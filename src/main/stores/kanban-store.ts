// src/lib/kanban-store.ts
// Re-export shim: all implementation moved to yolium-db.ts.
// Consumer files (kanban-handlers, agent-runner, etc.) require zero import changes.

export {
  normalizeForHash,
  createBoard,
  getBoard,
  getOrCreateBoard,
  updateBoard,
  addItem,
  updateItem,
  addComment,
  buildConversationHistory,
  deleteItem,
  deleteItems,
  deleteBoard,
  saveAttachment,
  readAttachment,
  getAttachmentPath,
  listAttachments,
  deleteAttachment,
  deleteItemAttachments,
  deleteProjectAttachments,
  copyAttachmentsToWorktree,
} from './yolium-db';

export type { NewItemParams } from './yolium-db';
