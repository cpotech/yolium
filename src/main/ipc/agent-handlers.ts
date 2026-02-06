/**
 * @module src/ipc/agent-handlers
 * Agent start, resume, stop, and answer IPC handlers.
 */

import { BrowserWindow, type IpcMain } from 'electron';
import { createLogger } from '@main/lib/logger';
import {
  startAgent,
  resumeAgent,
  stopAgent,
  answerAgentQuestion,
  getAgentEvents,
  getSessionByItemId,
  recoverInterruptedAgents,
} from '@main/services/agent-runner';
import type { KanbanItem } from '@shared/types/kanban';

const logger = createLogger('agent-handlers');

/**
 * Register agent IPC handlers.
 * @param ipcMain - Electron IPC main instance
 */
export function registerAgentHandlers(ipcMain: IpcMain): void {
  // Start agent
  ipcMain.handle('agent:start', async (event, params: {
    agentName: string;
    projectPath: string;
    itemId: string;
    goal: string;
  }) => {
    const webContentsId = event.sender.id;
    const win = BrowserWindow.getAllWindows().find(w => w.webContents.id === webContentsId);
    logger.info('IPC: agent:start', { ...params, webContentsId });

    // Output is sent directly from agent-container.ts to webContents (no callback needed here)
    const result = await startAgent({
      webContentsId,
      ...params,
    });

    if (result.error) {
      logger.error('Agent start failed', { error: result.error });
      return result;
    }

    // Set up event forwarding for non-output events
    const events = getAgentEvents(result.sessionId);

    // Notify UI that board was updated (item moved to in-progress)
    win?.webContents.send('kanban:board-updated', params.projectPath);

    if (events) {

      events.on('question', (question: { text: string; options?: string[] }) => {
        win?.webContents.send('agent:question', result.sessionId, question);
        win?.webContents.send('kanban:board-updated', params.projectPath);
      });

      events.on('itemCreated', (item: KanbanItem) => {
        win?.webContents.send('agent:item-created', result.sessionId, item);
        win?.webContents.send('kanban:board-updated', params.projectPath);
      });

      events.on('complete', (summary: string) => {
        win?.webContents.send('agent:complete', result.sessionId, summary);
        win?.webContents.send('kanban:board-updated', params.projectPath);
      });

      events.on('error', (message: string) => {
        win?.webContents.send('agent:error', result.sessionId, message);
        win?.webContents.send('kanban:board-updated', params.projectPath);
      });

      events.on('progress', (progress: { step: string; detail: string; attempt?: number; maxAttempts?: number }) => {
        win?.webContents.send('agent:progress', result.sessionId, progress);
        win?.webContents.send('kanban:board-updated', params.projectPath);
      });
    }

    return result;
  });

  // Resume agent
  ipcMain.handle('agent:resume', async (event, params: {
    agentName: string;
    projectPath: string;
    itemId: string;
    goal: string;
  }) => {
    const webContentsId = event.sender.id;
    const win = BrowserWindow.getAllWindows().find(w => w.webContents.id === webContentsId);
    logger.info('IPC: agent:resume', { ...params, webContentsId });

    // Output is sent directly from agent-container.ts to webContents (no callback needed here)
    const result = await resumeAgent({
      webContentsId,
      ...params,
    });

    if (result.error) {
      logger.error('Agent resume failed', { error: result.error });
      return result;
    }

    // Set up event forwarding for non-output events
    const events = getAgentEvents(result.sessionId);

    // Notify UI that board was updated (item moved to in-progress)
    win?.webContents.send('kanban:board-updated', params.projectPath);

    if (events) {
      events.on('question', (question: { text: string; options?: string[] }) => {
        win?.webContents.send('agent:question', result.sessionId, question);
        win?.webContents.send('kanban:board-updated', params.projectPath);
      });

      events.on('itemCreated', (item: KanbanItem) => {
        win?.webContents.send('agent:item-created', result.sessionId, item);
        win?.webContents.send('kanban:board-updated', params.projectPath);
      });

      events.on('complete', (summary: string) => {
        win?.webContents.send('agent:complete', result.sessionId, summary);
        win?.webContents.send('kanban:board-updated', params.projectPath);
      });

      events.on('error', (message: string) => {
        win?.webContents.send('agent:error', result.sessionId, message);
        win?.webContents.send('kanban:board-updated', params.projectPath);
      });

      events.on('progress', (progress: { step: string; detail: string; attempt?: number; maxAttempts?: number }) => {
        win?.webContents.send('agent:progress', result.sessionId, progress);
        win?.webContents.send('kanban:board-updated', params.projectPath);
      });
    }

    return result;
  });

  // Answer agent question
  ipcMain.handle('agent:answer', (_event, projectPath: string, itemId: string, answer: string) => {
    logger.info('IPC: agent:answer', { projectPath, itemId, answerLength: answer.length });
    answerAgentQuestion(projectPath, itemId, answer);
  });

  // Stop agent
  ipcMain.handle('agent:stop', async (_event, sessionId: string) => {
    logger.info('IPC: agent:stop', { sessionId });
    await stopAgent(sessionId);
  });

  // Get active session for item
  ipcMain.handle('agent:get-active-session', (_event, projectPath: string, itemId: string) => {
    const session = getSessionByItemId(projectPath, itemId);
    return session ? { sessionId: session.id } : null;
  });

  // Recover interrupted agents
  ipcMain.handle('agent:recover', (_event, projectPath: string) => {
    logger.info('IPC: agent:recover', { projectPath });
    return recoverInterruptedAgents(projectPath);
  });
}
