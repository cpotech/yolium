/**
 * @module src/ipc/agent-handlers
 * Agent start, resume, stop, and answer IPC handlers.
 */

import { BrowserWindow, type IpcMain } from 'electron';
import { createLogger } from '@main/lib/logger';
import { getAgentSession } from '@main/docker';
import {
  startAgent,
  resumeAgent,
  stopAgent,
  answerAgentQuestion,
  getAgentEvents,
  getSessionByItemId,
  recoverInterruptedAgents,
} from '@main/services/agent-runner';
import { listAgents, loadAgentDefinition, isBuiltinAgent } from '@main/services/agent-loader';
import { saveCustomAgent, deleteCustomAgent } from '@main/stores/custom-agent-store';
import { readLog, deleteLog } from '@main/stores/workitem-log-store';
import type { KanbanItem } from '@shared/types/kanban';
import type { AgentDefinition, CustomAgentInput } from '@shared/types/agent';

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
    agentProvider: string;
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

      events.on('commentAdded', () => {
        win?.webContents.send('kanban:board-updated', params.projectPath);
      });

      events.on('descriptionUpdated', () => {
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
    agentProvider: string;
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

      events.on('commentAdded', () => {
        win?.webContents.send('kanban:board-updated', params.projectPath);
      });

      events.on('descriptionUpdated', () => {
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
    if (!session) return null;

    const containerSession = getAgentSession(session.id);
    return {
      sessionId: session.id,
      cumulativeUsage: containerSession?.cumulativeUsage ?? { inputTokens: 0, outputTokens: 0, costUsd: 0 },
    };
  });

  // Recover interrupted agents
  ipcMain.handle('agent:recover', (_event, projectPath: string) => {
    logger.info('IPC: agent:recover', { projectPath });
    return recoverInterruptedAgents(projectPath);
  });

  // List available agent definitions
  ipcMain.handle('agent:list-definitions', () => {
    const agentNames = listAgents();
    const definitions: AgentDefinition[] = [];
    for (const name of agentNames) {
      try {
        const { systemPrompt: _, ...def } = loadAgentDefinition(name);
        definitions.push({ ...def, isBuiltin: isBuiltinAgent(name) });
      } catch (err) {
        logger.error('Failed to load agent definition', { name, error: String(err) });
      }
    }
    // Sort by order field (SDLC order), agents without order go to the end
    definitions.sort((a, b) => {
      if (a.order != null && b.order != null) {
        return a.order - b.order;
      }
      if (a.order != null) return -1;
      if (b.order != null) return 1;
      return a.name.localeCompare(b.name);
    });
    return definitions;
  });

  // Save custom agent definition
  ipcMain.handle('agent:save-definition', (_event, def: CustomAgentInput) => {
    logger.info('IPC: agent:save-definition', { name: def.name });
    saveCustomAgent(def);
  });

  // Delete custom agent definition
  ipcMain.handle('agent:delete-definition', (_event, name: string) => {
    logger.info('IPC: agent:delete-definition', { name });
    deleteCustomAgent(name);
  });

  // Load full agent definition (including systemPrompt and isBuiltin flag)
  ipcMain.handle('agent:load-full-definition', (_event, name: string) => {
    logger.info('IPC: agent:load-full-definition', { name });
    const def = loadAgentDefinition(name);
    return { ...def, isBuiltin: isBuiltinAgent(name) };
  });

  // Read persistent log for a work item
  ipcMain.handle('agent:read-log', (_event, projectPath: string, itemId: string) => {
    return readLog(projectPath, itemId);
  });

  // Clear persistent log for a work item
  ipcMain.handle('agent:clear-log', (_event, projectPath: string, itemId: string) => {
    return deleteLog(projectPath, itemId);
  });
}
