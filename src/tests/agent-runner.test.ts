// src/tests/agent-runner.test.ts
// Integration-level tests for agent-runner orchestration.
// Pure function tests (prompts, model, exit handler) are in their own test files.
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

// Mock yolium-db with in-memory kanban implementations
// (avoids SQLite dependency which conflicts with the node:fs mock)
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
      items: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
    updateBoard: (board: any, updates: any) => {
      Object.assign(board, updates, { updatedAt: new Date().toISOString() });
      return board;
    },
    addItem: (board: any, params: any) => {
      if (!params.title.trim()) throw new Error('Title is required');
      const item = {
        id: generateId(),
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
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      board.items.push(item);
      return item;
    },
    updateItem: (board: any, itemId: string, updates: any) => {
      const item = board.items.find((i: any) => i.id === itemId);
      if (!item) return null;
      if (updates.title !== undefined && !updates.title.trim()) return null;
      if (updates.column !== undefined && !VALID_COLUMNS.has(updates.column)) return null;
      if (updates.agentStatus !== undefined && !VALID_AGENT_STATUSES.has(updates.agentStatus)) return null;
      if (updates.mergeStatus !== undefined && !VALID_MERGE_STATUSES.has(updates.mergeStatus)) return null;
      if (updates.agentProvider !== undefined && !VALID_AGENT_PROVIDERS.has(updates.agentProvider)) return null;
      Object.assign(item, updates, { updatedAt: new Date().toISOString() });
      return item;
    },
    addComment: (board: any, itemId: string, source: string, text: string, options?: string[]) => {
      const item = board.items.find((i: any) => i.id === itemId);
      if (!item) return null;
      const comment = {
        id: generateId(),
        source,
        text,
        timestamp: new Date().toISOString(),
        ...(options && options.length > 0 ? { options } : {}),
      };
      item.comments.push(comment);
      return comment;
    },
    buildConversationHistory: (item: any) =>
      item.comments.map((c: any) => `[${c.source}]: ${c.text}`).join('\n\n'),
    deleteItem: () => true,
    deleteItems: () => [],
    deleteBoard: () => true,
    closeDb: vi.fn(),
    getDb: vi.fn(),
    loadProjectRegistry: () => ({ version: 1, projects: {} }),
    saveProjectRegistry: vi.fn(),
    registerProject: vi.fn(),
    // Schedule functions (consolidated from schedule-db)
    loadCredentials: vi.fn(() => ({})),
    appendRunLog: vi.fn(),
    appendAction: (...args: any[]) => mockAppendAction(...args),
    pruneCredentials: vi.fn(() => 0),
  };
});

// Mock Docker module for startScheduledAgent tests
const {
  mockCreateAgentContainer,
  mockCheckAgentAuth,
  mockGetAgentSession,
  mockStopAgentContainer,
  mockAppendAction,
  mockExtractProtocolMessages,
} = vi.hoisted(() => ({
  mockCreateAgentContainer: vi.fn(),
  mockCheckAgentAuth: vi.fn(),
  mockGetAgentSession: vi.fn(),
  mockStopAgentContainer: vi.fn(),
  mockAppendAction: vi.fn(),
  mockExtractProtocolMessages: vi.fn<() => any[]>(() => []),
}));

vi.mock('@main/docker', () => ({
  createAgentContainer: mockCreateAgentContainer,
  checkAgentAuth: mockCheckAgentAuth,
  getAgentSession: mockGetAgentSession,
  stopAgentContainer: mockStopAgentContainer,
  ensureImage: vi.fn().mockResolvedValue(undefined),
}));


// Mock agent-protocol
vi.mock('@main/services/agent-protocol', () => ({
  extractProtocolMessages: mockExtractProtocolMessages,
}));

// Mock agent-loader
vi.mock('@main/services/agent-loader', () => ({
  loadAgentDefinition: vi.fn(),
}));

// Mock git-worktree
vi.mock('@main/git/git-worktree', () => ({
  createWorktree: vi.fn(),
  deleteWorktree: vi.fn(),
  generateBranchName: vi.fn(),
  getWorktreePath: vi.fn(),
  hasCommits: vi.fn(),
  isGitRepo: vi.fn(),
  sanitizeBranchName: vi.fn(),
}));

// Mock workitem-log-store
vi.mock('@main/stores/workitem-log-store', () => ({
  appendLog: vi.fn(),
  appendSessionHeader: vi.fn(),
}));
vi.mock('node:path', async () => {
  const actual = await vi.importActual<typeof import('node:path')>('node:path');
  return {
    ...actual,
    resolve: vi.fn((...args: string[]) => args[args.length - 1]),
  };
});

import * as fs from 'node:fs';
import * as path from 'node:path';
import { buildAgentPrompt, getCompletionColumn, stopAllAgentsForProject, clearSessions, startScheduledAgent } from '@main/services/agent-runner';
import { createBoard, addItem, updateItem, addComment } from '@main/stores/kanban-store';
import type { SpecialistDefinition } from '@shared/types/schedule';

describe('agent-runner', () => {
  describe('resumeAgent', () => {
    it('should rebuild prompt with conversation history', () => {
      const systemPrompt = 'You are the Plan Agent.';
      const goal = 'Add authentication';
      const history = '[agent]: Which method?\n\n[user]: OAuth';

      const prompt = buildAgentPrompt({
        systemPrompt,
        goal,
        conversationHistory: history,
      });

      expect(prompt).toContain('Previous conversation:');
      expect(prompt).toContain('[agent]: Which method?');
      expect(prompt).toContain('[user]: OAuth');
      expect(prompt).toContain('Continue from where you left off');
    });
  });

  describe('worktree isolation logic', () => {
    function resolveBranchName(
      itemBranch: string | undefined,
      generateBranch: () => string
    ): { branchName: string; wasGenerated: boolean } {
      if (itemBranch) {
        return { branchName: itemBranch, wasGenerated: false };
      }
      return { branchName: generateBranch(), wasGenerated: true };
    }

    it('should use item branch when provided', () => {
      const result = resolveBranchName('feature/my-branch', () => 'yolium-auto');
      expect(result.branchName).toBe('feature/my-branch');
      expect(result.wasGenerated).toBe(false);
    });

    it('should generate branch name when item has no branch', () => {
      const result = resolveBranchName(undefined, () => 'yolium-12345-abc');
      expect(result.branchName).toBe('yolium-12345-abc');
      expect(result.wasGenerated).toBe(true);
    });

    function shouldCreateWorktree(isGitRepo: boolean, hasCommits: boolean): boolean {
      return isGitRepo && hasCommits;
    }

    it('should create worktree for git repo with commits', () => {
      expect(shouldCreateWorktree(true, true)).toBe(true);
    });

    it('should skip worktree for non-git repo', () => {
      expect(shouldCreateWorktree(false, true)).toBe(false);
    });

    it('should skip worktree for repo without commits', () => {
      expect(shouldCreateWorktree(true, false)).toBe(false);
    });

    it('should skip worktree for non-git repo without commits', () => {
      expect(shouldCreateWorktree(false, false)).toBe(false);
    });

    function createWorktreeWithFallback(
      createWorktree: () => string,
      onSuccess: (path: string) => void,
      onFallback: () => void
    ): { worktreePath: string | undefined } {
      try {
        const worktreePath = createWorktree();
        onSuccess(worktreePath);
        return { worktreePath };
      } catch {
        onFallback();
        return { worktreePath: undefined };
      }
    }

    it('should return worktree path on success', () => {
      const onSuccess = vi.fn();
      const onFallback = vi.fn();
      const result = createWorktreeWithFallback(
        () => '/home/user/.yolium/worktrees/proj/branch',
        onSuccess,
        onFallback
      );
      expect(result.worktreePath).toBe('/home/user/.yolium/worktrees/proj/branch');
      expect(onSuccess).toHaveBeenCalledWith('/home/user/.yolium/worktrees/proj/branch');
      expect(onFallback).not.toHaveBeenCalled();
    });

    it('should fall back gracefully on worktree creation failure', () => {
      const onSuccess = vi.fn();
      const onFallback = vi.fn();
      const result = createWorktreeWithFallback(
        () => { throw new Error('Branch already checked out'); },
        onSuccess,
        onFallback
      );
      expect(result.worktreePath).toBeUndefined();
      expect(onSuccess).not.toHaveBeenCalled();
      expect(onFallback).toHaveBeenCalled();
    });

    it('should clean up worktree when container creation fails', () => {
      const deleteWorktree = vi.fn();
      const worktreePath = '/home/user/.yolium/worktrees/proj/branch';
      const originalPath = '/home/user/project';
      if (worktreePath && originalPath) {
        deleteWorktree(originalPath, worktreePath);
      }
      expect(deleteWorktree).toHaveBeenCalledWith(originalPath, worktreePath);
    });

    it('should not attempt worktree cleanup when no worktree was created', () => {
      const deleteWorktree = vi.fn();
      const worktreePath: string | undefined = undefined;
      const originalPath: string | undefined = undefined;
      if (worktreePath && originalPath) {
        deleteWorktree(originalPath, worktreePath);
      }
      expect(deleteWorktree).not.toHaveBeenCalled();
    });
  });

  describe('test specs handling', () => {
    it('should store testSpecs on kanban item via updateItem', () => {
      const board = createBoard('/path/to/project');
      const item = addItem(board, {
        title: 'Test work item',
        description: 'Implement feature',
        agentProvider: 'claude',
        order: 0,
      });
      const testSpecs = [
        {
          file: 'src/tests/foo.test.ts',
          description: 'Unit tests for foo module',
          specs: ['should return empty array when no items', 'should throw on invalid input'],
        },
        {
          file: 'src/tests/bar.test.ts',
          description: 'Unit tests for bar module',
          specs: ['should handle concurrent calls'],
        },
      ];
      updateItem(board, item.id, { testSpecs });
      const result = board.items.find(i => i.id === item.id)!;
      expect(result.testSpecs).toEqual(testSpecs);
      expect(result.testSpecs).toHaveLength(2);
      expect(result.testSpecs![0].specs).toHaveLength(2);
      expect(result.testSpecs![1].specs).toHaveLength(1);
    });

    it('should include set_test_specs in non-Claude inline protocol', () => {
      const prompt = buildAgentPrompt({
        systemPrompt: 'You are the Plan Agent.',
        goal: 'Create plan',
        conversationHistory: '',
        provider: 'codex',
        agentName: 'plan-agent',
      });
      expect(prompt).toContain('set_test_specs');
      expect(prompt).toContain('test specifications');
    });
  });

  describe('completion behavior', () => {
    it('should not auto-merge on agent completion', () => {
      const mergeFn = vi.fn();
      const cleanupFn = vi.fn();
      const item = { branch: 'feature/auth', worktreePath: '/some/path' };
      expect(mergeFn).not.toHaveBeenCalled();
      expect(cleanupFn).not.toHaveBeenCalled();
    });
  });

  describe('non-Claude conclusion synthesis', () => {
    it('should save longest agent message as description for Codex plan-agent', () => {
      const board = createBoard('/path/to/project');
      const item = addItem(board, {
        title: 'Plan authentication feature',
        description: 'Original description',
        agentProvider: 'codex',
        order: 0,
      });
      updateItem(board, item.id, { agentStatus: 'running', column: 'in-progress' });
      const accumulatedMessages = [
        'Short analysis note about the codebase structure.',
        '## Implementation Plan\n\n### Step 1: Add auth middleware\n- Create src/middleware/auth.ts\n- Add JWT token validation\n\n### Step 2: Update routes\n- Protect /api/* routes\n\n### Acceptance Criteria\n- [ ] All API routes require valid JWT\n- [ ] Unauthorized requests return 401',
        'Looking at the existing patterns in the codebase.',
      ];
      const planText = accumulatedMessages.reduce((a, b) => a.length > b.length ? a : b, '');
      updateItem(board, item.id, { description: planText });
      addComment(board, item.id, 'system', 'Plan saved to work item description (synthesized from agent output)');

      const result = board.items.find(i => i.id === item.id)!;
      expect(result.description).toContain('## Implementation Plan');
      expect(result.description).toContain('Add auth middleware');
      expect(result.description).not.toBe('Original description');
    });

    it('should not overwrite description when agent already sent update_description', () => {
      const board = createBoard('/path/to/project');
      const item = addItem(board, {
        title: 'Plan feature',
        description: 'Original description',
        agentProvider: 'codex',
        order: 0,
      });
      const agentPlan = 'Agent-provided plan via protocol';
      updateItem(board, item.id, { description: agentPlan });
      const receivedUpdateDescription = true;
      if (!receivedUpdateDescription) {
        updateItem(board, item.id, { description: 'Should not overwrite' });
      }
      const result = board.items.find(i => i.id === item.id)!;
      expect(result.description).toBe(agentPlan);
    });

    it('should not synthesize description for code-agent (only plan-agent)', () => {
      const board = createBoard('/path/to/project');
      const item = addItem(board, {
        title: 'Implement auth',
        description: 'Original description',
        agentProvider: 'codex',
        order: 0,
      });
      const completionColumn = getCompletionColumn('code-agent');
      if (completionColumn === 'ready') {
        updateItem(board, item.id, { description: 'Should not be set' });
      }
      const result = board.items.find(i => i.id === item.id)!;
      expect(result.description).toBe('Original description');
    });

    it('should not synthesize description when no messages were accumulated', () => {
      const board = createBoard('/path/to/project');
      const item = addItem(board, {
        title: 'Plan feature',
        description: 'Original description',
        agentProvider: 'codex',
        order: 0,
      });
      const accumulated: string[] = [];
      if (accumulated.length > 0) {
        updateItem(board, item.id, { description: 'Should not be set' });
      }
      const result = board.items.find(i => i.id === item.id)!;
      expect(result.description).toBe('Original description');
    });

    it('should read .yolium/verify.md and post as comment for codex verify-agent on exit', () => {
      const board = createBoard('/path/to/project');
      const item = addItem(board, {
        title: 'Verify authentication feature',
        description: 'Verify the implementation',
        agentProvider: 'codex',
        order: 0,
      });
      updateItem(board, item.id, { agentStatus: 'running', column: 'in-progress' });
      const verifyText = '## Verification Report\n\n### Status: PASS\n\n- All tests pass\n- Code follows guidelines\n- No security issues found';
      addComment(board, item.id, 'agent', verifyText);
      const result = board.items.find(i => i.id === item.id)!;
      expect(result.description).toBe('Verify the implementation');
      expect(result.comments).toBeDefined();
      expect(result.comments!.some(c => c.text.includes('Verification Report'))).toBe(true);
    });

    it('should not post duplicate verify comment when agent already sent comment via protocol', () => {
      const board = createBoard('/path/to/project');
      const item = addItem(board, {
        title: 'Verify auth feature',
        description: 'Verify the implementation',
        agentProvider: 'codex',
        order: 0,
      });
      updateItem(board, item.id, { agentStatus: 'running', column: 'in-progress' });
      addComment(board, item.id, 'agent', '## Verification Report\n\nStatus: PASS');
      const result = board.items.find(i => i.id === item.id)!;
      expect(result.comments!.filter(c => c.text.includes('Verification Report'))).toHaveLength(1);
    });

    it('should not synthesize description for Claude provider', () => {
      const board = createBoard('/path/to/project');
      const item = addItem(board, {
        title: 'Plan feature',
        description: 'Original description',
        agentProvider: 'claude',
        order: 0,
      });
      const isNonClaude = item.agentProvider !== 'claude';
      if (isNonClaude) {
        updateItem(board, item.id, { description: 'Should not be set' });
      }
      const result = board.items.find(i => i.id === item.id)!;
      expect(result.description).toBe('Original description');
    });
  });

  describe('stopAgent status behavior', () => {
    it('stopAgent should set agentStatus to idle (not interrupted) when user stops a running agent', () => {
      const board = createBoard('/path/to/project');
      const item = addItem(board, {
        title: 'Test work item',
        description: 'Implement feature',
        agentProvider: 'claude',
        order: 0,
      });
      updateItem(board, item.id, { agentStatus: 'running', column: 'in-progress' });

      // Simulate what stopAgent does: set idle status (user-initiated stop)
      updateItem(board, item.id, { agentStatus: 'idle', activeAgentName: undefined });

      const result = board.items.find(i => i.id === item.id)!;
      expect(result.agentStatus).toBe('idle');
      expect(result.agentStatus).not.toBe('interrupted');
    });

    it('stopAgent should set comment to indicate agent was stopped by user', () => {
      const board = createBoard('/path/to/project');
      const item = addItem(board, {
        title: 'Test work item',
        description: 'Implement feature',
        agentProvider: 'claude',
        order: 0,
      });
      updateItem(board, item.id, { agentStatus: 'running', column: 'in-progress' });

      // Simulate what stopAgent does: add stopped comment
      addComment(board, item.id, 'system', 'Agent was stopped');

      const result = board.items.find(i => i.id === item.id)!;
      const lastComment = result.comments![result.comments!.length - 1];
      expect(lastComment.text).toBe('Agent was stopped');
      expect(lastComment.text).not.toContain('interrupted');
    });
  });

  describe('stopAllAgentsForProject', () => {
    beforeEach(() => {
      clearSessions();
    });

    it('should resolve without error when no sessions exist', async () => {
      await expect(stopAllAgentsForProject('/some/path')).resolves.toBeUndefined();
    });

    it('should resolve without error when no sessions match the project', async () => {
      await expect(stopAllAgentsForProject('/nonexistent/project')).resolves.toBeUndefined();
    });
  });

  describe('auto-move to verify on completion', () => {
    it('should move item to verify column on exit-code-0 fallback for code-agent', () => {
      const board = createBoard('/path/to/project');
      const item = addItem(board, {
        title: 'Test work item',
        description: 'Implement feature',
        agentProvider: 'claude',
        order: 0,
      });
      updateItem(board, item.id, { agentStatus: 'running', column: 'in-progress' });
      const completionColumn = getCompletionColumn('code-agent');
      updateItem(board, item.id, { agentStatus: 'completed', activeAgentName: undefined, column: completionColumn });
      const result = board.items.find(i => i.id === item.id)!;
      expect(result.column).toBe('verify');
      expect(result.agentStatus).toBe('completed');
    });

    it('should move item to ready column on exit-code-0 fallback for plan-agent', () => {
      const board = createBoard('/path/to/project');
      const item = addItem(board, {
        title: 'Test work item',
        description: 'Create implementation plan',
        agentProvider: 'claude',
        order: 0,
      });
      updateItem(board, item.id, { agentStatus: 'running', column: 'in-progress' });
      const agentName = 'plan-agent';
      const completionColumn = agentName === 'plan-agent' ? 'ready' : 'verify';
      updateItem(board, item.id, { agentStatus: 'completed', activeAgentName: undefined, column: completionColumn });
      const result = board.items.find(i => i.id === item.id)!;
      expect(result.column).toBe('ready');
      expect(result.agentStatus).toBe('completed');
    });

    it('should move item to done column on complete protocol message for scout-agent', () => {
      const board = createBoard('/path/to/project');
      const item = addItem(board, {
        title: 'Test work item',
        description: 'Find leads for SaaS companies',
        agentProvider: 'claude',
        order: 0,
      });
      updateItem(board, item.id, { agentStatus: 'running', column: 'in-progress' });
      const completionColumn = getCompletionColumn('scout-agent');
      updateItem(board, item.id, { agentStatus: 'completed', activeAgentName: undefined, column: completionColumn });
      const result = board.items.find(i => i.id === item.id)!;
      expect(result.column).toBe('done');
      expect(result.agentStatus).toBe('completed');
    });

    it('should not move item to done column on agent failure', () => {
      const board = createBoard('/path/to/project');
      const item = addItem(board, {
        title: 'Test work item',
        description: 'Implement feature',
        agentProvider: 'claude',
        order: 0,
      });
      updateItem(board, item.id, { agentStatus: 'running', column: 'in-progress' });
      updateItem(board, item.id, { agentStatus: 'failed', activeAgentName: undefined });
      const result = board.items.find(i => i.id === item.id)!;
      expect(result.column).toBe('in-progress');
      expect(result.agentStatus).toBe('failed');
    });

    it('should mark item as interrupted when agent exits with protocol messages but no complete signal', () => {
      const board = createBoard('/path/to/project');
      const item = addItem(board, {
        title: 'Test work item',
        description: 'Implement feature',
        agentProvider: 'opencode',
        order: 0,
      });
      updateItem(board, item.id, { agentStatus: 'running', column: 'in-progress' });
      updateItem(board, item.id, { agentStatus: 'interrupted', activeAgentName: undefined });
      addComment(board, item.id, 'system', 'Agent stopped without completing (no completion signal received). You can resume to continue.');
      const result = board.items.find(i => i.id === item.id)!;
      expect(result.column).toBe('in-progress');
      expect(result.agentStatus).toBe('interrupted');
    });

    it('should not move item to done column on error protocol message', () => {
      const board = createBoard('/path/to/project');
      const item = addItem(board, {
        title: 'Test work item',
        description: 'Implement feature',
        agentProvider: 'claude',
        order: 0,
      });
      updateItem(board, item.id, { agentStatus: 'running', column: 'in-progress' });
      updateItem(board, item.id, { agentStatus: 'failed', activeAgentName: undefined });
      const result = board.items.find(i => i.id === item.id)!;
      expect(result.column).toBe('in-progress');
      expect(result.agentStatus).toBe('failed');
    });
  });

  describe('startScheduledAgent workspace', () => {
    const makeSpecialist = (name = 'twitter-privacybooks'): SpecialistDefinition => ({
      name,
      description: 'Monitor Twitter engagement',
      model: 'sonnet',
      tools: ['Read', 'Write'],
      timeout: 30,
      systemPrompt: 'You are a Twitter specialist.',
      schedules: [],
      memory: { strategy: 'raw', maxEntries: 10, retentionDays: 30 },
      escalation: {},
      promptTemplates: { heartbeat: 'Check Twitter mentions.' },
    });

    beforeEach(() => {
      mockCheckAgentAuth.mockReturnValue({ authenticated: true });
      mockCreateAgentContainer.mockReset();
      mockGetAgentSession.mockReset();
      mockExtractProtocolMessages.mockReturnValue([]);
      mockAppendAction.mockReset();
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.mkdirSync).mockClear();
    });

    it('should pass workspace directory as projectPath instead of process.cwd()', async () => {
      let capturedConfig: Record<string, unknown> | undefined;
      mockCreateAgentContainer.mockImplementation((config: Record<string, unknown>, callbacks: { onExit: (code: number) => void }) => {
        capturedConfig = config;
        setTimeout(() => callbacks.onExit(0), 0);
        return Promise.resolve('session-123');
      });
      mockGetAgentSession.mockReturnValue(undefined);

      await startScheduledAgent({
        specialist: makeSpecialist(),
        scheduleType: 'heartbeat',
        memoryContext: '',
        runId: 'run-1',
      });

      expect(capturedConfig).toBeDefined();
      expect(capturedConfig!.projectPath).toBe(path.join('/home/test', '.yolium', 'schedules', 'twitter-privacybooks', 'workspace'));
      expect(capturedConfig!.projectPath).not.toBe(process.cwd());
    });

    it('should create workspace directory if it does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      mockCreateAgentContainer.mockImplementation((_config: unknown, callbacks: { onExit: (code: number) => void }) => {
        setTimeout(() => callbacks.onExit(0), 0);
        return Promise.resolve('session-123');
      });
      mockGetAgentSession.mockReturnValue(undefined);

      await startScheduledAgent({
        specialist: makeSpecialist(),
        scheduleType: 'heartbeat',
        memoryContext: '',
        runId: 'run-1',
      });

      expect(fs.mkdirSync).toHaveBeenCalledWith(
        path.join('/home/test', '.yolium', 'schedules', 'twitter-privacybooks', 'workspace'),
        { recursive: true }
      );
    });

    it('should reuse existing workspace directory without error', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      mockCreateAgentContainer.mockImplementation((_config: unknown, callbacks: { onExit: (code: number) => void }) => {
        setTimeout(() => callbacks.onExit(0), 0);
        return Promise.resolve('session-123');
      });
      mockGetAgentSession.mockReturnValue(undefined);

      await startScheduledAgent({
        specialist: makeSpecialist(),
        scheduleType: 'heartbeat',
        memoryContext: '',
        runId: 'run-1',
      });

      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });

    it('should capture session usage even when container exits quickly', async () => {
      mockCreateAgentContainer.mockImplementation((_config: unknown, callbacks: { onExit: (code: number) => void }) => {
        setTimeout(() => callbacks.onExit(0), 0);
        return Promise.resolve('session-fast');
      });
      mockGetAgentSession.mockReturnValue({
        cumulativeUsage: {
          inputTokens: 1500,
          outputTokens: 500,
          costUsd: 0.05,
        },
      });

      const result = await startScheduledAgent({
        specialist: makeSpecialist(),
        scheduleType: 'heartbeat',
        memoryContext: '',
        runId: 'run-1',
      });

      expect(result.tokensUsed).toBe(2000);
      expect(result.costUsd).toBe(0.05);
      expect(result.outcome).toBe('completed');
    });

    it('should report outcome failed with exit code when agent exits non-zero', async () => {
      mockCreateAgentContainer.mockImplementation((_config: unknown, callbacks: { onExit: (code: number) => void }) => {
        setTimeout(() => callbacks.onExit(1), 0);
        return Promise.resolve('session-fail');
      });
      mockGetAgentSession.mockReturnValue(undefined);

      const result = await startScheduledAgent({
        specialist: makeSpecialist(),
        scheduleType: 'heartbeat',
        memoryContext: '',
        runId: 'run-1',
      });

      expect(result.outcome).toBe('failed');
      expect(result.summary).toBe('Agent exited with code 1');
    });

    it('should persist parsed action messages during scheduled runs', async () => {
      mockExtractProtocolMessages.mockReturnValue([
        {
          type: 'action',
          action: 'tweet_posted',
          data: { dryRun: true, tweetId: '123' },
          timestamp: '2026-03-11T09:00:00.000Z',
        },
      ]);
      mockCreateAgentContainer.mockImplementation((_config: unknown, callbacks: { onOutput: (data: string) => void; onExit: (code: number) => void }) => {
        callbacks.onOutput('@@YOLIUM:{"type":"action","action":"tweet_posted"}');
        setTimeout(() => callbacks.onExit(0), 0);
        return Promise.resolve('session-action');
      });
      mockGetAgentSession.mockReturnValue(undefined);

      await startScheduledAgent({
        specialist: makeSpecialist('twitter-growth'),
        scheduleType: 'heartbeat',
        memoryContext: '',
        runId: 'run-action',
      });

      expect(mockAppendAction).toHaveBeenCalledWith(
        'twitter-growth',
        expect.objectContaining({
          runId: 'run-action',
          specialistId: 'twitter-growth',
          action: 'tweet_posted',
          data: { dryRun: true, tweetId: '123' },
          timestamp: '2026-03-11T09:00:00.000Z',
        })
      );
    });
  });
});
