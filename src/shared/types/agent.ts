// Agent type definitions

// Agent provider: which CLI tool runs the agent (claude, opencode, codex, shell)
export type AgentProvider = 'claude' | 'opencode' | 'codex' | 'shell';

// Agent providers valid for Kanban work items (no shell - shell is for interactive containers only)
export type KanbanAgentProvider = Exclude<AgentProvider, 'shell'>;

export interface AgentTokenUsage {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

// Agent definition from markdown frontmatter
export interface AgentDefinition {
  name: string;
  description: string;
  model: 'opus' | 'sonnet' | 'haiku';
  tools: string[];
  timeout?: number; // Inactivity timeout in minutes (default: 30)
  order?: number; // SDLC order for sorting (1 = plan, 2 = code, 3 = verify, etc.)
  isBuiltin?: boolean; // Whether this is a built-in agent (vs custom user-defined)
}

// Input type for saving custom agent definitions
export interface CustomAgentInput {
  name: string;
  description: string;
  model: 'opus' | 'sonnet' | 'haiku';
  tools: string[];
  timeout?: number;
  order?: number;
  systemPrompt: string;
}

// Protocol message types from agent stdout
export type ProtocolMessageType = 'ask_question' | 'create_item' | 'update_description' | 'add_comment' | 'set_test_specs' | 'complete' | 'error' | 'progress' | 'run_result' | 'action';

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
  description?: string;
  branch?: string;
  agentProvider: KanbanAgentProvider;
  order: number;
  model?: string;
}

export interface UpdateDescriptionMessage extends ProtocolMessage {
  type: 'update_description';
  description: string;
}

export interface AddCommentMessage extends ProtocolMessage {
  type: 'add_comment';
  text: string;
}

export interface SetTestSpecsMessage extends ProtocolMessage {
  type: 'set_test_specs';
  specs: Array<{
    file: string;
    description: string;
    specs: string[];
  }>;
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

export interface RunResultMessage extends ProtocolMessage {
  type: 'run_result';
  outcome: 'completed' | 'no_action' | 'failed' | 'timeout';
  summary: string;
  tokensUsed?: number;
}

export interface ActionMessage extends ProtocolMessage {
  type: 'action';
  action: string;
  data: Record<string, unknown>;
  timestamp?: string;
}

// Claude OAuth usage data (5-hour and 7-day rate limit utilization)
export interface ClaudeUsageData {
  fiveHour: { utilization: number; resetsAt: string };
  sevenDay: { utilization: number; resetsAt: string };
}

export interface ClaudeUsageSnapshot {
  hasOAuth: boolean;
  usage: ClaudeUsageData | null;
}

export type ClaudeUsageStatus = 'loading' | 'ready' | 'unavailable' | 'no-oauth';

export type ClaudeUsageState =
  | {
    status: 'loading';
    hasOAuth: true;
    usage: null;
  }
  | {
    status: 'ready';
    hasOAuth: true;
    usage: ClaudeUsageData;
  }
  | {
    status: 'unavailable';
    hasOAuth: true;
    usage: null;
  }
  | {
    status: 'no-oauth';
    hasOAuth: false;
    usage: null;
  };
