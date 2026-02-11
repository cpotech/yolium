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
  agentQuestion?: string;
  agentQuestionOptions?: string[];
  worktreePath?: string;
  mergeStatus?: MergeStatus;
  prUrl?: string;
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
