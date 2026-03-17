// src/tests/yolium-db.test.ts
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

// Mock path.resolve to return input as-is (platform-independent tests)
vi.mock('node:path', async () => {
  const actual = await vi.importActual<typeof import('node:path')>('node:path');
  return {
    ...actual,
    resolve: vi.fn((...args: string[]) => args[args.length - 1]),
  };
});

let yoliumDb: typeof import('@main/stores/yolium-db');

describe('yolium-db', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yolium-db-'));
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

  describe('createBoard / getBoard', () => {
    it('should create a board for a project path and return it with correct fields', () => {
      const board = yoliumDb.createBoard('/home/user/project');

      expect(board.id).toBeDefined();
      expect(board.id.length).toBeGreaterThan(0);
      expect(board.projectPath).toBe('/home/user/project');
      expect(board.items).toEqual([]);
      expect(board.createdAt).toBeDefined();
      expect(board.updatedAt).toBeDefined();
    });

    it('should return null from getBoard when no board exists for a path', () => {
      const board = yoliumDb.getBoard('/nonexistent/path');
      expect(board).toBeNull();
    });

    it('should create board on getOrCreateBoard when none exists', () => {
      const board = yoliumDb.getOrCreateBoard('/home/user/project');

      expect(board).not.toBeNull();
      expect(board.projectPath).toBe('/home/user/project');
      expect(board.items).toEqual([]);
    });

    it('should return existing board on getOrCreateBoard when one exists', () => {
      const board1 = yoliumDb.getOrCreateBoard('/home/user/project');
      const board2 = yoliumDb.getOrCreateBoard('/home/user/project');

      expect(board1.id).toBe(board2.id);
    });

    it('should normalize backslash paths in projectPath on createBoard', () => {
      const board = yoliumDb.createBoard('C:\\Users\\gaming\\project');
      expect(board.projectPath).toBe('C:/Users/gaming/project');
    });

    it('should produce the same board for equivalent paths', () => {
      const board1 = yoliumDb.createBoard('C:\\Users\\gaming\\project');
      const board2 = yoliumDb.getBoard('C:/Users/gaming/project');

      expect(board2).not.toBeNull();
      expect(board1.id).toBe(board2!.id);
    });
  });

  describe('updateBoard', () => {
    it('should update board lastAgentName via updateBoard', () => {
      const board = yoliumDb.createBoard('/home/user/project');
      yoliumDb.updateBoard(board, { lastAgentName: 'code-agent' });

      expect(board.lastAgentName).toBe('code-agent');

      // Verify persisted
      const reloaded = yoliumDb.getBoard('/home/user/project');
      expect(reloaded!.lastAgentName).toBe('code-agent');
    });
  });

  describe('addItem', () => {
    it('should add an item to a board with all fields populated', () => {
      const board = yoliumDb.createBoard('/home/user/project');
      const item = yoliumDb.addItem(board, {
        title: 'Implement feature X',
        description: 'Full description here',
        branch: 'feature/x',
        agentProvider: 'claude',
        agentType: 'code-agent',
        order: 1,
        model: 'opus',
      });

      expect(item.id).toBeDefined();
      expect(item.title).toBe('Implement feature X');
      expect(item.description).toBe('Full description here');
      expect(item.branch).toBe('feature/x');
      expect(item.agentProvider).toBe('claude');
      expect(item.agentType).toBe('code-agent');
      expect(item.order).toBe(1);
      expect(item.model).toBe('opus');
      expect(item.column).toBe('backlog');
      expect(item.agentStatus).toBe('idle');
      expect(item.comments).toEqual([]);
      expect(board.items).toContain(item);

      // Verify persisted
      const reloaded = yoliumDb.getBoard('/home/user/project');
      expect(reloaded!.items).toHaveLength(1);
      expect(reloaded!.items[0].title).toBe('Implement feature X');
    });

    it('should throw on empty title when adding an item', () => {
      const board = yoliumDb.createBoard('/home/user/project');
      expect(() =>
        yoliumDb.addItem(board, {
          title: '',
          description: 'desc',
          agentProvider: 'claude',
          order: 0,
        })
      ).toThrow('Title is required');
    });

    it('should throw on whitespace-only title when adding an item', () => {
      const board = yoliumDb.createBoard('/home/user/project');
      expect(() =>
        yoliumDb.addItem(board, {
          title: '   ',
          description: 'desc',
          agentProvider: 'claude',
          order: 0,
        })
      ).toThrow('Title is required');
    });

    it('should set item defaults (column=backlog, agentStatus=idle, empty comments)', () => {
      const board = yoliumDb.createBoard('/home/user/project');
      const item = yoliumDb.addItem(board, {
        title: 'Test item',
        description: '',
        agentProvider: 'claude',
        order: 0,
      });

      expect(item.column).toBe('backlog');
      expect(item.agentStatus).toBe('idle');
      expect(item.comments).toEqual([]);
    });
  });

  describe('updateItem', () => {
    it('should update item column and persist the change', () => {
      const board = yoliumDb.createBoard('/home/user/project');
      const item = yoliumDb.addItem(board, {
        title: 'Test',
        description: 'Test',
        agentProvider: 'claude',
        order: 0,
      });

      const updated = yoliumDb.updateItem(board, item.id, { column: 'in-progress' });
      expect(updated).not.toBeNull();
      expect(updated!.column).toBe('in-progress');

      // Verify persisted
      const reloaded = yoliumDb.getBoard('/home/user/project');
      expect(reloaded!.items[0].column).toBe('in-progress');
    });

    it('should reject invalid column values on updateItem', () => {
      const board = yoliumDb.createBoard('/home/user/project');
      const item = yoliumDb.addItem(board, {
        title: 'Test',
        description: 'Test',
        agentProvider: 'claude',
        order: 0,
      });

      const result = yoliumDb.updateItem(board, item.id, { column: 'invalid-column' as never });
      expect(result).toBeNull();
    });

    it('should reject invalid agentStatus values on updateItem', () => {
      const board = yoliumDb.createBoard('/home/user/project');
      const item = yoliumDb.addItem(board, {
        title: 'Test',
        description: 'Test',
        agentProvider: 'claude',
        order: 0,
      });

      const result = yoliumDb.updateItem(board, item.id, { agentStatus: 'hacked' as never });
      expect(result).toBeNull();
    });

    it('should reject empty title on updateItem', () => {
      const board = yoliumDb.createBoard('/home/user/project');
      const item = yoliumDb.addItem(board, {
        title: 'Test',
        description: 'Test',
        agentProvider: 'claude',
        order: 0,
      });

      const result = yoliumDb.updateItem(board, item.id, { title: '' });
      expect(result).toBeNull();
    });

    it('should accept valid agentStatus, model, agentType, lastAgentName updates', () => {
      const board = yoliumDb.createBoard('/home/user/project');
      const item = yoliumDb.addItem(board, {
        title: 'Test',
        description: 'Test',
        agentProvider: 'claude',
        order: 0,
      });

      let result = yoliumDb.updateItem(board, item.id, { agentStatus: 'running' });
      expect(result!.agentStatus).toBe('running');

      result = yoliumDb.updateItem(board, item.id, { model: 'opus' });
      expect(result!.model).toBe('opus');

      result = yoliumDb.updateItem(board, item.id, { agentType: 'plan-agent' });
      expect(result!.agentType).toBe('plan-agent');

      result = yoliumDb.updateItem(board, item.id, { lastAgentName: 'code-agent' });
      expect(result!.lastAgentName).toBe('code-agent');
    });

    it('should update verified flag to true and false', () => {
      const board = yoliumDb.createBoard('/home/user/project');
      const item = yoliumDb.addItem(board, {
        title: 'Test',
        description: 'Test',
        agentProvider: 'claude',
        order: 0,
      });

      let result = yoliumDb.updateItem(board, item.id, { verified: true });
      expect(result!.verified).toBe(true);

      // Verify persisted
      let reloaded = yoliumDb.getBoard('/home/user/project');
      expect(reloaded!.items[0].verified).toBe(true);

      result = yoliumDb.updateItem(board, item.id, { verified: false });
      expect(result!.verified).toBe(false);

      reloaded = yoliumDb.getBoard('/home/user/project');
      expect(reloaded!.items[0].verified).toBe(false);
    });

    it('should store and retrieve testSpecs as JSON', () => {
      const board = yoliumDb.createBoard('/home/user/project');
      const item = yoliumDb.addItem(board, {
        title: 'Test',
        description: 'Test',
        agentProvider: 'claude',
        order: 0,
      });

      const testSpecs = [
        { file: 'test.ts', description: 'Unit tests', specs: ['should work', 'should fail'] },
      ];
      yoliumDb.updateItem(board, item.id, { testSpecs });

      const reloaded = yoliumDb.getBoard('/home/user/project');
      expect(reloaded!.items[0].testSpecs).toEqual(testSpecs);
    });

    it('should store and retrieve agentQuestionOptions as JSON', () => {
      const board = yoliumDb.createBoard('/home/user/project');
      const item = yoliumDb.addItem(board, {
        title: 'Test',
        description: 'Test',
        agentProvider: 'claude',
        order: 0,
      });

      const options = ['Option A', 'Option B', 'Option C'];
      yoliumDb.updateItem(board, item.id, { agentQuestionOptions: options });

      const reloaded = yoliumDb.getBoard('/home/user/project');
      expect(reloaded!.items[0].agentQuestionOptions).toEqual(options);
    });
  });

  describe('addComment', () => {
    it('should add a comment to an item', () => {
      const board = yoliumDb.createBoard('/home/user/project');
      const item = yoliumDb.addItem(board, {
        title: 'Test',
        description: 'Test',
        agentProvider: 'claude',
        order: 0,
      });

      const comment = yoliumDb.addComment(board, item.id, 'user', 'Hello world');
      expect(comment).not.toBeNull();
      expect(comment!.source).toBe('user');
      expect(comment!.text).toBe('Hello world');
      expect(comment!.timestamp).toBeDefined();

      // Check in-memory
      expect(item.comments).toHaveLength(1);

      // Check persisted
      const reloaded = yoliumDb.getBoard('/home/user/project');
      expect(reloaded!.items[0].comments).toHaveLength(1);
      expect(reloaded!.items[0].comments[0].text).toBe('Hello world');
    });

    it('should add a comment with options array', () => {
      const board = yoliumDb.createBoard('/home/user/project');
      const item = yoliumDb.addItem(board, {
        title: 'Test',
        description: 'Test',
        agentProvider: 'claude',
        order: 0,
      });

      const comment = yoliumDb.addComment(board, item.id, 'agent', 'Which approach?', ['Option A', 'Option B']);
      expect(comment!.options).toEqual(['Option A', 'Option B']);

      const reloaded = yoliumDb.getBoard('/home/user/project');
      expect(reloaded!.items[0].comments[0].options).toEqual(['Option A', 'Option B']);
    });

    it('should not include options field when options is empty array', () => {
      const board = yoliumDb.createBoard('/home/user/project');
      const item = yoliumDb.addItem(board, {
        title: 'Test',
        description: 'Test',
        agentProvider: 'claude',
        order: 0,
      });

      const comment = yoliumDb.addComment(board, item.id, 'agent', 'Just a message', []);
      expect(comment!.options).toBeUndefined();

      const reloaded = yoliumDb.getBoard('/home/user/project');
      expect(reloaded!.items[0].comments[0].options).toBeUndefined();
    });

    it('should return null when adding comment to non-existent item', () => {
      const board = yoliumDb.createBoard('/home/user/project');
      const result = yoliumDb.addComment(board, 'nonexistent-id', 'user', 'Hello');
      expect(result).toBeNull();
    });
  });

  describe('deleteItem / deleteItems', () => {
    it('should delete a single item and its comments (CASCADE)', () => {
      const board = yoliumDb.createBoard('/home/user/project');
      const item = yoliumDb.addItem(board, {
        title: 'Test',
        description: 'Test',
        agentProvider: 'claude',
        order: 0,
      });
      yoliumDb.addComment(board, item.id, 'user', 'A comment');

      const deleted = yoliumDb.deleteItem(board, item.id);
      expect(deleted).toBe(true);
      expect(board.items).toHaveLength(0);

      const reloaded = yoliumDb.getBoard('/home/user/project');
      expect(reloaded!.items).toHaveLength(0);
    });

    it('should delete multiple items by ID', () => {
      const board = yoliumDb.createBoard('/home/user/project');
      const item1 = yoliumDb.addItem(board, { title: 'Item 1', description: '', agentProvider: 'claude', order: 0 });
      const item2 = yoliumDb.addItem(board, { title: 'Item 2', description: '', agentProvider: 'claude', order: 1 });
      const item3 = yoliumDb.addItem(board, { title: 'Item 3', description: '', agentProvider: 'claude', order: 2 });

      const deletedIds = yoliumDb.deleteItems(board, [item1.id, item3.id]);
      expect(deletedIds).toHaveLength(2);
      expect(deletedIds).toContain(item1.id);
      expect(deletedIds).toContain(item3.id);
      expect(board.items).toHaveLength(1);
      expect(board.items[0].id).toBe(item2.id);
    });

    it('should return empty array when deleting non-existent item IDs', () => {
      const board = yoliumDb.createBoard('/home/user/project');
      yoliumDb.addItem(board, { title: 'Item 1', description: '', agentProvider: 'claude', order: 0 });

      const deletedIds = yoliumDb.deleteItems(board, ['nonexistent-id']);
      expect(deletedIds).toHaveLength(0);
    });
  });

  describe('deleteBoard', () => {
    it('should delete a board and all its items and comments (CASCADE)', () => {
      const board = yoliumDb.createBoard('/home/user/project');
      const item = yoliumDb.addItem(board, {
        title: 'Test',
        description: 'Test',
        agentProvider: 'claude',
        order: 0,
      });
      yoliumDb.addComment(board, item.id, 'user', 'A comment');

      const result = yoliumDb.deleteBoard('/home/user/project');
      expect(result).toBe(true);

      const reloaded = yoliumDb.getBoard('/home/user/project');
      expect(reloaded).toBeNull();
    });

    it('should return false when deleting non-existent board', () => {
      const result = yoliumDb.deleteBoard('/nonexistent/path');
      expect(result).toBe(false);
    });
  });

  describe('buildConversationHistory', () => {
    it('should build conversation history from comments in order', () => {
      const board = yoliumDb.createBoard('/home/user/project');
      const item = yoliumDb.addItem(board, {
        title: 'Test',
        description: 'Test',
        agentProvider: 'claude',
        order: 0,
      });

      yoliumDb.addComment(board, item.id, 'system', 'Agent started');
      yoliumDb.addComment(board, item.id, 'agent', 'Which framework?');
      yoliumDb.addComment(board, item.id, 'user', 'Use React');

      const history = yoliumDb.buildConversationHistory(item);
      expect(history).toContain('[system]: Agent started');
      expect(history).toContain('[agent]: Which framework?');
      expect(history).toContain('[user]: Use React');
    });
  });

  describe('project registry', () => {
    it('should register a project and retrieve it from the registry', () => {
      yoliumDb.registerProject('/home/user/my-project');

      const registry = yoliumDb.loadProjectRegistry();
      const projects = registry.projects;
      const entries = Object.values(projects);
      expect(entries.length).toBeGreaterThanOrEqual(1);

      const found = entries.find(e => e.path === '/home/user/my-project');
      expect(found).toBeDefined();
      expect(found!.lastAccessed).toBeDefined();
      expect(found!.createdAt).toBeDefined();
    });

    it('should update lastAccessed on re-registration of existing project', async () => {
      yoliumDb.registerProject('/home/user/my-project');
      const registry1 = yoliumDb.loadProjectRegistry();
      const entry1 = Object.values(registry1.projects).find(e => e.path === '/home/user/my-project')!;

      // Wait a tiny bit to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 10));

      yoliumDb.registerProject('/home/user/my-project');
      const registry2 = yoliumDb.loadProjectRegistry();
      const entry2 = Object.values(registry2.projects).find(e => e.path === '/home/user/my-project')!;

      expect(entry2.lastAccessed >= entry1.lastAccessed).toBe(true);
      expect(entry2.createdAt).toBe(entry1.createdAt);
    });

    it('should handle loadProjectRegistry returning empty when no projects exist', () => {
      const registry = yoliumDb.loadProjectRegistry();
      expect(registry.version).toBe(1);
      expect(registry.projects).toEqual({});
    });
  });
});
