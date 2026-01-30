// Agent type definitions

export type AgentType = 'claude' | 'opencode' | 'shell';

// Agents that support code review (have review capabilities)
export type ReviewAgentType = 'claude' | 'opencode';

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
