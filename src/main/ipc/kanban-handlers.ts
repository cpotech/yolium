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
} from '@main/stores/kanban-store';
import { deleteWorktree } from '@main/git/git-worktree';
import { backfillWorktreePaths } from '@main/services/agent-runner';
import { createLogger } from '@main/lib/logger';
import type { KanbanItem } from '@shared/types/kanban';

const logger = createLogger('kanban-handlers');

/**
 * Register kanban IPC handlers.
 * @param ipcMain - Electron IPC main instance
 */
export function registerKanbanHandlers(ipcMain: IpcMain): void {
  // Get or create board for a project (backfills worktree paths for existing items)
  ipcMain.handle('kanban:get-board', (_event, projectPath: string) => {
    backfillWorktreePaths(projectPath);
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

  // Delete item (also cleans up associated worktree if present)
  ipcMain.handle('kanban:delete-item', (event, projectPath: string, itemId: string) => {
    const board = getOrCreateBoard(projectPath);

    // Clean up worktree before deleting the item
    const item = board.items.find(i => i.id === itemId);
    if (item?.worktreePath) {
      try {
        deleteWorktree(projectPath, item.worktreePath);
        logger.info('Cleaned up worktree on item delete', { itemId, worktreePath: item.worktreePath });
      } catch (err) {
        logger.error('Failed to clean up worktree on item delete', {
          itemId,
          worktreePath: item.worktreePath,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const result = deleteItem(board, itemId);
    event.sender.send('kanban:board-updated', projectPath);
    return result;
  });
}
