/**
 * @module src/main/stores/schedule-db
 * Unified SQLite store for schedule state, run history, action logs, and credentials.
 * Replaces schedule-store, run-history-store, action-log-store, specialist-credentials-store.
 */

import Database from 'better-sqlite3';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type {
  ScheduleState,
  SpecialistStatus,
  ScheduledRun,
  RunStats,
  ActionLogEntry,
  ActionStats,
  ServiceCredentials,
} from '@shared/types/schedule';

let db: Database.Database | null = null;

function getSchedulesDir(): string {
  return path.join(os.homedir(), '.yolium', 'schedules');
}

function getDbPath(): string {
  return path.join(os.homedir(), '.yolium', 'schedules.db');
}

function createSchema(database: Database.Database): void {
  database.exec(`
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
    CREATE INDEX IF NOT EXISTS idx_runs_specialist ON runs(specialist_id, started_at);

    CREATE TABLE IF NOT EXISTS actions (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      specialist_id TEXT NOT NULL,
      action TEXT NOT NULL,
      data TEXT NOT NULL DEFAULT '{}',
      timestamp TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_actions_specialist ON actions(specialist_id, timestamp);
    CREATE INDEX IF NOT EXISTS idx_actions_run ON actions(run_id);

    CREATE TABLE IF NOT EXISTS credentials (
      specialist_id TEXT NOT NULL,
      service_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      PRIMARY KEY (specialist_id, service_id, key)
    );
  `);
}

// ─── Migration ────────────────────────────────────────────────────────────

function migrateLegacyData(database: Database.Database): void {
  migrateLegacyConfig(database);
  migrateLegacyRunHistory(database);
  migrateLegacyActionLogs(database);
  migrateLegacyCredentials(database);
}

function migrateLegacyConfig(database: Database.Database): void {
  const configPath = path.join(getSchedulesDir(), 'config.json');
  if (!fs.existsSync(configPath)) return;

  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    const state = JSON.parse(content) as ScheduleState;

    const upsert = database.prepare(
      'INSERT OR REPLACE INTO schedule_state (key, value) VALUES (?, ?)'
    );
    upsert.run('state', JSON.stringify(state));

    fs.renameSync(configPath, configPath + '.migrated');
  } catch {
    // Skip corrupted config
  }
}

function migrateLegacyRunHistory(database: Database.Database): void {
  const schedulesDir = getSchedulesDir();
  if (!fs.existsSync(schedulesDir)) return;

  const insert = database.prepare(`
    INSERT OR IGNORE INTO runs (id, specialist_id, schedule_type, started_at, completed_at, status, tokens_used, cost_usd, summary, outcome)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let entries: string[];
  try {
    entries = fs.readdirSync(schedulesDir);
  } catch {
    return;
  }

  for (const entry of entries) {
    const historyPath = path.join(schedulesDir, entry, 'run_history.jsonl');
    if (!fs.existsSync(historyPath)) continue;

    try {
      const content = fs.readFileSync(historyPath, 'utf-8');
      for (const line of content.split('\n').filter(l => l.trim())) {
        try {
          const run = JSON.parse(line) as ScheduledRun;
          insert.run(
            run.id, run.specialistId, run.scheduleType,
            run.startedAt, run.completedAt, run.status,
            run.tokensUsed, run.costUsd, run.summary, run.outcome
          );
        } catch {
          // Skip corrupted lines
        }
      }
      fs.renameSync(historyPath, historyPath + '.migrated');
    } catch {
      // Skip unreadable files
    }
  }
}

function migrateLegacyActionLogs(database: Database.Database): void {
  const schedulesDir = getSchedulesDir();
  if (!fs.existsSync(schedulesDir)) return;

  const insert = database.prepare(`
    INSERT OR IGNORE INTO actions (id, run_id, specialist_id, action, data, timestamp)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  let entries: string[];
  try {
    entries = fs.readdirSync(schedulesDir);
  } catch {
    return;
  }

  for (const entry of entries) {
    const actionsPath = path.join(schedulesDir, entry, 'actions.jsonl');
    if (!fs.existsSync(actionsPath)) continue;

    try {
      const content = fs.readFileSync(actionsPath, 'utf-8');
      for (const line of content.split('\n').filter(l => l.trim())) {
        try {
          const action = JSON.parse(line) as ActionLogEntry;
          insert.run(
            action.id, action.runId, action.specialistId,
            action.action, JSON.stringify(action.data), action.timestamp
          );
        } catch {
          // Skip corrupted lines
        }
      }
      fs.renameSync(actionsPath, actionsPath + '.migrated');
    } catch {
      // Skip unreadable files
    }
  }
}

function migrateLegacyCredentials(database: Database.Database): void {
  const credPath = path.join(os.homedir(), '.yolium', 'specialist-credentials.json');
  if (!fs.existsSync(credPath)) return;

  try {
    const content = fs.readFileSync(credPath, 'utf-8');
    const store = JSON.parse(content) as Record<string, ServiceCredentials>;

    const insert = database.prepare(
      'INSERT OR REPLACE INTO credentials (specialist_id, service_id, key, value) VALUES (?, ?, ?, ?)'
    );

    for (const [specialistId, services] of Object.entries(store)) {
      for (const [serviceId, creds] of Object.entries(services)) {
        for (const [key, value] of Object.entries(creds)) {
          insert.run(specialistId, serviceId, key, value);
        }
      }
    }

    fs.renameSync(credPath, credPath + '.migrated');
  } catch {
    // Skip corrupted credentials
  }
}

// ─── Database Lifecycle ───────────────────────────────────────────────────

export function getDb(): Database.Database {
  if (db) return db;

  const dbPath = getDbPath();
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  createSchema(db);
  migrateLegacyData(db);

  // Set file permissions to 0o600
  try {
    fs.chmodSync(dbPath, 0o600);
  } catch {
    // May fail on Windows — non-critical
  }

  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

// ─── Schedule State ───────────────────────────────────────────────────────

function createDefaultState(): ScheduleState {
  return { specialists: {}, globalEnabled: false };
}

export function getScheduleState(): ScheduleState {
  const database = getDb();
  const row = database.prepare('SELECT value FROM schedule_state WHERE key = ?').get('state') as { value: string } | undefined;
  if (!row) return createDefaultState();

  try {
    return JSON.parse(row.value) as ScheduleState;
  } catch {
    return createDefaultState();
  }
}

export function saveScheduleState(state: ScheduleState): void {
  const database = getDb();
  database.prepare('INSERT OR REPLACE INTO schedule_state (key, value) VALUES (?, ?)').run('state', JSON.stringify(state));
}

export function updateSpecialistStatus(
  state: ScheduleState,
  id: string,
  updates: Partial<SpecialistStatus>
): ScheduleState {
  const existing = state.specialists[id];
  if (!existing) return state;

  return {
    ...state,
    specialists: {
      ...state.specialists,
      [id]: { ...existing, ...updates },
    },
  };
}

export function toggleSpecialist(
  state: ScheduleState,
  id: string,
  enabled: boolean
): ScheduleState {
  return updateSpecialistStatus(state, id, { enabled });
}

export function toggleGlobal(
  state: ScheduleState,
  enabled: boolean
): ScheduleState {
  return { ...state, globalEnabled: enabled };
}

// ─── Run History ──────────────────────────────────────────────────────────

export function appendRun(specialistId: string, run: ScheduledRun): void {
  const database = getDb();
  database.prepare(`
    INSERT OR REPLACE INTO runs (id, specialist_id, schedule_type, started_at, completed_at, status, tokens_used, cost_usd, summary, outcome)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    run.id, run.specialistId, run.scheduleType,
    run.startedAt, run.completedAt, run.status,
    run.tokensUsed, run.costUsd, run.summary, run.outcome
  );
}

export function getRecentRuns(specialistId: string, limit: number): ScheduledRun[] {
  const database = getDb();
  const rows = database.prepare(`
    SELECT * FROM (
      SELECT id, specialist_id, schedule_type, started_at, completed_at, status, tokens_used, cost_usd, summary, outcome
      FROM runs WHERE specialist_id = ?
      ORDER BY started_at DESC LIMIT ?
    ) sub ORDER BY started_at ASC
  `).all(specialistId, limit) as any[];

  return rows.map(rowToRun);
}

export function getRunsSince(specialistId: string, since: Date): ScheduledRun[] {
  const database = getDb();
  const rows = database.prepare(`
    SELECT id, specialist_id, schedule_type, started_at, completed_at, status, tokens_used, cost_usd, summary, outcome
    FROM runs WHERE specialist_id = ? AND started_at >= ?
    ORDER BY started_at ASC
  `).all(specialistId, since.toISOString()) as any[];

  return rows.map(rowToRun);
}

export function getRunStats(specialistId: string): RunStats {
  const database = getDb();

  const statsRow = database.prepare(`
    SELECT
      COUNT(*) as total_runs,
      SUM(CASE WHEN outcome IN ('completed', 'no_action') THEN 1 ELSE 0 END) as success_count,
      SUM(tokens_used) as total_tokens,
      SUM(
        (julianday(completed_at) - julianday(started_at)) * 86400000
      ) as total_duration_ms
    FROM runs WHERE specialist_id = ?
  `).get(specialistId) as any;

  if (!statsRow || statsRow.total_runs === 0) {
    return { totalRuns: 0, successRate: 0, weeklyCost: 0, averageTokensPerRun: 0, averageDurationMs: 0 };
  }

  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const costRow = database.prepare(`
    SELECT COALESCE(SUM(cost_usd), 0) as weekly_cost
    FROM runs WHERE specialist_id = ? AND started_at >= ?
  `).get(specialistId, oneWeekAgo) as any;

  return {
    totalRuns: statsRow.total_runs,
    successRate: (statsRow.success_count / statsRow.total_runs) * 100,
    weeklyCost: costRow.weekly_cost,
    averageTokensPerRun: statsRow.total_tokens / statsRow.total_runs,
    averageDurationMs: statsRow.total_duration_ms / statsRow.total_runs,
  };
}

export function trimHistory(specialistId: string, maxEntries: number): void {
  const database = getDb();
  database.prepare(`
    DELETE FROM runs WHERE specialist_id = ? AND id NOT IN (
      SELECT id FROM runs WHERE specialist_id = ?
      ORDER BY started_at DESC LIMIT ?
    )
  `).run(specialistId, specialistId, maxEntries);
}

// ─── Per-Run Log Files (stay as files, not SQLite) ────────────────────────

function getRunLogDir(specialistId: string): string {
  return path.join(getSchedulesDir(), specialistId, 'runs');
}

function getRunLogPath(specialistId: string, runId: string): string {
  return path.join(getRunLogDir(specialistId), `${runId}.log`);
}

export function appendRunLog(specialistId: string, runId: string, data: string): void {
  const dir = getRunLogDir(specialistId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const timestamp = new Date().toISOString();
  fs.appendFileSync(getRunLogPath(specialistId, runId), `[${timestamp}] ${data}\n`, 'utf-8');
}

export function getRunLog(specialistId: string, runId: string): string {
  const logPath = getRunLogPath(specialistId, runId);
  if (!fs.existsSync(logPath)) return '';
  return fs.readFileSync(logPath, 'utf-8');
}

// ─── Action Log ───────────────────────────────────────────────────────────

export function appendAction(specialistId: string, entry: ActionLogEntry): void {
  const database = getDb();
  database.prepare(`
    INSERT OR REPLACE INTO actions (id, run_id, specialist_id, action, data, timestamp)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(entry.id, entry.runId, entry.specialistId, entry.action, JSON.stringify(entry.data), entry.timestamp);
}

export function getRecentActions(specialistId: string, limit: number): ActionLogEntry[] {
  const database = getDb();
  const rows = database.prepare(`
    SELECT * FROM (
      SELECT id, run_id, specialist_id, action, data, timestamp
      FROM actions WHERE specialist_id = ?
      ORDER BY timestamp DESC LIMIT ?
    ) sub ORDER BY timestamp ASC
  `).all(specialistId, limit) as any[];

  return rows.map(rowToAction);
}

export function getActionsByRun(specialistId: string, runId: string): ActionLogEntry[] {
  const database = getDb();
  const rows = database.prepare(`
    SELECT id, run_id, specialist_id, action, data, timestamp
    FROM actions WHERE specialist_id = ? AND run_id = ?
    ORDER BY timestamp ASC
  `).all(specialistId, runId) as any[];

  return rows.map(rowToAction);
}

export function getAllRecentActions(specialistIds: string[], limit: number): ActionLogEntry[] {
  if (specialistIds.length === 0) return [];

  const database = getDb();
  const placeholders = specialistIds.map(() => '?').join(', ');
  const rows = database.prepare(`
    SELECT id, run_id, specialist_id, action, data, timestamp
    FROM actions WHERE specialist_id IN (${placeholders})
    ORDER BY timestamp DESC LIMIT ?
  `).all(...specialistIds, limit) as any[];

  return rows.map(rowToAction);
}

export function getActionStats(specialistId: string): ActionStats {
  const database = getDb();

  const totalRow = database.prepare(
    'SELECT COUNT(*) as total FROM actions WHERE specialist_id = ?'
  ).get(specialistId) as any;

  const countRows = database.prepare(
    'SELECT action, COUNT(*) as cnt FROM actions WHERE specialist_id = ? GROUP BY action'
  ).all(specialistId) as any[];

  const actionCounts: Record<string, number> = {};
  for (const row of countRows) {
    actionCounts[row.action] = row.cnt;
  }

  return {
    totalActions: totalRow?.total || 0,
    actionCounts,
  };
}

// ─── Credentials ──────────────────────────────────────────────────────────

export function saveCredentials(
  specialistId: string,
  serviceId: string,
  credentials: Record<string, string>
): void {
  if (Object.keys(credentials).length === 0) return;

  const database = getDb();
  const existing = loadServiceCredentials(database, specialistId, serviceId);

  const upsert = database.prepare(
    'INSERT OR REPLACE INTO credentials (specialist_id, service_id, key, value) VALUES (?, ?, ?, ?)'
  );

  for (const [key, value] of Object.entries(credentials)) {
    if (value.length > 0 || !(key in existing)) {
      upsert.run(specialistId, serviceId, key, value);
    }
  }
}

export function loadCredentials(specialistId: string): ServiceCredentials {
  const database = getDb();
  const rows = database.prepare(
    'SELECT service_id, key, value FROM credentials WHERE specialist_id = ?'
  ).all(specialistId) as any[];

  const result: ServiceCredentials = {};
  for (const row of rows) {
    if (!result[row.service_id]) result[row.service_id] = {};
    result[row.service_id][row.key] = row.value;
  }
  return result;
}

export function loadRedactedCredentials(
  specialistId: string
): Record<string, Record<string, boolean>> {
  const credentials = loadCredentials(specialistId);
  const redacted: Record<string, Record<string, boolean>> = {};
  for (const [serviceId, creds] of Object.entries(credentials)) {
    redacted[serviceId] = {};
    for (const [key, value] of Object.entries(creds)) {
      redacted[serviceId][key] = value.length > 0;
    }
  }
  return redacted;
}

export function deleteCredentials(specialistId: string): void {
  const database = getDb();
  database.prepare('DELETE FROM credentials WHERE specialist_id = ?').run(specialistId);
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function loadServiceCredentials(
  database: Database.Database,
  specialistId: string,
  serviceId: string
): Record<string, string> {
  const rows = database.prepare(
    'SELECT key, value FROM credentials WHERE specialist_id = ? AND service_id = ?'
  ).all(specialistId, serviceId) as any[];

  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.key] = row.value;
  }
  return result;
}

function rowToRun(row: any): ScheduledRun {
  return {
    id: row.id,
    specialistId: row.specialist_id,
    scheduleType: row.schedule_type,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    status: row.status,
    tokensUsed: row.tokens_used,
    costUsd: row.cost_usd,
    summary: row.summary,
    outcome: row.outcome,
  };
}

function rowToAction(row: any): ActionLogEntry {
  return {
    id: row.id,
    runId: row.run_id,
    specialistId: row.specialist_id,
    action: row.action,
    data: JSON.parse(row.data),
    timestamp: row.timestamp,
  };
}
