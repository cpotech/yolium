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

// Mock git and agent-runner dependencies used by kanban-handlers
vi.mock('@main/git/git-worktree', () => ({
  deleteWorktree: vi.fn(),
}));

vi.mock('@main/services/agent-runner', () => ({
  backfillWorktreePaths: vi.fn(),
  stopAllAgentsForProject: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@main/stores/workitem-log-store', () => ({
  deleteLog: vi.fn(),
}));

let yoliumDb: typeof import('@main/stores/yolium-db');
let attachmentStore: typeof import('@main/stores/attachment-store');

// Minimal IPC mock
function createIpcMainMock() {
  const handlers = new Map<string, Function>();
  return {
    handle: (channel: string, handler: Function) => {
      handlers.set(channel, handler);
    },
    getHandler: (channel: string) => handlers.get(channel),
  };
}

function createEventMock() {
  return {
    sender: {
      send: vi.fn(),
      isDestroyed: () => false,
    },
  };
}

describe('attachment-handlers', () => {
  let tempDir: string;
  let ipcMock: ReturnType<typeof createIpcMainMock>;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'attach-handlers-'));
    fs.mkdirSync(path.join(tempDir, '.yolium'), { recursive: true });
    homedirMock.mockReturnValue(tempDir);

    vi.resetModules();
    yoliumDb = await import('@main/stores/yolium-db');
    attachmentStore = await import('@main/stores/attachment-store');

    // Initialize DB
    yoliumDb.getDb();

    // Create a board and item for tests
    const board = yoliumDb.createBoard('/test-project');
    yoliumDb.addItem(board, {
      title: 'Test item',
      description: 'Test description',
      agentProvider: 'claude',
      order: 0,
    });

    // Register handlers
    ipcMock = createIpcMainMock();
    const { registerKanbanHandlers } = await import('@main/ipc/kanban-handlers');
    registerKanbanHandlers(ipcMock as any);
  });

  afterEach(() => {
    yoliumDb.closeDb();
    vi.clearAllMocks();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function getBoard() {
    return yoliumDb.getOrCreateBoard('/test-project');
  }

  function getItemId() {
    return getBoard().items[0].id;
  }

  it('should save attachment via kanban:add-attachment and return metadata', async () => {
    const handler = ipcMock.getHandler('kanban:add-attachment')!;
    const event = createEventMock();
    const base64Data = Buffer.from('test file content').toString('base64');
    const itemId = getItemId();

    const result = await handler(event, '/test-project', itemId, 'test.txt', 'text/plain', base64Data);

    expect(result.id).toBeDefined();
    expect(result.filename).toBe('test.txt');
    expect(result.mimeType).toBe('text/plain');
    expect(result.itemId).toBe(itemId);
  });

  it('should list attachments for an item via kanban:list-attachments', async () => {
    const addHandler = ipcMock.getHandler('kanban:add-attachment')!;
    const listHandler = ipcMock.getHandler('kanban:list-attachments')!;

    const event = createEventMock();
    const itemId = getItemId();
    const base64 = Buffer.from('data').toString('base64');

    await addHandler(event, '/test-project', itemId, 'a.txt', 'text/plain', base64);
    await addHandler(event, '/test-project', itemId, 'b.txt', 'text/plain', base64);

    const list = await listHandler(event, '/test-project', itemId);
    expect(list.length).toBe(2);
  });

  it('should delete attachment via kanban:delete-attachment and clean up file', async () => {
    const addHandler = ipcMock.getHandler('kanban:add-attachment')!;
    const deleteHandler = ipcMock.getHandler('kanban:delete-attachment')!;

    const event = createEventMock();
    const itemId = getItemId();
    const base64 = Buffer.from('data').toString('base64');

    const saved = await addHandler(event, '/test-project', itemId, 'del.txt', 'text/plain', base64);
    const result = await deleteHandler(event, '/test-project', itemId, saved.id);

    expect(result).toBe(true);

    // Verify file is gone
    const readResult = attachmentStore.readAttachment('/test-project', itemId, saved.id);
    expect(readResult).toBeNull();
  });

  it('should read attachment file via kanban:read-attachment and return base64 data', async () => {
    const addHandler = ipcMock.getHandler('kanban:add-attachment')!;
    const readHandler = ipcMock.getHandler('kanban:read-attachment')!;

    const event = createEventMock();
    const itemId = getItemId();
    const originalContent = 'hello world attachment';
    const base64 = Buffer.from(originalContent).toString('base64');

    const saved = await addHandler(event, '/test-project', itemId, 'read.txt', 'text/plain', base64);
    const result = await readHandler(event, '/test-project', itemId, saved.id);

    expect(result).not.toBeNull();
    expect(result.filename).toBe('read.txt');
    expect(result.mimeType).toBe('text/plain');
    expect(Buffer.from(result.data, 'base64').toString()).toBe(originalContent);
  });

  it('should reject oversized files with an error', () => {
    const handler = ipcMock.getHandler('kanban:add-attachment')!;
    const event = createEventMock();
    const itemId = getItemId();

    // 11MB file as base64
    const bigData = Buffer.alloc(11 * 1024 * 1024).toString('base64');

    expect(() => {
      handler(event, '/test-project', itemId, 'big.bin', 'application/octet-stream', bigData);
    }).toThrow(/size limit/i);
  });

  it('should emit kanban:board-updated after adding an attachment', async () => {
    const handler = ipcMock.getHandler('kanban:add-attachment')!;
    const event = createEventMock();
    const itemId = getItemId();
    const base64 = Buffer.from('data').toString('base64');

    await handler(event, '/test-project', itemId, 'test.txt', 'text/plain', base64);

    expect(event.sender.send).toHaveBeenCalledWith('kanban:board-updated', '/test-project');
  });
});
