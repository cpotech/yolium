/**
 * @module src/ipc
 * IPC handler registration. Aggregates all IPC handlers into a single entry point.
 */

import { ipcMain, dialog, shell } from 'electron';
import { registerAppHandlers, performCleanup, isCleanupDone } from './app-handlers';
import { registerTerminalHandlers } from './terminal-handlers';
import { registerTabHandlers } from './tab-handlers';
import { registerDialogHandlers } from './dialog-handlers';
import { registerFilesystemHandlers } from './filesystem-handlers';
import { registerGitHandlers } from './git-handlers';
import { registerDockerHandlers } from './docker-handlers';
import { registerContainerHandlers } from './container-handlers';
import { registerKanbanHandlers } from './kanban-handlers';
import { registerAgentHandlers } from './agent-handlers';
import { registerCacheHandlers } from './cache-handlers';
import { registerWhisperHandlers } from './whisper-handlers';
import { registerCodeReviewHandlers } from './code-review-handlers';

/**
 * Register all IPC handlers.
 * Call this once during app initialization.
 */
export function registerAllHandlers(): void {
  registerAppHandlers(ipcMain, shell);
  registerTerminalHandlers(ipcMain);
  registerTabHandlers(ipcMain);
  registerDialogHandlers(ipcMain, dialog);
  registerFilesystemHandlers(ipcMain);
  registerGitHandlers(ipcMain);
  registerDockerHandlers(ipcMain);
  registerContainerHandlers(ipcMain);
  registerKanbanHandlers(ipcMain);
  registerAgentHandlers(ipcMain);
  registerCacheHandlers(ipcMain);
  registerWhisperHandlers(ipcMain);
  registerCodeReviewHandlers(ipcMain);
}

// Re-export cleanup utilities for use in main.ts lifecycle hooks
export { performCleanup, isCleanupDone };
