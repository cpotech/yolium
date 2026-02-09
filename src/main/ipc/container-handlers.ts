/**
 * @module src/ipc/container-handlers
 * Yolium container lifecycle IPC handlers.
 */

import type { IpcMain } from 'electron';
import { createLogger } from '@main/lib/logger';
import {
  createYolium,
  writeToContainer,
  resizeContainer,
  stopYolium,
  getSessionWorktreeInfo,
  deleteSessionWorktree,
} from '@main/docker';

const logger = createLogger('container-handlers');

/**
 * Register container IPC handlers.
 * @param ipcMain - Electron IPC main instance
 */
export function registerContainerHandlers(ipcMain: IpcMain): void {
  // Create yolium container
  ipcMain.handle('yolium:create', (event, folderPath: string, agent: string = 'claude', gsdEnabled: boolean = true, gitConfig?: { name: string; email: string }, worktreeEnabled: boolean = false, branchName?: string) => {
    logger.info('IPC: yolium:create', { folderPath, agent, gsdEnabled, worktreeEnabled, branchName, gitConfig: gitConfig ? { name: gitConfig.name, email: gitConfig.email } : null });
    return createYolium(event.sender.id, folderPath, agent, gsdEnabled, gitConfig, worktreeEnabled, branchName);
  });

  // Write to container stdin
  ipcMain.on('yolium:write', (_event, sessionId: string, data: string) => {
    writeToContainer(sessionId, data);
  });

  // Resize container TTY
  ipcMain.on('yolium:resize', (_event, sessionId: string, cols: number, rows: number) => {
    resizeContainer(sessionId, cols, rows);
  });

  // Stop container
  ipcMain.handle('yolium:stop', async (_event, sessionId: string, deleteWorktree?: boolean) => {
    logger.info('IPC: yolium:stop', { sessionId, deleteWorktree });

    // If deleteWorktree is explicitly set, handle worktree cleanup
    if (deleteWorktree === true) {
      deleteSessionWorktree(sessionId);
    }

    return stopYolium(sessionId);
  });

  // Get worktree info for a session (used for cleanup prompt)
  ipcMain.handle('yolium:get-worktree-info', (_event, sessionId: string) => {
    return getSessionWorktreeInfo(sessionId);
  });
}
