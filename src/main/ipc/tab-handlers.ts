/**
 * @module src/ipc/tab-handlers
 * Tab context menu IPC handlers.
 */

import { Menu, type IpcMain } from 'electron';

/**
 * Register tab IPC handlers.
 * @param ipcMain - Electron IPC main instance
 */
export function registerTabHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('tab:context-menu', async (event, tabId: string, x: number, y: number) => {
    const menu = Menu.buildFromTemplate([
      {
        label: 'Close',
        click: () => event.sender.send('tab:close-specific', tabId),
      },
      {
        label: 'Close Others',
        click: () => event.sender.send('tab:close-others', tabId),
      },
      {
        label: 'Close All',
        click: () => event.sender.send('tab:close-all'),
      },
    ]);
    menu.popup({ x, y });
  });
}
