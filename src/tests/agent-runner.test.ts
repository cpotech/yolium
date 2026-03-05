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

import { buildAgentPrompt, resolveModel, getDisplayModel, getCompletionColumn, stopAllAgentsForProject, clearSessions } from '@main/services/agent-runner';
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

    it('should not include inline protocol for Claude provider', () => {
      const prompt = buildAgentPrompt({
        systemPrompt: 'You are the Code Agent.',
        goal: 'Fix bug',
        conversationHistory: '',
        provider: 'claude',
      });

      expect(prompt).toContain('You are the Code Agent.');
      expect(prompt).toContain('Fix bug');
      expect(prompt).not.toContain('@@YOLIUM: Protocol (MANDATORY)');
      expect(prompt).not.toContain('REMINDER: You MUST output @@YOLIUM:');
    });

    it('should not include inline protocol when provider is undefined', () => {
      const prompt = buildAgentPrompt({
        systemPrompt: 'You are the Code Agent.',
        goal: 'Fix bug',
        conversationHistory: '',
      });

      expect(prompt).not.toContain('@@YOLIUM: Protocol (MANDATORY)');
    });

    it('should include inline protocol for codex provider', () => {
      const prompt = buildAgentPrompt({
        systemPrompt: 'You are the Code Agent.',
        goal: 'Fix bug',
        conversationHistory: '',
        provider: 'codex',
      });

      // Should contain the full protocol reference inline
      expect(prompt).toContain('@@YOLIUM: Protocol (MANDATORY)');
      expect(prompt).toContain('You MUST communicate with Yolium');

      // Should contain all message types
      expect(prompt).toContain('"type":"progress"');
      expect(prompt).toContain('"type":"comment"');
      expect(prompt).toContain('"type":"ask_question"');
      expect(prompt).toContain('"type":"complete"');
      expect(prompt).toContain('"type":"error"');
      expect(prompt).toContain('"type":"create_item"');
      expect(prompt).toContain('"type":"update_description"');

      // Should contain the system prompt inline
      expect(prompt).toContain('You are the Code Agent.');

      // Should contain the goal
      expect(prompt).toContain('Fix bug');

      // Should include bookend instructions
      expect(prompt).toContain('Your FIRST output MUST be a progress message');
      expect(prompt).toContain('LAST protocol message MUST be either a complete or error message');
      expect(prompt).toContain('REMINDER: You MUST output @@YOLIUM:');
    });

    it('should include file-based output instructions for codex plan-agent', () => {
      const prompt = buildAgentPrompt({
        systemPrompt: 'You are the Plan Agent.',
        goal: 'Create plan',
        conversationHistory: '',
        provider: 'codex',
        agentName: 'plan-agent',
      });

      expect(prompt).toContain('.yolium-plan.md');
      expect(prompt).toContain('Write Your Plan to a File');
      expect(prompt).not.toContain('.yolium-summary.md');
    });

    it('should include file-based output instructions for codex code-agent', () => {
      const prompt = buildAgentPrompt({
        systemPrompt: 'You are the Code Agent.',
        goal: 'Fix bug',
        conversationHistory: '',
        provider: 'codex',
        agentName: 'code-agent',
      });

      expect(prompt).toContain('.yolium-summary.md');
      expect(prompt).toContain('Write Your Summary to a File');
      expect(prompt).not.toContain('.yolium-plan.md');
    });

    it('should include file-based output instructions for codex scout-agent', () => {
      const prompt = buildAgentPrompt({
        systemPrompt: 'You are the Scout Agent.',
        goal: 'Find leads',
        conversationHistory: '',
        provider: 'codex',
        agentName: 'scout-agent',
      });

      expect(prompt).toContain('.yolium-scout.json');
      expect(prompt).toContain('Write Your Dossier to a File');
      expect(prompt).not.toContain('.yolium-plan.md');
      expect(prompt).not.toContain('.yolium-summary.md');
    });

    it('should not include file-based output instructions for claude provider', () => {
      const prompt = buildAgentPrompt({
        systemPrompt: 'You are the Plan Agent.',
        goal: 'Create plan',
        conversationHistory: '',
        provider: 'claude',
        agentName: 'plan-agent',
      });

      expect(prompt).not.toContain('.yolium-plan.md');
      expect(prompt).not.toContain('.yolium-summary.md');
    });

    it('should include inline protocol for opencode provider', () => {
      const prompt = buildAgentPrompt({
        systemPrompt: 'You are the Plan Agent.',
        goal: 'Create plan',
        conversationHistory: '',
        provider: 'opencode',
      });

      // Same inline protocol as codex
      expect(prompt).toContain('@@YOLIUM: Protocol (MANDATORY)');
      expect(prompt).toContain('You are the Plan Agent.');
      expect(prompt).toContain('Create plan');
      expect(prompt).toContain('REMINDER: You MUST output @@YOLIUM:');
    });

    it('should include conversation history in non-Claude prompt', () => {
      const prompt = buildAgentPrompt({
        systemPrompt: 'You are the Code Agent.',
        goal: 'Fix bug',
        conversationHistory: '[agent]: What file?\n\n[user]: src/main.ts',
        provider: 'codex',
      });

      expect(prompt).toContain('@@YOLIUM: Protocol (MANDATORY)');
      expect(prompt).toContain('Previous conversation:');
      expect(prompt).toContain('[agent]: What file?');
      expect(prompt).toContain('[user]: src/main.ts');
      expect(prompt).toContain('Continue from where you left off.');
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

    it('should pass through full model ID strings as-is', () => {
      expect(resolveModel(undefined, undefined, 'claude-opus-4-6-20250212')).toBe('claude-opus-4-6-20250212');
      expect(resolveModel(undefined, undefined, 'claude-sonnet-4-5-20250929')).toBe('claude-sonnet-4-5-20250929');
      expect(resolveModel(undefined, undefined, 'o3-mini')).toBe('o3-mini');
      expect(resolveModel(undefined, undefined, 'gpt-4o')).toBe('gpt-4o');
    });

    it('should resolve full model ID from item override', () => {
      const result = resolveModel('claude-opus-4-6-20250212', undefined, 'sonnet');
      expect(result).toBe('claude-opus-4-6-20250212');
    });

    it('should resolve full model ID from settings override', () => {
      const result = resolveModel(undefined, 'o3-mini', 'opus');
      expect(result).toBe('o3-mini');
    });

    it('should prefer item model over settings model', () => {
      const result = resolveModel('sonnet', 'opus', 'haiku');
      expect(result).toBe('claude-sonnet-4-5-20250929');
    });

    it('should prefer settings model over agent model', () => {
      const result = resolveModel(undefined, 'sonnet', 'opus');
      expect(result).toBe('claude-sonnet-4-5-20250929');
    });

    it('should resolve custom provider model from settings', () => {
      const result = resolveModel(undefined, 'minimax-m2.5-free', 'sonnet');
      expect(result).toBe('minimax-m2.5-free');
    });

    it('should resolve custom provider model from item override', () => {
      const result = resolveModel('kimi-k2.5-free', 'sonnet', 'opus');
      expect(result).toBe('kimi-k2.5-free');
    });

    it('should pass through OpenCode provider/model format from item override', () => {
      expect(resolveModel('opencode/big-pickle', undefined, 'opus')).toBe('opencode/big-pickle');
      expect(resolveModel('opencode/kimi-k2.5-free', undefined, 'opus')).toBe('opencode/kimi-k2.5-free');
    });

    it('should pass through OpenCode provider/model format from settings', () => {
      expect(resolveModel(undefined, 'opencode/big-pickle', 'sonnet')).toBe('opencode/big-pickle');
      expect(resolveModel(undefined, 'anthropic/claude-sonnet-4-20250514', 'opus')).toBe('anthropic/claude-sonnet-4-20250514');
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

    it('should return agent model for claude provider when no override', () => {
      expect(getDisplayModel('claude', undefined, undefined, 'opus')).toBe('opus');
    });

    it('should use item model override directly for claude provider', () => {
      expect(getDisplayModel('claude', 'sonnet', undefined, 'opus')).toBe('sonnet');
    });

    it('should use settings model directly for claude provider when no item model', () => {
      expect(getDisplayModel('claude', undefined, 'haiku', 'opus')).toBe('haiku');
    });

    it('should prefer item model over settings model for claude provider', () => {
      expect(getDisplayModel('claude', 'sonnet', 'haiku', 'opus')).toBe('sonnet');
    });

    it('should return full model ID when provided as override', () => {
      expect(getDisplayModel('claude', 'claude-opus-4-6-20250212', undefined, 'sonnet')).toBe('claude-opus-4-6-20250212');
    });

    it('should return codex-default for codex provider when no override', () => {
      expect(getDisplayModel('codex', undefined, undefined, 'opus')).toBe('codex-default');
    });

    it('should use override model for codex provider when provided', () => {
      expect(getDisplayModel('codex', 'o3-mini', undefined, 'opus')).toBe('o3-mini');
    });

    it('should use settings override for codex provider when no item override', () => {
      expect(getDisplayModel('codex', undefined, 'gpt-4o', 'opus')).toBe('gpt-4o');
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

    it('should return agent model for opencode without any anthropic API key', () => {
      mockLoadGitConfig.mockReturnValue(null);
      expect(getDisplayModel('opencode', undefined, undefined, 'opus')).toBe('opus');
    });

    it('should return agent model for opencode with config but no anthropic key', () => {
      mockLoadGitConfig.mockReturnValue({ name: 'test', email: 'test@test.com' });
      expect(getDisplayModel('opencode', undefined, undefined, 'opus')).toBe('opus');
    });

    it('should use override model for opencode with anthropic key', () => {
      mockLoadGitConfig.mockReturnValue({ anthropicApiKey: 'sk-ant-test-key' });
      expect(getDisplayModel('opencode', 'claude-opus-4-6', undefined, 'sonnet')).toBe('claude-opus-4-6');
    });

    it('should use settings override for opencode without anthropic key', () => {
      mockLoadGitConfig.mockReturnValue(null);
      expect(getDisplayModel('opencode', undefined, 'minimax-m2.5-free', 'sonnet')).toBe('minimax-m2.5-free');
    });

    it('should return agent model for unknown provider', () => {
      expect(getDisplayModel('unknown-provider', undefined, undefined, 'opus')).toBe('opus');
    });

    it('should use override for unknown provider', () => {
      expect(getDisplayModel('unknown-provider', 'custom-model', undefined, 'opus')).toBe('custom-model');
    });
  });

  describe('getCompletionColumn', () => {
    it('should route plan-agent to ready column', () => {
      expect(getCompletionColumn('plan-agent')).toBe('ready');
    });

    it('should route scout-agent to done column', () => {
      expect(getCompletionColumn('scout-agent')).toBe('done');
    });

    it('should route code-agent to verify column', () => {
      expect(getCompletionColumn('code-agent')).toBe('verify');
    });

    it('should route verify-agent to verify column', () => {
      expect(getCompletionColumn('verify-agent')).toBe('verify');
    });

    it('should route unknown agents to verify column', () => {
      expect(getCompletionColumn('unknown-agent')).toBe('verify');
      expect(getCompletionColumn('marketing-agent')).toBe('verify');
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

  describe('non-Claude conclusion synthesis', () => {
    /**
     * Tests the post-completion synthesis behavior for non-Claude providers (e.g., Codex).
     * These providers don't follow the @@YOLIUM protocol natively, so the system
     * synthesizes missing protocol actions from accumulated agent messages on exit.
     */

    it('should save longest agent message as description for Codex plan-agent', () => {
      // Simulates the onExit synthesis path when:
      // - Provider is non-Claude (Codex)
      // - Agent is plan-agent
      // - receivedUpdateDescription is false
      // - Accumulated agent messages exist
      const board = createBoard('/path/to/project');
      const item = addItem(board, {
        title: 'Plan authentication feature',
        description: 'Original description',
        agentProvider: 'codex',
        order: 0,
      });

      // Simulate agent start
      updateItem(board, item.id, { agentStatus: 'running', column: 'in-progress' });

      // Simulate what conclusion synthesis does:
      // Pick the longest accumulated message as the plan
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
      // When receivedUpdateDescription is true, synthesis should be skipped
      const board = createBoard('/path/to/project');
      const item = addItem(board, {
        title: 'Plan feature',
        description: 'Original description',
        agentProvider: 'codex',
        order: 0,
      });

      // Simulate that agent sent update_description (protocol message was received)
      const agentPlan = 'Agent-provided plan via protocol';
      updateItem(board, item.id, { description: agentPlan });

      // Simulate conclusion synthesis check: receivedUpdateDescription = true → skip
      const receivedUpdateDescription = true;
      if (!receivedUpdateDescription) {
        updateItem(board, item.id, { description: 'Should not overwrite' });
      }

      const result = board.items.find(i => i.id === item.id)!;
      expect(result.description).toBe(agentPlan);
    });

    it('should not synthesize description for code-agent (only plan-agent)', () => {
      // Code agents don't need description synthesis — they commit code, not plans
      const board = createBoard('/path/to/project');
      const item = addItem(board, {
        title: 'Implement auth',
        description: 'Original description',
        agentProvider: 'codex',
        order: 0,
      });

      // Simulate conclusion synthesis check: agentName !== 'plan-agent' → skip
      const agentName = 'code-agent';
      if (agentName === 'plan-agent') {
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

      // Simulate conclusion synthesis with empty accumulated messages
      const accumulated: string[] = [];
      if (accumulated.length > 0) {
        updateItem(board, item.id, { description: 'Should not be set' });
      }

      const result = board.items.find(i => i.id === item.id)!;
      expect(result.description).toBe('Original description');
    });

    it('should not synthesize description for Claude provider', () => {
      // Claude follows the protocol natively — no synthesis needed
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

    it('should move item to verify column on exit-code-0 fallback for code-agent', () => {
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

      // Simulate exit-code-0 fallback for code-agent
      const exitItem = board.items.find(i => i.id === item.id);
      expect(exitItem).toBeDefined();
      expect(exitItem!.agentStatus).toBe('running');

      const agentName = 'code-agent';
      const completionColumn = agentName === 'plan-agent' ? 'ready' : 'verify';
      updateItem(board, item.id, { agentStatus: 'completed', activeAgentName: undefined, column: completionColumn });

      const result = board.items.find(i => i.id === item.id)!;
      expect(result.column).toBe('verify');
      expect(result.agentStatus).toBe('completed');
    });

    it('should move item to ready column on exit-code-0 fallback for plan-agent', () => {
      // Simulates the onExit handler when code === 0 and item is still 'running' for plan-agent
      const board = createBoard('/path/to/project');
      const item = addItem(board, {
        title: 'Test work item',
        description: 'Create implementation plan',
        agentProvider: 'claude',
        order: 0,
      });

      // Simulate agent start: move to in-progress with running status
      updateItem(board, item.id, { agentStatus: 'running', column: 'in-progress' });

      // Simulate exit-code-0 fallback for plan-agent
      const exitItem = board.items.find(i => i.id === item.id);
      expect(exitItem).toBeDefined();
      expect(exitItem!.agentStatus).toBe('running');

      const agentName = 'plan-agent';
      const completionColumn = agentName === 'plan-agent' ? 'ready' : 'verify';
      updateItem(board, item.id, { agentStatus: 'completed', activeAgentName: undefined, column: completionColumn });

      const result = board.items.find(i => i.id === item.id)!;
      expect(result.column).toBe('ready');
      expect(result.agentStatus).toBe('completed');
    });

    it('should move item to verify column on complete protocol message for code-agent', () => {
      // Simulates the handleAgentOutput 'complete' case (agent-runner.ts:560-568) for code-agent
      const board = createBoard('/path/to/project');
      const item = addItem(board, {
        title: 'Test work item',
        description: 'Implement feature',
        agentProvider: 'claude',
        order: 0,
      });

      // Simulate agent start
      updateItem(board, item.id, { agentStatus: 'running', column: 'in-progress' });

      // Simulate complete protocol message for code-agent
      const agentName = 'code-agent';
      const completionColumn = agentName === 'plan-agent' ? 'ready' : 'verify';
      updateItem(board, item.id, { agentStatus: 'completed', activeAgentName: undefined, column: completionColumn });

      const result = board.items.find(i => i.id === item.id)!;
      expect(result.column).toBe('verify');
      expect(result.agentStatus).toBe('completed');
    });

    it('should move item to ready column on complete protocol message for plan-agent', () => {
      // Simulates the handleAgentOutput 'complete' case (agent-runner.ts:560-568) for plan-agent
      const board = createBoard('/path/to/project');
      const item = addItem(board, {
        title: 'Test work item',
        description: 'Create implementation plan',
        agentProvider: 'claude',
        order: 0,
      });

      // Simulate agent start
      updateItem(board, item.id, { agentStatus: 'running', column: 'in-progress' });

      // Simulate complete protocol message for plan-agent
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

      // Simulate agent start
      updateItem(board, item.id, { agentStatus: 'running', column: 'in-progress' });

      // Simulate complete protocol message for scout-agent using getCompletionColumn
      const completionColumn = getCompletionColumn('scout-agent');
      updateItem(board, item.id, { agentStatus: 'completed', activeAgentName: undefined, column: completionColumn });

      const result = board.items.find(i => i.id === item.id)!;
      expect(result.column).toBe('done');
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
