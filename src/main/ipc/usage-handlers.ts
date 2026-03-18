/**
 * @module src/main/ipc/usage-handlers
 * Usage-related IPC handlers.
 */

import type { IpcMain } from 'electron';
import { hasHostClaudeOAuth, fetchClaudeUsage } from '@main/git/claude-oauth';

import { createLogger } from '@main/lib/logger';
const logger = createLogger('usage-handlers');

export const USAGE_CHANNELS = {
  getClaudeUsage: 'usage:get-claude',
} as const;

export const USAGE_IPC_CHANNELS = Object.values(USAGE_CHANNELS);

/**
 * Register usage IPC handlers.
 * @param ipcMain - Electron IPC main instance
 */
export function registerUsageHandlers(ipcMain: IpcMain): void {
  logger.info('Registering usage IPC handlers', { channels: USAGE_IPC_CHANNELS });

  // Get Claude OAuth usage state (auth status + usage data)
  ipcMain.handle(USAGE_CHANNELS.getClaudeUsage, async () => {
    logger.debug('IPC: usage:get-claude');
    const hasOAuth = hasHostClaudeOAuth();
    const usage = hasOAuth ? await fetchClaudeUsage() : null;
    return { hasOAuth, usage };
  });
}