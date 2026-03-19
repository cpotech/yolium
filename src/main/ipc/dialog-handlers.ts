/**
 * @module src/ipc/dialog-handlers
 * Dialog IPC handlers (stub — all confirmation dialogs now use React ConfirmDialog).
 */

import type { IpcMain } from 'electron';

/**
 * Register dialog IPC handlers.
 * @param ipcMain - Electron IPC main instance
 */
export function registerDialogHandlers(ipcMain: IpcMain): void {
  // All native dialog handlers have been replaced by React ConfirmDialog.
  // This function is kept as a no-op so the registration call site doesn't need changing.
  void ipcMain;
}
