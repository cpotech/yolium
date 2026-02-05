/**
 * @module src/ipc/app-handlers
 * App-level IPC handlers for version, home directory, and external links.
 */

import { app, BrowserWindow, IpcMain, Shell } from 'electron';
import { createLogger } from '../lib/logger';
import { closeAllPty } from '../pty-manager';
import { closeAllContainers } from '../lib/docker';

const logger = createLogger('app-handlers');

// Track if cleanup has been done to avoid duplicate cleanup
let cleanupDone = false;

/**
 * Perform async cleanup of PTY sessions, containers, and worktrees.
 * @returns Promise that resolves when cleanup is complete
 */
export async function performCleanup(): Promise<void> {
  if (cleanupDone) return;
  cleanupDone = true;

  logger.info('Starting cleanup...');
  closeAllPty();
  await closeAllContainers();
  logger.info('Cleanup complete');
}

/**
 * Reset the cleanup flag (for testing).
 */
export function resetCleanupFlag(): void {
  cleanupDone = false;
}

/**
 * Check if cleanup has been performed.
 */
export function isCleanupDone(): boolean {
  return cleanupDone;
}

/**
 * Register app-level IPC handlers.
 * @param ipcMain - Electron IPC main instance
 * @param shell - Electron shell instance
 */
export function registerAppHandlers(ipcMain: IpcMain, shell: Shell): void {
  // Get app version
  ipcMain.handle('app:get-version', () => {
    return app.getVersion();
  });

  // Force quit (called after user confirms)
  ipcMain.handle('app:force-quit', async () => {
    await performCleanup();
    app.quit();
  });

  // Get home directory
  ipcMain.handle('app:get-home-dir', () => {
    return app.getPath('home');
  });

  // Open URL in external browser
  ipcMain.handle('app:open-external', (_event, url: string) => {
    return shell.openExternal(url);
  });
}
