/**
 * @module src/main/stores/kanban-db
 * Kanban board, item, and comment CRUD operations.
 */

import type {
  KanbanBoard,
  KanbanItem,
  KanbanComment,
  KanbanAttachment,
  CommentSource,
} from '@shared/types/kanban';
import type { KanbanAgentProvider } from '@shared/types/agent';
import { getDb, generateId, normalizeForHash, safeJsonParse } from './db-connection';

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

function rowToAttachment(row: any): KanbanAttachment {
  return {
    id: row.id,
    itemId: row.item_id,
    filename: row.filename,
    mimeType: row.mime_type,
    size: row.size,
    createdAt: row.created_at,
  };
}

function rowToItem(row: any, comments: KanbanComment[], attachments?: KanbanAttachment[]): KanbanItem {
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

  if (attachments && attachments.length > 0) {
    item.attachments = attachments;
  }

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

function assembleBoard(boardRow: any, itemRows: any[], commentRows: any[], attachmentRows: any[] = []): KanbanBoard {
  // Group comments by item_id
  const commentsByItem = new Map<string, KanbanComment[]>();
  for (const row of commentRows) {
    const itemId = row.item_id;
    if (!commentsByItem.has(itemId)) {
      commentsByItem.set(itemId, []);
    }
    commentsByItem.get(itemId)!.push(rowToComment(row));
  }

  // Group attachments by item_id
  const attachmentsByItem = new Map<string, KanbanAttachment[]>();
  for (const row of attachmentRows) {
    const itemId = row.item_id;
    if (!attachmentsByItem.has(itemId)) {
      attachmentsByItem.set(itemId, []);
    }
    attachmentsByItem.get(itemId)!.push(rowToAttachment(row));
  }

  const items = itemRows.map(row => rowToItem(
    row,
    commentsByItem.get(row.id) || [],
    attachmentsByItem.get(row.id),
  ));

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
  let attachmentRows: any[] = [];
  if (itemIds.length > 0) {
    const placeholders = itemIds.map(() => '?').join(', ');
    commentRows = database.prepare(
      `SELECT * FROM kanban_comments WHERE item_id IN (${placeholders}) ORDER BY timestamp ASC`
    ).all(...itemIds) as any[];
    attachmentRows = database.prepare(
      `SELECT * FROM kanban_attachments WHERE item_id IN (${placeholders}) ORDER BY created_at ASC`
    ).all(...itemIds) as any[];
  }

  return assembleBoard(boardRow, itemRows, commentRows, attachmentRows);
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
