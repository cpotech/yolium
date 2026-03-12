/**
 * @module src/ipc/types
 * Shared types and dependencies for IPC handlers.
 */

import type { BrowserWindow, Dialog, IpcMain, Shell } from 'electron';

/**
 * Dependencies injected into IPC handler registration functions.
 */
export interface IpcDeps {
  ipcMain: IpcMain;
  dialog: Dialog;
  shell: Shell;
  getMainWindow: () => BrowserWindow | null;
}
