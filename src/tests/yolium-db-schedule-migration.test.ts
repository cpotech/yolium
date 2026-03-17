// src/tests/yolium-db-schedule-migration.test.ts
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

vi.mock('@main/lib/logger', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

import type { ScheduledRun, ActionLogEntry } from '@shared/types/schedule';

let yoliumDb: typeof import('@main/stores/yolium-db');

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

/**
 * Create a schedules.db file with the same schema as the old schedule-db module.
 */
function createSchedulesDb(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS schedule_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      specialist_id TEXT NOT NULL,
      schedule_type TEXT NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT NOT NULL,
      status TEXT NOT NULL,
      tokens_used INTEGER NOT NULL DEFAULT 0,
      cost_usd REAL NOT NULL DEFAULT 0,
      summary TEXT NOT NULL DEFAULT '',
      outcome TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS actions (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      specialist_id TEXT NOT NULL,
      action TEXT NOT NULL,
      data TEXT NOT NULL DEFAULT '{}',
      timestamp TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS credentials (
      specialist_id TEXT NOT NULL,
      service_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      PRIMARY KEY (specialist_id, service_id, key)
    );
  `);
  return db;
}

describe('yolium-db schedule migration (schedules.db → yolium.db)', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yolium-db-migration-'));
    fs.mkdirSync(path.join(tempDir, '.yolium'), { recursive: true });
    homedirMock.mockReturnValue(tempDir);

    vi.resetModules();
    yoliumDb = await import('@main/stores/yolium-db');
  });

  afterEach(() => {
    yoliumDb.closeDb();
    vi.clearAllMocks();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should import tables from existing schedules.db into yolium.db on first open', async () => {
    // Close the DB opened during beforeEach (no schedules.db existed yet)
    yoliumDb.closeDb();

    // Create a schedules.db with test data
    const schedulesDbPath = path.join(tempDir, '.yolium', 'schedules.db');
    const sDb = createSchedulesDb(schedulesDbPath);

    const state = { specialists: { 'test-specialist': { id: 'test-specialist', enabled: true, consecutiveNoAction: 0, consecutiveFailures: 0, totalRuns: 5, successRate: 80, weeklyCost: 1.5 } }, globalEnabled: true };
    sDb.prepare('INSERT INTO schedule_state (key, value) VALUES (?, ?)').run('state', JSON.stringify(state));

    const run = makeRun({ id: 'migrated-run-1', specialistId: 'test-specialist' });
    sDb.prepare('INSERT INTO runs (id, specialist_id, schedule_type, started_at, completed_at, status, tokens_used, cost_usd, summary, outcome) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      run.id, run.specialistId, run.scheduleType, run.startedAt, run.completedAt, run.status, run.tokensUsed, run.costUsd, run.summary, run.outcome
    );

    const action = makeAction({ id: 'migrated-action-1', specialistId: 'test-specialist' });
    sDb.prepare('INSERT INTO actions (id, run_id, specialist_id, action, data, timestamp) VALUES (?, ?, ?, ?, ?, ?)').run(
      action.id, action.runId, action.specialistId, action.action, JSON.stringify(action.data), action.timestamp
    );

    sDb.prepare('INSERT INTO credentials (specialist_id, service_id, key, value) VALUES (?, ?, ?, ?)').run('test-specialist', 'twitter-api', 'API_KEY', 'abc123');

    sDb.close();

    // Re-import to trigger migration
    vi.resetModules();
    yoliumDb = await import('@main/stores/yolium-db');

    // Verify data was imported
    const loadedState = yoliumDb.getScheduleState();
    expect(loadedState.globalEnabled).toBe(true);
    expect(loadedState.specialists['test-specialist'].totalRuns).toBe(5);

    const runs = yoliumDb.getRecentRuns('test-specialist', 100);
    expect(runs).toHaveLength(1);
    expect(runs[0].id).toBe('migrated-run-1');

    const actions = yoliumDb.getRecentActions('test-specialist', 100);
    expect(actions).toHaveLength(1);
    expect(actions[0].id).toBe('migrated-action-1');

    const creds = yoliumDb.loadCredentials('test-specialist');
    expect(creds).toEqual({ 'twitter-api': { API_KEY: 'abc123' } });
  });

  it('should rename schedules.db to schedules.db.migrated after successful migration', async () => {
    yoliumDb.closeDb();

    const schedulesDbPath = path.join(tempDir, '.yolium', 'schedules.db');
    const sDb = createSchedulesDb(schedulesDbPath);
    sDb.close();

    vi.resetModules();
    yoliumDb = await import('@main/stores/yolium-db');
    yoliumDb.getDb(); // trigger init

    expect(fs.existsSync(schedulesDbPath)).toBe(false);
    expect(fs.existsSync(schedulesDbPath + '.migrated')).toBe(true);
  });

  it('should handle missing schedules.db gracefully (no-op)', () => {
    // The beforeEach already opened the DB without a schedules.db existing
    const state = yoliumDb.getScheduleState();
    expect(state.globalEnabled).toBe(false);
    expect(state.specialists).toEqual({});
  });

  it('should not duplicate data if migration runs again after schedules.db.migrated exists', async () => {
    yoliumDb.closeDb();

    const schedulesDbPath = path.join(tempDir, '.yolium', 'schedules.db');
    const sDb = createSchedulesDb(schedulesDbPath);
    const run = makeRun({ id: 'unique-run', specialistId: 'test-specialist' });
    sDb.prepare('INSERT INTO runs (id, specialist_id, schedule_type, started_at, completed_at, status, tokens_used, cost_usd, summary, outcome) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      run.id, run.specialistId, run.scheduleType, run.startedAt, run.completedAt, run.status, run.tokensUsed, run.costUsd, run.summary, run.outcome
    );
    sDb.close();

    // First open: migrate
    vi.resetModules();
    yoliumDb = await import('@main/stores/yolium-db');
    let runs = yoliumDb.getRecentRuns('test-specialist', 100);
    expect(runs).toHaveLength(1);
    yoliumDb.closeDb();

    // Second open: .migrated exists, should skip
    vi.resetModules();
    yoliumDb = await import('@main/stores/yolium-db');
    runs = yoliumDb.getRecentRuns('test-specialist', 100);
    expect(runs).toHaveLength(1); // still 1, not duplicated
  });

  it('should preserve existing yolium.db data during schedules.db migration', async () => {
    // Add kanban data first
    const board = yoliumDb.getOrCreateBoard('/test/project');
    yoliumDb.addItem(board, { title: 'Test item', description: 'desc', agentProvider: 'claude', order: 0 });
    yoliumDb.closeDb();

    // Create schedules.db
    const schedulesDbPath = path.join(tempDir, '.yolium', 'schedules.db');
    const sDb = createSchedulesDb(schedulesDbPath);
    const run = makeRun({ id: 'schedule-run', specialistId: 'test-specialist' });
    sDb.prepare('INSERT INTO runs (id, specialist_id, schedule_type, started_at, completed_at, status, tokens_used, cost_usd, summary, outcome) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      run.id, run.specialistId, run.scheduleType, run.startedAt, run.completedAt, run.status, run.tokensUsed, run.costUsd, run.summary, run.outcome
    );
    sDb.close();

    // Re-open: should migrate schedules and keep kanban data
    vi.resetModules();
    yoliumDb = await import('@main/stores/yolium-db');

    const loadedBoard = yoliumDb.getBoard('/test/project');
    expect(loadedBoard).not.toBeNull();
    expect(loadedBoard!.items).toHaveLength(1);
    expect(loadedBoard!.items[0].title).toBe('Test item');

    const runs = yoliumDb.getRecentRuns('test-specialist', 100);
    expect(runs).toHaveLength(1);
    expect(runs[0].id).toBe('schedule-run');
  });

  it('should import legacy config.json into schedule_state table', async () => {
    yoliumDb.closeDb();

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

    vi.resetModules();
    yoliumDb = await import('@main/stores/yolium-db');

    const state = yoliumDb.getScheduleState();
    expect(state.globalEnabled).toBe(true);
    expect(state.specialists['security-monitor'].totalRuns).toBe(5);

    expect(fs.existsSync(path.join(schedulesDir, 'config.json.migrated'))).toBe(true);
    expect(fs.existsSync(path.join(schedulesDir, 'config.json'))).toBe(false);
  });

  it('should import legacy JSONL run history into runs table', async () => {
    yoliumDb.closeDb();

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
    yoliumDb = await import('@main/stores/yolium-db');

    const loaded = yoliumDb.getRecentRuns('test-specialist', 100);
    expect(loaded).toHaveLength(2);
    expect(loaded.map(r => r.id)).toContain('legacy-1');
    expect(loaded.map(r => r.id)).toContain('legacy-2');

    expect(fs.existsSync(path.join(specialistDir, 'run_history.jsonl.migrated'))).toBe(true);
  });
});
