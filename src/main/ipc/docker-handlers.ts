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
  getYoliumImageInfo,
} from '@main/docker';
import {
  detectDockerState,
  startDockerDesktop,
  startDockerEngine,
} from '@main/services/docker-setup';

const logger = createLogger('docker-handlers');
const mockDockerForE2E = process.env.YOLIUM_E2E_MOCK_DOCKER === '1';

/**
 * Register Docker IPC handlers.
 * @param ipcMain - Electron IPC main instance
 */
export function registerDockerHandlers(ipcMain: IpcMain): void {
  if (mockDockerForE2E) {
    logger.info('Using mocked Docker IPC handlers for E2E mode');
  }

  // Docker availability check
  ipcMain.handle('docker:available', () => {
    logger.debug('IPC: docker:available');
    if (mockDockerForE2E) return true;
    return isDockerAvailable();
  });

  // Image pull/build with progress
  ipcMain.handle('docker:ensure-image', (_event, imageName: string) => {
    logger.info('IPC: docker:ensure-image', { imageName });
    if (mockDockerForE2E) return Promise.resolve();
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
    if (mockDockerForE2E) {
      return { installed: true, running: true, desktopPath: null };
    }
    return detectDockerState();
  });

  ipcMain.handle('docker:start-desktop', () => {
    logger.info('IPC: docker:start-desktop');
    if (mockDockerForE2E) return true;
    return startDockerDesktop();
  });

  ipcMain.handle('docker:start-engine', () => {
    logger.info('IPC: docker:start-engine');
    if (mockDockerForE2E) return true;
    return startDockerEngine();
  });

  // Docker rebuild operations
  ipcMain.handle('docker:remove-all-containers', () => {
    logger.info('IPC: docker:remove-all-containers');
    if (mockDockerForE2E) return Promise.resolve();
    return removeAllYoliumContainers();
  });

  ipcMain.handle('docker:remove-image', () => {
    logger.info('IPC: docker:remove-image');
    if (mockDockerForE2E) return Promise.resolve();
    return removeYoliumImage();
  });

  ipcMain.handle('docker:get-image-info', () => {
    logger.debug('IPC: docker:get-image-info');
    if (mockDockerForE2E) return null;
    return getYoliumImageInfo();
  });
}
