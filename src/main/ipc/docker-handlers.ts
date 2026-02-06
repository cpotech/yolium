/**
 * @module src/ipc/docker-handlers
 * Docker availability, setup, and image management IPC handlers.
 */

import { BrowserWindow, type IpcMain } from 'electron';
import { createLogger } from '@main/lib/logger';
import {
  isDockerAvailable,
  ensureImage,
  removeAllYoliumContainers,
  removeYoliumImage,
} from '@main/docker';
import {
  detectDockerState,
  startDockerDesktop,
  startDockerEngine,
} from '@main/services/docker-setup';

const logger = createLogger('docker-handlers');

/**
 * Register Docker IPC handlers.
 * @param ipcMain - Electron IPC main instance
 */
export function registerDockerHandlers(ipcMain: IpcMain): void {
  // Docker availability check
  ipcMain.handle('docker:available', () => {
    logger.debug('IPC: docker:available');
    return isDockerAvailable();
  });

  // Image pull/build with progress
  ipcMain.handle('docker:ensure-image', (_event, imageName: string) => {
    logger.info('IPC: docker:ensure-image', { imageName });
    return ensureImage(imageName, (msg) => {
      // Send progress to renderer
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) {
        win.webContents.send('docker:build-progress', msg);
      }
    });
  });

  // Docker setup operations
  ipcMain.handle('docker:detect-state', () => {
    logger.debug('IPC: docker:detect-state');
    return detectDockerState();
  });

  ipcMain.handle('docker:start-desktop', () => {
    logger.info('IPC: docker:start-desktop');
    return startDockerDesktop();
  });

  ipcMain.handle('docker:start-engine', () => {
    logger.info('IPC: docker:start-engine');
    return startDockerEngine();
  });

  // Docker rebuild operations
  ipcMain.handle('docker:remove-all-containers', () => {
    logger.info('IPC: docker:remove-all-containers');
    return removeAllYoliumContainers();
  });

  ipcMain.handle('docker:remove-image', () => {
    logger.info('IPC: docker:remove-image');
    return removeYoliumImage();
  });
}
