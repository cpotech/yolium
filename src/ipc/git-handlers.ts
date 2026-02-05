/**
 * @module src/ipc/git-handlers
 * Git config and repository IPC handlers.
 */

import type { IpcMain } from 'electron';
import { createLogger } from '../lib/logger';
import { loadGitConfig, loadDetectedGitConfig, saveGitConfig } from '../lib/git-config';
import { isGitRepo, hasCommits, getWorktreeBranch, initGitRepo, validateBranchNameForUi } from '../lib/git-worktree';
import type { GitConfig } from '../types/git';

const logger = createLogger('git-handlers');

/**
 * Register git IPC handlers.
 * @param ipcMain - Electron IPC main instance
 */
export function registerGitHandlers(ipcMain: IpcMain): void {
  // Load git config (returns detected config with secrets redacted)
  ipcMain.handle('git-config:load', () => {
    const detectedConfig = loadDetectedGitConfig();
    if (!detectedConfig) return null;

    // Return detected config with source info and flags instead of actual secrets for security
    return {
      name: detectedConfig.name,
      email: detectedConfig.email,
      sources: detectedConfig.sources,
      hasPat: !!detectedConfig.githubPat,
      hasOpenaiKey: !!detectedConfig.openaiApiKey,
    };
  });

  // Save git config (preserves existing secrets if not provided)
  ipcMain.handle('git-config:save', (_event, config: GitConfig & { githubPat?: string; openaiApiKey?: string }) => {
    // Load existing config to preserve secrets if not provided in save
    const existing = loadGitConfig();
    const toSave: GitConfig = {
      name: config.name,
      email: config.email,
    };

    // If new PAT is provided, use it; otherwise preserve existing
    if (config.githubPat !== undefined) {
      if (config.githubPat) {
        toSave.githubPat = config.githubPat;
      }
      // If empty string, PAT is being cleared (don't include it)
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

  // Validate branch name for UI
  ipcMain.handle('git:validate-branch', (_event, branchName: string) => {
    return validateBranchNameForUi(branchName);
  });
}
