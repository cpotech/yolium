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
import { loadGitConfig, loadDetectedGitConfig, saveGitConfig, fetchGitHubUser, hasHostClaudeOAuth, hasHostCodexOAuth, generateGitCredentials } from '@main/git/git-config';
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
} from '@main/git/git-worktree';
import type { GitConfig } from '@shared/types/git';
import type { ProjectType } from '@shared/types/onboarding';

const logger = createLogger('git-handlers');
const GIT_CLONE_TIMEOUT_MS = 5 * 60 * 1000;

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
  worktreeChangedFiles: 'git:worktree-changed-files',
  worktreeFileDiff: 'git:worktree-file-diff',
  detectNestedRepos: 'git:detect-nested-repos',
} as const;

export const GIT_IPC_CHANNELS = Object.values(GIT_CHANNELS);
type GitIpcChannel = typeof GIT_IPC_CHANNELS[number];
type GitIpcHandler = (event: IpcMainInvokeEvent, ...args: any[]) => unknown;

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function registerGitChannel(ipcMain: IpcMain, channel: GitIpcChannel, handler: GitIpcHandler): void {
  try {
    ipcMain.handle(channel, handler);
    logger.debug('Registered git IPC handler', { channel });
  } catch (error) {
    logger.error('Failed to register git IPC handler', {
      channel,
      error: getErrorMessage(error),
    });
    throw error;
  }
}

export interface GitCloneResult {
  success: boolean;
  clonedPath: string | null;
  error: string | null;
}

function expandHomePath(inputPath: string): string {
  return inputPath.startsWith('~')
    ? inputPath.replace(/^~(?=$|[\\/])/, os.homedir())
    : inputPath;
}

/**
 * Extract repository name from a git URL.
 * Supports HTTPS, SSH, and SCP-like git URL formats.
 */
export function extractRepoNameFromUrl(repoUrl: string): string | null {
  const trimmed = repoUrl.trim();
  if (!trimmed) return null;

  const withoutQuery = trimmed.replace(/[?#].*$/, '');
  const withoutTrailingSlash = withoutQuery.replace(/[\\/]+$/, '');
  const withoutDotGit = withoutTrailingSlash.replace(/\.git$/i, '');
  if (!withoutDotGit) return null;

  const scpLikeMatch = withoutDotGit.match(/^[^@\s]+@[^:\s]+:(.+)$/);
  if (scpLikeMatch?.[1]) {
    const repoName = path.posix.basename(scpLikeMatch[1]);
    return repoName && repoName !== '.' ? repoName : null;
  }

  try {
    const parsed = new URL(withoutDotGit);
    const pathname = parsed.pathname.replace(/^\/+/, '');
    const repoName = path.posix.basename(pathname);
    return repoName && repoName !== '.' ? repoName : null;
  } catch {
    const segments = withoutDotGit.split(/[\\/]/).filter(Boolean);
    if (segments.length < 2) return null;
    return segments[segments.length - 1] ?? null;
  }
}

function buildGitCloneEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  const gitConfig = loadGitConfig();

  if (gitConfig?.githubPat) {
    const credPath = generateGitCredentials(gitConfig);
    if (credPath) {
      env.GIT_TERMINAL_PROMPT = '0';
      env.GIT_CONFIG_COUNT = '1';
      env.GIT_CONFIG_KEY_0 = 'credential.helper';
      env.GIT_CONFIG_VALUE_0 = `store --file "${credPath}"`;
    }
  }

  return env;
}

function resolveCloneTargetPath(targetDir: string, repoName: string): string {
  const expanded = expandHomePath(targetDir.trim());
  if (!expanded) {
    return path.join(process.cwd(), repoName);
  }

  const endsWithSeparator = /[\\/]$/.test(expanded);
  if (endsWithSeparator) {
    return path.join(expanded, repoName);
  }

  try {
    if (fs.statSync(expanded).isDirectory()) {
      return path.join(expanded, repoName);
    }
  } catch {
    // Path does not exist yet, treat as explicit target path.
  }

  return expanded;
}

async function runGitClone(url: string, targetPath: string, env: NodeJS.ProcessEnv): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let progressOutput = '';

    const proc = execFile(
      'git',
      ['clone', url, targetPath],
      {
        env,
        timeout: GIT_CLONE_TIMEOUT_MS,
      },
      (error, _stdout, stderr) => {
        if (error) {
          const errorMessage = (stderr || progressOutput || error.message || 'Failed to clone repository').trim();
          reject(new Error(errorMessage));
          return;
        }
        resolve();
      },
    );

    proc.stderr?.on('data', (chunk: Buffer | string) => {
      progressOutput += chunk.toString();
    });
  });
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
    if (!detectedConfig) return null;

    // Also load stored config to get githubLogin
    const storedConfig = loadGitConfig();

    // Return detected config with source info and flags instead of actual secrets for security
    return {
      name: detectedConfig.name,
      email: detectedConfig.email,
      sources: detectedConfig.sources,
      hasPat: !!detectedConfig.githubPat,
      hasOpenaiKey: !!detectedConfig.openaiApiKey,
      hasAnthropicKey: !!detectedConfig.anthropicApiKey,
      hasClaudeOAuth: hasHostClaudeOAuth(),
      useClaudeOAuth: storedConfig?.useClaudeOAuth ?? false,
      hasCodexOAuth: hasHostCodexOAuth(),
      useCodexOAuth: storedConfig?.useCodexOAuth ?? false,
      githubLogin: storedConfig?.githubLogin,
      agentModelDefaults: storedConfig?.agentModelDefaults,
    };
  });

  // Save git config (preserves existing secrets if not provided, auto-derives identity from PAT)
  registerGitChannel(ipcMain, GIT_CHANNELS.saveConfig, async (_event, config: { githubPat?: string; openaiApiKey?: string; anthropicApiKey?: string; useClaudeOAuth?: boolean; useCodexOAuth?: boolean; agentModelDefaults?: Record<string, string> }) => {
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

    // Handle agent model defaults
    if (config.agentModelDefaults !== undefined) {
      toSave.agentModelDefaults = config.agentModelDefaults;
    } else if (existing?.agentModelDefaults) {
      toSave.agentModelDefaults = existing.agentModelDefaults;
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
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.error('Failed to init git repo:', { error: message });
      return { success: false, error: message };
    }
  });

  // Clone repository into target directory.
  registerGitChannel(ipcMain, GIT_CHANNELS.clone, async (_event, url: string, targetDir: string): Promise<GitCloneResult> => {
    logger.info('IPC: git:clone', { url, targetDir });

    const repoName = extractRepoNameFromUrl(url);
    if (!repoName) {
      return { success: false, clonedPath: null, error: 'Invalid repository URL' };
    }

    const targetPath = resolveCloneTargetPath(targetDir, repoName);
    const parentDirectory = path.dirname(targetPath);

    if (fs.existsSync(targetPath)) {
      return { success: false, clonedPath: null, error: `Target already exists: ${targetPath}` };
    }

    if (!fs.existsSync(parentDirectory)) {
      return { success: false, clonedPath: null, error: `Parent directory does not exist: ${parentDirectory}` };
    }

    try {
      const env = buildGitCloneEnv();
      await runGitClone(url.trim(), targetPath, env);
      return { success: true, clonedPath: targetPath, error: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to clone repository';
      logger.error('Failed to clone repository', { url, targetPath, error: message });
      return { success: false, clonedPath: null, error: message };
    }
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
      } catch (err) {
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
    } catch (err) {
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
    } catch (err) {
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
    } catch (err) {
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
    } catch (err) {
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
    } catch (err) {
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
    } catch {
      // Folder may not be readable
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
