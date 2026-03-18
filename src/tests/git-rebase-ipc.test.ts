import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IpcMain } from 'electron';

const { mockRebaseBranchOntoDefault } = vi.hoisted(() => ({
  mockRebaseBranchOntoDefault: vi.fn(),
}));

vi.mock('@main/lib/logger', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

vi.mock('@main/git/git-worktree', () => ({
  isGitRepo: vi.fn(),
  hasCommits: vi.fn(),
  getWorktreeBranch: vi.fn(),
  initGitRepoWithDefaults: vi.fn(),
  validateBranchNameForUi: vi.fn(),
  mergeWorktreeBranch: vi.fn(),
  getWorktreeDiffStats: vi.fn(),
  getWorktreeChangedFiles: vi.fn(),
  getWorktreeFileDiff: vi.fn(),
  cleanupWorktreeAndBranch: vi.fn(),
  mergeBranchAndPushPR: vi.fn(),
  checkMergeConflicts: vi.fn(),
  approvePR: vi.fn(),
  mergePR: vi.fn(),
  rebaseBranchOntoDefault: mockRebaseBranchOntoDefault,
}));

vi.mock('@main/git/git-config', () => ({
  loadGitConfig: vi.fn(),
  saveGitConfig: vi.fn(),
}))

vi.mock('@main/git/git-identity', () => ({
  loadDetectedGitConfig: vi.fn(),
}))

vi.mock('@main/git/git-credentials', () => ({
  fetchGitHubUser: vi.fn(),
  generateGitCredentials: vi.fn(),
}))

vi.mock('@main/git/claude-oauth', () => ({
  hasHostClaudeOAuth: vi.fn(),
  fetchClaudeUsage: vi.fn(),
}))

vi.mock('@main/git/codex-oauth', () => ({
  hasHostCodexOAuth: vi.fn(),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  statSync: vi.fn(),
  readdirSync: vi.fn(() => []),
}));

import { registerGitHandlers } from '@main/ipc/git-handlers';

function registerHandlersForTest(): Map<string, unknown> {
  const handlers = new Map<string, unknown>();
  const ipcMain = {
    handle: vi.fn((channel: string, handler: unknown) => {
      handlers.set(channel, handler);
    }),
  } as unknown as IpcMain;

  registerGitHandlers(ipcMain);
  return handlers;
}

describe('git:rebase-onto-default handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registerGitHandlers should continue to register git:rebase-onto-default', () => {
    const handlers = registerHandlersForTest();
    expect(handlers.has('git:rebase-onto-default')).toBe(true);
  });

  it('git:rebase-onto-default should return the success payload from rebaseBranchOntoDefault', async () => {
    mockRebaseBranchOntoDefault.mockReturnValue({ success: true });

    const handlers = registerHandlersForTest();
    const handler = handlers.get('git:rebase-onto-default') as (
      event: unknown,
      worktreePath: string,
      projectPath: string,
    ) => Promise<unknown>;

    const result = await handler({}, '/home/user/worktree', '/home/user/project');

    expect(mockRebaseBranchOntoDefault).toHaveBeenCalledWith(
      '/home/user/worktree',
      '/home/user/project',
    );
    expect(result).toEqual({ success: true });
  });

  it('git:rebase-onto-default should return conflict metadata unchanged', async () => {
    mockRebaseBranchOntoDefault.mockReturnValue({
      success: false,
      conflict: true,
      error: 'Rebase conflicts detected. The branch cannot be automatically rebased onto the latest default.',
      conflictingFiles: ['src/main.ts', 'src/utils.ts'],
    });

    const handlers = registerHandlersForTest();
    const handler = handlers.get('git:rebase-onto-default') as (
      event: unknown,
      worktreePath: string,
      projectPath: string,
    ) => Promise<unknown>;

    const result = await handler({}, '/home/user/worktree', '/home/user/project');

    expect(result).toEqual({
      success: false,
      conflict: true,
      error: 'Rebase conflicts detected. The branch cannot be automatically rebased onto the latest default.',
      conflictingFiles: ['src/main.ts', 'src/utils.ts'],
    });
  });

  it('git:rebase-onto-default should return non-conflict failures unchanged', async () => {
    mockRebaseBranchOntoDefault.mockReturnValue({
      success: false,
      error: 'Rebase failed: network error',
    });

    const handlers = registerHandlersForTest();
    const handler = handlers.get('git:rebase-onto-default') as (
      event: unknown,
      worktreePath: string,
      projectPath: string,
    ) => Promise<unknown>;

    const result = await handler({}, '/home/user/worktree', '/home/user/project');

    expect(result).toEqual({
      success: false,
      error: 'Rebase failed: network error',
    });
  });
});
