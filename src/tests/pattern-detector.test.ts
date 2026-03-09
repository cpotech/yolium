// src/tests/pattern-detector.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

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

// Mock run-history-store
vi.mock('@main/stores/run-history-store', () => ({
  getRecentRuns: vi.fn(() => []),
  getRunsSince: vi.fn(() => []),
  getRunStats: vi.fn(() => ({ totalRuns: 0, successRate: 0, weeklyCost: 0, averageTokensPerRun: 0, averageDurationMs: 0 })),
}));

import { detectPatterns } from '@main/services/pattern-detector';
import { getRecentRuns } from '@main/stores/run-history-store';
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

describe('pattern-detector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should detect 3 consecutive no-action runs', () => {
    vi.mocked(getRecentRuns).mockReturnValue([
      makeRun({ outcome: 'no_action' }),
      makeRun({ outcome: 'no_action' }),
      makeRun({ outcome: 'no_action' }),
    ]);

    const actions = detectPatterns('test-specialist');
    expect(actions.length).toBeGreaterThan(0);
    expect(actions.some(a => a.action === 'reduce_frequency')).toBe(true);
  });

  it('should detect 3 consecutive failures', () => {
    vi.mocked(getRecentRuns).mockReturnValue([
      makeRun({ outcome: 'failed' }),
      makeRun({ outcome: 'failed' }),
      makeRun({ outcome: 'failed' }),
    ]);

    const actions = detectPatterns('test-specialist');
    expect(actions.length).toBeGreaterThan(0);
    expect(actions.some(a => a.action === 'alert_user')).toBe(true);
  });

  it('should not trigger on non-consecutive no-action runs', () => {
    vi.mocked(getRecentRuns).mockReturnValue([
      makeRun({ outcome: 'no_action' }),
      makeRun({ outcome: 'completed' }),
      makeRun({ outcome: 'no_action' }),
      makeRun({ outcome: 'no_action' }),
    ]);

    const actions = detectPatterns('test-specialist');
    // Should not trigger reduce_frequency because there's a completed run breaking the streak
    const reduceFreq = actions.filter(a => a.action === 'reduce_frequency');
    expect(reduceFreq.length).toBe(0);
  });

  it('should return empty array when no patterns detected', () => {
    vi.mocked(getRecentRuns).mockReturnValue([
      makeRun({ outcome: 'completed' }),
      makeRun({ outcome: 'completed' }),
    ]);

    const actions = detectPatterns('test-specialist');
    expect(actions).toEqual([]);
  });

  it('should detect cost spike exceeding 2x rolling average', () => {
    // Historical runs with low cost
    const historicalRuns = Array.from({ length: 10 }, () =>
      makeRun({ costUsd: 0.01 })
    );
    // Recent run with high cost (>2x average)
    const recentRun = makeRun({ costUsd: 0.05 });

    vi.mocked(getRecentRuns).mockReturnValue([...historicalRuns, recentRun]);

    const actions = detectPatterns('test-specialist');
    expect(actions.some(a => a.action === 'alert_user' && a.reason.includes('cost'))).toBe(true);
  });

  it('should return reduce_frequency action for consecutive no-action', () => {
    vi.mocked(getRecentRuns).mockReturnValue([
      makeRun({ outcome: 'no_action' }),
      makeRun({ outcome: 'no_action' }),
      makeRun({ outcome: 'no_action' }),
    ]);

    const actions = detectPatterns('test-specialist');
    const reduceAction = actions.find(a => a.action === 'reduce_frequency');
    expect(reduceAction).toBeDefined();
    expect(reduceAction!.specialistId).toBe('test-specialist');
  });

  it('should return alert_user action for consecutive failures', () => {
    vi.mocked(getRecentRuns).mockReturnValue([
      makeRun({ outcome: 'failed' }),
      makeRun({ outcome: 'failed' }),
      makeRun({ outcome: 'failed' }),
    ]);

    const actions = detectPatterns('test-specialist');
    const alertAction = actions.find(a => a.action === 'alert_user');
    expect(alertAction).toBeDefined();
    expect(alertAction!.specialistId).toBe('test-specialist');
  });

  it('should handle empty run history gracefully', () => {
    vi.mocked(getRecentRuns).mockReturnValue([]);

    const actions = detectPatterns('test-specialist');
    expect(actions).toEqual([]);
  });

  it('should only consider runs within the detection window', () => {
    // Recent runs: 3 consecutive no-action
    const recentRuns = [
      makeRun({ outcome: 'no_action' }),
      makeRun({ outcome: 'no_action' }),
      makeRun({ outcome: 'no_action' }),
    ];

    vi.mocked(getRecentRuns).mockReturnValue(recentRuns);

    const actions = detectPatterns('test-specialist');
    // Should detect the pattern in the recent window
    expect(actions.some(a => a.action === 'reduce_frequency')).toBe(true);
  });
});
