/**
 * @module src/main/stores/db-connection
 * DB singleton, shared helpers, schema creation, and legacy migrations.
 * Single database at ~/.yolium/yolium.db.
 */

import Database from 'better-sqlite3';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import type {
  KanbanBoard,
  KanbanItem,
  KanbanComment,
} from '@shared/types/kanban';
import type {
  ScheduleState,
  ScheduledRun,
  ActionLogEntry,
  ServiceCredentials,
} from '@shared/types/schedule';
import { createLogger } from '@main/lib/logger';

const logger = createLogger('yolium-db');

let db: Database.Database | null = null;

function getDbPath(): string {
  return path.join(os.homedir(), '.yolium', 'yolium.db');
}

export function generateId(): string {
  return crypto.randomBytes(8).toString('hex');
}

export function getSchedulesDir(): string {
  return path.join(os.homedir(), '.yolium', 'schedules');
}

// ─── Path Normalization ───────────────────────────────────────────────────

/**
 * Normalize a project path for consistent hashing.
 * Converts backslashes to forward slashes and removes trailing slashes
 * so that the same physical path always produces the same hash.
 */
export function normalizeForHash(projectPath: string): string {
  let normalized = path.resolve(projectPath).replace(/\\/g, '/');
  if (normalized.endsWith('/') && normalized.length > 1) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

export function safeJsonParse<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch { /* invalid JSON — use fallback */
    return fallback;
  }
}

// ─── Schema ───────────────────────────────────────────────────────────────

function createSchema(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS kanban_boards (
      id TEXT PRIMARY KEY,
      project_path TEXT NOT NULL UNIQUE,
      last_agent_name TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS kanban_items (
      id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL REFERENCES kanban_boards(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      "column" TEXT NOT NULL DEFAULT 'backlog',
      branch TEXT,
      agent_provider TEXT NOT NULL,
      agent_type TEXT,
      "order" INTEGER NOT NULL DEFAULT 0,
      model TEXT,
      agent_status TEXT NOT NULL DEFAULT 'idle',
      active_agent_name TEXT,
      last_agent_name TEXT,
      agent_question TEXT,
      agent_question_options TEXT,
      test_specs TEXT,
      worktree_path TEXT,
      merge_status TEXT,
      pr_url TEXT,
      verified INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_items_board ON kanban_items(board_id);

    CREATE TABLE IF NOT EXISTS kanban_comments (
      id TEXT PRIMARY KEY,
      item_id TEXT NOT NULL REFERENCES kanban_items(id) ON DELETE CASCADE,
      source TEXT NOT NULL,
      text TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      options TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_comments_item ON kanban_comments(item_id);

    CREATE TABLE IF NOT EXISTS project_registry (
      dir_name TEXT PRIMARY KEY,
      path TEXT NOT NULL,
      folder_name TEXT NOT NULL,
      last_accessed TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

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

function migrateLegacyBoards(database: Database.Database): void {
  const boardsDir = path.join(os.homedir(), '.yolium', 'boards');
  if (!fs.existsSync(boardsDir)) return;

  let files: string[];
  try {
    files = fs.readdirSync(boardsDir);
  } catch { /* directory not readable — skip migration */
    return;
  }

  const jsonFiles = files.filter(f => f.endsWith('.json') && !f.endsWith('.migrated'));
  if (jsonFiles.length === 0) return;

  const insertBoard = database.prepare(`
    INSERT OR IGNORE INTO kanban_boards (id, project_path, last_agent_name, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  const insertItem = database.prepare(`
    INSERT OR IGNORE INTO kanban_items (
      id, board_id, title, description, "column", branch, agent_provider, agent_type,
      "order", model, agent_status, active_agent_name, last_agent_name,
      agent_question, agent_question_options, test_specs, worktree_path,
      merge_status, pr_url, verified, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertComment = database.prepare(`
    INSERT OR IGNORE INTO kanban_comments (id, item_id, source, text, timestamp, options)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const migrateAll = database.transaction(() => {
    for (const file of jsonFiles) {
      const filePath = path.join(boardsDir, file);
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const board = JSON.parse(content) as KanbanBoard;

        const normalizedPath = normalizeForHash(board.projectPath);

        insertBoard.run(
          board.id,
          normalizedPath,
          board.lastAgentName ?? null,
          board.createdAt,
          board.updatedAt
        );

        for (const item of board.items || []) {
          insertItem.run(
            item.id,
            board.id,
            item.title,
            item.description || '',
            item.column || 'backlog',
            item.branch ?? null,
            item.agentProvider || 'claude',
            item.agentType ?? null,
            item.order || 0,
            item.model ?? null,
            item.agentStatus || 'idle',
            item.activeAgentName ?? null,
            item.lastAgentName ?? null,
            item.agentQuestion ?? null,
            item.agentQuestionOptions ? JSON.stringify(item.agentQuestionOptions) : null,
            item.testSpecs ? JSON.stringify(item.testSpecs) : null,
            item.worktreePath ?? null,
            item.mergeStatus ?? null,
            item.prUrl ?? null,
            item.verified === undefined ? null : item.verified ? 1 : 0,
            item.createdAt,
            item.updatedAt
          );

          for (const comment of item.comments || []) {
            insertComment.run(
              comment.id,
              item.id,
              comment.source,
              comment.text,
              comment.timestamp,
              comment.options && comment.options.length > 0 ? JSON.stringify(comment.options) : null
            );
          }
        }

        fs.renameSync(filePath, filePath + '.migrated');
      } catch (err) {
        logger.warn('Failed to migrate board file', { file, error: String(err) });
      }
    }
  });

  migrateAll();
}

function migrateLegacyProjectRegistry(database: Database.Database): void {
  const registryPath = path.join(os.homedir(), '.yolium', 'project-registry.json');
  if (!fs.existsSync(registryPath)) return;

  try {
    const content = fs.readFileSync(registryPath, 'utf-8');
    const registry = JSON.parse(content) as {
      version: number;
      projects: Record<string, { path: string; folderName: string; lastAccessed: string; createdAt: string }>;
    };

    const insert = database.prepare(`
      INSERT OR IGNORE INTO project_registry (dir_name, path, folder_name, last_accessed, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    for (const [dirName, entry] of Object.entries(registry.projects || {})) {
      insert.run(dirName, entry.path, entry.folderName, entry.lastAccessed, entry.createdAt);
    }

    fs.renameSync(registryPath, registryPath + '.migrated');
  } catch (err) {
    logger.warn('Failed to migrate project registry', { error: String(err) });
  }
}

// ─── Schedule Migrations ──────────────────────────────────────────────────

function migrateSchedulesDb(database: Database.Database): void {
  const yoliumDir = path.join(os.homedir(), '.yolium');
  const schedulesDbPath = path.join(yoliumDir, 'schedules.db');
  const migratedPath = schedulesDbPath + '.migrated';

  if (!fs.existsSync(schedulesDbPath) || fs.existsSync(migratedPath)) return;

  let sourceDb: Database.Database | null = null;
  try {
    sourceDb = new Database(schedulesDbPath, { readonly: true });

    const tables = sourceDb.prepare(
      "SELECT name FROM sqlite_master WHERE type='table'"
    ).all() as Array<{ name: string }>;
    const tableNames = new Set(tables.map(t => t.name));

    database.transaction(() => {
      if (tableNames.has('schedule_state')) {
        const rows = sourceDb!.prepare('SELECT key, value FROM schedule_state').all() as any[];
        const insert = database.prepare('INSERT OR IGNORE INTO schedule_state (key, value) VALUES (?, ?)');
        for (const row of rows) insert.run(row.key, row.value);
      }

      if (tableNames.has('runs')) {
        const rows = sourceDb!.prepare('SELECT * FROM runs').all() as any[];
        const insert = database.prepare(
          'INSERT OR IGNORE INTO runs (id, specialist_id, schedule_type, started_at, completed_at, status, tokens_used, cost_usd, summary, outcome) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        for (const row of rows) {
          insert.run(row.id, row.specialist_id, row.schedule_type, row.started_at, row.completed_at, row.status, row.tokens_used, row.cost_usd, row.summary, row.outcome);
        }
      }

      if (tableNames.has('actions')) {
        const rows = sourceDb!.prepare('SELECT * FROM actions').all() as any[];
        const insert = database.prepare(
          'INSERT OR IGNORE INTO actions (id, run_id, specialist_id, action, data, timestamp) VALUES (?, ?, ?, ?, ?, ?)'
        );
        for (const row of rows) {
          insert.run(row.id, row.run_id, row.specialist_id, row.action, row.data, row.timestamp);
        }
      }

      if (tableNames.has('credentials')) {
        const rows = sourceDb!.prepare('SELECT * FROM credentials').all() as any[];
        const insert = database.prepare(
          'INSERT OR IGNORE INTO credentials (specialist_id, service_id, key, value) VALUES (?, ?, ?, ?)'
        );
        for (const row of rows) {
          insert.run(row.specialist_id, row.service_id, row.key, row.value);
        }
      }
    })();

    sourceDb.close();
    sourceDb = null;

    fs.renameSync(schedulesDbPath, migratedPath);
  } catch (err) {
    logger.warn('Failed to migrate schedules.db', { error: String(err) });
    if (sourceDb) {
      try { sourceDb.close(); } catch { /* ignore */ }
    }
  }
}

function migrateLegacyScheduleConfig(database: Database.Database): void {
  const configPath = path.join(getSchedulesDir(), 'config.json');
  if (!fs.existsSync(configPath)) return;

  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    const state = JSON.parse(content) as ScheduleState;

    database.prepare(
      'INSERT OR REPLACE INTO schedule_state (key, value) VALUES (?, ?)'
    ).run('state', JSON.stringify(state));

    fs.renameSync(configPath, configPath + '.migrated');
  } catch (err) {
    logger.warn('Failed to migrate legacy config', { error: String(err) });
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
  } catch { /* directory not readable — skip migration */
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
        } catch (err) {
          logger.warn('Failed to parse run history line', { entry, error: String(err) });
        }
      }
      fs.renameSync(historyPath, historyPath + '.migrated');
    } catch (err) {
      logger.warn('Failed to migrate run history file', { entry, error: String(err) });
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
  } catch { /* directory not readable — skip migration */
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
        } catch (err) {
          logger.warn('Failed to parse action log line', { entry, error: String(err) });
        }
      }
      fs.renameSync(actionsPath, actionsPath + '.migrated');
    } catch (err) {
      logger.warn('Failed to migrate action log file', { entry, error: String(err) });
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
  } catch (err) {
    logger.warn('Failed to migrate legacy credentials', { error: String(err) });
  }
}

function migrateLegacyScheduleData(database: Database.Database): void {
  migrateLegacyScheduleConfig(database);
  migrateLegacyRunHistory(database);
  migrateLegacyActionLogs(database);
  migrateLegacyCredentials(database);
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
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');

  createSchema(db);
  migrateLegacyBoards(db);
  migrateLegacyProjectRegistry(db);
  migrateSchedulesDb(db);
  migrateLegacyScheduleData(db);

  const version = db.pragma('user_version', { simple: true }) as number;
  if (version < 1) {
    db.pragma('user_version = 1');
  }

  try {
    fs.chmodSync(dbPath, 0o600);
  } catch { /* May fail on Windows — non-critical */
  }

  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
