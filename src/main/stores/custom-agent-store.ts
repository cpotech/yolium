/**
 * @module src/main/stores/custom-agent-store
 * CRUD operations for custom agent definitions stored as .md files in ~/.yolium/agents/
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { parseAgentDefinition, type ParsedAgent } from '@main/services/agent-loader';

const VALID_MODELS = ['opus', 'sonnet', 'haiku'] as const;

export interface CustomAgentInput {
  name: string;
  description: string;
  model: 'opus' | 'sonnet' | 'haiku';
  tools: string[];
  timeout?: number;
  order?: number;
  systemPrompt: string;
}

/**
 * Get the custom agents directory (~/.yolium/agents/).
 */
export function getCustomAgentsDir(): string {
  return path.join(os.homedir(), '.yolium', 'agents');
}

/**
 * Sanitize agent name to filesystem-safe kebab-case.
 */
export function sanitizeAgentName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * List custom agent names from a directory.
 * Exported with _ prefix for testability (allows injecting a custom dir).
 */
export function _listCustomAgentsFromDir(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.md') && !f.startsWith('_') && f !== 'README.md')
    .map(f => f.replace('.md', ''));
}

/**
 * List custom agent names from the default custom agents directory.
 */
export function listCustomAgents(): string[] {
  return _listCustomAgentsFromDir(getCustomAgentsDir());
}

/**
 * Load a custom agent definition from a directory.
 */
export function _loadCustomAgentFromDir(dir: string, name: string): ParsedAgent {
  const agentPath = path.join(dir, `${name}.md`);
  if (!fs.existsSync(agentPath)) {
    throw new Error(`Custom agent definition not found: ${name}`);
  }
  const content = fs.readFileSync(agentPath, 'utf-8');
  return parseAgentDefinition(content);
}

/**
 * Load a custom agent definition from the default custom agents directory.
 */
export function loadCustomAgent(name: string): ParsedAgent {
  return _loadCustomAgentFromDir(getCustomAgentsDir(), name);
}

/**
 * Save a custom agent definition to a directory.
 */
export function _saveCustomAgentToDir(dir: string, def: CustomAgentInput): void {
  if (!def.name || !def.name.trim()) {
    throw new Error('Agent name is required');
  }
  if (!def.description || !def.description.trim()) {
    throw new Error('Agent description is required');
  }
  if (!VALID_MODELS.includes(def.model as typeof VALID_MODELS[number])) {
    throw new Error(`Invalid model "${def.model}". Must be one of: ${VALID_MODELS.join(', ')}`);
  }

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const toolsYaml = def.tools.map(t => `  - ${t}`).join('\n');
  const frontmatter = [
    `name: ${def.name}`,
    `description: ${def.description}`,
    `model: ${def.model}`,
    `tools:\n${toolsYaml}`,
  ];
  if (def.timeout != null && def.timeout > 0) {
    frontmatter.push(`timeout: ${def.timeout}`);
  }
  if (def.order != null && def.order > 0) {
    frontmatter.push(`order: ${def.order}`);
  }

  const content = `---\n${frontmatter.join('\n')}\n---\n\n${def.systemPrompt}`;
  fs.writeFileSync(path.join(dir, `${def.name}.md`), content, 'utf-8');
}

/**
 * Save a custom agent definition to the default custom agents directory.
 */
export function saveCustomAgent(def: CustomAgentInput): void {
  _saveCustomAgentToDir(getCustomAgentsDir(), def);
}

/**
 * Delete a custom agent definition from a directory.
 */
export function _deleteCustomAgentFromDir(dir: string, name: string): void {
  const agentPath = path.join(dir, `${name}.md`);
  if (!fs.existsSync(agentPath)) {
    throw new Error(`Custom agent definition not found: ${name}`);
  }
  fs.unlinkSync(agentPath);
}

/**
 * Delete a custom agent definition from the default custom agents directory.
 */
export function deleteCustomAgent(name: string): void {
  _deleteCustomAgentFromDir(getCustomAgentsDir(), name);
}
