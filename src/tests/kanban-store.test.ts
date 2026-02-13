// src/tests/kanban-store.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as path from 'node:path';
import {
  createBoard,
  getBoard,
  deleteBoard,
  addItem,
  updateBoard,
  updateItem,
  addComment,
  deleteItems,
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

  describe('updateBoard', () => {
    it('should update board metadata', () => {
      const board = createBoard('/path/to/project');

      updateBoard(board, { lastAgentName: 'code-agent' });

      expect(board.lastAgentName).toBe('code-agent');
    });
  });

  describe('addItem', () => {
    it('should add item to board', () => {
      const board = createBoard('/path/to/project');
      const item = addItem(board, {
        title: 'Test Item',
        description: 'Do the thing',
        agentProvider: 'claude',
        order: 1,
      });

      expect(item.title).toBe('Test Item');
      expect(item.column).toBe('backlog');
      expect(item.agentStatus).toBe('idle');
      expect(board.items).toContain(item);
    });

    it('should add item with agentType', () => {
      const board = createBoard('/path/to/project');
      const item = addItem(board, {
        title: 'Test Item',
        description: 'Do the thing',
        agentProvider: 'claude',
        agentType: 'code-agent',
        order: 1,
      });

      expect(item.agentType).toBe('code-agent');
    });

    it('should add item without agentType', () => {
      const board = createBoard('/path/to/project');
      const item = addItem(board, {
        title: 'Test Item',
        description: 'Do the thing',
        agentProvider: 'claude',
        order: 1,
      });

      expect(item.agentType).toBeUndefined();
    });

    it('should throw on empty title', () => {
      const board = createBoard('/path/to/project');
      expect(() =>
        addItem(board, {
          title: '',
          description: 'Do the thing',
          agentProvider: 'claude',
          order: 1,
        })
      ).toThrow('Title is required');
    });

    it('should throw on whitespace-only title', () => {
      const board = createBoard('/path/to/project');
      expect(() =>
        addItem(board, {
          title: '   ',
          description: 'Do the thing',
          agentProvider: 'claude',
          order: 1,
        })
      ).toThrow('Title is required');
    });
  });

  describe('addComment', () => {
    it('should add comment to item', () => {
      const board = createBoard('/path/to/project');
      const item = addItem(board, {
        title: 'Test',
        description: 'Test',
        agentProvider: 'claude',
        order: 1,
      });

      addComment(board, item.id, 'user', 'This is my answer');

      const updated = board.items.find(i => i.id === item.id)!;
      expect(updated.comments).toHaveLength(1);
      expect(updated.comments[0].source).toBe('user');
      expect(updated.comments[0].text).toBe('This is my answer');
    });

    it('should add comment with options', () => {
      const board = createBoard('/path/to/project');
      const item = addItem(board, {
        title: 'Test',
        description: 'Test',
        agentProvider: 'claude',
        order: 1,
      });

      addComment(board, item.id, 'agent', 'Which approach?', ['Option A', 'Option B']);

      const updated = board.items.find(i => i.id === item.id)!;
      expect(updated.comments).toHaveLength(1);
      expect(updated.comments[0].source).toBe('agent');
      expect(updated.comments[0].text).toBe('Which approach?');
      expect(updated.comments[0].options).toEqual(['Option A', 'Option B']);
    });

    it('should not include options field when options is empty', () => {
      const board = createBoard('/path/to/project');
      const item = addItem(board, {
        title: 'Test',
        description: 'Test',
        agentProvider: 'claude',
        order: 1,
      });

      addComment(board, item.id, 'agent', 'Just a message', []);

      const updated = board.items.find(i => i.id === item.id)!;
      expect(updated.comments[0].options).toBeUndefined();
    });

    it('should not include options field when options is undefined', () => {
      const board = createBoard('/path/to/project');
      const item = addItem(board, {
        title: 'Test',
        description: 'Test',
        agentProvider: 'claude',
        order: 1,
      });

      addComment(board, item.id, 'user', 'A comment');

      const updated = board.items.find(i => i.id === item.id)!;
      expect(updated.comments[0].options).toBeUndefined();
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
        agentProvider: 'claude',
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
        agentProvider: 'claude',
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
        agentProvider: 'claude',
        order: 0,
      });

      const result = updateItem(board, item.id, { column: 'ready' });
      expect(result).not.toBeNull();
      expect(result!.column).toBe('ready');
    });

    it('should accept verify as a valid column value', () => {
      const board = createBoard('/path/to/project');
      const item = addItem(board, {
        title: 'Test',
        description: 'Test',
        agentProvider: 'claude',
        order: 0,
      });

      const result = updateItem(board, item.id, { column: 'verify' });
      expect(result).not.toBeNull();
      expect(result!.column).toBe('verify');
    });

    it('should accept valid agentStatus values', () => {
      const board = createBoard('/path/to/project');
      const item = addItem(board, {
        title: 'Test',
        description: 'Test',
        agentProvider: 'claude',
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
        agentProvider: 'claude',
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
        agentProvider: 'claude',
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
        agentProvider: 'claude',
        order: 0,
      });

      const result = updateItem(board, item.id, { model: 'invalid-model' });
      expect(result).toBeNull();
    });

    it('should accept updating agentType', () => {
      const board = createBoard('/path/to/project');
      const item = addItem(board, {
        title: 'Test',
        description: 'Test',
        agentProvider: 'claude',
        order: 0,
      });

      const result = updateItem(board, item.id, { agentType: 'plan-agent' });
      expect(result).not.toBeNull();
      expect(result!.agentType).toBe('plan-agent');
    });

    it('should accept clearing agentType with undefined', () => {
      const board = createBoard('/path/to/project');
      const item = addItem(board, {
        title: 'Test',
        description: 'Test',
        agentProvider: 'claude',
        agentType: 'code-agent',
        order: 0,
      });

      const result = updateItem(board, item.id, { agentType: undefined });
      expect(result).not.toBeNull();
      expect(result!.agentType).toBeUndefined();
    });

    it('should accept updating lastAgentName', () => {
      const board = createBoard('/path/to/project');
      const item = addItem(board, {
        title: 'Test',
        description: 'Test',
        agentProvider: 'claude',
        order: 0,
      });

      const result = updateItem(board, item.id, { lastAgentName: 'code-agent' });
      expect(result).not.toBeNull();
      expect(result!.lastAgentName).toBe('code-agent');
    });

    it('should accept clearing lastAgentName with undefined', () => {
      const board = createBoard('/path/to/project');
      const item = addItem(board, {
        title: 'Test',
        description: 'Test',
        agentProvider: 'claude',
        order: 0,
      });

      updateItem(board, item.id, { lastAgentName: 'plan-agent' });
      const result = updateItem(board, item.id, { lastAgentName: undefined });
      expect(result).not.toBeNull();
      expect(result!.lastAgentName).toBeUndefined();
    });

    it('should reject empty title on update', () => {
      const board = createBoard('/path/to/project');
      const item = addItem(board, {
        title: 'Test',
        description: 'Test',
        agentProvider: 'claude',
        order: 0,
      });

      const result = updateItem(board, item.id, { title: '' });
      expect(result).toBeNull();
    });

    it('should reject whitespace-only title on update', () => {
      const board = createBoard('/path/to/project');
      const item = addItem(board, {
        title: 'Test',
        description: 'Test',
        agentProvider: 'claude',
        order: 0,
      });

      const result = updateItem(board, item.id, { title: '   ' });
      expect(result).toBeNull();
    });

    it('should accept valid title on update', () => {
      const board = createBoard('/path/to/project');
      const item = addItem(board, {
        title: 'Test',
        description: 'Test',
        agentProvider: 'claude',
        order: 0,
      });

      const result = updateItem(board, item.id, { title: 'New Title' });
      expect(result).not.toBeNull();
      expect(result!.title).toBe('New Title');
    });
  });

  describe('buildConversationHistory', () => {
    it('should build history from comments', () => {
      const board = createBoard('/path/to/project');
      const item = addItem(board, {
        title: 'Test',
        description: 'Test',
        agentProvider: 'claude',
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

  describe('deleteItems', () => {
    it('should delete multiple items by their IDs', () => {
      const board = createBoard('/path/to/project');
      const item1 = addItem(board, { title: 'Item 1', description: 'Desc 1', agentProvider: 'claude', order: 0 });
      const item2 = addItem(board, { title: 'Item 2', description: 'Desc 2', agentProvider: 'claude', order: 1 });
      const item3 = addItem(board, { title: 'Item 3', description: 'Desc 3', agentProvider: 'claude', order: 2 });

      const deletedIds = deleteItems(board, [item1.id, item3.id]);

      expect(deletedIds).toHaveLength(2);
      expect(deletedIds).toContain(item1.id);
      expect(deletedIds).toContain(item3.id);
      expect(board.items).toHaveLength(1);
      expect(board.items[0].id).toBe(item2.id);
    });

    it('should return empty array when no IDs match', () => {
      const board = createBoard('/path/to/project');
      addItem(board, { title: 'Item 1', description: 'Desc 1', agentProvider: 'claude', order: 0 });

      const deletedIds = deleteItems(board, ['nonexistent-id']);

      expect(deletedIds).toHaveLength(0);
      expect(board.items).toHaveLength(1);
    });

    it('should handle empty itemIds array', () => {
      const board = createBoard('/path/to/project');
      addItem(board, { title: 'Item 1', description: 'Desc 1', agentProvider: 'claude', order: 0 });

      const deletedIds = deleteItems(board, []);

      expect(deletedIds).toHaveLength(0);
      expect(board.items).toHaveLength(1);
    });

    it('should only delete items that exist, ignoring unknown IDs', () => {
      const board = createBoard('/path/to/project');
      const item1 = addItem(board, { title: 'Item 1', description: 'Desc 1', agentProvider: 'claude', order: 0 });
      addItem(board, { title: 'Item 2', description: 'Desc 2', agentProvider: 'claude', order: 1 });

      const deletedIds = deleteItems(board, [item1.id, 'nonexistent-id']);

      expect(deletedIds).toHaveLength(1);
      expect(deletedIds).toContain(item1.id);
      expect(board.items).toHaveLength(1);
    });

    it('should delete all items when all IDs are provided', () => {
      const board = createBoard('/path/to/project');
      const item1 = addItem(board, { title: 'Item 1', description: 'Desc 1', agentProvider: 'claude', order: 0 });
      const item2 = addItem(board, { title: 'Item 2', description: 'Desc 2', agentProvider: 'claude', order: 1 });

      const deletedIds = deleteItems(board, [item1.id, item2.id]);

      expect(deletedIds).toHaveLength(2);
      expect(board.items).toHaveLength(0);
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
