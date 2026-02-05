/**
 * @module src/ipc/cache-handlers
 * Project cache management IPC handlers.
 */

import type { IpcMain } from 'electron';
import { createLogger } from '../lib/logger';
import {
  listProjectCaches,
  getProjectCacheStats,
  deleteProjectCache,
  cleanupOrphanedCaches,
  cleanupStaleCaches,
} from '../lib/docker';

const logger = createLogger('cache-handlers');

/**
 * Register cache management IPC handlers.
 * @param ipcMain - Electron IPC main instance
 */
export function registerCacheHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('cache:list', () => {
    logger.info('IPC: cache:list');
    return listProjectCaches();
  });

  ipcMain.handle('cache:stats', () => {
    logger.info('IPC: cache:stats');
    return getProjectCacheStats();
  });

  ipcMain.handle('cache:delete', (_event, dirName: string) => {
    logger.info('IPC: cache:delete', { dirName });
    return deleteProjectCache(dirName);
  });

  ipcMain.handle('cache:cleanup-orphaned', () => {
    logger.info('IPC: cache:cleanup-orphaned');
    return cleanupOrphanedCaches();
  });

  ipcMain.handle('cache:cleanup-stale', (_event, maxAgeDays: number = 90) => {
    logger.info('IPC: cache:cleanup-stale', { maxAgeDays });
    return cleanupStaleCaches(maxAgeDays);
  });
}
