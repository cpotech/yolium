/**
 * @module src/ipc/kanban-handlers
 * Kanban board IPC handlers.
 */

import type { IpcMain } from 'electron';
import {
  getOrCreateBoard,
  addItem,
  updateItem,
  addComment,
  deleteItem,
} from '../lib/kanban-store';
import type { KanbanItem } from '../types/kanban';

/**
 * Register kanban IPC handlers.
 * @param ipcMain - Electron IPC main instance
 */
export function registerKanbanHandlers(ipcMain: IpcMain): void {
  // Get or create board for a project
  ipcMain.handle('kanban:get-board', (_event, projectPath: string) => {
    return getOrCreateBoard(projectPath);
  });

  // Add item to board
  ipcMain.handle('kanban:add-item', (event, projectPath: string, params: {
    title: string;
    description: string;
    branch?: string;
    agentType: 'claude' | 'codex' | 'opencode';
    order: number;
    model?: string;
  }) => {
    const board = getOrCreateBoard(projectPath);
    const result = addItem(board, params);
    event.sender.send('kanban:board-updated', projectPath);
    return result;
  });

  // Update item
  ipcMain.handle('kanban:update-item', (event, projectPath: string, itemId: string, updates: Partial<KanbanItem>) => {
    const board = getOrCreateBoard(projectPath);
    const result = updateItem(board, itemId, updates);
    if (!result) {
      throw new Error(`Failed to update item ${itemId}: item not found or invalid update`);
    }
    event.sender.send('kanban:board-updated', projectPath);
    return result;
  });

  // Add comment to item
  ipcMain.handle('kanban:add-comment', (event, projectPath: string, itemId: string, source: 'user' | 'agent' | 'system', text: string) => {
    const board = getOrCreateBoard(projectPath);
    const result = addComment(board, itemId, source, text);
    if (!result) {
      throw new Error(`Failed to add comment to item ${itemId}: item not found`);
    }
    event.sender.send('kanban:board-updated', projectPath);
    return result;
  });

  // Delete item
  ipcMain.handle('kanban:delete-item', (event, projectPath: string, itemId: string) => {
    const board = getOrCreateBoard(projectPath);
    const result = deleteItem(board, itemId);
    event.sender.send('kanban:board-updated', projectPath);
    return result;
  });
}
