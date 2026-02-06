// src/tests/kanban-store.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as path from 'node:path';
import {
  createBoard,
  getBoard,
  deleteBoard,
  addItem,
  updateItem,
  addComment,
  buildConversationHistory,
  normalizeForHash,
} from '@main/stores/kanban-store';

// Mock fs
vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(() => '{}'),
  readdirSync: vi.fn(() => []),
  unlinkSync: vi.fn(),
}));

vi.mock('node:os', () => ({
  homedir: vi.fn(() => '/home/test'),
}));

// Mock path.resolve to return input as-is by default (platform-independent tests).
// Individual tests can override to simulate Windows drive-letter resolution.
vi.mock('node:path', async () => {
  const actual = await vi.importActual<typeof import('node:path')>('node:path');
  return {
    ...actual,
    resolve: vi.fn((...args: string[]) => args[args.length - 1]),
  };
});

describe('kanban-store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('normalizeForHash', () => {
    it('should convert backslashes to forward slashes', () => {
      expect(normalizeForHash('C:\\Users\\gaming\\project')).toBe('C:/Users/gaming/project');
    });

    it('should remove trailing slash', () => {
      expect(normalizeForHash('/path/to/project/')).toBe('/path/to/project');
    });

    it('should remove trailing backslash (after conversion)', () => {
      expect(normalizeForHash('C:\\Users\\gaming\\project\\')).toBe('C:/Users/gaming/project');
    });

    it('should leave already normalized paths unchanged', () => {
      expect(normalizeForHash('C:/Users/gaming/project')).toBe('C:/Users/gaming/project');
    });

    it('should preserve root slash', () => {
      expect(normalizeForHash('/')).toBe('/');
    });

    it('should handle mixed separators', () => {
      expect(normalizeForHash('C:\\Users/gaming\\project')).toBe('C:/Users/gaming/project');
    });

    it('should resolve drive-letter-less paths to the same hash as drive-letter paths', () => {
      // Simulate Windows: path.resolve('/Users/gaming/project') → 'C:\\Users\\gaming\\project'
      vi.mocked(path.resolve).mockReturnValueOnce('C:\\Users\\gaming\\project');
      const hash1 = normalizeForHash('/Users/gaming/project');

      vi.mocked(path.resolve).mockReturnValueOnce('C:\\Users\\gaming\\project');
      const hash2 = normalizeForHash('C:\\Users\\gaming\\project');

      expect(hash1).toBe('C:/Users/gaming/project');
      expect(hash2).toBe('C:/Users/gaming/project');
      expect(hash1).toBe(hash2);
    });
  });

  describe('createBoard', () => {
    it('should create a new board for a project', () => {
      const board = createBoard('/path/to/project');

      expect(board.projectPath).toBe('/path/to/project');
      expect(board.items).toEqual([]);
      expect(board.id).toBeDefined();
    });

    it('should normalize backslash paths in projectPath', () => {
      const board = createBoard('C:\\Users\\gaming\\project');

      expect(board.projectPath).toBe('C:/Users/gaming/project');
    });

    it('should produce the same board for equivalent paths', async () => {
      const fs = await import('node:fs');
      const writeFileSync = vi.mocked(fs.writeFileSync);

      createBoard('C:\\Users\\gaming\\project');
      const path1 = writeFileSync.mock.calls[0][0] as string;

      writeFileSync.mockClear();

      createBoard('C:/Users/gaming/project');
      const path2 = writeFileSync.mock.calls[0][0] as string;

      // Both should write to the same file path (same hash)
      expect(path1).toBe(path2);
    });
  });

  describe('addItem', () => {
    it('should add item to board', () => {
      const board = createBoard('/path/to/project');
      const item = addItem(board, {
        title: 'Test Item',
        description: 'Do the thing',
        agentType: 'claude',
        order: 1,
      });

      expect(item.title).toBe('Test Item');
      expect(item.column).toBe('backlog');
      expect(item.agentStatus).toBe('idle');
      expect(board.items).toContain(item);
    });
  });

  describe('addComment', () => {
    it('should add comment to item', () => {
      const board = createBoard('/path/to/project');
      const item = addItem(board, {
        title: 'Test',
        description: 'Test',
        agentType: 'claude',
        order: 1,
      });

      addComment(board, item.id, 'user', 'This is my answer');

      const updated = board.items.find(i => i.id === item.id)!;
      expect(updated.comments).toHaveLength(1);
      expect(updated.comments[0].source).toBe('user');
      expect(updated.comments[0].text).toBe('This is my answer');
    });
  });

  describe('getBoard', () => {
    it('should return null and not crash when board JSON is corrupted', async () => {
      const fs = await import('node:fs');
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('not valid json{{{');

      const board = getBoard('/path/to/project');
      expect(board).toBeNull();
    });

    it('should return null when board file does not exist', async () => {
      const fs = await import('node:fs');
      vi.mocked(fs.existsSync).mockReturnValue(false);
      // Also mock readdirSync to return empty array for migration search
      vi.mocked(fs.readdirSync as unknown as () => string[]).mockReturnValue([]);

      const board = getBoard('/path/to/project');
      expect(board).toBeNull();
    });
  });

  describe('updateItem', () => {
    it('should reject invalid column values', () => {
      const board = createBoard('/path/to/project');
      const item = addItem(board, {
        title: 'Test',
        description: 'Test',
        agentType: 'claude',
        order: 0,
      });

      const result = updateItem(board, item.id, { column: 'invalid-column' as never });
      expect(result).toBeNull();
    });

    it('should reject invalid agentStatus values', () => {
      const board = createBoard('/path/to/project');
      const item = addItem(board, {
        title: 'Test',
        description: 'Test',
        agentType: 'claude',
        order: 0,
      });

      const result = updateItem(board, item.id, { agentStatus: 'hacked' as never });
      expect(result).toBeNull();
    });

    it('should accept valid column values', () => {
      const board = createBoard('/path/to/project');
      const item = addItem(board, {
        title: 'Test',
        description: 'Test',
        agentType: 'claude',
        order: 0,
      });

      const result = updateItem(board, item.id, { column: 'ready' });
      expect(result).not.toBeNull();
      expect(result!.column).toBe('ready');
    });

    it('should accept valid agentStatus values', () => {
      const board = createBoard('/path/to/project');
      const item = addItem(board, {
        title: 'Test',
        description: 'Test',
        agentType: 'claude',
        order: 0,
      });

      const result = updateItem(board, item.id, { agentStatus: 'running' });
      expect(result).not.toBeNull();
      expect(result!.agentStatus).toBe('running');
    });

    it('should accept valid model values', () => {
      const board = createBoard('/path/to/project');
      const item = addItem(board, {
        title: 'Test',
        description: 'Test',
        agentType: 'claude',
        order: 0,
      });

      const result = updateItem(board, item.id, { model: 'opus' });
      expect(result).not.toBeNull();
      expect(result!.model).toBe('opus');
    });

    it('should accept clearing model with empty string', () => {
      const board = createBoard('/path/to/project');
      const item = addItem(board, {
        title: 'Test',
        description: 'Test',
        agentType: 'claude',
        order: 0,
        model: 'opus',
      });

      const result = updateItem(board, item.id, { model: '' });
      expect(result).not.toBeNull();
      expect(result!.model).toBe('');
    });

    it('should reject invalid model values', () => {
      const board = createBoard('/path/to/project');
      const item = addItem(board, {
        title: 'Test',
        description: 'Test',
        agentType: 'claude',
        order: 0,
      });

      const result = updateItem(board, item.id, { model: 'invalid-model' });
      expect(result).toBeNull();
    });
  });

  describe('buildConversationHistory', () => {
    it('should build history from comments', () => {
      const board = createBoard('/path/to/project');
      const item = addItem(board, {
        title: 'Test',
        description: 'Test',
        agentType: 'claude',
        order: 1,
      });

      addComment(board, item.id, 'system', 'Agent started');
      addComment(board, item.id, 'agent', 'Which framework?');
      addComment(board, item.id, 'user', 'Use React');

      const history = buildConversationHistory(item);

      expect(history).toContain('[system]: Agent started');
      expect(history).toContain('[agent]: Which framework?');
      expect(history).toContain('[user]: Use React');
    });
  });

  describe('deleteBoard', () => {
    it('should return true when board file exists', async () => {
      const fs = await import('node:fs');
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.unlinkSync).mockImplementation(() => {});

      const result = deleteBoard('/path/to/project');
      expect(result).toBe(true);
      expect(fs.unlinkSync).toHaveBeenCalled();
    });

    it('should return false when board file does not exist', async () => {
      const fs = await import('node:fs');
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = deleteBoard('/path/to/nonexistent');
      expect(result).toBe(false);
    });
  });
});
