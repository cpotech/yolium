/**
 * @module src/main/docker/agent-auth
 * Shared auth checks for agent providers.
 */

import { loadGitConfig } from '@main/git/git-config';
import { hasHostClaudeOAuth } from '@main/git/claude-oauth';
import { hasHostCodexOAuth } from '@main/git/codex-oauth';

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

  if (agent === 'openrouter') {
    const hasApiKey = !!(storedConfig?.openrouterApiKey || process.env.OPENROUTER_API_KEY);
    return { authenticated: hasApiKey };
  }

  if (agent === 'xai') {
    const hasApiKey = !!(storedConfig?.xaiApiKey || process.env.XAI_API_KEY);
    return { authenticated: hasApiKey };
  }

  return { authenticated: false };
}
