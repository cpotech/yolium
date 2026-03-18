/**
 * @module src/ipc/git-handlers
 * Git config and repository IPC handlers.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execFile } from 'node:child_process';
import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import { createLogger } from '@main/lib/logger';
import { getErrorMessage } from '@main/lib/error-utils';
import { loadGitConfig, saveGitConfig } from '@main/git/git-config';
import { loadDetectedGitConfig } from '@main/git/git-identity';
import { fetchGitHubUser, generateGitCredentials } from '@main/git/git-credentials';
import { hasHostClaudeOAuth } from '@main/git/claude-oauth';
import { hasHostCodexOAuth } from '@main/git/codex-oauth';
import {
  isGitRepo,
  hasCommits,
  getWorktreeBranch,
  initGitRepoWithDefaults,
  validateBranchNameForUi,
  mergeWorktreeBranch,
  getWorktreeDiffStats,
  getWorktreeChangedFiles,
  getWorktreeFileDiff,
  cleanupWorktreeAndBranch,
  mergeBranchAndPushPR,
  checkMergeConflicts,
  approvePR,
  mergePR,
  rebaseBranchOntoDefault,
} from '@main/git/git-worktree';
import {
  cloneRepository,
  extractRepoNameFromUrl,
} from '@main/git/git-clone';
import type { GitConfig } from '@shared/types/git';
import type { ProjectType } from '@shared/types/onboarding';

const logger = createLogger('git-handlers');

const GIT_CHANNELS = {
  loadConfig: 'git-config:load',
  saveConfig: 'git-config:save',
  isRepo: 'git:is-repo',
  getBranch: 'git:get-branch',
  init: 'git:init',
  clone: 'git:clone',
  validateBranch: 'git:validate-branch',
  mergeBranch: 'git:merge-branch',
  worktreeDiffStats: 'git:worktree-diff-stats',
  checkMergeConflicts: 'git:check-merge-conflicts',
  cleanupWorktree: 'git:cleanup-worktree',
  mergeAndPushPr: 'git:merge-and-push-pr',
  approvePr: 'git:approve-pr',
  mergePr: 'git:merge-pr',
  worktreeChangedFiles: 'git:worktree-changed-files',
  worktreeFileDiff: 'git:worktree-file-diff',
  detectNestedRepos: 'git:detect-nested-repos',
  rebaseOntoDefault: 'git:rebase-onto-default',
} as const;

export const GIT_IPC_CHANNELS = Object.values(GIT_CHANNELS);
type GitIpcChannel = typeof GIT_IPC_CHANNELS[number];
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- handler args vary per channel
type GitIpcHandler = (event: IpcMainInvokeEvent, ...args: any[]) => unknown;

function registerGitChannel(ipcMain: IpcMain, channel: GitIpcChannel, handler: GitIpcHandler): void {
  try {
    ipcMain.handle(channel, handler);
    logger.debug('Registered git IPC handler', { channel });
  } catch (error) { /* intentionally ignored */
    logger.error('Failed to register git IPC handler', {
      channel,
      error: getErrorMessage(error),
    });
    throw error;
  }
}

/**
 * Register git IPC handlers.
 * @param ipcMain - Electron IPC main instance
 */
export function registerGitHandlers(ipcMain: IpcMain): void {
  logger.info('Registering git IPC handlers', { channels: GIT_IPC_CHANNELS });

  // Load git config (returns detected config with secrets redacted)
  registerGitChannel(ipcMain, GIT_CHANNELS.loadConfig, () => {
    const detectedConfig = loadDetectedGitConfig();
    const storedConfig = loadGitConfig();

    const hasClaudeOAuth = hasHostClaudeOAuth();
    const hasCodexOAuth = hasHostCodexOAuth();

    // Return null only if there's truly no config anywhere (no git identity, no keys, no OAuth)
    if (!detectedConfig && !hasClaudeOAuth && !hasCodexOAuth && !storedConfig?.useClaudeOAuth && !storedConfig?.useCodexOAuth) {
      return null;
    }

    // Return detected config with source info and flags instead of actual secrets for security
    return {
      name: detectedConfig?.name ?? '',
      email: detectedConfig?.email ?? '',
      sources: detectedConfig?.sources ?? {},
      hasPat: !!detectedConfig?.githubPat,
      hasOpenaiKey: !!detectedConfig?.openaiApiKey,
      hasAnthropicKey: !!detectedConfig?.anthropicApiKey,
      hasClaudeOAuth,
      useClaudeOAuth: storedConfig?.useClaudeOAuth ?? false,
      hasCodexOAuth,
      useCodexOAuth: storedConfig?.useCodexOAuth ?? false,
      githubLogin: storedConfig?.githubLogin,
      providerModelDefaults: storedConfig?.providerModelDefaults,
      providerModels: storedConfig?.providerModels,
    };
  });

  // Save git config (preserves existing secrets if not provided, auto-derives identity from PAT)
  registerGitChannel(ipcMain, GIT_CHANNELS.saveConfig, async (_event, config: { githubPat?: string; openaiApiKey?: string; anthropicApiKey?: string; useClaudeOAuth?: boolean; useCodexOAuth?: boolean; providerModelDefaults?: Record<string, string>; providerModels?: Record<string, string[]> }) => {
    // Load existing config to preserve secrets if not provided in save
    const existing = loadGitConfig();
    const toSave: GitConfig = {
      name: existing?.name || '',
      email: existing?.email || '',
    };

    // If new PAT is provided, use it; otherwise preserve existing
    if (config.githubPat !== undefined) {
      if (config.githubPat) {
        toSave.githubPat = config.githubPat;
      }
      // If empty string, PAT is being cleared (don't include it, also clear derived identity)
    } else if (existing?.githubPat) {
      // Preserve existing PAT if not explicitly changed
      toSave.githubPat = existing.githubPat;
    }

    // If new OpenAI key is provided, use it; otherwise preserve existing
    if (config.openaiApiKey !== undefined) {
      if (config.openaiApiKey) {
        toSave.openaiApiKey = config.openaiApiKey;
      }
      // If empty string, key is being cleared (don't include it)
    } else if (existing?.openaiApiKey) {
      // Preserve existing key if not explicitly changed
      toSave.openaiApiKey = existing.openaiApiKey;
    }

    // If new Anthropic key is provided, use it; otherwise preserve existing
    if (config.anthropicApiKey !== undefined) {
      if (config.anthropicApiKey) {
        toSave.anthropicApiKey = config.anthropicApiKey;
      }
      // If empty string, key is being cleared (don't include it)
    } else if (existing?.anthropicApiKey) {
      // Preserve existing Anthropic key if not explicitly changed
      toSave.anthropicApiKey = existing.anthropicApiKey;
    }

    // Handle Claude OAuth toggle
    if (config.useClaudeOAuth !== undefined) {
      toSave.useClaudeOAuth = config.useClaudeOAuth;
      if (config.useClaudeOAuth) {
        // When OAuth is enabled, clear Anthropic API key (mutual exclusion)
        delete toSave.anthropicApiKey;
      }
    } else if (existing?.useClaudeOAuth) {
      toSave.useClaudeOAuth = existing.useClaudeOAuth;
    }

    // Handle Codex OAuth toggle
    if (config.useCodexOAuth !== undefined) {
      toSave.useCodexOAuth = config.useCodexOAuth;
      if (config.useCodexOAuth) {
        // When OAuth is enabled, clear OpenAI API key (mutual exclusion)
        delete toSave.openaiApiKey;
      }
    } else if (existing?.useCodexOAuth) {
      toSave.useCodexOAuth = existing.useCodexOAuth;
    }

    // Auto-derive git identity from PAT via GitHub API
    const pat = toSave.githubPat;
    if (pat) {
      const githubUser = await fetchGitHubUser(pat);
      if (githubUser) {
        toSave.name = githubUser.name;
        toSave.email = githubUser.email;
        toSave.githubLogin = githubUser.login;
        logger.info('Derived git identity from GitHub PAT', { login: githubUser.login });
      } else {
        // API call failed — preserve existing identity
        toSave.name = existing?.name || '';
        toSave.email = existing?.email || '';
        toSave.githubLogin = existing?.githubLogin;
        logger.warn('Failed to fetch GitHub user from PAT, preserving existing identity');
      }
    } else {
      // PAT was cleared — clear derived identity too
      toSave.githubLogin = undefined;
    }

    // Handle provider model defaults
    if (config.providerModelDefaults !== undefined) {
      toSave.providerModelDefaults = config.providerModelDefaults;
    } else if (existing?.providerModelDefaults) {
      toSave.providerModelDefaults = existing.providerModelDefaults;
    }

    // Handle provider models (multi-model list)
    if (config.providerModels !== undefined) {
      toSave.providerModels = config.providerModels;
    } else if (existing?.providerModels) {
      toSave.providerModels = existing.providerModels;
    }

    saveGitConfig(toSave);
  });

  // Check if folder is a git repo (and if it has commits)
  registerGitChannel(ipcMain, GIT_CHANNELS.isRepo, (_event, folderPath: string) => {
    const isRepo = isGitRepo(folderPath);
    if (!isRepo) {
      return { isRepo: false, hasCommits: false };
    }
    return { isRepo: true, hasCommits: hasCommits(folderPath) };
  });

  // Get current branch name
  registerGitChannel(ipcMain, GIT_CHANNELS.getBranch, (_event, folderPath: string) => {
    return getWorktreeBranch(folderPath);
  });

  // Initialize git repo
  registerGitChannel(ipcMain, GIT_CHANNELS.init, (_event, folderPath: string, projectTypes?: ProjectType[]) => {
    logger.info('IPC: git:init', { folderPath, projectTypes });
    try {
      const result = initGitRepoWithDefaults(folderPath, projectTypes || []);
      return { success: true, initialized: result.initialized, hasCommits: result.hasCommits };
    } catch (err) { /* intentionally ignored */
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.error('Failed to init git repo:', { error: message });
      return { success: false, error: message };
    }
  });

  // Clone repository into target directory.
  registerGitChannel(ipcMain, GIT_CHANNELS.clone, async (_event, url: string, targetDir: string) => {
    logger.info('IPC: git:clone', { url, targetDir });
    return cloneRepository(url, targetDir);
  });

  // Validate branch name for UI
  registerGitChannel(ipcMain, GIT_CHANNELS.validateBranch, (_event, branchName: string) => {
    return validateBranchNameForUi(branchName);
  });

  // Merge a branch into the default branch
  registerGitChannel(ipcMain, GIT_CHANNELS.mergeBranch, async (_event, projectPath: string, branchName: string) => {
    logger.info('IPC: git:merge-branch', { projectPath, branchName });
    return withMergeLock(projectPath, async () => {
      try {
        mergeWorktreeBranch(projectPath, branchName);
        return { success: true };
      } catch (err) { /* intentionally ignored */
        const message = err instanceof Error ? err.message : 'Unknown error';
        const conflict = message.startsWith('conflict:');
        logger.error('Failed to merge branch', { projectPath, branchName, error: message });
        return { success: false, error: message, conflict };
      }
    });
  });

  // Get diff stats between default branch and a feature branch
  registerGitChannel(ipcMain, GIT_CHANNELS.worktreeDiffStats, async (_event, projectPath: string, branchName: string) => {
    logger.info('IPC: git:worktree-diff-stats', { projectPath, branchName });
    try {
      return await getWorktreeDiffStats(projectPath, branchName);
    } catch (err) { /* intentionally ignored */
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.error('Failed to get diff stats', { projectPath, branchName, error: message });
      return { filesChanged: 0, insertions: 0, deletions: 0 };
    }
  });

  // Get list of changed files between default branch and feature branch
  registerGitChannel(ipcMain, GIT_CHANNELS.worktreeChangedFiles, (_event, projectPath: string, branchName: string) => {
    logger.info('IPC: git:worktree-changed-files', { projectPath, branchName });
    try {
      return { files: getWorktreeChangedFiles(projectPath, branchName) };
    } catch (err) { /* intentionally ignored */
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.error('Failed to get changed files', { projectPath, branchName, error: message });
      return { files: [], error: message };
    }
  });

  // Get unified diff for a specific file between default branch and feature branch
  registerGitChannel(ipcMain, GIT_CHANNELS.worktreeFileDiff, (_event, projectPath: string, branchName: string, filePath: string) => {
    logger.info('IPC: git:worktree-file-diff', { projectPath, branchName, filePath });
    try {
      return { diff: getWorktreeFileDiff(projectPath, branchName, filePath) };
    } catch (err) { /* intentionally ignored */
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.error('Failed to get file diff', { projectPath, branchName, filePath, error: message });
      return { diff: '', error: message };
    }
  });

  // Check if a branch can merge cleanly (conflict pre-check)
  registerGitChannel(ipcMain, GIT_CHANNELS.checkMergeConflicts, (_event, projectPath: string, branchName: string) => {
    logger.info('IPC: git:check-merge-conflicts', { projectPath, branchName });
    try {
      return checkMergeConflicts(projectPath, branchName);
    } catch (err) { /* intentionally ignored */
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.error('Failed to check merge conflicts', { projectPath, branchName, error: message });
      return { clean: false, conflictingFiles: [`(check failed: ${message})`] };
    }
  });

  // Clean up a worktree and its branch
  registerGitChannel(ipcMain, GIT_CHANNELS.cleanupWorktree, async (_event, projectPath: string, worktreePath: string, branchName: string) => {
    logger.info('IPC: git:cleanup-worktree', { projectPath, worktreePath, branchName });
    try {
      await cleanupWorktreeAndBranch(projectPath, worktreePath, branchName);
    } catch (err) { /* intentionally ignored */
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.error('Failed to cleanup worktree', { projectPath, worktreePath, branchName, error: message });
    }
  });

  // Merge a worktree branch, push to remote, and create a PR
  registerGitChannel(ipcMain, GIT_CHANNELS.mergeAndPushPr, async (
    _event,
    projectPath: string,
    branchName: string,
    worktreePath: string,
    itemTitle: string,
    itemDescription: string,
  ) => {
    logger.info('IPC: git:merge-and-push-pr', { projectPath, branchName });
    return withMergeLock(projectPath, async () => {
      return mergeBranchAndPushPR(projectPath, branchName, worktreePath, itemTitle, itemDescription);
    });
  });

  // Approve a GitHub PR
  registerGitChannel(ipcMain, GIT_CHANNELS.approvePr, async (
    _event,
    projectPath: string,
    prUrl: string,
  ) => {
    logger.info('IPC: git:approve-pr', { projectPath, prUrl });
    return approvePR(projectPath, prUrl);
  });

  // Merge a GitHub PR (squash merge)
  registerGitChannel(ipcMain, GIT_CHANNELS.mergePr, async (
    _event,
    projectPath: string,
    prUrl: string,
  ) => {
    logger.info('IPC: git:merge-pr', { projectPath, prUrl });
    return mergePR(projectPath, prUrl);
  });

  // Rebase a worktree branch onto the latest default branch
  registerGitChannel(ipcMain, GIT_CHANNELS.rebaseOntoDefault, async (
    _event,
    worktreePath: string,
    projectPath: string,
  ) => {
    logger.info('IPC: git:rebase-onto-default', { worktreePath, projectPath });
    return withMergeLock(projectPath, async () => {
      return rebaseBranchOntoDefault(worktreePath, projectPath);
    });
  });

  // Detect if folder is a git repo, and scan one level deep for nested repos if not
  registerGitChannel(ipcMain, GIT_CHANNELS.detectNestedRepos, (_event, folderPath: string) => {
    if (isGitRepo(folderPath)) {
      return { isRepo: true, nestedRepos: [] };
    }

    const nestedRepos: { name: string; path: string }[] = [];
    try {
      const entries = fs.readdirSync(folderPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          const subPath = path.join(folderPath, entry.name);
          if (fs.existsSync(path.join(subPath, '.git'))) {
            nestedRepos.push({ name: entry.name, path: subPath });
          }
        }
      }
    } catch { /* Folder may not be readable */
    }

    return { isRepo: false, nestedRepos };
  });



  logger.info('Git IPC handlers registered', {
    count: GIT_IPC_CHANNELS.length,
    includesClone: GIT_IPC_CHANNELS.includes('git:clone'),
  });
}

// Per-project merge mutex to serialize concurrent merge operations
const mergeQueues = new Map<string, Promise<unknown>>();

function withMergeLock<T>(projectPath: string, fn: () => Promise<T>): Promise<T> {
  const prev = mergeQueues.get(projectPath) || Promise.resolve();
  const next = prev.then(fn, fn);
  mergeQueues.set(projectPath, next);
  return next;
}
