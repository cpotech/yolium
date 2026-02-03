// Git configuration type definitions

export interface GitConfig {
  name: string;
  email: string;
  githubPat?: string;  // Optional GitHub Personal Access Token for HTTPS auth
  openaiApiKey?: string;  // Optional OpenAI API Key for Codex agent
}

export interface GitConfigWithPat extends GitConfig {
  hasPat?: boolean;  // Used by IPC to indicate PAT exists without exposing it
  hasOpenaiKey?: boolean;  // Used by IPC to indicate OpenAI key exists without exposing it
  sources?: {
    name?: 'system' | 'environment' | 'yolium';
    email?: 'system' | 'environment' | 'yolium';
    githubPat?: 'system' | 'environment' | 'yolium';
    openaiApiKey?: 'system' | 'environment' | 'yolium';
  };
}
