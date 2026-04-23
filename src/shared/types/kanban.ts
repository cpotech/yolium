// src/types/kanban.ts
import type { KanbanAgentProvider } from './agent';

export type AgentStatus =
  | 'idle'
  | 'running'
  | 'waiting'
  | 'interrupted'
  | 'completed'
  | 'failed';

export type KanbanColumn = 'backlog' | 'ready' | 'in-progress' | 'verify' | 'done';

export type CommentSource = 'user' | 'agent' | 'system';

export interface KanbanComment {
  id: string;
  source: CommentSource;
  text: string;
  timestamp: string;
  options?: string[];
}

export type MergeStatus = 'unmerged' | 'merged' | 'conflict';

/**
 * Caveman Mode — a terseness directive appended to agent system prompts to
 * reduce output tokens. `off` is the default and produces no change.
 */
export type CavemanMode = 'off' | 'lite' | 'full' | 'ultra';

export interface TestSpec {
  file: string;
  description: string;
  specs: string[];
}

export interface KanbanAttachment {
  id: string;
  itemId: string;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

export interface KanbanItem {
  id: string;
  title: string;
  description: string;
  column: KanbanColumn;
  branch?: string;
  agentProvider: KanbanAgentProvider;
  agentType?: string;
  order: number;
  model?: string;
  agentStatus: AgentStatus;
  activeAgentName?: string;
  lastAgentName?: string;
  agentQuestion?: string;
  agentQuestionOptions?: string[];
  testSpecs?: TestSpec[];
  worktreePath?: string;
  mergeStatus?: MergeStatus;
  prUrl?: string;
  verified?: boolean;
  cavemanMode?: CavemanMode | 'inherit';
  attachments?: KanbanAttachment[];
  comments: KanbanComment[];
  createdAt: string;
  updatedAt: string;
}

export interface KanbanBoard {
  id: string;
  projectPath: string;
  items: KanbanItem[];
  lastAgentName?: string;
  createdAt: string;
  updatedAt: string;
}
