// src/tests/scheduled-agent-logs.test.ts
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
  appendRunLog,
  getRunLog,
} from '@main/stores/run-history-store';

describe('scheduled-agent-logs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should store log to file at ~/.yolium/schedules/{specialistId}/runs/{runId}.log', async () => {
    const fs = await import('node:fs');

    appendRunLog('my-specialist', 'run-123', 'Hello world\n');

    expect(fs.mkdirSync).toHaveBeenCalledWith(
      '/home/test/.yolium/schedules/my-specialist/runs',
      { recursive: true }
    );
    expect(fs.appendFileSync).toHaveBeenCalledWith(
      '/home/test/.yolium/schedules/my-specialist/runs/run-123.log',
      expect.any(String),
      'utf-8'
    );
  });

  it('should capture display output lines during a scheduled agent run', async () => {
    const fs = await import('node:fs');

    appendRunLog('spec-1', 'run-abc', 'Assistant: Hello');
    appendRunLog('spec-1', 'run-abc', 'Tool: Read file.ts');

    expect(fs.appendFileSync).toHaveBeenCalledTimes(2);
    // Both calls should target the same log file
    const calls = vi.mocked(fs.appendFileSync).mock.calls;
    expect(calls[0][0]).toBe('/home/test/.yolium/schedules/spec-1/runs/run-abc.log');
    expect(calls[1][0]).toBe('/home/test/.yolium/schedules/spec-1/runs/run-abc.log');
  });

  it('should return log content via getRunLog(specialistId, runId)', async () => {
    const fs = await import('node:fs');
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('[12:00:00] Line 1\n[12:00:01] Line 2\n');

    const log = getRunLog('my-specialist', 'run-456');
    expect(log).toBe('[12:00:00] Line 1\n[12:00:01] Line 2\n');
    expect(fs.readFileSync).toHaveBeenCalledWith(
      '/home/test/.yolium/schedules/my-specialist/runs/run-456.log',
      'utf-8'
    );
  });

  it('should return empty string for non-existent run log', async () => {
    const fs = await import('node:fs');
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const log = getRunLog('nonexistent', 'run-999');
    expect(log).toBe('');
  });

  it('should include timestamps in log lines', async () => {
    const fs = await import('node:fs');

    appendRunLog('spec-1', 'run-ts', 'Some output text');

    const written = vi.mocked(fs.appendFileSync).mock.calls[0][1] as string;
    // Should have a timestamp prefix like [HH:MM:SS] or [ISO date]
    expect(written).toMatch(/^\[.+\]/);
    expect(written).toContain('Some output text');
  });

  it('should handle concurrent runs writing to separate log files', async () => {
    const fs = await import('node:fs');

    // Two different runs for the same specialist
    appendRunLog('spec-1', 'run-A', 'Output A');
    appendRunLog('spec-1', 'run-B', 'Output B');

    const calls = vi.mocked(fs.appendFileSync).mock.calls;
    expect(calls[0][0]).toBe('/home/test/.yolium/schedules/spec-1/runs/run-A.log');
    expect(calls[1][0]).toBe('/home/test/.yolium/schedules/spec-1/runs/run-B.log');
  });
});
