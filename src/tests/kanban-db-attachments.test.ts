import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

let yoliumDb: typeof import('@main/stores/yolium-db');

describe('kanban-db-attachments', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kanban-attach-'));
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

  it('should create kanban_attachments table on DB init', () => {
    const db = yoliumDb.getDb();
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='kanban_attachments'"
    ).all();
    expect(tables.length).toBe(1);
  });

  it('should insert attachment metadata and retrieve by item ID', () => {
    const db = yoliumDb.getDb();
    const now = new Date().toISOString();

    // Create a board and item first
    const board = yoliumDb.createBoard('/project');
    const item = yoliumDb.addItem(board, {
      title: 'Test item',
      description: '',
      agentProvider: 'claude',
      order: 0,
    });

    db.prepare(`
      INSERT INTO kanban_attachments (id, item_id, filename, mime_type, size, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('att-1', item.id, 'test.png', 'image/png', 1024, now);

    const rows = db.prepare(
      'SELECT * FROM kanban_attachments WHERE item_id = ?'
    ).all(item.id) as any[];

    expect(rows.length).toBe(1);
    expect(rows[0].filename).toBe('test.png');
  });

  it('should cascade-delete attachments when item is deleted', () => {
    const db = yoliumDb.getDb();
    const now = new Date().toISOString();

    const board = yoliumDb.createBoard('/project');
    const item = yoliumDb.addItem(board, {
      title: 'Test item',
      description: '',
      agentProvider: 'claude',
      order: 0,
    });

    db.prepare(`
      INSERT INTO kanban_attachments (id, item_id, filename, mime_type, size, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('att-1', item.id, 'test.png', 'image/png', 1024, now);

    // Delete the item (CASCADE should remove attachments)
    yoliumDb.deleteItem(board, item.id);

    const rows = db.prepare(
      'SELECT * FROM kanban_attachments WHERE item_id = ?'
    ).all(item.id) as any[];

    expect(rows.length).toBe(0);
  });

  it('should cascade-delete attachments when board is deleted', () => {
    const db = yoliumDb.getDb();
    const now = new Date().toISOString();

    const board = yoliumDb.createBoard('/cascade-project');
    const item = yoliumDb.addItem(board, {
      title: 'Test item',
      description: '',
      agentProvider: 'claude',
      order: 0,
    });

    db.prepare(`
      INSERT INTO kanban_attachments (id, item_id, filename, mime_type, size, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('att-cascade', item.id, 'test.png', 'image/png', 1024, now);

    // Delete the board (CASCADE should remove items, then attachments)
    yoliumDb.deleteBoard('/cascade-project');

    const rows = db.prepare(
      'SELECT * FROM kanban_attachments WHERE id = ?'
    ).all('att-cascade') as any[];

    expect(rows.length).toBe(0);
  });

  it('should return empty array for item with no attachments', () => {
    const db = yoliumDb.getDb();
    const rows = db.prepare(
      'SELECT * FROM kanban_attachments WHERE item_id = ?'
    ).all('nonexistent') as any[];

    expect(rows).toEqual([]);
  });

  it('should store and retrieve all metadata fields correctly', () => {
    const db = yoliumDb.getDb();
    const now = '2026-04-02T10:00:00.000Z';

    const board = yoliumDb.createBoard('/project-meta');
    const item = yoliumDb.addItem(board, {
      title: 'Meta test',
      description: '',
      agentProvider: 'claude',
      order: 0,
    });

    db.prepare(`
      INSERT INTO kanban_attachments (id, item_id, filename, mime_type, size, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('att-meta', item.id, 'document.pdf', 'application/pdf', 5242880, now);

    const row = db.prepare(
      'SELECT * FROM kanban_attachments WHERE id = ?'
    ).get('att-meta') as any;

    expect(row.id).toBe('att-meta');
    expect(row.item_id).toBe(item.id);
    expect(row.filename).toBe('document.pdf');
    expect(row.mime_type).toBe('application/pdf');
    expect(row.size).toBe(5242880);
    expect(row.created_at).toBe(now);
  });

  it('should handle multiple attachments per item', () => {
    const db = yoliumDb.getDb();
    const now = new Date().toISOString();

    const board = yoliumDb.createBoard('/project-multi');
    const item = yoliumDb.addItem(board, {
      title: 'Multi attach',
      description: '',
      agentProvider: 'claude',
      order: 0,
    });

    db.prepare(`
      INSERT INTO kanban_attachments (id, item_id, filename, mime_type, size, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('att-m1', item.id, 'a.png', 'image/png', 100, now);

    db.prepare(`
      INSERT INTO kanban_attachments (id, item_id, filename, mime_type, size, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('att-m2', item.id, 'b.jpg', 'image/jpeg', 200, now);

    db.prepare(`
      INSERT INTO kanban_attachments (id, item_id, filename, mime_type, size, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('att-m3', item.id, 'c.pdf', 'application/pdf', 300, now);

    const rows = db.prepare(
      'SELECT * FROM kanban_attachments WHERE item_id = ?'
    ).all(item.id) as any[];

    expect(rows.length).toBe(3);
  });
});
