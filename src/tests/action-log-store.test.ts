import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs', () => ({
  appendFileSync: vi.fn(),
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(() => ''),
}));

vi.mock('node:os', () => ({
  homedir: vi.fn(() => '/home/test'),
}));

import * as path from 'node:path';
import {
  appendAction,
  getAllRecentActions,
  getActionStats,
  getActionsByRun,
  getRecentActions,
} from '@main/stores/action-log-store';
import type { ActionLogEntry } from '@shared/types/schedule';

function makeAction(overrides: Partial<ActionLogEntry> = {}): ActionLogEntry {
  return {
    id: 'action-1',
    runId: 'run-1',
    specialistId: 'twitter-growth',
    action: 'tweet_posted',
    data: { tweetId: '123' },
    timestamp: '2026-03-11T09:00:00.000Z',
    ...overrides,
  };
}

describe('action-log-store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should append an action entry to actions.jsonl', async () => {
    const fs = await import('node:fs');
    const entry = makeAction();

    appendAction('twitter-growth', entry);

    expect(fs.appendFileSync).toHaveBeenCalledWith(
      path.join('/home/test', '.yolium', 'schedules', 'twitter-growth', 'actions.jsonl'),
      `${JSON.stringify(entry)}\n`,
      'utf-8'
    );
  });

  it('should create the specialist action directory when it does not exist', async () => {
    const fs = await import('node:fs');
    vi.mocked(fs.existsSync).mockReturnValue(false);

    appendAction('twitter-growth', makeAction());

    expect(fs.mkdirSync).toHaveBeenCalledWith(
      path.join('/home/test', '.yolium', 'schedules', 'twitter-growth'),
      { recursive: true }
    );
  });

  it('should return an empty array when no action log exists', () => {
    expect(getRecentActions('twitter-growth', 10)).toEqual([]);
  });

  it('should return only the most recent actions up to the provided limit', async () => {
    const fs = await import('node:fs');
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue([
      makeAction({ id: 'a1', timestamp: '2026-03-11T09:00:00.000Z' }),
      makeAction({ id: 'a2', timestamp: '2026-03-11T09:05:00.000Z' }),
      makeAction({ id: 'a3', timestamp: '2026-03-11T09:10:00.000Z' }),
    ].map(entry => JSON.stringify(entry)).join('\n') + '\n');

    expect(getRecentActions('twitter-growth', 2).map(entry => entry.id)).toEqual(['a2', 'a3']);
  });

  it('should return only actions matching a specific run ID', async () => {
    const fs = await import('node:fs');
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue([
      makeAction({ id: 'a1', runId: 'run-1' }),
      makeAction({ id: 'a2', runId: 'run-2' }),
      makeAction({ id: 'a3', runId: 'run-1' }),
    ].map(entry => JSON.stringify(entry)).join('\n') + '\n');

    expect(getActionsByRun('twitter-growth', 'run-1').map(entry => entry.id)).toEqual(['a1', 'a3']);
  });

  it('should compute total action count and per-action counts', async () => {
    const fs = await import('node:fs');
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue([
      makeAction({ id: 'a1', action: 'tweet_posted' }),
      makeAction({ id: 'a2', action: 'tweet_posted' }),
      makeAction({ id: 'a3', action: 'mentions_checked' }),
    ].map(entry => JSON.stringify(entry)).join('\n') + '\n');

    expect(getActionStats('twitter-growth')).toEqual({
      totalActions: 3,
      actionCounts: {
        mentions_checked: 1,
        tweet_posted: 2,
      },
    });
  });

  it('should skip corrupted JSONL lines without failing the read', async () => {
    const fs = await import('node:fs');
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue([
      JSON.stringify(makeAction({ id: 'a1' })),
      '{bad json',
      JSON.stringify(makeAction({ id: 'a2' })),
    ].join('\n') + '\n');

    expect(getRecentActions('twitter-growth', 10).map(entry => entry.id)).toEqual(['a1', 'a2']);
  });

  describe('getAllRecentActions', () => {
    it('should return an empty array when no specialist IDs are provided', () => {
      expect(getAllRecentActions([], 100)).toEqual([]);
    });

    it('should merge actions from multiple specialists sorted by timestamp descending', async () => {
      const fs = await import('node:fs');
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const specialist1Actions = [
        makeAction({ id: 'a1', specialistId: 'twitter-growth', timestamp: '2026-03-11T09:00:00.000Z' }),
        makeAction({ id: 'a3', specialistId: 'twitter-growth', timestamp: '2026-03-11T11:00:00.000Z' }),
      ].map(e => JSON.stringify(e)).join('\n') + '\n';

      const specialist2Actions = [
        makeAction({ id: 'a2', specialistId: 'security-monitor', timestamp: '2026-03-11T10:00:00.000Z' }),
        makeAction({ id: 'a4', specialistId: 'security-monitor', timestamp: '2026-03-11T12:00:00.000Z' }),
      ].map(e => JSON.stringify(e)).join('\n') + '\n';

      vi.mocked(fs.readFileSync).mockImplementation((filePath: unknown) => {
        const p = String(filePath);
        if (p.includes('twitter-growth')) return specialist1Actions;
        if (p.includes('security-monitor')) return specialist2Actions;
        return '';
      });

      const result = getAllRecentActions(['twitter-growth', 'security-monitor'], 100);
      expect(result.map(e => e.id)).toEqual(['a4', 'a3', 'a2', 'a1']);
    });

    it('should respect the limit parameter across merged results', async () => {
      const fs = await import('node:fs');
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const specialist1Actions = [
        makeAction({ id: 'a1', specialistId: 'twitter-growth', timestamp: '2026-03-11T09:00:00.000Z' }),
        makeAction({ id: 'a3', specialistId: 'twitter-growth', timestamp: '2026-03-11T11:00:00.000Z' }),
      ].map(e => JSON.stringify(e)).join('\n') + '\n';

      const specialist2Actions = [
        makeAction({ id: 'a2', specialistId: 'security-monitor', timestamp: '2026-03-11T10:00:00.000Z' }),
        makeAction({ id: 'a4', specialistId: 'security-monitor', timestamp: '2026-03-11T12:00:00.000Z' }),
      ].map(e => JSON.stringify(e)).join('\n') + '\n';

      vi.mocked(fs.readFileSync).mockImplementation((filePath: unknown) => {
        const p = String(filePath);
        if (p.includes('twitter-growth')) return specialist1Actions;
        if (p.includes('security-monitor')) return specialist2Actions;
        return '';
      });

      const result = getAllRecentActions(['twitter-growth', 'security-monitor'], 2);
      expect(result).toHaveLength(2);
      expect(result.map(e => e.id)).toEqual(['a4', 'a3']);
    });

    it('should handle missing action files for some specialists gracefully', async () => {
      const fs = await import('node:fs');
      vi.mocked(fs.existsSync).mockImplementation((filePath: unknown) => {
        return String(filePath).includes('twitter-growth');
      });

      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify(makeAction({ id: 'a1', specialistId: 'twitter-growth' })) + '\n'
      );

      const result = getAllRecentActions(['twitter-growth', 'missing-specialist'], 100);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('a1');
    });

    it('should skip corrupted lines across multiple specialist files', async () => {
      const fs = await import('node:fs');
      vi.mocked(fs.existsSync).mockReturnValue(true);

      vi.mocked(fs.readFileSync).mockImplementation((filePath: unknown) => {
        const p = String(filePath);
        if (p.includes('twitter-growth')) {
          return [
            JSON.stringify(makeAction({ id: 'a1', specialistId: 'twitter-growth', timestamp: '2026-03-11T09:00:00.000Z' })),
            '{corrupted',
          ].join('\n') + '\n';
        }
        if (p.includes('security-monitor')) {
          return [
            '{also bad',
            JSON.stringify(makeAction({ id: 'a2', specialistId: 'security-monitor', timestamp: '2026-03-11T10:00:00.000Z' })),
          ].join('\n') + '\n';
        }
        return '';
      });

      const result = getAllRecentActions(['twitter-growth', 'security-monitor'], 100);
      expect(result.map(e => e.id)).toEqual(['a2', 'a1']);
    });
  });
});
