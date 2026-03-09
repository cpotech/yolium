// src/tests/memory-distiller.test.ts
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

import {
  distillDaily,
  distillWeekly,
  writeDigest,
  readDigest,
} from '@main/services/memory-distiller';
import { getRunsSince } from '@main/stores/run-history-store';
import type { ScheduledRun } from '@shared/types/schedule';

function makeRun(overrides: Partial<ScheduledRun> = {}): ScheduledRun {
  return {
    id: `run-${Math.random().toString(36).slice(2)}`,
    specialistId: 'test-specialist',
    scheduleType: 'daily',
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    status: 'completed',
    tokensUsed: 1000,
    costUsd: 0.01,
    summary: 'Test run completed successfully',
    outcome: 'completed',
    ...overrides,
  };
}

describe('memory-distiller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should produce daily summary from run entries', () => {
    const runs = [
      makeRun({ summary: 'Checked all endpoints', outcome: 'completed' }),
      makeRun({ summary: 'Found 2 issues', outcome: 'completed' }),
      makeRun({ summary: 'No action needed', outcome: 'no_action' }),
    ];
    vi.mocked(getRunsSince).mockReturnValue(runs);

    const summary = distillDaily('test-specialist');
    expect(summary).toContain('Checked all endpoints');
    expect(summary).toContain('Found 2 issues');
    expect(summary).toContain('No action needed');
    expect(summary.length).toBeGreaterThan(0);
  });

  it('should produce weekly digest from daily summaries', () => {
    const runs = [
      makeRun({ summary: 'Monday: all clear', scheduleType: 'daily' }),
      makeRun({ summary: 'Tuesday: found vulnerability', scheduleType: 'daily' }),
      makeRun({ summary: 'Wednesday: patched issue', scheduleType: 'daily' }),
    ];
    vi.mocked(getRunsSince).mockReturnValue(runs);

    const digest = distillWeekly('test-specialist');
    expect(digest).toContain('Monday: all clear');
    expect(digest).toContain('Tuesday: found vulnerability');
    expect(digest.length).toBeGreaterThan(0);
  });

  it('should write digest to correct file path', async () => {
    const fs = await import('node:fs');

    writeDigest('test-specialist', '# Weekly Digest\n\nAll good.');

    expect(fs.writeFileSync).toHaveBeenCalled();
    const writePath = vi.mocked(fs.writeFileSync).mock.calls[0][0] as string;
    expect(writePath).toContain('test-specialist');
    expect(writePath).toContain('digest.md');
  });

  it('should read existing digest', async () => {
    const fs = await import('node:fs');
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('# Existing Digest\n\nPrevious week summary.');

    const digest = readDigest('test-specialist');
    expect(digest).toBe('# Existing Digest\n\nPrevious week summary.');
  });

  it('should handle empty run history for distillation', () => {
    vi.mocked(getRunsSince).mockReturnValue([]);

    const summary = distillDaily('test-specialist');
    expect(summary).toBe('');
  });

  it('should include run outcomes and key metrics in summary', () => {
    const runs = [
      makeRun({ outcome: 'completed', tokensUsed: 500, costUsd: 0.005, summary: 'Scan complete' }),
      makeRun({ outcome: 'failed', tokensUsed: 100, costUsd: 0.001, summary: 'API timeout' }),
    ];
    vi.mocked(getRunsSince).mockReturnValue(runs);

    const summary = distillDaily('test-specialist');
    expect(summary).toContain('completed');
    expect(summary).toContain('failed');
  });

  it('should truncate overly long summaries', () => {
    const longSummary = 'A'.repeat(10000);
    const runs = [makeRun({ summary: longSummary })];
    vi.mocked(getRunsSince).mockReturnValue(runs);

    const summary = distillDaily('test-specialist');
    // Should be reasonably bounded
    expect(summary.length).toBeLessThan(10000);
  });
});
