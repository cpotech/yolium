/**
 * @module src/ipc/report-handlers
 * IPC handlers for opening HTML test reports in a new BrowserWindow.
 */

import type { IpcMain } from 'electron';
import { BrowserWindow } from 'electron';
import { stat } from 'node:fs/promises';
import path from 'node:path';

export function registerReportHandlers(ipcMain: IpcMain): void {
  ipcMain.handle(
    'report:open-file',
    async (_event, filePath: string): Promise<{ success: boolean; error?: string }> => {
      if (!filePath || typeof filePath !== 'string') {
        return { success: false, error: 'File path is required' };
      }

      // Reject directory traversal
      if (filePath.includes('..')) {
        return { success: false, error: 'Path traversal is not allowed' };
      }

      // Require .html or .htm extension
      const ext = path.extname(filePath).toLowerCase();
      if (ext !== '.html' && ext !== '.htm') {
        return { success: false, error: 'Only HTML files are allowed' };
      }

      // Verify file exists
      try {
        const stats = await stat(filePath);
        if (!stats.isFile()) {
          return { success: false, error: 'Path is not a file' };
        }
      } catch {
        return { success: false, error: 'File not found' };
      }

      // Derive window title from the parent directory name
      const dirName = path.basename(path.dirname(filePath));

      const win = new BrowserWindow({
        width: 1200,
        height: 800,
        title: dirName,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          // No preload — report windows don't need IPC access
        },
      });

      win.loadFile(filePath);
      return { success: true };
    },
  );
}
