import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';

vi.mock('@main/lib/logger', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

vi.mock('node:os', () => ({
  homedir: vi.fn(() => '/home/test'),
  platform: vi.fn(() => 'linux'),
}));

vi.mock('node:path', async () => {
  const actual = await vi.importActual<typeof import('node:path')>('node:path');
  return {
    ...actual,
    resolve: vi.fn((...args: string[]) => args[args.length - 1]),
  };
});

const mockExistsSync = vi.fn(() => false);
const mockReadFileSync = vi.fn(() => '');
vi.mock('node:fs', () => ({
  existsSync: (...args: unknown[]) => mockExistsSync(...args),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
  readdirSync: vi.fn(() => []),
  unlinkSync: vi.fn(),
}));

const mockGetAgentSession = vi.hoisted(() => vi.fn(() => undefined));
vi.mock('@main/docker', () => ({
  getAgentSession: (...args: unknown[]) => mockGetAgentSession(...args),
}));

const mockState = vi.hoisted(() => ({
  boards: new Map<string, any>(),
  nextId: 1,
}));

vi.mock('@main/stores/kanban-store', () => {
  const createBoard = (projectPath: string) => {
    const board = {
      id: `board-${mockState.nextId++}`,
      projectPath,
      items: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    mockState.boards.set(projectPath, board);
    return board;
  };
  const getOrCreateBoard = (projectPath: string) => {
    return mockState.boards.get(projectPath) || createBoard(projectPath);
  };
  const addItem = (board: any, params: any) => {
    const item = {
      id: `item-${mockState.nextId++}`,
      title: params.title,
      description: params.description,
      column: 'backlog',
      agentProvider: params.agentProvider,
      agentStatus: 'idle',
      comments: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    board.items.push(item);
    return item;
  };
  const updateItem = (board: any, itemId: string, updates: Record<string, unknown>) => {
    const item = board.items.find((i: any) => i.id === itemId);
    if (!item) return null;
    Object.assign(item, updates, { updatedAt: new Date().toISOString() });
    return item;
  };
  const addComment = (board: any, itemId: string, source: string, text: string) => {
    const item = board.items.find((i: any) => i.id === itemId);
    if (!item) return null;
    const comment = { id: `comment-${mockState.nextId++}`, source, text, timestamp: new Date().toISOString() };
    item.comments.push(comment);
    return comment;
  };
  return { createBoard, getOrCreateBoard, addItem, updateItem, addComment };
});

import { handleAgentExit, synthesizeNonClaudeConclusion } from '@main/services/agent-exit-handler';
import { addItem, getOrCreateBoard, updateItem } from '@main/stores/kanban-store';

function makeExitParams(overrides: Partial<Parameters<typeof handleAgentExit>[0]> = {}) {
  const events = new EventEmitter();
  // Prevent unhandled 'error' event from throwing in tests
  events.on('error', () => {});
  return {
    code: 0,
    projectPath: '/tmp/test-project',
    itemId: 'item-1',
    agentName: 'code-agent',
    provider: 'claude',
    sessionId: 'session-1',
    events,
    worktreePath: undefined,
    resolvedProjectPath: '/tmp/test-project',
    timeoutMinutes: 30,
    originalItemDescription: 'Original description',
    ...overrides,
  };
}

describe('agent-exit-handler', () => {
  beforeEach(() => {
    mockState.boards.clear();
    mockState.nextId = 1;
    vi.clearAllMocks();
    mockGetAgentSession.mockReturnValue(undefined);
    mockExistsSync.mockReturnValue(false);
    mockReadFileSync.mockReturnValue('');
  });

  describe('handleAgentExit', () => {
    it('should mark item completed on exit code 0 with no errors', () => {
      const board = getOrCreateBoard('/tmp/test-project');
      const item = addItem(board, { title: 'Test', description: 'Desc', agentProvider: 'claude' });
      updateItem(board, item.id, { agentStatus: 'running', column: 'in-progress' });
      mockGetAgentSession.mockReturnValue({ protocolMessageCount: 0 });

      handleAgentExit(makeExitParams({ itemId: item.id }));

      const updated = board.items.find((i: any) => i.id === item.id)!;
      expect(updated.agentStatus).toBe('completed');
      expect(updated.column).toBe('verify');
    });

    it('should mark item failed when detectedError is present', () => {
      const board = getOrCreateBoard('/tmp/test-project');
      const item = addItem(board, { title: 'Test', description: 'Desc', agentProvider: 'claude' });
      updateItem(board, item.id, { agentStatus: 'running', column: 'in-progress' });
      mockGetAgentSession.mockReturnValue({ detectedError: 'Something went wrong', protocolMessageCount: 0 });

      const onError = vi.fn();
      handleAgentExit(makeExitParams({ itemId: item.id, onError }));

      const updated = board.items.find((i: any) => i.id === item.id)!;
      expect(updated.agentStatus).toBe('failed');
      expect(onError).toHaveBeenCalledWith('Something went wrong');
    });

    it('should mark item interrupted when protocol messages sent but no complete', () => {
      const board = getOrCreateBoard('/tmp/test-project');
      const item = addItem(board, { title: 'Test', description: 'Desc', agentProvider: 'claude' });
      updateItem(board, item.id, { agentStatus: 'running', column: 'in-progress' });
      mockGetAgentSession.mockReturnValue({ protocolMessageCount: 5 });

      handleAgentExit(makeExitParams({ itemId: item.id }));

      const updated = board.items.find((i: any) => i.id === item.id)!;
      expect(updated.agentStatus).toBe('interrupted');
    });

    it('should treat non-Claude exit 0 with no protocol as success', () => {
      const board = getOrCreateBoard('/tmp/test-project');
      const item = addItem(board, { title: 'Test', description: 'Desc', agentProvider: 'codex' });
      updateItem(board, item.id, { agentStatus: 'running', column: 'in-progress' });
      mockGetAgentSession.mockReturnValue({ protocolMessageCount: 0 });

      handleAgentExit(makeExitParams({ itemId: item.id, provider: 'codex' }));

      const updated = board.items.find((i: any) => i.id === item.id)!;
      expect(updated.agentStatus).toBe('completed');
    });

    it('should handle timeout exit code 124', () => {
      const board = getOrCreateBoard('/tmp/test-project');
      const item = addItem(board, { title: 'Test', description: 'Desc', agentProvider: 'claude' });
      updateItem(board, item.id, { agentStatus: 'running', column: 'in-progress' });

      const onError = vi.fn();
      handleAgentExit(makeExitParams({ code: 124, itemId: item.id, onError }));

      const updated = board.items.find((i: any) => i.id === item.id)!;
      expect(updated.agentStatus).toBe('failed');
      expect(onError).toHaveBeenCalledWith('Agent timed out');
    });

    it('should handle non-zero exit with detected error message', () => {
      const board = getOrCreateBoard('/tmp/test-project');
      const item = addItem(board, { title: 'Test', description: 'Desc', agentProvider: 'claude' });
      updateItem(board, item.id, { agentStatus: 'running', column: 'in-progress' });
      mockGetAgentSession.mockReturnValue({ detectedError: 'OOM killed' });

      const onError = vi.fn();
      handleAgentExit(makeExitParams({ code: 1, itemId: item.id, onError }));

      const updated = board.items.find((i: any) => i.id === item.id)!;
      expect(updated.agentStatus).toBe('failed');
      expect(onError).toHaveBeenCalledWith('Agent exited with code 1: OOM killed');
    });

    it('should handle non-zero exit without detected error', () => {
      const board = getOrCreateBoard('/tmp/test-project');
      const item = addItem(board, { title: 'Test', description: 'Desc', agentProvider: 'claude' });
      updateItem(board, item.id, { agentStatus: 'running', column: 'in-progress' });

      const onError = vi.fn();
      handleAgentExit(makeExitParams({ code: 137, itemId: item.id, onError }));

      const updated = board.items.find((i: any) => i.id === item.id)!;
      expect(updated.agentStatus).toBe('failed');
      expect(onError).toHaveBeenCalledWith('Agent exited with code 137');
    });
  });

  describe('synthesizeNonClaudeConclusion', () => {
    it('should read .yolium-plan.md for non-Claude plan-agent on exit', () => {
      const board = getOrCreateBoard('/tmp/test-project');
      const item = addItem(board, { title: 'Test', description: 'Original', agentProvider: 'codex' });
      mockGetAgentSession.mockReturnValue({ receivedUpdateDescription: false });
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('## Plan\n\nStep 1: Do things');

      synthesizeNonClaudeConclusion({
        sessionId: 'session-1',
        agentName: 'plan-agent',
        itemId: item.id,
        projectPath: '/tmp/test-project',
        outputDir: '/tmp/worktree',
        originalItemDescription: 'Original',
      });

      const updated = board.items.find((i: any) => i.id === item.id)!;
      expect(updated.description).toBe('## Plan\n\nStep 1: Do things');
      expect(updated.comments.some((c: any) => c.text.includes('Step 1: Do things'))).toBe(true);
    });

    it('should read .yolium-summary.md for non-Claude code-agent on exit', () => {
      const board = getOrCreateBoard('/tmp/test-project');
      const item = addItem(board, { title: 'Test', description: 'Original', agentProvider: 'codex' });
      mockGetAgentSession.mockReturnValue({});
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('Summary of changes');

      synthesizeNonClaudeConclusion({
        sessionId: 'session-1',
        agentName: 'code-agent',
        itemId: item.id,
        projectPath: '/tmp/test-project',
        outputDir: '/tmp/worktree',
        originalItemDescription: 'Original',
      });

      const updated = board.items.find((i: any) => i.id === item.id)!;
      expect(updated.comments.some((c: any) => c.text === 'Summary of changes')).toBe(true);
    });

    it('should read .yolium-scout.json for non-Claude scout-agent on exit', () => {
      const board = getOrCreateBoard('/tmp/test-project');
      const item = addItem(board, { title: 'Test', description: 'Original', agentProvider: 'codex' });
      mockGetAgentSession.mockReturnValue({});
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('[{"company":"Acme"}]');

      synthesizeNonClaudeConclusion({
        sessionId: 'session-1',
        agentName: 'scout-agent',
        itemId: item.id,
        projectPath: '/tmp/test-project',
        outputDir: '/tmp/worktree',
        originalItemDescription: 'Original',
      });

      const updated = board.items.find((i: any) => i.id === item.id)!;
      expect(updated.comments.some((c: any) => c.text.includes('Acme'))).toBe(true);
    });

    it('should read .yolium-verify.md for non-Claude verify-agent on exit', () => {
      const board = getOrCreateBoard('/tmp/test-project');
      const item = addItem(board, { title: 'Test', description: 'Original', agentProvider: 'codex' });
      mockGetAgentSession.mockReturnValue({});
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('## Verification Report\n\nStatus: PASS');

      synthesizeNonClaudeConclusion({
        sessionId: 'session-1',
        agentName: 'verify-agent',
        itemId: item.id,
        projectPath: '/tmp/test-project',
        outputDir: '/tmp/worktree',
        originalItemDescription: 'Original',
      });

      const updated = board.items.find((i: any) => i.id === item.id)!;
      expect(updated.comments.some((c: any) => c.text.includes('Verification Report'))).toBe(true);
    });

    it('should fall back to accumulated agent message texts for plan-agent', () => {
      const board = getOrCreateBoard('/tmp/test-project');
      const item = addItem(board, { title: 'Test', description: 'Original', agentProvider: 'codex' });
      mockGetAgentSession.mockReturnValue({
        receivedUpdateDescription: false,
        agentMessageTexts: [
          'Short note.',
          '## Full Plan\n\nStep 1: Do this\nStep 2: Do that\nStep 3: Profit',
          'Another short note.',
        ],
      });
      mockExistsSync.mockReturnValue(false);

      synthesizeNonClaudeConclusion({
        sessionId: 'session-1',
        agentName: 'plan-agent',
        itemId: item.id,
        projectPath: '/tmp/test-project',
        outputDir: '/tmp/worktree',
        originalItemDescription: 'Original',
      });

      const updated = board.items.find((i: any) => i.id === item.id)!;
      expect(updated.description).toContain('## Full Plan');
    });
  });
});
