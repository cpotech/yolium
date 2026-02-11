/**
 * @module src/ipc/git-handlers
 * Git config and repository IPC handlers.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execFile } from 'node:child_process';
import type { IpcMain } from 'electron';
import { createLogger } from '@main/lib/logger';
import { loadGitConfig, loadDetectedGitConfig, saveGitConfig, fetchGitHubUser, hasHostClaudeOAuth, hasHostCodexOAuth, generateGitCredentials } from '@main/git/git-config';
import {
  isGitRepo,
  hasCommits,
  getWorktreeBranch,
  initGitRepo,
  validateBranchNameForUi,
  mergeWorktreeBranch,
  getWorktreeDiffStats,
  cleanupWorktreeAndBranch,
  mergeBranchAndPushPR,
  checkMergeConflicts,
} from '@main/git/git-worktree';
import type { GitConfig } from '@shared/types/git';

const logger = createLogger('git-handlers');
const GIT_CLONE_TIMEOUT_MS = 5 * 60 * 1000;

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
  // Load git config (returns detected config with secrets redacted)
  ipcMain.handle('git-config:load', () => {
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
    };
  });

  // Save git config (preserves existing secrets if not provided, auto-derives identity from PAT)
  ipcMain.handle('git-config:save', async (_event, config: { githubPat?: string; openaiApiKey?: string; anthropicApiKey?: string; useClaudeOAuth?: boolean; useCodexOAuth?: boolean }) => {
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

    saveGitConfig(toSave);
  });

  // Check if folder is a git repo (and if it has commits)
  ipcMain.handle('git:is-repo', (_event, folderPath: string) => {
    const isRepo = isGitRepo(folderPath);
    if (!isRepo) {
      return { isRepo: false, hasCommits: false };
    }
    return { isRepo: true, hasCommits: hasCommits(folderPath) };
  });

  // Get current branch name
  ipcMain.handle('git:get-branch', (_event, folderPath: string) => {
    return getWorktreeBranch(folderPath);
  });

  // Initialize git repo
  ipcMain.handle('git:init', (_event, folderPath: string) => {
    logger.info('IPC: git:init', { folderPath });
    try {
      const initialized = initGitRepo(folderPath);
      return { success: true, initialized };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.error('Failed to init git repo:', { error: message });
      return { success: false, error: message };
    }
  });

  // Clone repository into target directory.
  ipcMain.handle('git:clone', async (_event, url: string, targetDir: string): Promise<GitCloneResult> => {
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
  ipcMain.handle('git:validate-branch', (_event, branchName: string) => {
    return validateBranchNameForUi(branchName);
  });

  // Merge a branch into the default branch
  ipcMain.handle('git:merge-branch', async (_event, projectPath: string, branchName: string) => {
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
  ipcMain.handle('git:worktree-diff-stats', (_event, projectPath: string, branchName: string) => {
    logger.info('IPC: git:worktree-diff-stats', { projectPath, branchName });
    try {
      return getWorktreeDiffStats(projectPath, branchName);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.error('Failed to get diff stats', { projectPath, branchName, error: message });
      return { filesChanged: 0, insertions: 0, deletions: 0 };
    }
  });

  // Check if a branch can merge cleanly (conflict pre-check)
  ipcMain.handle('git:check-merge-conflicts', (_event, projectPath: string, branchName: string) => {
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
  ipcMain.handle('git:cleanup-worktree', (_event, projectPath: string, worktreePath: string, branchName: string) => {
    logger.info('IPC: git:cleanup-worktree', { projectPath, worktreePath, branchName });
    try {
      cleanupWorktreeAndBranch(projectPath, worktreePath, branchName);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.error('Failed to cleanup worktree', { projectPath, worktreePath, branchName, error: message });
    }
  });

  // Merge a worktree branch, push to remote, and create a PR
  ipcMain.handle('git:merge-and-push-pr', async (
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
  ipcMain.handle('git:detect-nested-repos', (_event, folderPath: string) => {
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
}

// Per-project merge mutex to serialize concurrent merge operations
const mergeQueues = new Map<string, Promise<unknown>>();

function withMergeLock<T>(projectPath: string, fn: () => Promise<T>): Promise<T> {
  const prev = mergeQueues.get(projectPath) || Promise.resolve();
  const next = prev.then(fn, fn);
  mergeQueues.set(projectPath, next);
  return next;
}
