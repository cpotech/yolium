// src/tests/scheduler.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock node-cron and agent-runner - use vi.hoisted to make functions available outside the factory
const { mockCronSchedule, mockCronValidate, mockStartScheduledAgent } = vi.hoisted(() => ({
  mockCronSchedule: vi.fn<(expression: string, task: () => void) => { stop: () => void }>(() => ({ stop: vi.fn() })),
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

// Mock fs (for memory-distiller writeDigest which stays file-based)
vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(() => ''),
  appendFileSync: vi.fn(),
  readdirSync: vi.fn(() => []),
  watch: vi.fn(() => ({ close: vi.fn() })),
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
    source: 'default',
  })),
  getSpecialistsDir: vi.fn(() => '/test/agents/cron'),
  getCustomSpecialistsDir: vi.fn(() => '/home/test/.yolium/agents/cron/custom'),
  validateSchedules: vi.fn(() => true),
  parseSpecialistDefinition: vi.fn(),
}));

// Mock agent-runner (re-exports startScheduledAgent from agent-scheduled)
vi.mock('@main/services/agent-runner', () => ({
  startScheduledAgent: mockStartScheduledAgent,
}));

// Mock specialist-readiness
const { mockCheckSpecialistReadiness } = vi.hoisted(() => ({
  mockCheckSpecialistReadiness: vi.fn(() => ({ ready: true, reasons: [] })),
}));
vi.mock('@main/services/specialist-readiness', () => ({
  checkSpecialistReadiness: mockCheckSpecialistReadiness,
}));

// Mock schedule-db (the unified store)
vi.mock('@main/stores/yolium-db', () => ({
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
  updateSpecialistStatus: vi.fn((state, _id, updates) => ({
    ...state,
    specialists: { ...state.specialists, [_id]: { ...state.specialists[_id], ...updates } },
  })),
  toggleSpecialist: vi.fn((state, id, enabled) => ({
    ...state,
    specialists: { ...state.specialists, [id]: { ...state.specialists[id], enabled } },
  })),
  toggleGlobal: vi.fn((state, enabled) => ({ ...state, globalEnabled: enabled })),
  appendRun: vi.fn(),
  getRecentRuns: vi.fn(() => []),
  getRunsSince: vi.fn(() => []),
  getRunStats: vi.fn(() => ({ totalRuns: 0, successRate: 0, weeklyCost: 0, averageTokensPerRun: 0, averageDurationMs: 0 })),
  trimHistory: vi.fn(),
  appendRunLog: vi.fn(),
  getRunLog: vi.fn(() => ''),
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
import { getScheduleState, appendRun, getRecentRuns, getRunStats, getRunsSince, saveScheduleState, updateSpecialistStatus } from '@main/stores/yolium-db';
import { listSpecialists, loadSpecialist, getSpecialistsDir, getCustomSpecialistsDir } from '@main/services/specialist-loader';
import { BrowserWindow } from 'electron';
import type { ScheduledRun } from '@shared/types/schedule';

function makeRun(overrides: Partial<ScheduledRun> = {}): ScheduledRun {
  return {
    id: `run-${Math.random().toString(36).slice(2)}`,
    specialistId: 'test-specialist',
    scheduleType: 'heartbeat',
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    status: 'completed',
    tokensUsed: 1000,
    costUsd: 0.01,
    summary: 'Test run',
    outcome: 'completed',
    ...overrides,
  };
}

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
      ([expression]) => expression !== '59 23 * * *'
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

    // Run stats should be fetched for successRate/weeklyCost
    expect(getRunStats).toHaveBeenCalledWith('security-monitor');
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

  // ─── Pre-flight Readiness Check ────────────────────────────────────────────

  describe('pre-flight readiness check', () => {
    it('should skip run and record failure when specialist readiness check fails (missing credentials)', async () => {
      mockStartScheduledAgent.mockResolvedValueOnce({
        outcome: 'failed' as const,
        summary: 'Specialist not ready: Missing credentials for twitter-api: TWITTER_API_KEY, TWITTER_API_SECRET',
        tokensUsed: 0,
        costUsd: 0,
        durationMs: 0,
      });

      scheduler.start();
      scheduler.triggerRun('security-monitor', 'daily');

      // Wait for the async startScheduledAgent to resolve
      await vi.waitFor(() => {
        expect(appendRun).toHaveBeenCalledWith(
          'security-monitor',
          expect.objectContaining({ outcome: 'failed' })
        );
      });
    });

    it('should skip run and record failure when specialist readiness check fails (missing tools)', async () => {
      mockStartScheduledAgent.mockResolvedValueOnce({
        outcome: 'failed' as const,
        summary: 'Specialist not ready: Tool directory not found: twitter',
        tokensUsed: 0,
        costUsd: 0,
        durationMs: 0,
      });

      scheduler.start();
      scheduler.triggerRun('security-monitor', 'daily');

      await vi.waitFor(() => {
        expect(appendRun).toHaveBeenCalledWith(
          'security-monitor',
          expect.objectContaining({ outcome: 'failed' })
        );
      });
    });

    it('should proceed with run when specialist readiness check passes', () => {
      // Default mock returns completed successfully
      scheduler.start();
      const result = scheduler.triggerRun('security-monitor', 'daily');
      expect(result.skipped).toBeFalsy();
      expect(mockStartScheduledAgent).toHaveBeenCalled();
    });

    it('should log readiness failure reason in the skipped run summary', async () => {
      const failureMessage = 'Specialist not ready: Missing credentials for twitter-api: TWITTER_API_KEY';
      mockStartScheduledAgent.mockResolvedValueOnce({
        outcome: 'failed' as const,
        summary: failureMessage,
        tokensUsed: 0,
        costUsd: 0,
        durationMs: 0,
      });

      scheduler.start();
      scheduler.triggerRun('security-monitor', 'daily');

      await vi.waitFor(() => {
        expect(appendRun).toHaveBeenCalledWith(
          'security-monitor',
          expect.objectContaining({
            outcome: 'failed',
            summary: expect.stringContaining('not ready'),
          })
        );
      });
    });
  });

  // ─── Pattern Detection (inlined) ──────────────────────────────────────────

  describe('pattern detection (inlined)', () => {
    it('should detect 3 consecutive no-action runs and return reduce_frequency', () => {
      vi.mocked(getRecentRuns).mockReturnValue([
        makeRun({ outcome: 'no_action' }),
        makeRun({ outcome: 'no_action' }),
        makeRun({ outcome: 'no_action' }),
      ]);

      scheduler.start();
      // detectPatterns is now a private method, but handleRunComplete calls it.
      // We test it indirectly via handleRunComplete which triggers pattern detection + escalation.
      // For direct testing, we can access it via the class if we expose it for testing,
      // or we test the behavior through handleRunComplete side effects.

      // Use the internal detectPatterns method via (scheduler as any)
      const patterns = (scheduler as any).detectPatterns('security-monitor');
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns.some((a: any) => a.action === 'reduce_frequency')).toBe(true);
    });

    it('should detect 3 consecutive failures and return alert_user', () => {
      vi.mocked(getRecentRuns).mockReturnValue([
        makeRun({ outcome: 'failed' }),
        makeRun({ outcome: 'failed' }),
        makeRun({ outcome: 'failed' }),
      ]);

      scheduler.start();
      const patterns = (scheduler as any).detectPatterns('security-monitor');
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns.some((a: any) => a.action === 'alert_user')).toBe(true);
    });

    it('should not trigger on non-consecutive same-outcome runs', () => {
      vi.mocked(getRecentRuns).mockReturnValue([
        makeRun({ outcome: 'no_action' }),
        makeRun({ outcome: 'completed' }),
        makeRun({ outcome: 'no_action' }),
        makeRun({ outcome: 'no_action' }),
      ]);

      scheduler.start();
      const patterns = (scheduler as any).detectPatterns('security-monitor');
      const reduceFreq = patterns.filter((a: any) => a.action === 'reduce_frequency');
      expect(reduceFreq.length).toBe(0);
    });

    it('should detect cost spike exceeding 2x rolling average', () => {
      const historicalRuns = Array.from({ length: 10 }, () =>
        makeRun({ costUsd: 0.01 })
      );
      const recentRun = makeRun({ costUsd: 0.05 });

      vi.mocked(getRecentRuns).mockReturnValue([...historicalRuns, recentRun]);

      scheduler.start();
      const patterns = (scheduler as any).detectPatterns('security-monitor');
      expect(patterns.some((a: any) => a.action === 'alert_user' && a.reason.includes('cost'))).toBe(true);
    });

    it('should return empty array when no patterns detected', () => {
      vi.mocked(getRecentRuns).mockReturnValue([
        makeRun({ outcome: 'completed' }),
        makeRun({ outcome: 'completed' }),
      ]);

      scheduler.start();
      const patterns = (scheduler as any).detectPatterns('security-monitor');
      expect(patterns).toEqual([]);
    });
  });

  // ─── Escalation Handling (inlined) ────────────────────────────────────────

  describe('escalation handling (inlined)', () => {
    it('should reduce frequency by doubling skipEveryN', () => {
      const state = {
        specialists: {
          'security-monitor': {
            id: 'security-monitor',
            enabled: true,
            consecutiveNoAction: 0,
            consecutiveFailures: 0,
            totalRuns: 0,
            successRate: 0,
            weeklyCost: 0,
            skipEveryN: 1,
          },
        },
        globalEnabled: true,
      };
      vi.mocked(getScheduleState).mockReturnValue(state);

      scheduler = new CronScheduler();
      scheduler.start();

      (scheduler as any).handleEscalation('reduce_frequency', 'security-monitor', { reason: 'test' });

      expect(updateSpecialistStatus).toHaveBeenCalledWith(
        expect.anything(),
        'security-monitor',
        expect.objectContaining({ skipEveryN: 2 })
      );
    });

    it('should pause specialist by setting enabled to false', () => {
      const state = {
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
      };
      vi.mocked(getScheduleState).mockReturnValue(state);

      scheduler = new CronScheduler();
      scheduler.start();

      (scheduler as any).handleEscalation('pause', 'security-monitor', { reason: 'test' });

      expect(updateSpecialistStatus).toHaveBeenCalledWith(
        expect.anything(),
        'security-monitor',
        expect.objectContaining({ enabled: false })
      );
    });

    it('should broadcast alert to renderer windows', () => {
      const mockSend = vi.fn();
      vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([
        { isDestroyed: () => false, webContents: { send: mockSend } } as any,
      ]);

      scheduler.start();
      (scheduler as any).handleEscalation('alert_user', 'security-monitor', { reason: 'test alert' });

      expect(mockSend).toHaveBeenCalledWith('schedule:alert', 'security-monitor', expect.stringContaining('test alert'));
    });
  });

  // ─── Memory Distillation (inlined) ────────────────────────────────────────

  describe('memory distillation (inlined)', () => {
    it('should produce daily summary from today\'s runs', () => {
      const runs = [
        makeRun({ summary: 'Checked all endpoints', outcome: 'completed' }),
        makeRun({ summary: 'Found 2 issues', outcome: 'completed' }),
      ];
      vi.mocked(getRunsSince).mockReturnValue(runs);

      scheduler.start();
      const summary = (scheduler as any).distillDaily('security-monitor');
      expect(summary).toContain('Checked all endpoints');
      expect(summary).toContain('Found 2 issues');
    });

    it('should produce weekly digest with header and run details', () => {
      const runs = [
        makeRun({ summary: 'Monday check', scheduleType: 'daily' }),
        makeRun({ summary: 'Tuesday check', scheduleType: 'daily' }),
      ];
      vi.mocked(getRunsSince).mockReturnValue(runs);

      scheduler.start();
      const digest = (scheduler as any).distillWeekly('security-monitor');
      expect(digest).toContain('Monday check');
      expect(digest).toContain('Weekly Digest');
    });

    it('should write digest to specialist\'s digest.md file', async () => {
      const fs = await import('node:fs');

      scheduler.start();
      (scheduler as any).writeDigest('security-monitor', '# Digest\n\nContent');

      expect(fs.writeFileSync).toHaveBeenCalled();
      const writePath = vi.mocked(fs.writeFileSync).mock.calls[0][0] as string;
      expect(writePath).toContain('security-monitor');
      expect(writePath).toContain('digest.md');
    });

    it('should return empty string when no runs exist for distillation', () => {
      vi.mocked(getRunsSince).mockReturnValue([]);

      scheduler.start();
      const summary = (scheduler as any).distillDaily('security-monitor');
      expect(summary).toBe('');
    });

    it('should truncate overly long summaries', () => {
      const longSummary = 'A'.repeat(10000);
      const runs = [makeRun({ summary: longSummary })];
      vi.mocked(getRunsSince).mockReturnValue(runs);

      scheduler.start();
      const summary = (scheduler as any).distillDaily('security-monitor');
      expect(summary.length).toBeLessThan(10000);
    });
  });

  // ─── Dual-Directory File Watching ──────────────────────────────────────────

  describe('dual-directory file watching', () => {
    it('should watch both default and custom specialist directories for file changes', async () => {
      const fs = await import('node:fs');
      const watchCalls: string[] = [];
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.watch as any).mockImplementation((dir: string) => {
        watchCalls.push(dir);
        return { close: vi.fn() };
      });

      scheduler.start();

      expect(watchCalls).toContain('/test/agents/cron');
      expect(watchCalls).toContain('/home/test/.yolium/agents/cron/custom');
    });

    it('should close both watchers on unwatchSpecialistFiles', async () => {
      const fs = await import('node:fs');
      const closeFns: ReturnType<typeof vi.fn>[] = [];
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.watch as any).mockImplementation(() => {
        const close = vi.fn();
        closeFns.push(close);
        return { close };
      });

      scheduler.start();
      scheduler.stop();

      // Both watchers should have their close() called
      for (const closeFn of closeFns) {
        expect(closeFn).toHaveBeenCalled();
      }
    });

    it('should load specialists from both default and custom directories', () => {
      scheduler.start();

      // listSpecialists is called during loadSpecialists
      expect(listSpecialists).toHaveBeenCalled();
    });

    it('should include source field in loaded specialist definitions', () => {
      scheduler.start();

      const specialists = scheduler.getSpecialists();
      const securityMonitor = specialists.get('security-monitor');
      expect(securityMonitor).toBeDefined();
      expect(securityMonitor!.source).toBe('default');
    });

    it('should handle custom directory not existing without error', async () => {
      const fs = await import('node:fs');
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        if (p === '/home/test/.yolium/agents/cron/custom') return false;
        return true;
      });

      // Should not throw
      expect(() => {
        const localScheduler = new CronScheduler();
        localScheduler.start();
        localScheduler.stop();
      }).not.toThrow();
    });

    it('should reload when files change in custom/default directory', async () => {
      const fs = await import('node:fs');
      const watchCallbacks: ((eventType: string, filename: string) => void)[] = [];
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.watch as any).mockImplementation((_dir: string, callback: (eventType: string, filename: string) => void) => {
        watchCallbacks.push(callback);
        return { close: vi.fn() };
      });

      scheduler.start();
      const initialLoadCalls = vi.mocked(listSpecialists).mock.calls.length;

      // Simulate file change in one of the watched directories
      if (watchCallbacks.length > 0) {
        watchCallbacks[0]('change', 'test-agent.md');
        // Wait for debounce
        await vi.waitFor(() => {
          expect(vi.mocked(listSpecialists).mock.calls.length).toBeGreaterThan(initialLoadCalls);
        }, { timeout: 2000 });
      }
    });
  });
});
