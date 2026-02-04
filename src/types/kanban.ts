// src/types/kanban.ts

export type AgentStatus =
  | 'idle'
  | 'running'
  | 'waiting'
  | 'interrupted'
  | 'completed'
  | 'failed';

export type KanbanColumn = 'backlog' | 'ready' | 'in-progress' | 'done';

export type CommentSource = 'user' | 'agent' | 'system';

export interface KanbanComment {
  id: string;
  source: CommentSource;
  text: string;
  timestamp: string;
}

export interface KanbanItem {
  id: string;
  title: string;
  description: string;
  column: KanbanColumn;
  branch?: string;
  agentType: 'claude' | 'codex' | 'opencode' | 'shell';
  order: number;
  agentStatus: AgentStatus;
  agentQuestion?: string;
  agentQuestionOptions?: string[];
  comments: KanbanComment[];
  createdAt: string;
  updatedAt: string;
}

export interface KanbanBoard {
  id: string;
  projectPath: string;
  items: KanbanItem[];
  createdAt: string;
  updatedAt: string;
}
