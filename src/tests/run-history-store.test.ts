// src/tests/run-history-store.test.ts
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

import {
  appendRun,
  getRecentRuns,
  getRunsSince,
  getRunStats,
  trimHistory,
} from '@main/stores/run-history-store';
import type { ScheduledRun } from '@shared/types/schedule';

function makeRun(overrides: Partial<ScheduledRun> = {}): ScheduledRun {
  return {
    id: `run-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    specialistId: 'test-specialist',
    scheduleType: 'daily',
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    status: 'completed',
    tokensUsed: 1000,
    costUsd: 0.01,
    summary: 'Test run completed',
    outcome: 'completed',
    ...overrides,
  };
}

describe('run-history-store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should append run to JSONL file', async () => {
    const fs = await import('node:fs');
    const run = makeRun();

    appendRun('test-specialist', run);

    expect(fs.appendFileSync).toHaveBeenCalled();
    const written = vi.mocked(fs.appendFileSync).mock.calls[0][1] as string;
    expect(JSON.parse(written.trim())).toEqual(run);
  });

  it('should create file and directories if they do not exist', async () => {
    const fs = await import('node:fs');
    vi.mocked(fs.existsSync).mockReturnValue(false);

    appendRun('test-specialist', makeRun());

    expect(fs.mkdirSync).toHaveBeenCalledWith(expect.any(String), { recursive: true });
  });

  it('should get recent runs respecting limit parameter', async () => {
    const fs = await import('node:fs');
    const runs = [
      makeRun({ id: 'run-1', summary: 'First' }),
      makeRun({ id: 'run-2', summary: 'Second' }),
      makeRun({ id: 'run-3', summary: 'Third' }),
    ];
    const jsonl = runs.map(r => JSON.stringify(r)).join('\n') + '\n';

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(jsonl);

    const recent = getRecentRuns('test-specialist', 2);
    expect(recent).toHaveLength(2);
    // Should return the most recent (last) runs
    expect(recent[0].id).toBe('run-2');
    expect(recent[1].id).toBe('run-3');
  });

  it('should return empty array when no history exists', async () => {
    const fs = await import('node:fs');
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const runs = getRecentRuns('nonexistent', 10);
    expect(runs).toEqual([]);
  });

  it('should filter runs by date with getRunsSince', async () => {
    const fs = await import('node:fs');
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

    const runs = [
      makeRun({ id: 'old', startedAt: twoDaysAgo.toISOString() }),
      makeRun({ id: 'recent', startedAt: now.toISOString() }),
    ];
    const jsonl = runs.map(r => JSON.stringify(r)).join('\n') + '\n';

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(jsonl);

    const filtered = getRunsSince('test-specialist', yesterday);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe('recent');
  });

  it('should compute correct stats from run history', async () => {
    const fs = await import('node:fs');
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const runs = [
      makeRun({ id: 'r1', outcome: 'completed', tokensUsed: 1000, costUsd: 0.01, startedAt: now.toISOString() }),
      makeRun({ id: 'r2', outcome: 'completed', tokensUsed: 2000, costUsd: 0.02, startedAt: now.toISOString() }),
      makeRun({ id: 'r3', outcome: 'failed', tokensUsed: 500, costUsd: 0.005, startedAt: now.toISOString() }),
    ];
    const jsonl = runs.map(r => JSON.stringify(r)).join('\n') + '\n';

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(jsonl);

    const stats = getRunStats('test-specialist');
    expect(stats.totalRuns).toBe(3);
    // 2 completed out of 3 = ~66.67%
    expect(stats.successRate).toBeCloseTo(66.67, 0);
    expect(stats.weeklyCost).toBeCloseTo(0.035, 3);
  });

  it('should trim history beyond max entries', async () => {
    const fs = await import('node:fs');
    const runs = Array.from({ length: 10 }, (_, i) =>
      makeRun({ id: `run-${i}`, summary: `Run ${i}` })
    );
    const jsonl = runs.map(r => JSON.stringify(r)).join('\n') + '\n';

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(jsonl);

    trimHistory('test-specialist', 5);

    // Should write back only the last 5 entries
    expect(fs.writeFileSync).toHaveBeenCalled();
    const written = vi.mocked(fs.writeFileSync).mock.calls[0][1] as string;
    const writtenLines = written.trim().split('\n');
    expect(writtenLines).toHaveLength(5);
    // Should keep the most recent entries
    expect(JSON.parse(writtenLines[0]).id).toBe('run-5');
  });

  it('should handle concurrent appends safely', async () => {
    const fs = await import('node:fs');
    const run1 = makeRun({ id: 'concurrent-1' });
    const run2 = makeRun({ id: 'concurrent-2' });

    // Both should append without error
    appendRun('test-specialist', run1);
    appendRun('test-specialist', run2);

    expect(fs.appendFileSync).toHaveBeenCalledTimes(2);
  });

  it('should parse each JSONL line independently (resilient to partial corruption)', async () => {
    const fs = await import('node:fs');
    const validRun = makeRun({ id: 'valid-run' });
    const jsonl = `${JSON.stringify(validRun)}\nnot valid json{{\n${JSON.stringify(makeRun({ id: 'another-valid' }))}\n`;

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(jsonl);

    const runs = getRecentRuns('test-specialist', 10);
    // Should parse valid lines and skip corrupted ones
    expect(runs).toHaveLength(2);
    expect(runs[0].id).toBe('valid-run');
    expect(runs[1].id).toBe('another-valid');
  });

  it('should calculate weekly cost correctly from run data', async () => {
    const fs = await import('node:fs');
    const now = new Date();

    // Create runs within the past week
    const runs = [
      makeRun({ costUsd: 0.10, startedAt: now.toISOString() }),
      makeRun({ costUsd: 0.20, startedAt: now.toISOString() }),
      makeRun({ costUsd: 0.05, startedAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString() }),
    ];
    const jsonl = runs.map(r => JSON.stringify(r)).join('\n') + '\n';

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(jsonl);

    const stats = getRunStats('test-specialist');
    expect(stats.weeklyCost).toBeCloseTo(0.35, 2);
  });
});
