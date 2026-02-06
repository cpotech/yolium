/**
 * @module src/ipc/terminal-handlers
 * Terminal PTY IPC handlers.
 */

import type { IpcMain } from 'electron';
import { createLogger } from '@main/lib/logger';
import { createPty, writePty, resizePty, closePty, hasRunningChildren } from '@main/services/pty-manager';

const logger = createLogger('terminal-handlers');

/**
 * Register terminal IPC handlers.
 * @param ipcMain - Electron IPC main instance
 */
export function registerTerminalHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('terminal:create', (event, cwd?: string) => {
    logger.debug('IPC: terminal:create', { webContentsId: event.sender.id, cwd });
    return createPty(event.sender.id, cwd);
  });

  ipcMain.on('terminal:write', (_event, sessionId: string, data: string) => {
    writePty(sessionId, data);
  });

  ipcMain.on('terminal:resize', (_event, sessionId: string, cols: number, rows: number) => {
    resizePty(sessionId, cols, rows);
  });

  ipcMain.handle('terminal:close', (_event, sessionId: string) => {
    logger.debug('IPC: terminal:close', { sessionId });
    closePty(sessionId);
  });

  // Check if session has running children
  ipcMain.handle('terminal:has-running-children', (_event, sessionId: string) => {
    return hasRunningChildren(sessionId);
  });
}
