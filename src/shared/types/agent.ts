// Agent type definitions

// Agent provider: which CLI tool runs the agent (claude, opencode, codex, shell)
export type AgentProvider = 'claude' | 'opencode' | 'codex' | 'shell';

// Agent providers valid for Kanban work items (no shell - shell is for interactive containers only)
export type KanbanAgentProvider = Exclude<AgentProvider, 'shell'>;

// Agents that support code review (have review capabilities)
export type ReviewAgentProvider = 'claude' | 'opencode' | 'codex';

// Code review job status
export type CodeReviewStatus = 'starting' | 'running' | 'completed' | 'failed';

export interface CodeReviewJob {
  id: string;
  repoUrl: string;
  branch: string;
  agent: ReviewAgentProvider;
  status: CodeReviewStatus;
  error?: string;
}

// Agent definition from markdown frontmatter
export interface AgentDefinition {
  name: string;
  description: string;
  model: 'opus' | 'sonnet' | 'haiku';
  tools: string[];
  timeout?: number; // Inactivity timeout in minutes (default: 30)
}

// Protocol message types from agent stdout
export type ProtocolMessageType = 'ask_question' | 'create_item' | 'complete' | 'error' | 'progress';

export interface ProtocolMessage {
  type: ProtocolMessageType;
}

export interface AskQuestionMessage extends ProtocolMessage {
  type: 'ask_question';
  text: string;
  options?: string[];
}

export interface CreateItemMessage extends ProtocolMessage {
  type: 'create_item';
  title: string;
  description: string;
  branch?: string;
  agentProvider: KanbanAgentProvider;
  order: number;
  model?: string;
}

export interface CompleteMessage extends ProtocolMessage {
  type: 'complete';
  summary: string;
}

export interface ErrorMessage extends ProtocolMessage {
  type: 'error';
  message: string;
}

export interface ProgressMessage extends ProtocolMessage {
  type: 'progress';
  step: string;
  detail: string;
  attempt?: number;
  maxAttempts?: number;
}
