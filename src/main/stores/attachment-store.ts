/**
 * @module src/main/stores/attachment-store
 * Attachment CRUD operations — filesystem for binary files, SQLite for metadata.
 * Follows the workitem-log-store.ts pattern for directory structure.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import type { KanbanAttachment } from '@shared/types/kanban';
import { getDb, generateId } from './db-connection';

const YOLIUM_DIR = path.join(os.homedir(), '.yolium');
const ATTACHMENTS_DIR = path.join(YOLIUM_DIR, 'attachments');
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

function projectHash(projectPath: string): string {
  let normalized = path.resolve(projectPath).replace(/\\/g, '/');
  if (normalized.endsWith('/') && normalized.length > 1) {
    normalized = normalized.slice(0, -1);
  }
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 12);
}

function getAttachmentDir(projectPath: string, itemId: string): string {
  return path.join(ATTACHMENTS_DIR, projectHash(projectPath), itemId);
}

function getProjectAttachmentDir(projectPath: string): string {
  return path.join(ATTACHMENTS_DIR, projectHash(projectPath));
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function getExtension(filename: string): string {
  const ext = path.extname(filename);
  return ext || '';
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

export function saveAttachment(
  projectPath: string,
  itemId: string,
  filename: string,
  mimeType: string,
  data: Buffer,
): KanbanAttachment {
  if (data.length > MAX_FILE_SIZE) {
    throw new Error(`File exceeds size limit of ${MAX_FILE_SIZE / (1024 * 1024)}MB`);
  }

  const db = getDb();
  const id = generateId();
  const now = new Date().toISOString();
  const ext = getExtension(filename);
  const dir = getAttachmentDir(projectPath, itemId);
  ensureDir(dir);

  const filePath = path.join(dir, `${id}${ext}`);
  fs.writeFileSync(filePath, data);

  db.prepare(`
    INSERT INTO kanban_attachments (id, item_id, filename, mime_type, size, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, itemId, filename, mimeType, data.length, now);

  return {
    id,
    itemId,
    filename,
    mimeType,
    size: data.length,
    createdAt: now,
  };
}

export function readAttachment(
  projectPath: string,
  itemId: string,
  attachmentId: string,
): Buffer | null {
  const db = getDb();
  const row = db.prepare(
    'SELECT * FROM kanban_attachments WHERE id = ? AND item_id = ?'
  ).get(attachmentId, itemId) as any;

  if (!row) return null;

  const ext = getExtension(row.filename);
  const filePath = path.join(getAttachmentDir(projectPath, itemId), `${attachmentId}${ext}`);

  if (!fs.existsSync(filePath)) return null;

  try {
    return fs.readFileSync(filePath);
  } catch { /* file may have been deleted between existsSync and readFileSync */
    return null;
  }
}

export function getAttachmentPath(
  projectPath: string,
  itemId: string,
  attachmentId: string,
): string | null {
  const db = getDb();
  const row = db.prepare(
    'SELECT filename FROM kanban_attachments WHERE id = ? AND item_id = ?'
  ).get(attachmentId, itemId) as any;

  if (!row) return null;

  const ext = getExtension(row.filename);
  const filePath = path.join(getAttachmentDir(projectPath, itemId), `${attachmentId}${ext}`);

  return fs.existsSync(filePath) ? filePath : null;
}

export function listAttachments(itemId: string): KanbanAttachment[] {
  const db = getDb();
  const rows = db.prepare(
    'SELECT * FROM kanban_attachments WHERE item_id = ? ORDER BY created_at ASC'
  ).all(itemId) as any[];

  return rows.map(rowToAttachment);
}

export function deleteAttachment(
  projectPath: string,
  itemId: string,
  attachmentId: string,
): boolean {
  const db = getDb();
  const row = db.prepare(
    'SELECT filename FROM kanban_attachments WHERE id = ? AND item_id = ?'
  ).get(attachmentId, itemId) as any;

  if (!row) return false;

  const ext = getExtension(row.filename);
  const filePath = path.join(getAttachmentDir(projectPath, itemId), `${attachmentId}${ext}`);

  db.prepare('DELETE FROM kanban_attachments WHERE id = ?').run(attachmentId);

  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch { /* file cleanup is best-effort */ }
  }

  return true;
}

export function deleteItemAttachments(projectPath: string, itemId: string): void {
  const db = getDb();
  db.prepare('DELETE FROM kanban_attachments WHERE item_id = ?').run(itemId);

  const dir = getAttachmentDir(projectPath, itemId);
  if (fs.existsSync(dir)) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch { /* directory cleanup is best-effort */ }
  }
}

export function deleteProjectAttachments(projectPath: string): void {
  // Get all item IDs for this project's attachments, then delete them
  const db = getDb();
  const rows = db.prepare(
    'SELECT DISTINCT item_id FROM kanban_attachments'
  ).all() as any[];

  // Delete all attachments for items under this project hash
  const dir = getProjectAttachmentDir(projectPath);
  if (fs.existsSync(dir)) {
    // Get item IDs from the directory structure
    try {
      const itemDirs = fs.readdirSync(dir);
      for (const itemId of itemDirs) {
        db.prepare('DELETE FROM kanban_attachments WHERE item_id = ?').run(itemId);
      }
    } catch { /* cleanup is best-effort */ }

    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch { /* directory cleanup is best-effort */ }
  }
}

export function copyAttachmentsToWorktree(
  projectPath: string,
  itemId: string,
  worktreePath: string,
): string[] {
  const attachments = listAttachments(itemId);
  if (attachments.length === 0) return [];

  const targetDir = path.join(worktreePath, '.yolium', 'attachments');
  ensureDir(targetDir);

  const copiedPaths: string[] = [];
  for (const attachment of attachments) {
    const sourceData = readAttachment(projectPath, itemId, attachment.id);
    if (sourceData) {
      const targetPath = path.join(targetDir, attachment.filename);
      fs.writeFileSync(targetPath, sourceData);
      copiedPaths.push(targetPath);
    }
  }

  return copiedPaths;
}
