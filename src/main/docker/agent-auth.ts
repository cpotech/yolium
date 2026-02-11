/**
 * @module src/main/docker/agent-auth
 * Shared auth checks for agent providers.
 */

import { loadGitConfig, hasHostClaudeOAuth, hasHostCodexOAuth } from '@main/git/git-config';

/**
 * Check whether an agent provider has valid authentication configured.
 * OpenCode always returns authenticated because free models are available.
 */
export function checkAgentAuth(agent: string): { authenticated: boolean } {
  const storedConfig = loadGitConfig();

  if (agent === 'claude') {
    const hasApiKey = !!(storedConfig?.anthropicApiKey || process.env.ANTHROPIC_API_KEY);
    const hasOAuth = !!(storedConfig?.useClaudeOAuth && hasHostClaudeOAuth());
    return { authenticated: hasApiKey || hasOAuth };
  }

  if (agent === 'opencode') {
    return { authenticated: true };
  }

  if (agent === 'codex') {
    const hasApiKey = !!(storedConfig?.openaiApiKey || process.env.OPENAI_API_KEY);
    const hasOAuth = !!(storedConfig?.useCodexOAuth && hasHostCodexOAuth());
    return { authenticated: hasApiKey || hasOAuth };
  }

  return { authenticated: false };
}
