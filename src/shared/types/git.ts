// Git configuration type definitions

export interface GitConfig {
  name: string;
  email: string;
  githubPat?: string;  // Optional GitHub Personal Access Token for HTTPS auth
  openaiApiKey?: string;  // Optional OpenAI API Key for Codex agent
  anthropicApiKey?: string;  // Optional Anthropic API Key for Claude/OpenCode agents
  openrouterApiKey?: string;  // Optional OpenRouter API Key for OpenRouter agent
  githubLogin?: string;  // GitHub username derived from PAT via API
  useClaudeOAuth?: boolean;  // Use Claude Max OAuth tokens instead of Anthropic API key
  useCodexOAuth?: boolean;  // Use Codex OAuth (ChatGPT) tokens instead of OpenAI API key
  providerModelDefaults?: Record<string, string>;  // Default model per provider (e.g., {"claude": "claude-opus-4-6", "codex": "o3-mini"})
  providerModels?: Record<string, string[]>;  // Multiple models per provider (first is default)
}

export interface GitConfigWithPat extends GitConfig {
  hasPat?: boolean;  // Used by IPC to indicate PAT exists without exposing it
  hasOpenaiKey?: boolean;  // Used by IPC to indicate OpenAI key exists without exposing it
  hasAnthropicKey?: boolean;  // Used by IPC to indicate Anthropic key exists without exposing it
  hasOpenrouterKey?: boolean;  // Used by IPC to indicate OpenRouter key exists without exposing it
  hasClaudeOAuth?: boolean;  // Whether ~/.claude/.credentials.json exists on host with valid tokens
  hasCodexOAuth?: boolean;  // Whether ~/.codex/auth.json exists on host with valid OAuth tokens
  githubLogin?: string;  // GitHub username derived from PAT
  providerModelDefaults?: Record<string, string>;  // Default model per provider (e.g., {"claude": "claude-opus-4-6", "codex": "o3-mini"})
  providerModels?: Record<string, string[]>;  // Multiple models per provider (first is default)
  sources?: {
    name?: 'system' | 'environment' | 'yolium';
    email?: 'system' | 'environment' | 'yolium';
    githubPat?: 'system' | 'environment' | 'yolium';
    openaiApiKey?: 'system' | 'environment' | 'yolium';
    anthropicApiKey?: 'system' | 'environment' | 'yolium';
    openrouterApiKey?: 'system' | 'environment' | 'yolium';
  };
}
