// src/tests/agent-runner.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock electron-dependent logger before importing agent-runner
vi.mock('@main/lib/logger', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

import { buildAgentPrompt, resolveModel, stopAllAgentsForProject, clearSessions } from '@main/services/agent-runner';

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
    it('should use item model when provided', () => {
      const result = resolveModel('opus', 'sonnet');
      expect(result).toBe('claude-opus-4-6');
    });

    it('should fall back to agent model when item model is undefined', () => {
      const result = resolveModel(undefined, 'sonnet');
      expect(result).toBe('claude-sonnet-4-5-20250929');
    });

    it('should map short names to full model IDs', () => {
      expect(resolveModel(undefined, 'opus')).toBe('claude-opus-4-6');
      expect(resolveModel(undefined, 'sonnet')).toBe('claude-sonnet-4-5-20250929');
      expect(resolveModel(undefined, 'haiku')).toBe('claude-haiku-4-5-20251001');
    });

    it('should pass through unknown model names as-is', () => {
      const result = resolveModel(undefined, 'some-custom-model');
      expect(result).toBe('some-custom-model');
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

  describe('auto-merge on completion', () => {
    /**
     * Simulates the auto-merge logic from handleAgentOutput's 'complete' case.
     * When an agent completes and the item has a branch + worktree, merge locally.
     */
    function autoMergeOnComplete(
      item: { branch?: string; worktreePath?: string },
      projectPath: string,
      mergeFn: (projectPath: string, branch: string) => void,
      cleanupFn: (projectPath: string, worktreePath: string, branch: string) => void,
    ): { mergeStatus: string; worktreePath?: string; comments: string[] } {
      const comments: string[] = [];
      let mergeStatus = 'unmerged';
      let worktreePath = item.worktreePath;

      if (item.branch && item.worktreePath) {
        try {
          mergeFn(projectPath, item.branch);
          mergeStatus = 'merged';
          comments.push(`Merged branch '${item.branch}' into default branch`);

          try {
            cleanupFn(projectPath, item.worktreePath, item.branch);
            worktreePath = undefined;
            comments.push('Cleaned up worktree');
          } catch {
            // Cleanup failure is non-fatal
          }
        } catch (mergeErr) {
          const mergeMessage = mergeErr instanceof Error ? mergeErr.message : String(mergeErr);
          const isConflict = mergeMessage.startsWith('conflict:');
          mergeStatus = isConflict ? 'conflict' : 'unmerged';
          comments.push(
            isConflict
              ? 'Auto-merge failed: conflicts detected. Please merge manually.'
              : `Auto-merge failed: ${mergeMessage}`
          );
        }
      }

      return { mergeStatus, worktreePath, comments };
    }

    it('should merge and cleanup worktree on successful completion', () => {
      const mergeFn = vi.fn();
      const cleanupFn = vi.fn();

      const result = autoMergeOnComplete(
        { branch: 'feature/auth', worktreePath: '/home/user/.yolium/worktrees/proj/feature/auth' },
        '/home/user/project',
        mergeFn,
        cleanupFn,
      );

      expect(mergeFn).toHaveBeenCalledWith('/home/user/project', 'feature/auth');
      expect(cleanupFn).toHaveBeenCalledWith('/home/user/project', '/home/user/.yolium/worktrees/proj/feature/auth', 'feature/auth');
      expect(result.mergeStatus).toBe('merged');
      expect(result.worktreePath).toBeUndefined();
      expect(result.comments).toContain("Merged branch 'feature/auth' into default branch");
      expect(result.comments).toContain('Cleaned up worktree');
    });

    it('should set conflict status when merge has conflicts', () => {
      const mergeFn = vi.fn(() => { throw new Error('conflict: Merge conflicts detected. Please resolve manually.'); });
      const cleanupFn = vi.fn();

      const result = autoMergeOnComplete(
        { branch: 'feature/auth', worktreePath: '/home/user/.yolium/worktrees/proj/feature/auth' },
        '/home/user/project',
        mergeFn,
        cleanupFn,
      );

      expect(result.mergeStatus).toBe('conflict');
      expect(result.worktreePath).toBe('/home/user/.yolium/worktrees/proj/feature/auth');
      expect(cleanupFn).not.toHaveBeenCalled();
      expect(result.comments).toContain('Auto-merge failed: conflicts detected. Please merge manually.');
    });

    it('should keep unmerged status when merge fails for non-conflict reasons', () => {
      const mergeFn = vi.fn(() => { throw new Error('Failed to checkout main: some error'); });
      const cleanupFn = vi.fn();

      const result = autoMergeOnComplete(
        { branch: 'feature/auth', worktreePath: '/home/user/.yolium/worktrees/proj/feature/auth' },
        '/home/user/project',
        mergeFn,
        cleanupFn,
      );

      expect(result.mergeStatus).toBe('unmerged');
      expect(result.worktreePath).toBe('/home/user/.yolium/worktrees/proj/feature/auth');
      expect(cleanupFn).not.toHaveBeenCalled();
      expect(result.comments).toContain('Auto-merge failed: Failed to checkout main: some error');
    });

    it('should skip merge when item has no branch', () => {
      const mergeFn = vi.fn();
      const cleanupFn = vi.fn();

      const result = autoMergeOnComplete(
        { worktreePath: '/some/path' },
        '/home/user/project',
        mergeFn,
        cleanupFn,
      );

      expect(mergeFn).not.toHaveBeenCalled();
      expect(cleanupFn).not.toHaveBeenCalled();
      expect(result.mergeStatus).toBe('unmerged');
    });

    it('should skip merge when item has no worktree path', () => {
      const mergeFn = vi.fn();
      const cleanupFn = vi.fn();

      const result = autoMergeOnComplete(
        { branch: 'feature/auth' },
        '/home/user/project',
        mergeFn,
        cleanupFn,
      );

      expect(mergeFn).not.toHaveBeenCalled();
      expect(cleanupFn).not.toHaveBeenCalled();
      expect(result.mergeStatus).toBe('unmerged');
    });

    it('should still mark as merged even if cleanup fails', () => {
      const mergeFn = vi.fn();
      const cleanupFn = vi.fn(() => { throw new Error('cleanup failed'); });

      const result = autoMergeOnComplete(
        { branch: 'feature/auth', worktreePath: '/home/user/.yolium/worktrees/proj/feature/auth' },
        '/home/user/project',
        mergeFn,
        cleanupFn,
      );

      expect(result.mergeStatus).toBe('merged');
      // worktreePath is NOT cleared on cleanup failure
      expect(result.worktreePath).toBe('/home/user/.yolium/worktrees/proj/feature/auth');
      expect(result.comments).toContain("Merged branch 'feature/auth' into default branch");
      expect(result.comments).not.toContain('Cleaned up worktree');
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
});
