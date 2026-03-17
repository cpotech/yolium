/**
 * @module src/main/stores/yolium-db
 * Unified SQLite store for kanban boards and project registry.
 * Replaces kanban-store.ts (JSON files) and project-registry.ts (JSON file).
 * Follows the same patterns as schedule-db.ts.
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
  CommentSource,
} from '@shared/types/kanban';
import type { KanbanAgentProvider } from '@shared/types/agent';
import { createLogger } from '@main/lib/logger';

const logger = createLogger('yolium-db');

let db: Database.Database | null = null;

function getDbPath(): string {
  return path.join(os.homedir(), '.yolium', 'yolium.db');
}

function generateId(): string {
  return crypto.randomBytes(8).toString('hex');
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

function safeJsonParse<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
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
  `);
}

// ─── Migration ────────────────────────────────────────────────────────────

function migrateLegacyBoards(database: Database.Database): void {
  const boardsDir = path.join(os.homedir(), '.yolium', 'boards');
  if (!fs.existsSync(boardsDir)) return;

  let files: string[];
  try {
    files = fs.readdirSync(boardsDir);
  } catch {
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

  const version = db.pragma('user_version', { simple: true }) as number;
  if (version < 1) {
    db.pragma('user_version = 1');
  }

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

// ─── Row Conversion Helpers ──────────────────────────────────────────────

function rowToComment(row: any): KanbanComment {
  const comment: KanbanComment = {
    id: row.id,
    source: row.source,
    text: row.text,
    timestamp: row.timestamp,
  };
  if (row.options) {
    comment.options = safeJsonParse(row.options, []);
  }
  return comment;
}

function rowToItem(row: any, comments: KanbanComment[]): KanbanItem {
  const item: KanbanItem = {
    id: row.id,
    title: row.title,
    description: row.description,
    column: row.column,
    agentProvider: row.agent_provider as KanbanAgentProvider,
    order: row.order,
    agentStatus: row.agent_status,
    comments,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  if (row.branch != null) item.branch = row.branch;
  if (row.agent_type != null) item.agentType = row.agent_type;
  if (row.model != null) item.model = row.model;
  if (row.active_agent_name != null) item.activeAgentName = row.active_agent_name;
  if (row.last_agent_name != null) item.lastAgentName = row.last_agent_name;
  if (row.agent_question != null) item.agentQuestion = row.agent_question;
  if (row.agent_question_options != null) item.agentQuestionOptions = safeJsonParse(row.agent_question_options, []);
  if (row.test_specs != null) item.testSpecs = safeJsonParse(row.test_specs, []);
  if (row.worktree_path != null) item.worktreePath = row.worktree_path;
  if (row.merge_status != null) item.mergeStatus = row.merge_status;
  if (row.pr_url != null) item.prUrl = row.pr_url;
  if (row.verified != null) item.verified = row.verified === 1;

  return item;
}

function assembleBoard(boardRow: any, itemRows: any[], commentRows: any[]): KanbanBoard {
  // Group comments by item_id
  const commentsByItem = new Map<string, KanbanComment[]>();
  for (const row of commentRows) {
    const itemId = row.item_id;
    if (!commentsByItem.has(itemId)) {
      commentsByItem.set(itemId, []);
    }
    commentsByItem.get(itemId)!.push(rowToComment(row));
  }

  const items = itemRows.map(row => rowToItem(row, commentsByItem.get(row.id) || []));

  const board: KanbanBoard = {
    id: boardRow.id,
    projectPath: boardRow.project_path,
    items,
    createdAt: boardRow.created_at,
    updatedAt: boardRow.updated_at,
  };

  if (boardRow.last_agent_name != null) {
    board.lastAgentName = boardRow.last_agent_name;
  }

  return board;
}

// ─── Kanban Board Functions ──────────────────────────────────────────────

export function createBoard(projectPath: string): KanbanBoard {
  const database = getDb();
  const normalized = normalizeForHash(projectPath);
  const now = new Date().toISOString();
  const id = generateId();

  database.prepare(`
    INSERT INTO kanban_boards (id, project_path, last_agent_name, created_at, updated_at)
    VALUES (?, ?, NULL, ?, ?)
  `).run(id, normalized, now, now);

  return {
    id,
    projectPath: normalized,
    items: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function getBoard(projectPath: string): KanbanBoard | null {
  const database = getDb();
  const normalized = normalizeForHash(projectPath);

  const boardRow = database.prepare(
    'SELECT * FROM kanban_boards WHERE project_path = ?'
  ).get(normalized) as any;

  if (!boardRow) return null;

  const itemRows = database.prepare(
    'SELECT * FROM kanban_items WHERE board_id = ? ORDER BY "order" ASC'
  ).all(boardRow.id) as any[];

  const itemIds = itemRows.map((r: any) => r.id);
  let commentRows: any[] = [];
  if (itemIds.length > 0) {
    const placeholders = itemIds.map(() => '?').join(', ');
    commentRows = database.prepare(
      `SELECT * FROM kanban_comments WHERE item_id IN (${placeholders}) ORDER BY timestamp ASC`
    ).all(...itemIds) as any[];
  }

  return assembleBoard(boardRow, itemRows, commentRows);
}

export function getOrCreateBoard(projectPath: string): KanbanBoard {
  return getBoard(projectPath) || createBoard(projectPath);
}

export function updateBoard(
  board: KanbanBoard,
  updates: Partial<Pick<KanbanBoard, 'lastAgentName'>>
): KanbanBoard {
  const database = getDb();
  const now = new Date().toISOString();

  database.prepare(`
    UPDATE kanban_boards SET last_agent_name = ?, updated_at = ? WHERE id = ?
  `).run(
    updates.lastAgentName !== undefined ? updates.lastAgentName : board.lastAgentName ?? null,
    now,
    board.id
  );

  Object.assign(board, updates, { updatedAt: now });
  return board;
}

// ─── Kanban Item Functions ───────────────────────────────────────────────

export interface NewItemParams {
  title: string;
  description: string;
  branch?: string;
  agentProvider: KanbanAgentProvider;
  agentType?: string;
  order: number;
  model?: string;
}

const VALID_COLUMNS = new Set(['backlog', 'ready', 'in-progress', 'verify', 'done']);
const VALID_AGENT_STATUSES = new Set(['idle', 'running', 'waiting', 'interrupted', 'completed', 'failed']);
const VALID_MERGE_STATUSES = new Set(['unmerged', 'merged', 'conflict']);
const VALID_AGENT_PROVIDERS = new Set(['claude', 'opencode', 'codex']);

export function addItem(board: KanbanBoard, params: NewItemParams): KanbanItem {
  if (!params.title.trim()) {
    throw new Error('Title is required');
  }

  const database = getDb();
  const now = new Date().toISOString();
  const id = generateId();

  database.prepare(`
    INSERT INTO kanban_items (
      id, board_id, title, description, "column", branch, agent_provider, agent_type,
      "order", model, agent_status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'backlog', ?, ?, ?, ?, ?, 'idle', ?, ?)
  `).run(
    id,
    board.id,
    params.title,
    params.description,
    params.branch ?? null,
    params.agentProvider,
    params.agentType ?? null,
    params.order,
    params.model ?? null,
    now,
    now
  );

  const item: KanbanItem = {
    id,
    title: params.title,
    description: params.description,
    column: 'backlog',
    branch: params.branch,
    agentProvider: params.agentProvider,
    agentType: params.agentType,
    order: params.order,
    model: params.model,
    agentStatus: 'idle',
    comments: [],
    createdAt: now,
    updatedAt: now,
  };

  board.items.push(item);
  return item;
}

export function updateItem(
  board: KanbanBoard,
  itemId: string,
  updates: Partial<Pick<KanbanItem, 'title' | 'description' | 'column' | 'branch' | 'model' | 'agentType' | 'agentStatus' | 'activeAgentName' | 'lastAgentName' | 'agentQuestion' | 'agentQuestionOptions' | 'testSpecs' | 'worktreePath' | 'mergeStatus' | 'agentProvider' | 'prUrl' | 'order' | 'verified'>>
): KanbanItem | null {
  const item = board.items.find(i => i.id === itemId);
  if (!item) return null;

  if (updates.title !== undefined && !updates.title.trim()) return null;
  if (updates.column !== undefined && !VALID_COLUMNS.has(updates.column)) return null;
  if (updates.agentStatus !== undefined && !VALID_AGENT_STATUSES.has(updates.agentStatus)) return null;
  if (updates.mergeStatus !== undefined && !VALID_MERGE_STATUSES.has(updates.mergeStatus)) return null;
  if (updates.agentProvider !== undefined && !VALID_AGENT_PROVIDERS.has(updates.agentProvider)) return null;

  const database = getDb();
  const now = new Date().toISOString();

  // Build SET clause dynamically for provided fields
  const setClauses: string[] = ['updated_at = ?'];
  const params: any[] = [now];

  const fieldMap: Record<string, string> = {
    title: 'title',
    description: 'description',
    column: '"column"',
    branch: 'branch',
    model: 'model',
    agentType: 'agent_type',
    agentStatus: 'agent_status',
    activeAgentName: 'active_agent_name',
    lastAgentName: 'last_agent_name',
    agentQuestion: 'agent_question',
    worktreePath: 'worktree_path',
    mergeStatus: 'merge_status',
    agentProvider: 'agent_provider',
    prUrl: 'pr_url',
    order: '"order"',
  };

  for (const [key, col] of Object.entries(fieldMap)) {
    if (key in updates) {
      setClauses.push(`${col} = ?`);
      params.push((updates as any)[key] ?? null);
    }
  }

  // Handle JSON fields
  if ('agentQuestionOptions' in updates) {
    setClauses.push('agent_question_options = ?');
    params.push(updates.agentQuestionOptions ? JSON.stringify(updates.agentQuestionOptions) : null);
  }
  if ('testSpecs' in updates) {
    setClauses.push('test_specs = ?');
    params.push(updates.testSpecs ? JSON.stringify(updates.testSpecs) : null);
  }

  // Handle verified (boolean → integer)
  if ('verified' in updates) {
    setClauses.push('verified = ?');
    params.push(updates.verified === undefined ? null : updates.verified ? 1 : 0);
  }

  params.push(itemId);

  database.prepare(
    `UPDATE kanban_items SET ${setClauses.join(', ')} WHERE id = ?`
  ).run(...params);

  Object.assign(item, updates, { updatedAt: now });
  return item;
}

// ─── Comment Functions ───────────────────────────────────────────────────

export function addComment(
  board: KanbanBoard,
  itemId: string,
  source: CommentSource,
  text: string,
  options?: string[]
): KanbanComment | null {
  const item = board.items.find(i => i.id === itemId);
  if (!item) return null;

  const database = getDb();
  const id = generateId();
  const timestamp = new Date().toISOString();
  const hasOptions = options && options.length > 0;

  const insertAndTouch = database.transaction(() => {
    database.prepare(`
      INSERT INTO kanban_comments (id, item_id, source, text, timestamp, options)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, itemId, source, text, timestamp, hasOptions ? JSON.stringify(options) : null);

    database.prepare('UPDATE kanban_items SET updated_at = ? WHERE id = ?').run(timestamp, itemId);
  });
  insertAndTouch();

  const comment: KanbanComment = {
    id,
    source,
    text,
    timestamp,
    ...(hasOptions ? { options } : {}),
  };

  item.comments.push(comment);
  item.updatedAt = timestamp;
  return comment;
}

export function buildConversationHistory(item: KanbanItem): string {
  return item.comments
    .map(c => `[${c.source}]: ${c.text}`)
    .join('\n\n');
}

// ─── Delete Functions ────────────────────────────────────────────────────

export function deleteItem(board: KanbanBoard, itemId: string): boolean {
  const index = board.items.findIndex(i => i.id === itemId);
  if (index === -1) return false;

  const database = getDb();
  database.prepare('DELETE FROM kanban_items WHERE id = ?').run(itemId);

  board.items.splice(index, 1);
  return true;
}

export function deleteItems(board: KanbanBoard, itemIds: string[]): string[] {
  if (itemIds.length === 0) return [];

  const database = getDb();
  const idSet = new Set(itemIds);
  const deletedIds: string[] = [];

  // Find which items actually exist
  board.items = board.items.filter(item => {
    if (idSet.has(item.id)) {
      deletedIds.push(item.id);
      return false;
    }
    return true;
  });

  if (deletedIds.length > 0) {
    const placeholders = deletedIds.map(() => '?').join(', ');
    database.prepare(`DELETE FROM kanban_items WHERE id IN (${placeholders})`).run(...deletedIds);
  }

  return deletedIds;
}

export function deleteBoard(projectPath: string): boolean {
  const database = getDb();
  const normalized = normalizeForHash(projectPath);

  const result = database.prepare(
    'DELETE FROM kanban_boards WHERE project_path = ?'
  ).run(normalized);

  return result.changes > 0;
}

// ─── Project Registry ────────────────────────────────────────────────────

interface ProjectEntry {
  path: string;
  folderName: string;
  lastAccessed: string;
  createdAt: string;
}

interface ProjectRegistry {
  version: 1;
  projects: Record<string, ProjectEntry>;
}

export function loadProjectRegistry(): ProjectRegistry {
  const database = getDb();
  const rows = database.prepare('SELECT * FROM project_registry').all() as any[];

  const projects: Record<string, ProjectEntry> = {};
  for (const row of rows) {
    projects[row.dir_name] = {
      path: row.path,
      folderName: row.folder_name,
      lastAccessed: row.last_accessed,
      createdAt: row.created_at,
    };
  }

  return { version: 1, projects };
}

export function saveProjectRegistry(registry: ProjectRegistry): void {
  const database = getDb();

  const save = database.transaction(() => {
    database.prepare('DELETE FROM project_registry').run();

    const insert = database.prepare(`
      INSERT INTO project_registry (dir_name, path, folder_name, last_accessed, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    for (const [dirName, entry] of Object.entries(registry.projects)) {
      insert.run(dirName, entry.path, entry.folderName, entry.lastAccessed, entry.createdAt);
    }
  });

  save();
}

export function registerProject(projectPath: string): void {
  const database = getDb();
  const absolutePath = path.resolve(projectPath);
  const folderName = path.basename(absolutePath);
  // Generate a simple dir name from the path
  const safeName = folderName.replace(/[^a-zA-Z0-9-_]/g, '_');
  const hash = crypto.createHash('sha256').update(absolutePath).digest('hex').slice(0, 8);
  const dirName = `${safeName}-${hash}`;
  const now = new Date().toISOString();

  // Check for existing entry
  const existing = database.prepare(
    'SELECT created_at FROM project_registry WHERE dir_name = ?'
  ).get(dirName) as { created_at: string } | undefined;

  database.prepare(`
    INSERT OR REPLACE INTO project_registry (dir_name, path, folder_name, last_accessed, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(dirName, absolutePath, folderName, now, existing?.created_at || now);
}
