/**
 * @module src/ipc/code-review-handlers
 * Code review IPC handlers.
 */

import type { IpcMain } from 'electron';
import { createLogger } from '../lib/logger';
import {
  listRemoteBranches,
  checkAgentAuth,
  createCodeReviewContainer,
} from '../lib/docker';

const logger = createLogger('code-review-handlers');

/**
 * Register code review IPC handlers.
 * @param ipcMain - Electron IPC main instance
 */
export function registerCodeReviewHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('code-review:list-branches', (_event, repoUrl: string) => {
    logger.info('IPC: code-review:list-branches', { repoUrl });
    return listRemoteBranches(repoUrl);
  });

  ipcMain.handle('code-review:check-agent-auth', (_event, agent: string) => {
    logger.debug('IPC: code-review:check-agent-auth', { agent });
    return checkAgentAuth(agent);
  });

  ipcMain.handle('code-review:start', (event, repoUrl: string, branch: string, agent: string, gitConfig?: { name: string; email: string }) => {
    logger.info('IPC: code-review:start', { repoUrl, branch, agent });
    return createCodeReviewContainer(event.sender.id, repoUrl, branch, agent, gitConfig);
  });
}
