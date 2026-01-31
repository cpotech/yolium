// Agent type definitions

export type AgentType = 'claude' | 'opencode' | 'codex' | 'shell';

// Agents that support code review (have review capabilities)
export type ReviewAgentType = 'claude' | 'opencode' | 'codex';

// Code review job status
export type CodeReviewStatus = 'starting' | 'running' | 'completed' | 'failed';

export interface CodeReviewJob {
  id: string;
  repoUrl: string;
  branch: string;
  agent: ReviewAgentType;
  status: CodeReviewStatus;
  error?: string;
}
