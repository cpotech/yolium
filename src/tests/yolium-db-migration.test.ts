// src/tests/yolium-db-migration.test.ts
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

vi.mock('@main/lib/logger', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

let yoliumDb: typeof import('@main/stores/yolium-db');

describe('yolium-db migration', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yolium-db-migration-'));
    fs.mkdirSync(path.join(tempDir, '.yolium', 'boards'), { recursive: true });
    homedirMock.mockReturnValue(tempDir);
  });

  afterEach(() => {
    if (yoliumDb) {
      yoliumDb.closeDb();
    }
    vi.clearAllMocks();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function writeBoardJson(filename: string, board: any): void {
    const boardsDir = path.join(tempDir, '.yolium', 'boards');
    fs.writeFileSync(path.join(boardsDir, filename), JSON.stringify(board));
  }

  function makeBoard(overrides: any = {}) {
    return {
      id: 'board-1',
      projectPath: '/home/user/project',
      items: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
      ...overrides,
    };
  }

  function makeItem(overrides: any = {}) {
    return {
      id: 'item-1',
      title: 'Test Item',
      description: 'A description',
      column: 'backlog',
      branch: 'feature/x',
      agentProvider: 'claude',
      agentType: 'code-agent',
      order: 0,
      model: 'opus',
      agentStatus: 'idle',
      activeAgentName: 'agent-1',
      lastAgentName: 'agent-2',
      agentQuestion: 'Which approach?',
      agentQuestionOptions: ['Option A', 'Option B'],
      testSpecs: [{ file: 'test.ts', description: 'Unit tests', specs: ['should work'] }],
      worktreePath: '/tmp/worktree',
      mergeStatus: 'unmerged',
      prUrl: 'https://github.com/org/repo/pull/1',
      verified: true,
      comments: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
      ...overrides,
    };
  }

  function makeComment(overrides: any = {}) {
    return {
      id: 'comment-1',
      source: 'user',
      text: 'Hello world',
      timestamp: '2026-01-01T00:00:00.000Z',
      ...overrides,
    };
  }

  it('should migrate a single board JSON file into SQLite with all items and comments', async () => {
    const comment = makeComment({ id: 'c1' });
    const item = makeItem({ id: 'i1', comments: [comment] });
    const board = makeBoard({ id: 'b1', items: [item] });
    writeBoardJson('project-abc123.json', board);

    vi.resetModules();
    yoliumDb = await import('@main/stores/yolium-db');

    const loaded = yoliumDb.getBoard('/home/user/project');
    expect(loaded).not.toBeNull();
    expect(loaded!.id).toBe('b1');
    expect(loaded!.items).toHaveLength(1);
    expect(loaded!.items[0].id).toBe('i1');
    expect(loaded!.items[0].title).toBe('Test Item');
    expect(loaded!.items[0].comments).toHaveLength(1);
    expect(loaded!.items[0].comments[0].text).toBe('Hello world');
  });

  it('should migrate multiple board JSON files in a single transaction', async () => {
    const board1 = makeBoard({ id: 'b1', projectPath: '/home/user/project1' });
    const board2 = makeBoard({ id: 'b2', projectPath: '/home/user/project2' });
    writeBoardJson('project1-aaa.json', board1);
    writeBoardJson('project2-bbb.json', board2);

    vi.resetModules();
    yoliumDb = await import('@main/stores/yolium-db');

    expect(yoliumDb.getBoard('/home/user/project1')).not.toBeNull();
    expect(yoliumDb.getBoard('/home/user/project2')).not.toBeNull();
  });

  it('should rename migrated board files to .json.migrated', async () => {
    const board = makeBoard({ id: 'b1' });
    writeBoardJson('project-abc.json', board);

    vi.resetModules();
    yoliumDb = await import('@main/stores/yolium-db');

    // Trigger lazy DB init (migration runs inside getDb())
    yoliumDb.getBoard('/home/user/project');

    const boardsDir = path.join(tempDir, '.yolium', 'boards');
    expect(fs.existsSync(path.join(boardsDir, 'project-abc.json'))).toBe(false);
    expect(fs.existsSync(path.join(boardsDir, 'project-abc.json.migrated'))).toBe(true);
  });

  it('should skip corrupted board JSON files and log a warning', async () => {
    const boardsDir = path.join(tempDir, '.yolium', 'boards');
    fs.writeFileSync(path.join(boardsDir, 'corrupt-abc.json'), 'not valid json{{{');
    // Also write a valid one to ensure migration continues
    const validBoard = makeBoard({ id: 'valid-board', projectPath: '/home/user/valid' });
    writeBoardJson('valid-def.json', validBoard);

    vi.resetModules();
    yoliumDb = await import('@main/stores/yolium-db');

    // Valid board should have been migrated
    expect(yoliumDb.getBoard('/home/user/valid')).not.toBeNull();
    // Corrupt file should not be renamed (left as-is for debugging)
    expect(fs.existsSync(path.join(boardsDir, 'corrupt-abc.json'))).toBe(true);
  });

  it('should not re-migrate files that already have .migrated suffix', async () => {
    const board = makeBoard({ id: 'b1' });
    const boardsDir = path.join(tempDir, '.yolium', 'boards');
    fs.writeFileSync(path.join(boardsDir, 'project-abc.json.migrated'), JSON.stringify(board));

    vi.resetModules();
    yoliumDb = await import('@main/stores/yolium-db');

    // Should not have been imported
    expect(yoliumDb.getBoard('/home/user/project')).toBeNull();
  });

  it('should migrate project-registry.json into the project_registry table', async () => {
    const registry = {
      version: 1,
      projects: {
        'my-project-abc123': {
          path: '/home/user/my-project',
          folderName: 'my-project',
          lastAccessed: '2026-01-01T00:00:00.000Z',
          createdAt: '2025-12-01T00:00:00.000Z',
        },
      },
    };
    fs.writeFileSync(
      path.join(tempDir, '.yolium', 'project-registry.json'),
      JSON.stringify(registry)
    );

    vi.resetModules();
    yoliumDb = await import('@main/stores/yolium-db');

    const loaded = yoliumDb.loadProjectRegistry();
    expect(Object.keys(loaded.projects)).toHaveLength(1);
    expect(loaded.projects['my-project-abc123'].path).toBe('/home/user/my-project');
    expect(loaded.projects['my-project-abc123'].folderName).toBe('my-project');
  });

  it('should rename migrated project-registry.json to .json.migrated', async () => {
    const registry = { version: 1, projects: {} };
    const registryPath = path.join(tempDir, '.yolium', 'project-registry.json');
    fs.writeFileSync(registryPath, JSON.stringify(registry));

    vi.resetModules();
    yoliumDb = await import('@main/stores/yolium-db');

    // Trigger lazy DB init (migration runs inside getDb())
    yoliumDb.loadProjectRegistry();

    expect(fs.existsSync(registryPath)).toBe(false);
    expect(fs.existsSync(registryPath + '.migrated')).toBe(true);
  });

  it('should handle missing boards directory gracefully', async () => {
    // Remove the boards directory
    fs.rmSync(path.join(tempDir, '.yolium', 'boards'), { recursive: true, force: true });

    vi.resetModules();
    yoliumDb = await import('@main/stores/yolium-db');

    // Should not throw, DB should work fine
    const board = yoliumDb.createBoard('/home/user/project');
    expect(board).toBeDefined();
  });

  it('should handle missing project-registry.json gracefully', async () => {
    // No project-registry.json file exists
    vi.resetModules();
    yoliumDb = await import('@main/stores/yolium-db');

    const registry = yoliumDb.loadProjectRegistry();
    expect(registry.version).toBe(1);
    expect(registry.projects).toEqual({});
  });

  it('should preserve all KanbanItem fields through migration', async () => {
    const item = makeItem({
      id: 'full-item',
      branch: 'feature/full',
      model: 'opus',
      worktreePath: '/tmp/worktree/full',
      prUrl: 'https://github.com/org/repo/pull/42',
      mergeStatus: 'unmerged',
      verified: true,
      testSpecs: [{ file: 'spec.ts', description: 'Specs', specs: ['test1', 'test2'] }],
      agentQuestionOptions: ['Yes', 'No'],
    });
    const board = makeBoard({ id: 'b-full', items: [item] });
    writeBoardJson('full-project-abc.json', board);

    vi.resetModules();
    yoliumDb = await import('@main/stores/yolium-db');

    const loaded = yoliumDb.getBoard('/home/user/project');
    expect(loaded).not.toBeNull();
    const loadedItem = loaded!.items[0];
    expect(loadedItem.branch).toBe('feature/full');
    expect(loadedItem.model).toBe('opus');
    expect(loadedItem.worktreePath).toBe('/tmp/worktree/full');
    expect(loadedItem.prUrl).toBe('https://github.com/org/repo/pull/42');
    expect(loadedItem.mergeStatus).toBe('unmerged');
    expect(loadedItem.verified).toBe(true);
    expect(loadedItem.testSpecs).toEqual([{ file: 'spec.ts', description: 'Specs', specs: ['test1', 'test2'] }]);
    expect(loadedItem.agentQuestionOptions).toEqual(['Yes', 'No']);
    expect(loadedItem.agentType).toBe('code-agent');
    expect(loadedItem.activeAgentName).toBe('agent-1');
    expect(loadedItem.lastAgentName).toBe('agent-2');
    expect(loadedItem.agentQuestion).toBe('Which approach?');
  });

  it('should migrate board with non-normalized paths by normalizing them', async () => {
    const board = makeBoard({
      id: 'b-backslash',
      projectPath: 'C:\\Users\\gaming\\project',
    });
    writeBoardJson('project-xyz.json', board);

    vi.resetModules();
    yoliumDb = await import('@main/stores/yolium-db');

    // Should be accessible via normalized path
    const loaded = yoliumDb.getBoard('C:/Users/gaming/project');
    expect(loaded).not.toBeNull();
    expect(loaded!.projectPath).toBe('C:/Users/gaming/project');
  });
});
