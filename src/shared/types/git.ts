// Git configuration type definitions

export interface GitConfig {
  name: string;
  email: string;
  githubPat?: string;  // Optional GitHub Personal Access Token for HTTPS auth
  openaiApiKey?: string;  // Optional OpenAI API Key for Codex agent
  anthropicApiKey?: string;  // Optional Anthropic API Key for Claude/OpenCode agents
  githubLogin?: string;  // GitHub username derived from PAT via API
  useClaudeOAuth?: boolean;  // Use Claude Max OAuth tokens instead of Anthropic API key
}

export interface GitConfigWithPat extends GitConfig {
  hasPat?: boolean;  // Used by IPC to indicate PAT exists without exposing it
  hasOpenaiKey?: boolean;  // Used by IPC to indicate OpenAI key exists without exposing it
  hasAnthropicKey?: boolean;  // Used by IPC to indicate Anthropic key exists without exposing it
  hasClaudeOAuth?: boolean;  // Whether ~/.claude/.credentials.json exists on host with valid tokens
  githubLogin?: string;  // GitHub username derived from PAT
  sources?: {
    name?: 'system' | 'environment' | 'yolium';
    email?: 'system' | 'environment' | 'yolium';
    githubPat?: 'system' | 'environment' | 'yolium';
    openaiApiKey?: 'system' | 'environment' | 'yolium';
    anthropicApiKey?: 'system' | 'environment' | 'yolium';
  };
}
