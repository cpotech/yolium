// src/lib/kanban-store.ts
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import type {
  KanbanBoard,
  KanbanItem,
  KanbanComment,
  CommentSource,
} from '../types/kanban';
import type { KanbanAgentType } from '../types/agent';

const YOLIUM_DIR = path.join(os.homedir(), '.yolium');
const BOARDS_DIR = path.join(YOLIUM_DIR, 'boards');

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function generateId(): string {
  return crypto.randomBytes(8).toString('hex');
}

function getBoardPath(projectPath: string): string {
  const hash = crypto.createHash('sha256').update(projectPath).digest('hex').slice(0, 12);
  const safeName = path.basename(projectPath).replace(/[^a-zA-Z0-9-_]/g, '_');
  return path.join(BOARDS_DIR, `${safeName}-${hash}.json`);
}

function saveBoard(board: KanbanBoard): void {
  ensureDir(BOARDS_DIR);
  board.updatedAt = new Date().toISOString();
  fs.writeFileSync(getBoardPath(board.projectPath), JSON.stringify(board, null, 2));
}

export function createBoard(projectPath: string): KanbanBoard {
  const board: KanbanBoard = {
    id: generateId(),
    projectPath,
    items: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  saveBoard(board);
  return board;
}

export function getBoard(projectPath: string): KanbanBoard | null {
  const boardPath = getBoardPath(projectPath);
  if (!fs.existsSync(boardPath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(boardPath, 'utf-8'));
}

export function getOrCreateBoard(projectPath: string): KanbanBoard {
  return getBoard(projectPath) || createBoard(projectPath);
}

export interface NewItemParams {
  title: string;
  description: string;
  branch?: string;
  agentType: KanbanAgentType;
  order: number;
  model?: string;
}

export function addItem(board: KanbanBoard, params: NewItemParams): KanbanItem {
  const item: KanbanItem = {
    id: generateId(),
    title: params.title,
    description: params.description,
    column: 'backlog',
    branch: params.branch,
    agentType: params.agentType,
    order: params.order,
    model: params.model,
    agentStatus: 'idle',
    comments: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  board.items.push(item);
  saveBoard(board);
  return item;
}

export function updateItem(
  board: KanbanBoard,
  itemId: string,
  updates: Partial<Pick<KanbanItem, 'title' | 'description' | 'column' | 'agentStatus' | 'agentQuestion' | 'agentQuestionOptions'>>
): KanbanItem | null {
  const item = board.items.find(i => i.id === itemId);
  if (!item) return null;

  Object.assign(item, updates, { updatedAt: new Date().toISOString() });
  saveBoard(board);
  return item;
}

export function addComment(
  board: KanbanBoard,
  itemId: string,
  source: CommentSource,
  text: string
): KanbanComment | null {
  const item = board.items.find(i => i.id === itemId);
  if (!item) return null;

  const comment: KanbanComment = {
    id: generateId(),
    source,
    text,
    timestamp: new Date().toISOString(),
  };
  item.comments.push(comment);
  item.updatedAt = new Date().toISOString();
  saveBoard(board);
  return comment;
}

export function buildConversationHistory(item: KanbanItem): string {
  return item.comments
    .map(c => `[${c.source}]: ${c.text}`)
    .join('\n\n');
}

export function deleteItem(board: KanbanBoard, itemId: string): boolean {
  const index = board.items.findIndex(i => i.id === itemId);
  if (index === -1) return false;

  board.items.splice(index, 1);
  saveBoard(board);
  return true;
}

export function deleteBoard(projectPath: string): boolean {
  const boardPath = getBoardPath(projectPath);
  if (fs.existsSync(boardPath)) {
    fs.unlinkSync(boardPath);
    return true;
  }
  return false;
}
