/**
 * @module src/ipc/filesystem-handlers
 * Filesystem IPC handlers for directory listing and creation.
 */

import type { IpcMain } from 'electron';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';

/**
 * Register filesystem IPC handlers.
 * @param ipcMain - Electron IPC main instance
 */
export function registerFilesystemHandlers(ipcMain: IpcMain): void {
  // List directory contents for path autocomplete
  ipcMain.handle('fs:list-directory', async (_event, inputPath: string) => {
    try {
      // Expand ~ to home directory
      let resolvedPath = inputPath;
      if (resolvedPath.startsWith('~')) {
        resolvedPath = resolvedPath.replace('~', os.homedir());
      }

      // Determine the directory to list and the prefix to filter by
      let dirPath: string;
      let prefix = '';

      const stats = await fs.stat(resolvedPath).catch(() => null);
      if (stats?.isDirectory()) {
        // Input is a directory - list its contents
        dirPath = resolvedPath;
      } else {
        // Input is partial - list parent directory and filter
        dirPath = path.dirname(resolvedPath);
        prefix = path.basename(resolvedPath).toLowerCase();
      }

      // Read directory entries
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      // Filter to directories only and optionally by prefix
      const directories = entries
        .filter(entry => entry.isDirectory())
        .filter(entry => prefix === '' || entry.name.toLowerCase().startsWith(prefix))
        .map(entry => ({
          name: entry.name,
          path: path.join(dirPath, entry.name),
          isHidden: entry.name.startsWith('.'),
        }))
        .sort((a, b) => {
          // Sort: non-hidden first, then alphabetically
          if (a.isHidden !== b.isHidden) return a.isHidden ? 1 : -1;
          return a.name.localeCompare(b.name);
        });

      return {
        success: true,
        basePath: dirPath,
        entries: directories,
        error: null,
      };
    } catch (err) {
      return {
        success: false,
        basePath: '',
        entries: [],
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  });

  // Read a file as UTF-8 text (used for mock HTML preview)
  ipcMain.handle('fs:read-file', async (_event, filePath: string) => {
    try {
      // Reject paths with directory traversal
      if (filePath.includes('..')) {
        return { success: false, content: null, error: 'Path traversal not allowed' };
      }

      const resolvedPath = path.resolve(filePath);

      // Verify file exists and check size
      const stats = await fs.stat(resolvedPath);
      if (!stats.isFile()) {
        return { success: false, content: null, error: 'Path is not a file' };
      }

      const MAX_FILE_SIZE = 1024 * 1024; // 1MB
      if (stats.size > MAX_FILE_SIZE) {
        return { success: false, content: null, error: 'File exceeds 1MB size limit' };
      }

      const content = await fs.readFile(resolvedPath, 'utf-8');
      return { success: true, content, error: null };
    } catch (err) {
      const error = err as NodeJS.ErrnoException;
      let message = error.message || 'Unknown error';
      if (error.code === 'ENOENT') message = 'File not found';
      if (error.code === 'EACCES') message = 'Permission denied';
      return { success: false, content: null, error: message };
    }
  });

  // Create directory for path input dialog
  ipcMain.handle('fs:create-directory', async (_event, parentPath: string, folderName: string) => {
    try {
      // Expand ~ to home directory
      let resolvedParent = parentPath;
      if (resolvedParent.startsWith('~')) {
        resolvedParent = resolvedParent.replace('~', os.homedir());
      }

      // Validate folder name
      const invalidChars = /[<>:"|?*\/\\]/;
      if (invalidChars.test(folderName) || !folderName.trim()) {
        return { success: false, path: null, error: 'Invalid folder name' };
      }

      const fullPath = path.join(resolvedParent, folderName.trim());

      // Check if already exists
      try {
        await fs.access(fullPath);
        return { success: false, path: null, error: `Folder "${folderName}" already exists` };
      } catch { /* doesn't exist, proceed */ }

      await fs.mkdir(fullPath, { recursive: false });
      return { success: true, path: fullPath, error: null };
    } catch (err) {
      const error = err as NodeJS.ErrnoException;
      let message = error.message || 'Unknown error';
      if (error.code === 'EACCES') message = 'Permission denied';
      if (error.code === 'ENOENT') message = 'Parent directory does not exist';
      return { success: false, path: null, error: message };
    }
  });
}
