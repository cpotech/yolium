// src/tests/scheduler.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock node-cron and agent-runner - use vi.hoisted to make functions available outside the factory
const { mockCronSchedule, mockCronValidate, mockStartScheduledAgent } = vi.hoisted(() => ({
  mockCronSchedule: vi.fn(() => ({ stop: vi.fn() })),
  mockCronValidate: vi.fn(() => true),
  mockStartScheduledAgent: vi.fn(() => Promise.resolve({
    outcome: 'completed' as const,
    summary: 'Run completed successfully',
    tokensUsed: 500,
    costUsd: 0.005,
    durationMs: 5000,
  })),
}));
vi.mock('node-cron', () => ({
  default: { schedule: mockCronSchedule, validate: mockCronValidate },
  schedule: mockCronSchedule,
  validate: mockCronValidate,
}));

// Mock fs
vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(() => ''),
  appendFileSync: vi.fn(),
  readdirSync: vi.fn(() => []),
}));

vi.mock('node:os', () => ({
  homedir: vi.fn(() => '/home/test'),
}));

// Mock electron BrowserWindow
vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: vi.fn(() => []),
  },
}));

// Mock specialist-loader
vi.mock('@main/services/specialist-loader', () => ({
  listSpecialists: vi.fn(() => ['security-monitor']),
  loadSpecialist: vi.fn(() => ({
    name: 'security-monitor',
    description: 'Security monitor',
    model: 'haiku',
    tools: ['Read', 'Grep'],
    systemPrompt: 'You are a security monitor.',
    schedules: [
      { type: 'heartbeat', cron: '*/30 * * * *', enabled: true },
      { type: 'daily', cron: '0 0 * * *', enabled: true },
    ],
    memory: { strategy: 'distill_daily', maxEntries: 300, retentionDays: 90 },
    escalation: { onFailure: 'alert_user', onPattern: 'reduce_frequency' },
    promptTemplates: { heartbeat: 'Monitor security', daily: 'Daily audit' },
  })),
  getSpecialistsDir: vi.fn(() => '/test/agents/cron'),
  validateSchedules: vi.fn(() => true),
  parseSpecialistDefinition: vi.fn(),
}));

// Mock agent-runner
vi.mock('@main/services/agent-runner', () => ({
  startScheduledAgent: mockStartScheduledAgent,
}));

// Mock stores
vi.mock('@main/stores/schedule-store', () => ({
  getScheduleState: vi.fn(() => ({
    specialists: {
      'security-monitor': {
        id: 'security-monitor',
        enabled: true,
        consecutiveNoAction: 0,
        consecutiveFailures: 0,
        totalRuns: 0,
        successRate: 0,
        weeklyCost: 0,
      },
    },
    globalEnabled: true,
  })),
  saveScheduleState: vi.fn(),
  updateSpecialistStatus: vi.fn((state, _id, updates) => ({ ...state, specialists: { ...state.specialists, [_id]: { ...state.specialists[_id], ...updates } } })),
  toggleSpecialist: vi.fn((state, id, enabled) => ({ ...state, specialists: { ...state.specialists, [id]: { ...state.specialists[id], enabled } } })),
  toggleGlobal: vi.fn((state, enabled) => ({ ...state, globalEnabled: enabled })),
}));

vi.mock('@main/stores/run-history-store', () => ({
  appendRun: vi.fn(),
  getRecentRuns: vi.fn(() => []),
  getRunsSince: vi.fn(() => []),
  getRunStats: vi.fn(() => ({ totalRuns: 0, successRate: 0, weeklyCost: 0, averageTokensPerRun: 0, averageDurationMs: 0 })),
  trimHistory: vi.fn(),
}));

// Mock pattern detector
vi.mock('@main/services/pattern-detector', () => ({
  detectPatterns: vi.fn(() => []),
}));

// Mock escalation
vi.mock('@main/services/escalation', () => ({
  handleEscalation: vi.fn(),
}));

// Mock memory distiller
vi.mock('@main/services/memory-distiller', () => ({
  distillDaily: vi.fn(() => 'Daily summary'),
  distillWeekly: vi.fn(() => 'Weekly summary'),
  writeDigest: vi.fn(),
}));

// Mock logger (requires electron)
vi.mock('@main/lib/logger', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

import { CronScheduler } from '@main/services/scheduler';
import { getScheduleState } from '@main/stores/schedule-store';
import { appendRun, getRecentRuns, getRunStats } from '@main/stores/run-history-store';
import { detectPatterns } from '@main/services/pattern-detector';

describe('scheduler', () => {
  let scheduler: CronScheduler;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset getScheduleState to default (tests may override mockReturnValue)
    vi.mocked(getScheduleState).mockReturnValue({
      specialists: {
        'security-monitor': {
          id: 'security-monitor',
          enabled: true,
          consecutiveNoAction: 0,
          consecutiveFailures: 0,
          totalRuns: 0,
          successRate: 0,
          weeklyCost: 0,
        },
      },
      globalEnabled: true,
    });
    scheduler = new CronScheduler();
  });

  afterEach(() => {
    scheduler.stop();
  });

  it('should register cron jobs for enabled specialists on start', () => {
    scheduler.start();

    // Should have registered cron jobs for both schedules (heartbeat + daily)
    // Plus 1 for the distillation job
    expect(mockCronSchedule).toHaveBeenCalledWith('*/30 * * * *', expect.any(Function));
    expect(mockCronSchedule).toHaveBeenCalledWith('0 0 * * *', expect.any(Function));
  });

  it('should not register jobs for disabled specialists', () => {
    vi.mocked(getScheduleState).mockReturnValue({
      specialists: {
        'security-monitor': {
          id: 'security-monitor',
          enabled: false,
          consecutiveNoAction: 0,
          consecutiveFailures: 0,
          totalRuns: 0,
          successRate: 0,
          weeklyCost: 0,
        },
      },
      globalEnabled: true,
    });

    // Create new scheduler after mock override so constructor reads disabled state
    const localScheduler = new CronScheduler();
    localScheduler.start();

    // Should only have the distillation job, not specialist jobs
    const specialistCalls = mockCronSchedule.mock.calls.filter(
      call => call[0] !== '59 23 * * *'
    );
    expect(specialistCalls.length).toBe(0);
    localScheduler.stop();
  });

  it('should skip run when specialist is already running (conflict resolution)', () => {
    scheduler.start();

    // Simulate a running specialist
    scheduler.setRunning('security-monitor', true);

    // Trigger manual run — should be skipped
    const result = scheduler.triggerRun('security-monitor', 'heartbeat');
    expect(result).toEqual({ skipped: true, reason: 'already running' });
  });

  it('should record skipped run in history', () => {
    scheduler.start();
    scheduler.setRunning('security-monitor', true);

    scheduler.triggerRun('security-monitor', 'heartbeat');

    expect(appendRun).toHaveBeenCalledWith(
      'security-monitor',
      expect.objectContaining({ outcome: 'skipped' })
    );
  });

  it('should call startScheduledAgent with correct parameters', () => {
    scheduler.start();

    const result = scheduler.triggerRun('security-monitor', 'daily');

    // Should not be skipped
    expect(result.skipped).toBeFalsy();

    // Should have called startScheduledAgent
    expect(mockStartScheduledAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        scheduleType: 'daily',
        specialist: expect.objectContaining({ name: 'security-monitor' }),
      })
    );
  });

  it('should inject memory context from recent run history', () => {
    const mockHistory = [
      {
        id: 'r1',
        specialistId: 'security-monitor',
        scheduleType: 'heartbeat',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        status: 'completed',
        tokensUsed: 100,
        costUsd: 0.001,
        summary: 'No issues found',
        outcome: 'no_action',
      },
    ];
    vi.mocked(getRecentRuns).mockReturnValue(mockHistory as any);

    scheduler.start();
    const context = scheduler.buildMemoryContext('security-monitor');

    expect(context).toContain('No issues found');
    expect(context).toContain('Run History');
  });

  it('should update specialist status after run completion', () => {
    scheduler.start();

    scheduler.handleRunComplete('security-monitor', {
      outcome: 'completed',
      summary: 'All clear',
      tokensUsed: 500,
      costUsd: 0.005,
    });

    // Pattern detection should be triggered
    expect(detectPatterns).toHaveBeenCalledWith('security-monitor');
    // Run stats should be fetched for successRate/weeklyCost
    expect(getRunStats).toHaveBeenCalledWith('security-monitor');
  });

  it('should trigger pattern detection after each run', () => {
    scheduler.start();

    scheduler.handleRunComplete('security-monitor', {
      outcome: 'failed',
      summary: 'Error',
      tokensUsed: 0,
      costUsd: 0,
    });

    expect(detectPatterns).toHaveBeenCalledWith('security-monitor');
  });

  it('should stop all cron jobs on shutdown', () => {
    // start() registers jobs, each returns { stop: fn }
    scheduler.start();
    const registeredJobCount = mockCronSchedule.mock.calls.length;
    expect(registeredJobCount).toBeGreaterThan(0);

    // Collect stop functions from the mock's return values
    const stopFns = mockCronSchedule.mock.results
      .map(r => r.value?.stop)
      .filter(Boolean);

    scheduler.stop();

    // Each registered job's stop should have been called
    for (const stopFn of stopFns) {
      expect(stopFn).toHaveBeenCalled();
    }
  });

  it('should handle manual trigger via triggerRun', () => {
    scheduler.start();

    const result = scheduler.triggerRun('security-monitor', 'daily');
    expect(result.skipped).toBeFalsy();

    // startScheduledAgent should have been called
    expect(mockStartScheduledAgent).toHaveBeenCalled();
  });

  it('should respect global enabled/disabled toggle', () => {
    vi.mocked(getScheduleState).mockReturnValue({
      specialists: {
        'security-monitor': {
          id: 'security-monitor',
          enabled: true,
          consecutiveNoAction: 0,
          consecutiveFailures: 0,
          totalRuns: 0,
          successRate: 0,
          weeklyCost: 0,
        },
      },
      globalEnabled: false,
    });

    // Create new scheduler after mock override so constructor reads globalEnabled=false
    const localScheduler = new CronScheduler();
    localScheduler.start();

    // Should not register any jobs when global is disabled
    expect(mockCronSchedule).not.toHaveBeenCalled();
    localScheduler.stop();
  });

  it('should re-register jobs when specialist config changes', () => {
    // Use the scheduler from beforeEach (same instance that works in other tests)
    scheduler.start();
    const initialCallCount = mockCronSchedule.mock.calls.length;

    // Reload should stop old jobs and re-register new ones
    scheduler.reload();

    // Should have registered new jobs
    expect(mockCronSchedule.mock.calls.length).toBeGreaterThan(initialCallCount);
  });
});
