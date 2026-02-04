// src/tests/kanban-store.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createBoard,
  getBoard,
  addItem,
  updateItem,
  addComment,
  buildConversationHistory,
} from '../lib/kanban-store';

// Mock fs
vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(() => '{}'),
}));

vi.mock('node:os', () => ({
  homedir: vi.fn(() => '/home/test'),
}));

describe('kanban-store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createBoard', () => {
    it('should create a new board for a project', () => {
      const board = createBoard('/path/to/project');

      expect(board.projectPath).toBe('/path/to/project');
      expect(board.items).toEqual([]);
      expect(board.id).toBeDefined();
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
});
