import type { KanbanColumn } from '@shared/types/kanban';

export const MODEL_MAP: Record<string, string> = {
  opus: 'claude-opus-4-6',
  sonnet: 'claude-sonnet-4-5-20250929',
  haiku: 'claude-haiku-4-5-20251001',
};

/**
 * Determine which kanban column an item moves to on agent completion.
 * - plan-agent -> 'ready' (plan complete, waiting for code agent)
 * - scout-agent -> 'done' (intelligence dossier is a finished deliverable)
 * - all others -> 'verify' (code changes need review)
 */
export function getCompletionColumn(agentName: string): KanbanColumn {
  if (agentName === 'plan-agent') return 'ready';
  if (agentName === 'scout-agent') return 'done';
  return 'verify';
}

/**
 * Resolve the model to use for an agent run.
 * Priority: item-level model > settings default > agent frontmatter model.
 */
export function resolveModel(itemModel: string | undefined, settingsModel: string | undefined, agentModel: string): string {
  const shortName = itemModel || settingsModel || agentModel;
  return MODEL_MAP[shortName] || shortName;
}

/**
 * Get a human-readable model name for display in comments.
 * For Claude, shows the short model name (opus, sonnet, haiku) or the full model ID if overridden.
 * For non-Claude providers, shows the provider's actual model or fallback defaults.
 */
export function getDisplayModel(provider: string, itemModel: string | undefined, settingsModel: string | undefined, agentModel: string): string {
  // If item or settings override is set, use it directly (users now type full model IDs)
  const overrideModel = itemModel || settingsModel;
  if (overrideModel) {
    return overrideModel;
  }

  // No override - use agent frontmatter model with provider-specific fallbacks
  if (provider === 'claude') {
    return agentModel;
  }
  if (provider === 'opencode') {
    return agentModel;
  }
  if (provider === 'codex') {
    return 'codex-default';
  }
  if (provider === 'openrouter') {
    return agentModel;
  }
  return agentModel;
}
