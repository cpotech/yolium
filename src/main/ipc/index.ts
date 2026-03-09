/**
 * @module src/ipc
 * IPC handler registration. Aggregates all IPC handlers into a single entry point.
 */

import { ipcMain, dialog, shell } from 'electron';
import { createLogger } from '@main/lib/logger';
import { registerAppHandlers, performCleanup, isCleanupDone } from './app-handlers';
import { registerTerminalHandlers } from './terminal-handlers';
import { registerTabHandlers } from './tab-handlers';
import { registerDialogHandlers } from './dialog-handlers';
import { registerFilesystemHandlers } from './filesystem-handlers';
import { registerGitHandlers, GIT_IPC_CHANNELS } from './git-handlers';
import { registerDockerHandlers } from './docker-handlers';
import { registerContainerHandlers } from './container-handlers';
import { registerKanbanHandlers } from './kanban-handlers';
import { registerAgentHandlers } from './agent-handlers';
import { registerCacheHandlers } from './cache-handlers';
import { registerWhisperHandlers } from './whisper-handlers';
import { registerOnboardingHandlers } from './onboarding-handlers';
import { registerProjectConfigHandlers } from './project-config-handlers';
import { registerReportHandlers } from './report-handlers';
import { registerScheduleHandlers } from './schedule-handlers';

const logger = createLogger('ipc');
let handlersRegistered = false;
let registrationAttempts = 0;

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * Register all IPC handlers.
 * Call this once during app initialization.
 */
export function registerAllHandlers(): boolean {
  registrationAttempts += 1;

  if (handlersRegistered) {
    logger.debug('IPC handlers already registered; skipping duplicate registration', {
      attempt: registrationAttempts,
    });
    return false;
  }

  logger.info('Registering IPC handlers', {
    attempt: registrationAttempts,
    gitChannels: GIT_IPC_CHANNELS,
  });

  const handlers = [
    { name: 'app', register: () => registerAppHandlers(ipcMain, shell) },
    { name: 'terminal', register: () => registerTerminalHandlers(ipcMain) },
    { name: 'tabs', register: () => registerTabHandlers(ipcMain) },
    { name: 'dialog', register: () => registerDialogHandlers(ipcMain, dialog) },
    { name: 'filesystem', register: () => registerFilesystemHandlers(ipcMain) },
    { name: 'git', register: () => registerGitHandlers(ipcMain) },
    { name: 'docker', register: () => registerDockerHandlers(ipcMain) },
    { name: 'container', register: () => registerContainerHandlers(ipcMain) },
    { name: 'kanban', register: () => registerKanbanHandlers(ipcMain) },
    { name: 'agent', register: () => registerAgentHandlers(ipcMain) },
    { name: 'cache', register: () => registerCacheHandlers(ipcMain) },
    { name: 'whisper', register: () => registerWhisperHandlers(ipcMain) },
    { name: 'onboarding', register: () => registerOnboardingHandlers(ipcMain) },
    { name: 'project-config', register: () => registerProjectConfigHandlers(ipcMain) },
    { name: 'report', register: () => registerReportHandlers(ipcMain) },
    { name: 'schedule', register: () => registerScheduleHandlers(ipcMain) },
  ] as const;

  for (const handler of handlers) {
    try {
      handler.register();
      logger.debug('Registered IPC handler group', { group: handler.name });
    } catch (error) {
      logger.error('Failed to register IPC handler group', {
        group: handler.name,
        error: getErrorMessage(error),
      });
      throw error;
    }
  }

  handlersRegistered = true;
  logger.info('IPC handlers ready', {
    groups: handlers.length,
    includesGitClone: GIT_IPC_CHANNELS.includes('git:clone'),
  });
  return true;
}

export function areIpcHandlersRegistered(): boolean {
  return handlersRegistered;
}

// Re-export cleanup utilities for use in main.ts lifecycle hooks
export { performCleanup, isCleanupDone };
