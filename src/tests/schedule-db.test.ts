// src/tests/schedule-db.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

// Mock os.homedir to return a temp directory
const { homedirMock } = vi.hoisted(() => ({
  homedirMock: vi.fn(),
}));

vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof import('node:os')>('node:os');
  return { ...actual, homedir: homedirMock };
});

const loggerWarnMock = vi.fn();
vi.mock('@main/lib/logger', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: loggerWarnMock,
    error: vi.fn(),
  })),
}));

import type { ScheduledRun, ActionLogEntry } from '@shared/types/schedule';

// We need to import fresh for each test to get clean DB state.
// The module caches the singleton DB, so we re-import after resetModules.
let scheduleDb: typeof import('@main/stores/schedule-db');

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

function makeAction(overrides: Partial<ActionLogEntry> = {}): ActionLogEntry {
  return {
    id: `action-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    runId: 'run-1',
    specialistId: 'test-specialist',
    action: 'tweet_posted',
    data: { tweetId: '123' },
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

describe('schedule-db', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'schedule-db-'));
    fs.mkdirSync(path.join(tempDir, '.yolium'), { recursive: true });
    homedirMock.mockReturnValue(tempDir);

    // Reset module registry so each test gets a fresh DB singleton
    vi.resetModules();
    scheduleDb = await import('@main/stores/schedule-db');
  });

  afterEach(() => {
    // Close the database before cleaning up temp dir
    scheduleDb.closeDb();
    vi.clearAllMocks();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('schedule state', () => {
    it('should return default state when database is empty', () => {
      const state = scheduleDb.getScheduleState();
      expect(state.globalEnabled).toBe(false);
      expect(state.specialists).toEqual({});
    });

    it('should persist and load schedule state', () => {
      const state = {
        specialists: {
          'security-monitor': {
            id: 'security-monitor',
            enabled: true,
            consecutiveNoAction: 0,
            consecutiveFailures: 0,
            totalRuns: 5,
            successRate: 80,
            weeklyCost: 1.5,
          },
        },
        globalEnabled: true,
      };

      scheduleDb.saveScheduleState(state);
      const loaded = scheduleDb.getScheduleState();
      expect(loaded.globalEnabled).toBe(true);
      expect(loaded.specialists['security-monitor'].totalRuns).toBe(5);
      expect(loaded.specialists['security-monitor'].successRate).toBe(80);
    });

    it('should update individual specialist status fields', () => {
      const state = {
        specialists: {
          'test-specialist': {
            id: 'test-specialist',
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
      scheduleDb.saveScheduleState(state);

      const updated = scheduleDb.updateSpecialistStatus(
        scheduleDb.getScheduleState(),
        'test-specialist',
        { totalRuns: 10, successRate: 90 }
      );
      scheduleDb.saveScheduleState(updated);

      const loaded = scheduleDb.getScheduleState();
      expect(loaded.specialists['test-specialist'].totalRuns).toBe(10);
      expect(loaded.specialists['test-specialist'].successRate).toBe(90);
    });

    it('should toggle specialist enabled/disabled', () => {
      const state = {
        specialists: {
          'test-specialist': {
            id: 'test-specialist',
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
      scheduleDb.saveScheduleState(state);

      const updated = scheduleDb.toggleSpecialist(
        scheduleDb.getScheduleState(),
        'test-specialist',
        false
      );
      scheduleDb.saveScheduleState(updated);

      const loaded = scheduleDb.getScheduleState();
      expect(loaded.specialists['test-specialist'].enabled).toBe(false);
    });

    it('should toggle global enabled/disabled', () => {
      const state = { specialists: {}, globalEnabled: true };
      scheduleDb.saveScheduleState(state);

      const updated = scheduleDb.toggleGlobal(scheduleDb.getScheduleState(), false);
      scheduleDb.saveScheduleState(updated);

      const loaded = scheduleDb.getScheduleState();
      expect(loaded.globalEnabled).toBe(false);
    });

    it('should preserve other specialists when updating one', () => {
      const state = {
        specialists: {
          'specialist-a': {
            id: 'specialist-a',
            enabled: true,
            consecutiveNoAction: 0,
            consecutiveFailures: 0,
            totalRuns: 5,
            successRate: 100,
            weeklyCost: 1.0,
          },
          'specialist-b': {
            id: 'specialist-b',
            enabled: true,
            consecutiveNoAction: 0,
            consecutiveFailures: 0,
            totalRuns: 3,
            successRate: 66,
            weeklyCost: 0.5,
          },
        },
        globalEnabled: true,
      };
      scheduleDb.saveScheduleState(state);

      const updated = scheduleDb.updateSpecialistStatus(
        scheduleDb.getScheduleState(),
        'specialist-a',
        { totalRuns: 10 }
      );
      scheduleDb.saveScheduleState(updated);

      const loaded = scheduleDb.getScheduleState();
      expect(loaded.specialists['specialist-a'].totalRuns).toBe(10);
      expect(loaded.specialists['specialist-b'].totalRuns).toBe(3);
    });
  });

  describe('runs', () => {
    it('should insert a run and retrieve it by specialist ID', () => {
      const run = makeRun({ id: 'run-1', specialistId: 'test-specialist' });
      scheduleDb.appendRun('test-specialist', run);

      const runs = scheduleDb.getRecentRuns('test-specialist', 10);
      expect(runs).toHaveLength(1);
      expect(runs[0].id).toBe('run-1');
      expect(runs[0].specialistId).toBe('test-specialist');
    });

    it('should return only the N most recent runs (ORDER BY started_at DESC LIMIT)', () => {
      const now = Date.now();
      for (let i = 0; i < 10; i++) {
        scheduleDb.appendRun('test-specialist', makeRun({
          id: `run-${i}`,
          startedAt: new Date(now + i * 1000).toISOString(),
        }));
      }

      const runs = scheduleDb.getRecentRuns('test-specialist', 3);
      expect(runs).toHaveLength(3);
      // Should return the 3 most recent, ordered oldest-first (ascending) for display
      expect(runs[0].id).toBe('run-7');
      expect(runs[1].id).toBe('run-8');
      expect(runs[2].id).toBe('run-9');
    });

    it('should filter runs by date with getRunsSince', () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

      scheduleDb.appendRun('test-specialist', makeRun({ id: 'old', startedAt: twoDaysAgo.toISOString() }));
      scheduleDb.appendRun('test-specialist', makeRun({ id: 'recent', startedAt: now.toISOString() }));

      const filtered = scheduleDb.getRunsSince('test-specialist', yesterday);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('recent');
    });

    it('should compute run stats via SQL aggregates (totalRuns, successRate, weeklyCost, avgTokens, avgDuration)', () => {
      const now = new Date();
      scheduleDb.appendRun('test-specialist', makeRun({
        outcome: 'completed', tokensUsed: 1000, costUsd: 0.01,
        startedAt: now.toISOString(),
        completedAt: new Date(now.getTime() + 5000).toISOString(),
      }));
      scheduleDb.appendRun('test-specialist', makeRun({
        outcome: 'completed', tokensUsed: 2000, costUsd: 0.02,
        startedAt: now.toISOString(),
        completedAt: new Date(now.getTime() + 10000).toISOString(),
      }));
      scheduleDb.appendRun('test-specialist', makeRun({
        outcome: 'failed', tokensUsed: 500, costUsd: 0.005,
        startedAt: now.toISOString(),
        completedAt: new Date(now.getTime() + 3000).toISOString(),
      }));

      const stats = scheduleDb.getRunStats('test-specialist');
      expect(stats.totalRuns).toBe(3);
      expect(stats.successRate).toBeCloseTo(66.67, 0);
      expect(stats.weeklyCost).toBeCloseTo(0.035, 3);
      expect(stats.averageTokensPerRun).toBeCloseTo(1166.67, 0);
      expect(stats.averageDurationMs).toBeCloseTo(6000, 0);
    });

    it('should return zero-stats when no runs exist', () => {
      const stats = scheduleDb.getRunStats('nonexistent');
      expect(stats).toEqual({
        totalRuns: 0,
        successRate: 0,
        weeklyCost: 0,
        averageTokensPerRun: 0,
        averageDurationMs: 0,
      });
    });

    it('should trim history keeping only the most recent N entries', () => {
      const now = Date.now();
      for (let i = 0; i < 10; i++) {
        scheduleDb.appendRun('test-specialist', makeRun({
          id: `run-${i}`,
          startedAt: new Date(now + i * 1000).toISOString(),
        }));
      }

      scheduleDb.trimHistory('test-specialist', 5);

      const runs = scheduleDb.getRecentRuns('test-specialist', 100);
      expect(runs).toHaveLength(5);
      expect(runs[0].id).toBe('run-5');
    });

    it('should handle appendRunLog and getRunLog for per-run log files', () => {
      scheduleDb.appendRunLog('test-specialist', 'run-1', 'Line 1');
      scheduleDb.appendRunLog('test-specialist', 'run-1', 'Line 2');

      const log = scheduleDb.getRunLog('test-specialist', 'run-1');
      expect(log).toContain('Line 1');
      expect(log).toContain('Line 2');
    });
  });

  describe('actions', () => {
    it('should insert and retrieve recent actions for a specialist', () => {
      const action = makeAction({ id: 'a1', specialistId: 'test-specialist' });
      scheduleDb.appendAction('test-specialist', action);

      const actions = scheduleDb.getRecentActions('test-specialist', 10);
      expect(actions).toHaveLength(1);
      expect(actions[0].id).toBe('a1');
    });

    it('should filter actions by run ID', () => {
      scheduleDb.appendAction('test-specialist', makeAction({ id: 'a1', runId: 'run-1' }));
      scheduleDb.appendAction('test-specialist', makeAction({ id: 'a2', runId: 'run-2' }));
      scheduleDb.appendAction('test-specialist', makeAction({ id: 'a3', runId: 'run-1' }));

      const actions = scheduleDb.getActionsByRun('test-specialist', 'run-1');
      expect(actions.map(a => a.id)).toEqual(['a1', 'a3']);
    });

    it('should merge actions from multiple specialists sorted by timestamp descending', () => {
      scheduleDb.appendAction('twitter-growth', makeAction({
        id: 'a1', specialistId: 'twitter-growth', timestamp: '2026-03-11T09:00:00.000Z',
      }));
      scheduleDb.appendAction('twitter-growth', makeAction({
        id: 'a3', specialistId: 'twitter-growth', timestamp: '2026-03-11T11:00:00.000Z',
      }));
      scheduleDb.appendAction('security-monitor', makeAction({
        id: 'a2', specialistId: 'security-monitor', timestamp: '2026-03-11T10:00:00.000Z',
      }));
      scheduleDb.appendAction('security-monitor', makeAction({
        id: 'a4', specialistId: 'security-monitor', timestamp: '2026-03-11T12:00:00.000Z',
      }));

      const result = scheduleDb.getAllRecentActions(['twitter-growth', 'security-monitor'], 100);
      expect(result.map(e => e.id)).toEqual(['a4', 'a3', 'a2', 'a1']);
    });

    it('should respect the limit parameter across merged results', () => {
      scheduleDb.appendAction('twitter-growth', makeAction({
        id: 'a1', specialistId: 'twitter-growth', timestamp: '2026-03-11T09:00:00.000Z',
      }));
      scheduleDb.appendAction('twitter-growth', makeAction({
        id: 'a3', specialistId: 'twitter-growth', timestamp: '2026-03-11T11:00:00.000Z',
      }));
      scheduleDb.appendAction('security-monitor', makeAction({
        id: 'a2', specialistId: 'security-monitor', timestamp: '2026-03-11T10:00:00.000Z',
      }));
      scheduleDb.appendAction('security-monitor', makeAction({
        id: 'a4', specialistId: 'security-monitor', timestamp: '2026-03-11T12:00:00.000Z',
      }));

      const result = scheduleDb.getAllRecentActions(['twitter-growth', 'security-monitor'], 2);
      expect(result).toHaveLength(2);
      expect(result.map(e => e.id)).toEqual(['a4', 'a3']);
    });

    it('should compute action stats with GROUP BY', () => {
      scheduleDb.appendAction('test-specialist', makeAction({ id: 'a1', action: 'tweet_posted' }));
      scheduleDb.appendAction('test-specialist', makeAction({ id: 'a2', action: 'tweet_posted' }));
      scheduleDb.appendAction('test-specialist', makeAction({ id: 'a3', action: 'mentions_checked' }));

      const stats = scheduleDb.getActionStats('test-specialist');
      expect(stats.totalActions).toBe(3);
      expect(stats.actionCounts).toEqual({
        tweet_posted: 2,
        mentions_checked: 1,
      });
    });
  });

  describe('credentials', () => {
    it('should return empty object for unknown specialist', () => {
      const result = scheduleDb.loadCredentials('non-existent');
      expect(result).toEqual({});
    });

    it('should save and load credentials', () => {
      scheduleDb.saveCredentials('twitter-growth', 'twitter-api', { API_KEY: 'abc123', API_SECRET: 'secret456' });

      const result = scheduleDb.loadCredentials('twitter-growth');
      expect(result).toEqual({
        'twitter-api': { API_KEY: 'abc123', API_SECRET: 'secret456' },
      });
    });

    it('should merge partial credential updates preserving existing keys', () => {
      scheduleDb.saveCredentials('twitter-growth', 'twitter-api', { API_KEY: 'old-key', API_SECRET: 'secret-1' });
      scheduleDb.saveCredentials('twitter-growth', 'twitter-api', { API_KEY: 'new-key' });

      const result = scheduleDb.loadCredentials('twitter-growth');
      expect(result).toEqual({
        'twitter-api': { API_KEY: 'new-key', API_SECRET: 'secret-1' },
      });
    });

    it('should delete credentials for a specialist without affecting others', () => {
      scheduleDb.saveCredentials('twitter-growth', 'twitter-api', { API_KEY: 'abc' });
      scheduleDb.saveCredentials('security-monitor', 'slack', { WEBHOOK_URL: 'https://...' });

      scheduleDb.deleteCredentials('twitter-growth');

      expect(scheduleDb.loadCredentials('twitter-growth')).toEqual({});
      expect(scheduleDb.loadCredentials('security-monitor')).toEqual({
        slack: { WEBHOOK_URL: 'https://...' },
      });
    });

    it('should return redacted credentials (boolean flags, not values)', () => {
      scheduleDb.saveCredentials('twitter-growth', 'twitter-api', { API_KEY: 'abc123', API_SECRET: '' });

      const result = scheduleDb.loadRedactedCredentials('twitter-growth');
      expect(result).toEqual({
        'twitter-api': { API_KEY: true, API_SECRET: false },
      });
    });
  });

  describe('resetSpecialist', () => {
    it('should clear runs for the specialist', () => {
      scheduleDb.appendRun('test-specialist', makeRun({ id: 'run-1', specialistId: 'test-specialist' }));
      scheduleDb.appendRun('test-specialist', makeRun({ id: 'run-2', specialistId: 'test-specialist' }));

      const state = {
        specialists: {
          'test-specialist': {
            id: 'test-specialist', enabled: true,
            consecutiveNoAction: 3, consecutiveFailures: 2,
            totalRuns: 10, successRate: 80, weeklyCost: 5.0, skipEveryN: 4,
          },
        },
        globalEnabled: true,
      };
      scheduleDb.saveScheduleState(state);

      const updated = scheduleDb.resetSpecialist(scheduleDb.getScheduleState(), 'test-specialist');
      scheduleDb.saveScheduleState(updated);

      const runs = scheduleDb.getRecentRuns('test-specialist', 100);
      expect(runs).toHaveLength(0);
    });

    it('should clear actions for the specialist', () => {
      scheduleDb.appendAction('test-specialist', makeAction({ id: 'a1', specialistId: 'test-specialist' }));
      scheduleDb.appendAction('test-specialist', makeAction({ id: 'a2', specialistId: 'test-specialist' }));

      const state = {
        specialists: {
          'test-specialist': {
            id: 'test-specialist', enabled: true,
            consecutiveNoAction: 0, consecutiveFailures: 0,
            totalRuns: 5, successRate: 100, weeklyCost: 1.0,
          },
        },
        globalEnabled: true,
      };
      scheduleDb.saveScheduleState(state);

      const updated = scheduleDb.resetSpecialist(scheduleDb.getScheduleState(), 'test-specialist');
      scheduleDb.saveScheduleState(updated);

      const actions = scheduleDb.getRecentActions('test-specialist', 100);
      expect(actions).toHaveLength(0);
    });

    it('should clear run log files for the specialist', () => {
      scheduleDb.appendRunLog('test-specialist', 'run-1', 'Some log data');
      const logBefore = scheduleDb.getRunLog('test-specialist', 'run-1');
      expect(logBefore).toContain('Some log data');

      const state = {
        specialists: {
          'test-specialist': {
            id: 'test-specialist', enabled: true,
            consecutiveNoAction: 0, consecutiveFailures: 0,
            totalRuns: 1, successRate: 100, weeklyCost: 0.1,
          },
        },
        globalEnabled: true,
      };
      scheduleDb.saveScheduleState(state);

      const updated = scheduleDb.resetSpecialist(scheduleDb.getScheduleState(), 'test-specialist');
      scheduleDb.saveScheduleState(updated);

      // Run log directory should be deleted
      const runsDir = path.join(tempDir, '.yolium', 'schedules', 'test-specialist', 'runs');
      expect(fs.existsSync(runsDir)).toBe(false);
    });

    it('should clear the digest file for the specialist', () => {
      const specialistDir = path.join(tempDir, '.yolium', 'schedules', 'test-specialist');
      fs.mkdirSync(specialistDir, { recursive: true });
      fs.writeFileSync(path.join(specialistDir, 'digest.md'), '# Digest\nSome content');
      expect(fs.existsSync(path.join(specialistDir, 'digest.md'))).toBe(true);

      const state = {
        specialists: {
          'test-specialist': {
            id: 'test-specialist', enabled: true,
            consecutiveNoAction: 0, consecutiveFailures: 0,
            totalRuns: 1, successRate: 100, weeklyCost: 0.1,
          },
        },
        globalEnabled: true,
      };
      scheduleDb.saveScheduleState(state);

      const updated = scheduleDb.resetSpecialist(scheduleDb.getScheduleState(), 'test-specialist');
      scheduleDb.saveScheduleState(updated);

      expect(fs.existsSync(path.join(specialistDir, 'digest.md'))).toBe(false);
    });

    it('should delete the workspace directory for the specialist', () => {
      const workspaceDir = path.join(tempDir, '.yolium', 'schedules', 'test-specialist', 'workspace');
      fs.mkdirSync(workspaceDir, { recursive: true });
      fs.writeFileSync(path.join(workspaceDir, 'some-file.txt'), 'workspace data');
      expect(fs.existsSync(workspaceDir)).toBe(true);

      const state = {
        specialists: {
          'test-specialist': {
            id: 'test-specialist', enabled: true,
            consecutiveNoAction: 0, consecutiveFailures: 0,
            totalRuns: 1, successRate: 100, weeklyCost: 0.1,
          },
        },
        globalEnabled: true,
      };
      scheduleDb.saveScheduleState(state);

      const updated = scheduleDb.resetSpecialist(scheduleDb.getScheduleState(), 'test-specialist');
      scheduleDb.saveScheduleState(updated);

      expect(fs.existsSync(workspaceDir)).toBe(false);
    });

    it('should reset specialist status counters (consecutiveNoAction, consecutiveFailures, totalRuns, successRate, weeklyCost, skipEveryN)', () => {
      const state = {
        specialists: {
          'test-specialist': {
            id: 'test-specialist', enabled: true,
            consecutiveNoAction: 5, consecutiveFailures: 3,
            totalRuns: 50, successRate: 72, weeklyCost: 12.5, skipEveryN: 8,
          },
        },
        globalEnabled: true,
      };
      scheduleDb.saveScheduleState(state);

      const updated = scheduleDb.resetSpecialist(scheduleDb.getScheduleState(), 'test-specialist');

      const specialist = updated.specialists['test-specialist'];
      expect(specialist.consecutiveNoAction).toBe(0);
      expect(specialist.consecutiveFailures).toBe(0);
      expect(specialist.totalRuns).toBe(0);
      expect(specialist.successRate).toBe(0);
      expect(specialist.weeklyCost).toBe(0);
      expect(specialist.skipEveryN).toBeUndefined();
      // enabled should be preserved
      expect(specialist.enabled).toBe(true);
    });

    it('should not affect runs/actions/files of other specialists', () => {
      // Set up data for two specialists
      scheduleDb.appendRun('test-specialist', makeRun({ id: 'run-a', specialistId: 'test-specialist' }));
      scheduleDb.appendRun('other-specialist', makeRun({ id: 'run-b', specialistId: 'other-specialist' }));
      scheduleDb.appendAction('test-specialist', makeAction({ id: 'a1', specialistId: 'test-specialist' }));
      scheduleDb.appendAction('other-specialist', makeAction({ id: 'a2', specialistId: 'other-specialist' }));
      scheduleDb.appendRunLog('other-specialist', 'run-b', 'Other specialist log');
      scheduleDb.saveCredentials('test-specialist', 'twitter-api', { API_KEY: 'key1' });
      scheduleDb.saveCredentials('other-specialist', 'slack', { WEBHOOK: 'url' });

      const state = {
        specialists: {
          'test-specialist': {
            id: 'test-specialist', enabled: true,
            consecutiveNoAction: 3, consecutiveFailures: 2,
            totalRuns: 10, successRate: 80, weeklyCost: 5.0,
          },
          'other-specialist': {
            id: 'other-specialist', enabled: true,
            consecutiveNoAction: 1, consecutiveFailures: 0,
            totalRuns: 5, successRate: 100, weeklyCost: 2.0,
          },
        },
        globalEnabled: true,
      };
      scheduleDb.saveScheduleState(state);

      const updated = scheduleDb.resetSpecialist(scheduleDb.getScheduleState(), 'test-specialist');
      scheduleDb.saveScheduleState(updated);

      // Other specialist's data should be intact
      expect(scheduleDb.getRecentRuns('other-specialist', 100)).toHaveLength(1);
      expect(scheduleDb.getRecentActions('other-specialist', 100)).toHaveLength(1);
      expect(scheduleDb.getRunLog('other-specialist', 'run-b')).toContain('Other specialist log');
      expect(updated.specialists['other-specialist'].totalRuns).toBe(5);
      // Credentials for test-specialist should NOT be cleared
      expect(scheduleDb.loadCredentials('test-specialist')).toEqual({ 'twitter-api': { API_KEY: 'key1' } });
      expect(scheduleDb.loadCredentials('other-specialist')).toEqual({ slack: { WEBHOOK: 'url' } });
    });

    it('should handle specialist with no existing data gracefully', () => {
      const state = {
        specialists: {
          'empty-specialist': {
            id: 'empty-specialist', enabled: false,
            consecutiveNoAction: 0, consecutiveFailures: 0,
            totalRuns: 0, successRate: 0, weeklyCost: 0,
          },
        },
        globalEnabled: true,
      };
      scheduleDb.saveScheduleState(state);

      // Should not throw
      const updated = scheduleDb.resetSpecialist(scheduleDb.getScheduleState(), 'empty-specialist');

      expect(updated.specialists['empty-specialist'].totalRuns).toBe(0);
      expect(updated.specialists['empty-specialist'].consecutiveFailures).toBe(0);
    });
  });

  describe('database hardening', () => {
    it('should set busy_timeout pragma on database initialization', () => {
      const database = scheduleDb.getDb();
      const timeout = database.pragma('busy_timeout', { simple: true });
      expect(timeout).toBe(5000);
    });

    it('should set user_version pragma to 1 on fresh database', () => {
      const database = scheduleDb.getDb();
      const version = database.pragma('user_version', { simple: true });
      expect(version).toBe(1);
    });

    it('should preserve user_version 1 on subsequent opens', async () => {
      scheduleDb.getDb();
      scheduleDb.closeDb();

      vi.resetModules();
      scheduleDb = await import('@main/stores/schedule-db');

      const database = scheduleDb.getDb();
      const version = database.pragma('user_version', { simple: true });
      expect(version).toBe(1);
    });

    it('should handle malformed JSON in action data gracefully', () => {
      const action = makeAction({ id: 'bad-json-action', specialistId: 'test-specialist' });
      scheduleDb.appendAction('test-specialist', action);

      // Corrupt the data column
      const database = scheduleDb.getDb();
      database.prepare('UPDATE actions SET data = ? WHERE id = ?')
        .run('{not valid json', 'bad-json-action');

      const actions = scheduleDb.getRecentActions('test-specialist', 10);
      expect(actions).toHaveLength(1);
      expect(actions[0].data).toEqual({});
    });

    it('should log a warning when legacy config migration fails', async () => {
      scheduleDb.closeDb();
      loggerWarnMock.mockClear();

      const schedulesDir = path.join(tempDir, '.yolium', 'schedules');
      fs.mkdirSync(schedulesDir, { recursive: true });
      fs.writeFileSync(path.join(schedulesDir, 'config.json'), '{corrupted json');

      vi.resetModules();
      scheduleDb = await import('@main/stores/schedule-db');
      scheduleDb.getDb();

      expect(loggerWarnMock).toHaveBeenCalled();
    });

    it('should log a warning when legacy run history migration fails', async () => {
      scheduleDb.closeDb();
      loggerWarnMock.mockClear();

      const specialistDir = path.join(tempDir, '.yolium', 'schedules', 'test-specialist');
      fs.mkdirSync(specialistDir, { recursive: true });
      // Write a file that will cause the outer try to fail (make it unreadable by writing then removing read perms)
      // Instead, use a simpler approach: write JSONL with only corrupted lines
      fs.writeFileSync(path.join(specialistDir, 'run_history.jsonl'), '{bad\n{also bad\n');

      vi.resetModules();
      scheduleDb = await import('@main/stores/schedule-db');
      scheduleDb.getDb();

      // The inner catch for individual lines should log warnings
      expect(loggerWarnMock).toHaveBeenCalled();
    });

    it('should log a warning when legacy action log migration fails', async () => {
      scheduleDb.closeDb();
      loggerWarnMock.mockClear();

      const specialistDir = path.join(tempDir, '.yolium', 'schedules', 'test-specialist');
      fs.mkdirSync(specialistDir, { recursive: true });
      fs.writeFileSync(path.join(specialistDir, 'actions.jsonl'), '{corrupted\n');

      vi.resetModules();
      scheduleDb = await import('@main/stores/schedule-db');
      scheduleDb.getDb();

      expect(loggerWarnMock).toHaveBeenCalled();
    });

    it('should log a warning when legacy credentials migration fails', async () => {
      scheduleDb.closeDb();
      loggerWarnMock.mockClear();

      const yoliumDir = path.join(tempDir, '.yolium');
      fs.mkdirSync(yoliumDir, { recursive: true });
      fs.writeFileSync(path.join(yoliumDir, 'specialist-credentials.json'), 'not json');

      vi.resetModules();
      scheduleDb = await import('@main/stores/schedule-db');
      scheduleDb.getDb();

      expect(loggerWarnMock).toHaveBeenCalled();
    });
  });

  describe('migration', () => {
    it('should import legacy config.json into schedule_state table', async () => {
      // Close existing DB so we can set up legacy files before opening
      scheduleDb.closeDb();

      const schedulesDir = path.join(tempDir, '.yolium', 'schedules');
      fs.mkdirSync(schedulesDir, { recursive: true });

      const legacyState = {
        specialists: {
          'security-monitor': {
            id: 'security-monitor',
            enabled: true,
            consecutiveNoAction: 0,
            consecutiveFailures: 0,
            totalRuns: 5,
            successRate: 80,
            weeklyCost: 1.5,
          },
        },
        globalEnabled: true,
      };
      fs.writeFileSync(path.join(schedulesDir, 'config.json'), JSON.stringify(legacyState));

      // Re-import to trigger migration
      vi.resetModules();
      scheduleDb = await import('@main/stores/schedule-db');

      const state = scheduleDb.getScheduleState();
      expect(state.globalEnabled).toBe(true);
      expect(state.specialists['security-monitor'].totalRuns).toBe(5);

      // Legacy file should be renamed
      expect(fs.existsSync(path.join(schedulesDir, 'config.json.migrated'))).toBe(true);
      expect(fs.existsSync(path.join(schedulesDir, 'config.json'))).toBe(false);
    });

    it('should import legacy JSONL run history into runs table', async () => {
      scheduleDb.closeDb();

      const specialistDir = path.join(tempDir, '.yolium', 'schedules', 'test-specialist');
      fs.mkdirSync(specialistDir, { recursive: true });

      const runs = [
        makeRun({ id: 'legacy-1', specialistId: 'test-specialist' }),
        makeRun({ id: 'legacy-2', specialistId: 'test-specialist' }),
      ];
      fs.writeFileSync(
        path.join(specialistDir, 'run_history.jsonl'),
        runs.map(r => JSON.stringify(r)).join('\n') + '\n'
      );

      vi.resetModules();
      scheduleDb = await import('@main/stores/schedule-db');

      const loaded = scheduleDb.getRecentRuns('test-specialist', 100);
      expect(loaded).toHaveLength(2);
      expect(loaded.map(r => r.id)).toContain('legacy-1');
      expect(loaded.map(r => r.id)).toContain('legacy-2');

      // Legacy file renamed
      expect(fs.existsSync(path.join(specialistDir, 'run_history.jsonl.migrated'))).toBe(true);
    });

    it('should import legacy JSONL action logs into actions table', async () => {
      scheduleDb.closeDb();

      const specialistDir = path.join(tempDir, '.yolium', 'schedules', 'test-specialist');
      fs.mkdirSync(specialistDir, { recursive: true });

      const actions = [
        makeAction({ id: 'legacy-a1', specialistId: 'test-specialist' }),
        makeAction({ id: 'legacy-a2', specialistId: 'test-specialist' }),
      ];
      fs.writeFileSync(
        path.join(specialistDir, 'actions.jsonl'),
        actions.map(a => JSON.stringify(a)).join('\n') + '\n'
      );

      vi.resetModules();
      scheduleDb = await import('@main/stores/schedule-db');

      const loaded = scheduleDb.getRecentActions('test-specialist', 100);
      expect(loaded).toHaveLength(2);
      expect(loaded.map(a => a.id)).toContain('legacy-a1');
    });

    it('should import legacy credentials JSON into credentials table', async () => {
      scheduleDb.closeDb();

      const yoliumDir = path.join(tempDir, '.yolium');
      fs.mkdirSync(yoliumDir, { recursive: true });

      const legacyCreds = {
        'twitter-growth': {
          'twitter-api': { API_KEY: 'abc123', API_SECRET: 'secret' },
        },
      };
      fs.writeFileSync(
        path.join(yoliumDir, 'specialist-credentials.json'),
        JSON.stringify(legacyCreds)
      );

      vi.resetModules();
      scheduleDb = await import('@main/stores/schedule-db');

      const loaded = scheduleDb.loadCredentials('twitter-growth');
      expect(loaded).toEqual({
        'twitter-api': { API_KEY: 'abc123', API_SECRET: 'secret' },
      });

      // Legacy file renamed
      expect(fs.existsSync(path.join(yoliumDir, 'specialist-credentials.json.migrated'))).toBe(true);
    });

    it('should skip migration when no legacy files exist', async () => {
      scheduleDb.closeDb();
      vi.resetModules();
      scheduleDb = await import('@main/stores/schedule-db');

      // Should just work with empty state
      const state = scheduleDb.getScheduleState();
      expect(state.globalEnabled).toBe(false);
      expect(state.specialists).toEqual({});
    });
  });
});
