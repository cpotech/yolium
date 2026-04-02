import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import Database from 'better-sqlite3';

// Mock os.homedir to return a temp directory
const { homedirMock } = vi.hoisted(() => ({
  homedirMock: vi.fn(),
}));

vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof import('node:os')>('node:os');
  return { ...actual, homedir: homedirMock };
});

vi.mock('node:path', async () => {
  const actual = await vi.importActual<typeof import('node:path')>('node:path');
  return {
    ...actual,
    resolve: vi.fn((...args: string[]) => args[args.length - 1]),
  };
});

vi.mock('@main/lib/logger', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

let attachmentStore: typeof import('@main/stores/attachment-store');
let dbConnection: typeof import('@main/stores/db-connection');
let kanbanDb: typeof import('@main/stores/kanban-db');

// Helper to create a board + item so FK constraints are satisfied
function createTestItem(itemId: string = 'item-1') {
  const board = kanbanDb.getOrCreateBoard('/project');
  const item = kanbanDb.addItem(board, {
    title: `Test ${itemId}`,
    description: '',
    agentProvider: 'claude',
    order: 0,
  });
  return item;
}

describe('attachment-store', () => {
  let tempDir: string;
  let item1Id: string;
  let item2Id: string;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'attachment-store-'));
    fs.mkdirSync(path.join(tempDir, '.yolium'), { recursive: true });
    homedirMock.mockReturnValue(tempDir);

    vi.resetModules();
    dbConnection = await import('@main/stores/db-connection');
    attachmentStore = await import('@main/stores/attachment-store');
    kanbanDb = await import('@main/stores/kanban-db');

    // Ensure DB is initialized
    dbConnection.getDb();

    // Create items for FK constraints
    item1Id = createTestItem().id;
    item2Id = createTestItem().id;
  });

  afterEach(() => {
    dbConnection.closeDb();
    vi.clearAllMocks();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should save an attachment file and return metadata', () => {
    const data = Buffer.from('hello world');
    const result = attachmentStore.saveAttachment('/project', item1Id, 'test.txt', 'text/plain', data);

    expect(result.id).toBeDefined();
    expect(result.id.length).toBeGreaterThan(0);
    expect(result.itemId).toBe(item1Id);
    expect(result.filename).toBe('test.txt');
    expect(result.mimeType).toBe('text/plain');
    expect(result.size).toBe(data.length);
    expect(result.createdAt).toBeDefined();
  });

  it('should generate unique attachment IDs', () => {
    const data = Buffer.from('test');
    const a1 = attachmentStore.saveAttachment('/project', item1Id, 'a.txt', 'text/plain', data);
    const a2 = attachmentStore.saveAttachment('/project', item1Id, 'b.txt', 'text/plain', data);

    expect(a1.id).not.toBe(a2.id);
  });

  it('should read an attachment file by ID', () => {
    const data = Buffer.from('file contents here');
    const saved = attachmentStore.saveAttachment('/project', item1Id, 'doc.txt', 'text/plain', data);

    const result = attachmentStore.readAttachment('/project', item1Id, saved.id);
    expect(result).not.toBeNull();
    expect(result!.toString()).toBe('file contents here');
  });

  it('should delete a single attachment', () => {
    const data = Buffer.from('delete me');
    const saved = attachmentStore.saveAttachment('/project', item1Id, 'del.txt', 'text/plain', data);

    const deleted = attachmentStore.deleteAttachment('/project', item1Id, saved.id);
    expect(deleted).toBe(true);

    const result = attachmentStore.readAttachment('/project', item1Id, saved.id);
    expect(result).toBeNull();
  });

  it('should delete all attachments for an item', () => {
    const data = Buffer.from('test');
    attachmentStore.saveAttachment('/project', item1Id, 'a.txt', 'text/plain', data);
    attachmentStore.saveAttachment('/project', item1Id, 'b.txt', 'text/plain', data);

    attachmentStore.deleteItemAttachments('/project', item1Id);

    const list = attachmentStore.listAttachments(item1Id);
    expect(list).toEqual([]);
  });

  it('should delete all attachments for a project', () => {
    const data = Buffer.from('test');
    attachmentStore.saveAttachment('/project', item1Id, 'a.txt', 'text/plain', data);
    attachmentStore.saveAttachment('/project', item2Id, 'b.txt', 'text/plain', data);

    attachmentStore.deleteProjectAttachments('/project');

    expect(attachmentStore.listAttachments(item1Id)).toEqual([]);
    expect(attachmentStore.listAttachments(item2Id)).toEqual([]);
  });

  it('should reject files exceeding the size limit', () => {
    const bigData = Buffer.alloc(11 * 1024 * 1024); // 11MB
    expect(() => {
      attachmentStore.saveAttachment('/project', item1Id, 'big.bin', 'application/octet-stream', bigData);
    }).toThrow(/size limit/i);
  });

  it('should preserve original filename and mime type in metadata', () => {
    const data = Buffer.from('png data');
    const saved = attachmentStore.saveAttachment('/project', item1Id, 'screenshot.png', 'image/png', data);

    expect(saved.filename).toBe('screenshot.png');
    expect(saved.mimeType).toBe('image/png');

    const list = attachmentStore.listAttachments(item1Id);
    expect(list.length).toBe(1);
    expect(list[0].filename).toBe('screenshot.png');
    expect(list[0].mimeType).toBe('image/png');
  });

  it('should handle concurrent saves to different items', () => {
    const data = Buffer.from('test');
    const a1 = attachmentStore.saveAttachment('/project', item1Id, 'a.txt', 'text/plain', data);
    const a2 = attachmentStore.saveAttachment('/project', item2Id, 'b.txt', 'text/plain', data);

    expect(attachmentStore.listAttachments(item1Id).length).toBe(1);
    expect(attachmentStore.listAttachments(item2Id).length).toBe(1);
    expect(a1.itemId).toBe(item1Id);
    expect(a2.itemId).toBe(item2Id);
  });

  it('should return null when reading a non-existent attachment', () => {
    const result = attachmentStore.readAttachment('/project', item1Id, 'nonexistent');
    expect(result).toBeNull();
  });

  it('should create nested directories on first save', () => {
    const data = Buffer.from('test');
    const saved = attachmentStore.saveAttachment('/project', item1Id, 'file.txt', 'text/plain', data);

    // The attachment file should exist on disk
    const filePath = attachmentStore.getAttachmentPath('/project', item1Id, saved.id);
    expect(filePath).not.toBeNull();
    expect(fs.existsSync(filePath!)).toBe(true);
  });

  it('should copy item attachments into a worktree directory', () => {
    const data1 = Buffer.from('image data');
    const data2 = Buffer.from('doc data');
    attachmentStore.saveAttachment('/project', item1Id, 'screen.png', 'image/png', data1);
    attachmentStore.saveAttachment('/project', item1Id, 'notes.md', 'text/markdown', data2);

    const worktreeDir = path.join(tempDir, 'worktree');
    fs.mkdirSync(worktreeDir, { recursive: true });

    const copied = attachmentStore.copyAttachmentsToWorktree('/project', item1Id, worktreeDir);
    expect(copied.length).toBe(2);

    // Check files were actually copied
    for (const filePath of copied) {
      expect(fs.existsSync(filePath)).toBe(true);
    }
  });

  it('should return empty array when copying for item with no attachments', () => {
    const worktreeDir = path.join(tempDir, 'worktree');
    fs.mkdirSync(worktreeDir, { recursive: true });

    const copied = attachmentStore.copyAttachmentsToWorktree('/project', 'no-item', worktreeDir);
    expect(copied).toEqual([]);
  });
});
