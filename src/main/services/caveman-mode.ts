/**
 * @module src/main/services/caveman-mode
 * Native Caveman Mode — a terseness directive appended to agent system
 * prompts to reduce output tokens. Inspired by
 * https://github.com/JuliusBrussee/caveman, implemented in-tree with no
 * external skill install required.
 *
 * Pure functions only (aside from the file read inside resolveCavemanMode).
 */

import type { KanbanItem, CavemanMode } from '@shared/types/kanban';
import { loadProjectConfig } from './project-config';

const PRESERVATION_CLAUSE =
  'Keep code blocks, file paths, identifiers, and `@@YOLIUM:` JSON fully intact and unchanged.';

/**
 * Prompt snippets per caveman level. `off` is empty — inserting it is a
 * no-op and the assembled prompt is byte-identical to no caveman mode at all.
 */
export const CAVEMAN_DIRECTIVES: Record<CavemanMode, string> = {
  off: '',
  lite: `## Caveman Mode (lite)

Be terse. Use short sentences. Drop filler and restatement. Prefer nouns and verbs over adjectives and adverbs. Aim for roughly 25% fewer tokens than your normal output.

${PRESERVATION_CLAUSE}`,
  full: `## Caveman Mode (full)

Write in caveman grammar. Drop articles (a, an, the), pronouns where possible, and auxiliary verbs. Prefer imperatives and short fragments. Combine related ideas into a single clipped sentence. Aim for roughly 75% fewer tokens than your normal output.

${PRESERVATION_CLAUSE}`,
  ultra: `## Caveman Mode (ultra)

Fragments only. Bullet-style. Absolute minimum words. Drop every word that is not load-bearing. No full sentences. Aim for roughly 85% fewer tokens than your normal output.

${PRESERVATION_CLAUSE}`,
};

/**
 * Return the directive text for a given caveman level. Returns empty string
 * for `off` so callers can unconditionally concatenate.
 */
export function buildCavemanDirective(mode: CavemanMode): string {
  return CAVEMAN_DIRECTIVES[mode] ?? '';
}

function isCavemanMode(value: unknown): value is CavemanMode {
  return value === 'off' || value === 'lite' || value === 'full' || value === 'ultra';
}

/**
 * Resolve the effective caveman mode for an agent run.
 *
 * Order of precedence:
 * 1. Concrete per-item mode (`off | lite | full | ultra`) wins outright.
 * 2. Otherwise (undefined or `'inherit'`), fall back to the project mode
 *    from `.yolium.json`.
 * 3. If the project config is missing or does not specify a mode, return `off`.
 */
export function resolveCavemanMode(
  item: Pick<KanbanItem, 'cavemanMode'> | null | undefined,
  projectPath: string,
): CavemanMode {
  const itemMode = item?.cavemanMode;
  if (isCavemanMode(itemMode)) {
    return itemMode;
  }
  // undefined or 'inherit' → fall back to project
  const config = loadProjectConfig(projectPath);
  const projectMode = config?.cavemanMode;
  if (isCavemanMode(projectMode)) {
    return projectMode;
  }
  return 'off';
}
