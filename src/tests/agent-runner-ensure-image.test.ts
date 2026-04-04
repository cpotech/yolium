// src/tests/agent-runner-ensure-image.test.ts
// Verify that startAgent() calls ensureImage() before createAgentContainer().
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@main/lib/logger', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(() => '{}'),
  readdirSync: vi.fn(() => []),
  unlinkSync: vi.fn(),
  chmodSync: vi.fn(),
}));

vi.mock('node:os', () => ({
  homedir: vi.fn(() => '/home/test'),
  platform: vi.fn(() => 'linux'),
  tmpdir: vi.fn(() => '/tmp'),
}));

vi.mock('node:path', async () => {
  const actual = await vi.importActual<typeof import('node:path')>('node:path');
  return {
    ...actual,
    resolve: vi.fn((...args: string[]) => args[args.length - 1]),
  };
});

// In-memory kanban mock (same as agent-runner.test.ts)
vi.mock('@main/stores/yolium-db', () => {
  let nextId = 0;
  const generateId = () => `mock-${++nextId}`;
  const VALID_COLUMNS = new Set(['backlog', 'ready', 'in-progress', 'verify', 'done']);
  const VALID_AGENT_STATUSES = new Set(['idle', 'running', 'waiting', 'interrupted', 'completed', 'failed']);
  const VALID_MERGE_STATUSES = new Set(['unmerged', 'merged', 'conflict']);
  const VALID_AGENT_PROVIDERS = new Set(['claude', 'opencode', 'codex', 'openrouter', 'xai']);

  return {
    normalizeForHash: (p: string) => p.replace(/\\/g, '/').replace(/\/$/, '') || '/',
    createBoard: (projectPath: string) => ({
      id: generateId(),
      projectPath: projectPath.replace(/\\/g, '/').replace(/\/$/, '') || '/',
      items: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
    getBoard: () => null,
    getOrCreateBoard: (projectPath: string) => ({
      id: generateId(),
      projectPath,
      items: [
        {
          id: 'test-item-1',
          title: 'Test item',
          description: 'Test description',
          column: 'ready',
          agentStatus: 'idle',
          comments: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
    updateBoard: vi.fn(),
    updateItem: vi.fn(),
    addComment: vi.fn(),
    buildConversationHistory: vi.fn(() => ''),
    listAttachments: vi.fn(() => []),
    copyAttachmentsToWorktree: vi.fn(),
    deleteItem: () => true,
    deleteItems: () => [],
    deleteBoard: () => true,
    closeDb: vi.fn(),
    getDb: vi.fn(),
    loadProjectRegistry: () => ({ version: 1, projects: {} }),
    saveProjectRegistry: vi.fn(),
    registerProject: vi.fn(),
    loadCredentials: vi.fn(() => ({})),
    appendRunLog: vi.fn(),
    appendAction: vi.fn(),
    pruneCredentials: vi.fn(() => 0),
  };
});

const {
  mockCreateAgentContainer,
  mockCheckAgentAuth,
  mockEnsureImage,
  mockStopAgentContainer,
} = vi.hoisted(() => ({
  mockCreateAgentContainer: vi.fn(),
  mockCheckAgentAuth: vi.fn(),
  mockEnsureImage: vi.fn(),
  mockStopAgentContainer: vi.fn(),
}));

vi.mock('@main/docker', () => ({
  createAgentContainer: mockCreateAgentContainer,
  checkAgentAuth: mockCheckAgentAuth,
  ensureImage: mockEnsureImage,
  stopAgentContainer: mockStopAgentContainer,
  getAgentSession: vi.fn(),
}));

vi.mock('@main/services/agent-loader', () => ({
  loadAgentDefinition: vi.fn(() => ({
    name: 'code-agent',
    description: 'Code execution agent',
    model: 'sonnet',
    tools: ['Read', 'Write'],
    timeout: 30,
    systemPrompt: 'You are the Code Agent.',
  })),
}));

vi.mock('@main/git/git-worktree', () => ({
  createWorktree: vi.fn(),
  deleteWorktree: vi.fn(),
  generateBranchName: vi.fn(() => 'yolium-test-branch'),
  getWorktreePath: vi.fn(),
  hasCommits: vi.fn(() => false),
  isGitRepo: vi.fn(() => false),
  sanitizeBranchName: vi.fn((b: string) => b),
}));

vi.mock('@main/git/git-config', () => ({
  loadGitConfig: vi.fn(() => ({ defaultProvider: 'claude' })),
}));

vi.mock('@main/stores/workitem-log-store', () => ({
  appendLog: vi.fn(),
  appendSessionHeader: vi.fn(),
}));

import { startAgent, clearSessions } from '@main/services/agent-runner';

describe('startAgent ensureImage integration', () => {
  beforeEach(() => {
    clearSessions();
    mockCheckAgentAuth.mockReturnValue({ authenticated: true });
    mockEnsureImage.mockResolvedValue(undefined);
    mockCreateAgentContainer.mockReset();
    mockEnsureImage.mockClear();
  });

  it('should call ensureImage before creating agent container', async () => {
    const callOrder: string[] = [];
    mockEnsureImage.mockImplementation(async () => {
      callOrder.push('ensureImage');
    });
    mockCreateAgentContainer.mockImplementation((_config: unknown, callbacks: { onExit: (code: number) => void }) => {
      callOrder.push('createAgentContainer');
      setTimeout(() => callbacks.onExit(0), 0);
      return Promise.resolve('session-123');
    });

    await startAgent({
      webContentsId: 1,
      agentName: 'code-agent',
      projectPath: '/test/project',
      itemId: 'test-item-1',
      goal: 'Implement feature',
    });

    expect(mockEnsureImage).toHaveBeenCalledOnce();
    expect(mockCreateAgentContainer).toHaveBeenCalledOnce();
    expect(callOrder).toEqual(['ensureImage', 'createAgentContainer']);
  });

  it('should propagate ensureImage errors as agent start failures', async () => {
    mockEnsureImage.mockRejectedValue(new Error('Docker daemon not running'));

    const result = await startAgent({
      webContentsId: 1,
      agentName: 'code-agent',
      projectPath: '/test/project',
      itemId: 'test-item-1',
      goal: 'Implement feature',
    });

    expect(result.sessionId).toBe('');
    expect(result.error).toContain('Docker daemon not running');
    expect(mockCreateAgentContainer).not.toHaveBeenCalled();
  });

  it('should pass through to createAgentContainer after ensureImage succeeds', async () => {
    mockEnsureImage.mockResolvedValue(undefined);
    mockCreateAgentContainer.mockImplementation((_config: unknown, callbacks: { onExit: (code: number) => void }) => {
      setTimeout(() => callbacks.onExit(0), 0);
      return Promise.resolve('session-456');
    });

    const result = await startAgent({
      webContentsId: 1,
      agentName: 'code-agent',
      projectPath: '/test/project',
      itemId: 'test-item-1',
      goal: 'Implement feature',
    });

    expect(result.sessionId).toBe('session-456');
    expect(result.error).toBeUndefined();
    expect(mockCreateAgentContainer).toHaveBeenCalledOnce();
  });
});
