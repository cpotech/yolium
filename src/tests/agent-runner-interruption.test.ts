import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@main/lib/logger', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

const mockState = vi.hoisted(() => ({
  boards: new Map<string, any>(),
  nextId: 1,
}));

const nowIso = () => new Date().toISOString();

vi.mock('@main/stores/kanban-store', () => {
  const createBoard = (projectPath: string) => {
    const board = {
      id: `board-${mockState.nextId++}`,
      projectPath,
      items: [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    mockState.boards.set(projectPath, board);
    return board;
  };

  const getOrCreateBoard = (projectPath: string) => {
    const existing = mockState.boards.get(projectPath);
    return existing || createBoard(projectPath);
  };

  const addItem = (board: any, params: any) => {
    const item = {
      id: `item-${mockState.nextId++}`,
      title: params.title,
      description: params.description,
      column: 'backlog',
      branch: params.branch,
      agentProvider: params.agentProvider,
      agentType: params.agentType,
      order: params.order,
      model: params.model,
      agentStatus: 'idle',
      comments: [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    board.items.push(item);
    board.updatedAt = nowIso();
    return item;
  };

  const updateItem = (board: any, itemId: string, updates: Record<string, unknown>) => {
    const item = board.items.find((i: any) => i.id === itemId);
    if (!item) return null;
    Object.assign(item, updates, { updatedAt: nowIso() });
    board.updatedAt = nowIso();
    return item;
  };

  const updateBoard = (board: any, updates: Record<string, unknown>) => {
    Object.assign(board, updates, { updatedAt: nowIso() });
    return board;
  };

  const addComment = (board: any, itemId: string, source: string, text: string, options?: string[]) => {
    const item = board.items.find((i: any) => i.id === itemId);
    if (!item) return null;
    const comment = {
      id: `comment-${mockState.nextId++}`,
      source,
      text,
      timestamp: nowIso(),
      ...(options && options.length > 0 ? { options } : {}),
    };
    item.comments.push(comment);
    item.updatedAt = nowIso();
    board.updatedAt = nowIso();
    return comment;
  };

  const buildConversationHistory = (item: any): string => {
    return item.comments.map((comment: any) => `[${comment.source}]: ${comment.text}`).join('\n\n');
  };

  return {
    createBoard,
    getOrCreateBoard,
    addItem,
    updateItem,
    updateBoard,
    addComment,
    buildConversationHistory,
  };
});

const mockLoadAgentDefinition = vi.hoisted(() =>
  vi.fn(() => ({
    systemPrompt: 'You are a test agent.',
    model: 'sonnet',
    tools: ['Read', 'Write'],
  }))
);

vi.mock('@main/services/agent-loader', () => ({
  loadAgentDefinition: mockLoadAgentDefinition,
}));

vi.mock('@main/git/git-worktree', () => ({
  createWorktree: vi.fn(),
  deleteWorktree: vi.fn(),
  generateBranchName: vi.fn(() => 'yolium-test-branch'),
  getWorktreePath: vi.fn(() => '/tmp/worktree'),
  hasCommits: vi.fn(() => false),
  isGitRepo: vi.fn(() => false),
  sanitizeBranchName: vi.fn((name: string) => name),
}));

vi.mock('@main/git/git-config', () => ({
  loadGitConfig: vi.fn(() => null),
}));

vi.mock('@main/stores/workitem-log-store', () => ({
  appendLog: vi.fn(),
  appendSessionHeader: vi.fn(),
}));

const mockCreateAgentContainer = vi.hoisted(() => vi.fn());
const mockStopAgentContainer = vi.hoisted(() => vi.fn());
const mockCheckAgentAuth = vi.hoisted(() => vi.fn(() => ({ authenticated: true })));
const mockGetAgentSession = vi.hoisted(() => vi.fn());

vi.mock('@main/docker', () => ({
  createAgentContainer: mockCreateAgentContainer,
  stopAgentContainer: mockStopAgentContainer,
  checkAgentAuth: mockCheckAgentAuth,
  getAgentSession: mockGetAgentSession,
}));

import { addItem, getOrCreateBoard, updateItem } from '@main/stores/kanban-store';
import {
  clearSessions,
  getSession,
  recoverInterruptedAgents,
  startAgent,
  stopAgent,
} from '@main/services/agent-runner';

describe('agent-runner interruption cleanup', () => {
  beforeEach(() => {
    clearSessions();
    mockState.boards.clear();
    mockState.nextId = 1;

    vi.clearAllMocks();
    mockCreateAgentContainer.mockResolvedValue('session-1');
    mockCheckAgentAuth.mockReturnValue({ authenticated: true });
  });

  it('clears activeAgentName when stopAgent interrupts a running session', async () => {
    const projectPath = '/tmp/project-stop';
    const board = getOrCreateBoard(projectPath);
    const item = addItem(board, {
      title: 'Stop test item',
      description: 'Verify stop cleanup',
      agentProvider: 'claude',
      order: 0,
    });

    const startResult = await startAgent({
      webContentsId: 1,
      agentName: 'code-agent',
      projectPath,
      itemId: item.id,
      goal: 'Run then stop',
    });

    expect(startResult.error).toBeUndefined();

    await stopAgent(startResult.sessionId);

    const updatedItem = board.items.find((i: any) => i.id === item.id);
    expect(updatedItem?.agentStatus).toBe('interrupted');
    expect(updatedItem?.activeAgentName).toBeUndefined();
    expect(updatedItem?.lastAgentName).toBe('code-agent');
    expect(mockStopAgentContainer).toHaveBeenCalledWith(startResult.sessionId);
    expect(getSession(startResult.sessionId)).toBeUndefined();
  });

  it('clears activeAgentName when recovering interrupted running items', () => {
    const projectPath = '/tmp/project-recover';
    const board = getOrCreateBoard(projectPath);
    const runningItem = addItem(board, {
      title: 'Recover running item',
      description: 'Should be interrupted on recovery',
      agentProvider: 'claude',
      order: 0,
    });
    addItem(board, {
      title: 'Idle item',
      description: 'Should remain unchanged',
      agentProvider: 'claude',
      order: 1,
    });

    updateItem(board, runningItem.id, {
      agentStatus: 'running',
      activeAgentName: 'plan-agent',
      lastAgentName: 'plan-agent',
    });

    const recovered = recoverInterruptedAgents(projectPath);

    expect(recovered).toHaveLength(1);
    expect(recovered[0].id).toBe(runningItem.id);

    const updatedItem = board.items.find((i: any) => i.id === runningItem.id);
    expect(updatedItem?.agentStatus).toBe('interrupted');
    expect(updatedItem?.activeAgentName).toBeUndefined();
    expect(updatedItem?.lastAgentName).toBe('plan-agent');
  });

  it('does not recover items that still have an active in-memory session', async () => {
    const projectPath = '/tmp/project-recover-active';
    const board = getOrCreateBoard(projectPath);

    const activeItem = addItem(board, {
      title: 'Active running item',
      description: 'Has a real session',
      agentProvider: 'claude',
      order: 0,
    });
    const staleItem = addItem(board, {
      title: 'Stale running item',
      description: 'No session',
      agentProvider: 'claude',
      order: 1,
    });

    const startResult = await startAgent({
      webContentsId: 1,
      agentName: 'code-agent',
      projectPath,
      itemId: activeItem.id,
      goal: 'Keep running',
    });
    expect(startResult.error).toBeUndefined();

    updateItem(board, staleItem.id, {
      agentStatus: 'running',
      activeAgentName: 'plan-agent',
      lastAgentName: 'plan-agent',
    });

    const recovered = recoverInterruptedAgents(projectPath);

    expect(recovered).toHaveLength(1);
    expect(recovered[0].id).toBe(staleItem.id);

    const activeUpdated = board.items.find((i: any) => i.id === activeItem.id);
    expect(activeUpdated?.agentStatus).toBe('running');

    const staleUpdated = board.items.find((i: any) => i.id === staleItem.id);
    expect(staleUpdated?.agentStatus).toBe('interrupted');
    expect(staleUpdated?.activeAgentName).toBeUndefined();
  });
});
