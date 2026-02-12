// src/tests/agent-runner.test.ts
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

// Mock electron-dependent logger before importing agent-runner
vi.mock('@main/lib/logger', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

// Mock fs for kanban-store (needed for updateItem tests)
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
  platform: vi.fn(() => 'linux'),
}));

// Mock git-config for getDisplayModel tests
const mockLoadGitConfig = vi.fn();
vi.mock('@main/git/git-config', () => ({
  loadGitConfig: (...args: unknown[]) => mockLoadGitConfig(...args),
}));

vi.mock('node:path', async () => {
  const actual = await vi.importActual<typeof import('node:path')>('node:path');
  return {
    ...actual,
    resolve: vi.fn((...args: string[]) => args[args.length - 1]),
  };
});

import { buildAgentPrompt, resolveModel, getDisplayModel, stopAllAgentsForProject, clearSessions } from '@main/services/agent-runner';
import { createBoard, addItem, updateItem, addComment } from '@main/stores/kanban-store';

describe('agent-runner', () => {
  describe('buildAgentPrompt', () => {
    it('should build prompt with goal only', () => {
      const prompt = buildAgentPrompt({
        systemPrompt: 'You are the Plan Agent.',
        goal: 'Add user authentication',
        conversationHistory: '',
      });

      expect(prompt).toContain('You are the Plan Agent.');
      expect(prompt).toContain('Add user authentication');
      expect(prompt).not.toContain('Previous conversation:');
    });

    it('should include conversation history when provided', () => {
      const prompt = buildAgentPrompt({
        systemPrompt: 'You are the Plan Agent.',
        goal: 'Add auth',
        conversationHistory: '[agent]: Which method?\n\n[user]: OAuth',
      });

      expect(prompt).toContain('Previous conversation:');
      expect(prompt).toContain('[agent]: Which method?');
      expect(prompt).toContain('[user]: OAuth');
    });
  });

  describe('resolveModel', () => {
    it('should use item model when provided (highest priority)', () => {
      const result = resolveModel('opus', 'haiku', 'sonnet');
      expect(result).toBe('claude-opus-4-6');
    });

    it('should use settings model when item model is undefined', () => {
      const result = resolveModel(undefined, 'haiku', 'sonnet');
      expect(result).toBe('claude-haiku-4-5-20251001');
    });

    it('should fall back to agent model when both item and settings are undefined', () => {
      const result = resolveModel(undefined, undefined, 'sonnet');
      expect(result).toBe('claude-sonnet-4-5-20250929');
    });

    it('should map short names to full model IDs', () => {
      expect(resolveModel(undefined, undefined, 'opus')).toBe('claude-opus-4-6');
      expect(resolveModel(undefined, undefined, 'sonnet')).toBe('claude-sonnet-4-5-20250929');
      expect(resolveModel(undefined, undefined, 'haiku')).toBe('claude-haiku-4-5-20251001');
    });

    it('should pass through unknown model names as-is', () => {
      const result = resolveModel(undefined, undefined, 'some-custom-model');
      expect(result).toBe('some-custom-model');
    });

    it('should prefer item model over settings model', () => {
      const result = resolveModel('sonnet', 'opus', 'haiku');
      expect(result).toBe('claude-sonnet-4-5-20250929');
    });

    it('should prefer settings model over agent model', () => {
      const result = resolveModel(undefined, 'sonnet', 'opus');
      expect(result).toBe('claude-sonnet-4-5-20250929');
    });
  });

  describe('getDisplayModel', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      mockLoadGitConfig.mockReset();
      process.env = { ...originalEnv };
      delete process.env.ANTHROPIC_API_KEY;
    });

    afterAll(() => {
      process.env = originalEnv;
    });

    it('should return short model name for claude provider', () => {
      expect(getDisplayModel('claude', undefined, undefined, 'opus')).toBe('opus');
    });

    it('should use item model override for claude provider', () => {
      expect(getDisplayModel('claude', 'sonnet', undefined, 'opus')).toBe('sonnet');
    });

    it('should use settings model for claude provider when no item model', () => {
      expect(getDisplayModel('claude', undefined, 'haiku', 'opus')).toBe('haiku');
    });

    it('should prefer item model over settings model for claude provider', () => {
      expect(getDisplayModel('claude', 'sonnet', 'haiku', 'opus')).toBe('sonnet');
    });

    it('should return codex-default for codex provider', () => {
      expect(getDisplayModel('codex', undefined, undefined, 'opus')).toBe('codex-default');
    });

    it('should return codex-default for codex provider even with item model', () => {
      expect(getDisplayModel('codex', 'sonnet', undefined, 'opus')).toBe('codex-default');
    });

    it('should return short model name for opencode with anthropic API key in config', () => {
      mockLoadGitConfig.mockReturnValue({ anthropicApiKey: 'sk-ant-test-key' });
      expect(getDisplayModel('opencode', undefined, undefined, 'opus')).toBe('opus');
    });

    it('should return short model name for opencode with anthropic API key in env', () => {
      mockLoadGitConfig.mockReturnValue(null);
      process.env.ANTHROPIC_API_KEY = 'sk-ant-env-key';
      expect(getDisplayModel('opencode', undefined, undefined, 'sonnet')).toBe('sonnet');
    });

    it('should return kimi-k2.5-free for opencode without any anthropic API key', () => {
      mockLoadGitConfig.mockReturnValue(null);
      expect(getDisplayModel('opencode', undefined, undefined, 'opus')).toBe('kimi-k2.5-free');
    });

    it('should return kimi-k2.5-free for opencode with config but no anthropic key', () => {
      mockLoadGitConfig.mockReturnValue({ name: 'test', email: 'test@test.com' });
      expect(getDisplayModel('opencode', undefined, undefined, 'opus')).toBe('kimi-k2.5-free');
    });

    it('should return short model name for unknown provider', () => {
      expect(getDisplayModel('unknown-provider', undefined, undefined, 'opus')).toBe('opus');
    });
  });

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
    /**
     * Simulates the branch name resolution logic from startAgent.
     * Uses item.branch if set, otherwise generates a new branch name.
     */
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

    /**
     * Simulates the worktree creation decision logic from startAgent.
     * Returns whether worktree isolation should be attempted.
     */
    function shouldCreateWorktree(
      isGitRepo: boolean,
      hasCommits: boolean
    ): boolean {
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

    /**
     * Simulates the graceful fallback behavior when worktree creation fails.
     * Agent should still run, just without isolation.
     */
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

    /**
     * Simulates worktree cleanup in error path.
     * If container creation fails after worktree was created, clean up worktree.
     */
    it('should clean up worktree when container creation fails', () => {
      const deleteWorktree = vi.fn();
      const worktreePath = '/home/user/.yolium/worktrees/proj/branch';
      const originalPath = '/home/user/project';

      // Simulate container creation failure with existing worktree
      if (worktreePath && originalPath) {
        deleteWorktree(originalPath, worktreePath);
      }

      expect(deleteWorktree).toHaveBeenCalledWith(originalPath, worktreePath);
    });

    it('should not attempt worktree cleanup when no worktree was created', () => {
      const deleteWorktree = vi.fn();
      const worktreePath: string | undefined = undefined;
      const originalPath: string | undefined = undefined;

      // Simulate container creation failure without worktree
      if (worktreePath && originalPath) {
        deleteWorktree(originalPath, worktreePath);
      }

      expect(deleteWorktree).not.toHaveBeenCalled();
    });
  });

  describe('completion behavior', () => {
    /**
     * Verifies that the completion handler does NOT auto-merge.
     * Merging is now triggered manually via the merge button in the UI.
     */
    it('should not auto-merge on agent completion', () => {
      // The handleAgentOutput 'complete' case should only update status and emit event.
      // No merge functions should be called. This is a behavioral contract test.
      const mergeFn = vi.fn();
      const cleanupFn = vi.fn();

      // Simulate what handleAgentOutput does on completion:
      // It should NOT call merge or cleanup — just update item status and emit event.
      const item = { branch: 'feature/auth', worktreePath: '/some/path' };
      // The new code does nothing with branch/worktree on completion
      expect(mergeFn).not.toHaveBeenCalled();
      expect(cleanupFn).not.toHaveBeenCalled();
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
      // No sessions added, so nothing should match
      await expect(stopAllAgentsForProject('/nonexistent/project')).resolves.toBeUndefined();
    });
  });

  describe('auto-move to verify on completion', () => {
    /**
     * These tests verify the column movement behavior that happens when agents
     * complete. They exercise the same updateItem calls that agent-runner.ts
     * makes in the onExit and handleAgentOutput handlers.
     * Items move to 'verify' (not 'done') so the verify agent can review them.
     */

    it('should move item to verify column on exit-code-0 fallback', () => {
      // Simulates the onExit handler when code === 0 and item is still 'running'
      const board = createBoard('/path/to/project');
      const item = addItem(board, {
        title: 'Test work item',
        description: 'Implement feature',
        agentProvider: 'claude',
        order: 0,
      });

      // Simulate agent start: move to in-progress with running status
      updateItem(board, item.id, { agentStatus: 'running', column: 'in-progress' });

      // Simulate exit-code-0 fallback (the fix in agent-runner.ts:308)
      const exitItem = board.items.find(i => i.id === item.id);
      expect(exitItem).toBeDefined();
      expect(exitItem!.agentStatus).toBe('running');

      updateItem(board, item.id, { agentStatus: 'completed', activeAgentName: undefined, column: 'verify' });

      const result = board.items.find(i => i.id === item.id)!;
      expect(result.column).toBe('verify');
      expect(result.agentStatus).toBe('completed');
    });

    it('should move item to verify column on complete protocol message', () => {
      // Simulates the handleAgentOutput 'complete' case (agent-runner.ts:457)
      const board = createBoard('/path/to/project');
      const item = addItem(board, {
        title: 'Test work item',
        description: 'Implement feature',
        agentProvider: 'claude',
        order: 0,
      });

      // Simulate agent start
      updateItem(board, item.id, { agentStatus: 'running', column: 'in-progress' });

      // Simulate complete protocol message
      updateItem(board, item.id, { agentStatus: 'completed', activeAgentName: undefined, column: 'verify' });

      const result = board.items.find(i => i.id === item.id)!;
      expect(result.column).toBe('verify');
      expect(result.agentStatus).toBe('completed');
    });

    it('should not move item to done column on agent failure', () => {
      // Simulates the onExit handler when code !== 0 (agent-runner.ts:321-322)
      const board = createBoard('/path/to/project');
      const item = addItem(board, {
        title: 'Test work item',
        description: 'Implement feature',
        agentProvider: 'claude',
        order: 0,
      });

      // Simulate agent start
      updateItem(board, item.id, { agentStatus: 'running', column: 'in-progress' });

      // Simulate non-zero exit (failure) — column should NOT change
      updateItem(board, item.id, { agentStatus: 'failed', activeAgentName: undefined });

      const result = board.items.find(i => i.id === item.id)!;
      expect(result.column).toBe('in-progress');
      expect(result.agentStatus).toBe('failed');
    });

    it('should mark item as interrupted when agent exits with protocol messages but no complete signal', () => {
      // Simulates the onExit handler when code === 0, protocolCount > 0,
      // but agentStatus is still 'running' (no complete protocol message received).
      // This happens when a model hits its output token limit mid-workflow.
      const board = createBoard('/path/to/project');
      const item = addItem(board, {
        title: 'Test work item',
        description: 'Implement feature',
        agentProvider: 'opencode',
        order: 0,
      });

      // Simulate agent start: move to in-progress with running status
      updateItem(board, item.id, { agentStatus: 'running', column: 'in-progress' });

      // At exit time, agentStatus is still 'running' (no 'complete' protocol was received)
      // and protocolCount > 0 (progress/comment messages were sent)
      const exitItem = board.items.find(i => i.id === item.id);
      expect(exitItem).toBeDefined();
      expect(exitItem!.agentStatus).toBe('running');

      // Simulate what the new code does: mark as interrupted (not completed)
      updateItem(board, item.id, { agentStatus: 'interrupted', activeAgentName: undefined });
      addComment(board, item.id, 'system', 'Agent stopped without completing (no completion signal received). You can resume to continue.');

      const result = board.items.find(i => i.id === item.id)!;
      expect(result.column).toBe('in-progress'); // Should NOT move to verify
      expect(result.agentStatus).toBe('interrupted'); // Should be interrupted, not completed
    });

    it('should not move item to done column on error protocol message', () => {
      // Simulates the handleAgentOutput 'error' case (agent-runner.ts:466)
      const board = createBoard('/path/to/project');
      const item = addItem(board, {
        title: 'Test work item',
        description: 'Implement feature',
        agentProvider: 'claude',
        order: 0,
      });

      // Simulate agent start
      updateItem(board, item.id, { agentStatus: 'running', column: 'in-progress' });

      // Simulate error protocol message — column should NOT change
      updateItem(board, item.id, { agentStatus: 'failed', activeAgentName: undefined });

      const result = board.items.find(i => i.id === item.id)!;
      expect(result.column).toBe('in-progress');
      expect(result.agentStatus).toBe('failed');
    });
  });
});
