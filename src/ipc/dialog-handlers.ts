/**
 * @module src/ipc/dialog-handlers
 * Dialog IPC handlers for confirmations and folder selection.
 */

import type { Dialog, IpcMain } from 'electron';

/**
 * Register dialog IPC handlers.
 * @param ipcMain - Electron IPC main instance
 * @param dialog - Electron dialog instance
 */
export function registerDialogHandlers(ipcMain: IpcMain, dialog: Dialog): void {
  // Confirmation dialog for closing tab with running process
  ipcMain.handle('dialog:confirm-close', async (_event, message: string) => {
    const { response } = await dialog.showMessageBox({
      type: 'question',
      buttons: ['Close', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      title: 'Close Tab',
      message,
    });
    return response === 0; // true if user clicked "Close"
  });

  // Generic OK/Cancel confirmation dialog
  ipcMain.handle('dialog:confirm-ok-cancel', async (_event, title: string, message: string) => {
    const { response } = await dialog.showMessageBox({
      type: 'question',
      buttons: ['OK', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      title,
      message,
    });
    return response === 0; // true if user clicked "OK"
  });

  // Bulk close confirmation (for Close All, Close Others)
  ipcMain.handle('dialog:confirm-close-multiple', async (_event, count: number) => {
    const { response } = await dialog.showMessageBox({
      type: 'question',
      buttons: ['Close All', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      title: 'Close Tabs',
      message: `Close ${count} tab${count > 1 ? 's' : ''} with running processes?`,
    });
    return response === 0;
  });

  // Worktree cleanup confirmation dialog
  ipcMain.handle('dialog:worktree-cleanup', async (_event, branchName: string, hasUncommittedChanges: boolean) => {
    const message = hasUncommittedChanges
      ? `This session uses a git worktree on branch "${branchName}" with uncommitted changes.`
      : `This session uses a git worktree on branch "${branchName}".`;

    const { response } = await dialog.showMessageBox({
      type: 'question',
      buttons: ['Keep Worktree', 'Delete Worktree', 'Cancel'],
      defaultId: 0,
      cancelId: 2,
      title: 'Close Worktree Session',
      message,
      detail: hasUncommittedChanges
        ? 'Warning: Deleting the worktree will lose uncommitted changes!'
        : 'You can review the changes later using: git checkout ' + branchName,
    });
    // response: 0 = Keep, 1 = Delete, 2 = Cancel
    return { response };
  });

  // Folder picker
  ipcMain.handle('dialog:select-folder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Select Project Folder for Yolium',
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });
}
