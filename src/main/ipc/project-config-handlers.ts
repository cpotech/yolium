/**
 * @module src/ipc/project-config-handlers
 * IPC handlers for project-level .yolium.json configuration.
 */

import type { IpcMain } from 'electron';
import { createLogger } from '@main/lib/logger';
import {
  loadProjectConfig,
  saveProjectConfig,
  checkSharedDirExists,
} from '@main/services/project-config';
import type { ProjectConfig } from '@main/services/project-config';

const logger = createLogger('project-config-handlers');

/**
 * Register project config IPC handlers.
 * @param ipcMain - Electron IPC main instance
 */
export function registerProjectConfigHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('project-config:load', (_event, projectPath: string) => {
    logger.info('IPC: project-config:load', { projectPath });
    return loadProjectConfig(projectPath);
  });

  ipcMain.handle('project-config:save', (_event, projectPath: string, config: ProjectConfig) => {
    logger.info('IPC: project-config:save', { projectPath });
    saveProjectConfig(projectPath, config);
  });

  ipcMain.handle('project-config:check-dirs', (_event, projectPath: string, dirs: string[]) => {
    logger.info('IPC: project-config:check-dirs', { projectPath, count: dirs.length });
    const result: Record<string, boolean> = {};
    for (const dir of dirs) {
      result[dir] = checkSharedDirExists(projectPath, dir);
    }
    return result;
  });
}
