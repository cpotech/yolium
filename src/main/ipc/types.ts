/**
 * @module src/ipc/types
 * Shared types and dependencies for IPC handlers.
 */

import type { IpcMain, Dialog, Shell, BrowserWindow } from 'electron';

/**
 * Dependencies injected into IPC handler registration functions.
 */
export interface IpcDeps {
  ipcMain: IpcMain;
  dialog: typeof Dialog;
  shell: typeof Shell;
  getMainWindow: () => BrowserWindow | null;
}
