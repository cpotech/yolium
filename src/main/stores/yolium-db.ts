// Barrel re-export for backward compatibility.
// All implementation lives in domain-specific modules.
export { getDb, closeDb, normalizeForHash } from './db-connection';
export { createBoard, getBoard, getOrCreateBoard, updateBoard, addItem, updateItem, addComment, buildConversationHistory, deleteItem, deleteItems, deleteBoard } from './kanban-db';
export type { NewItemParams } from './kanban-db';
export { loadProjectRegistry, saveProjectRegistry, registerProject } from './registry-db';
export { getScheduleState, saveScheduleState, updateSpecialistStatus, toggleSpecialist, toggleGlobal, resetSpecialist, appendRun, getRecentRuns, getRunsSince, getRunStats, trimHistory, appendRunLog, getRunLog } from './schedule-db';
export { appendAction, getRecentActions, getActionsByRun, getAllRecentActions, getActionStats } from './actions-db';
export { saveCredentials, loadCredentials, loadRedactedCredentials, deleteCredentials, pruneCredentials } from './credentials-db';