// src/lib/agent-loader.ts
// eslint-disable-next-line @typescript-eslint/no-var-requires
const matter = require('gray-matter');
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AgentDefinition } from '../types/agent';

export interface ParsedAgent extends AgentDefinition {
  systemPrompt: string;
}

const VALID_MODELS = ['opus', 'sonnet', 'haiku'] as const;

export function parseAgentDefinition(markdown: string): ParsedAgent {
  const { data, content } = matter(markdown);

  // Validate required fields
  if (!data.name || !data.description || !data.model || !data.tools) {
    throw new Error('Agent definition missing required fields: name, description, model, tools');
  }

  // Validate model
  if (!VALID_MODELS.includes(data.model)) {
    throw new Error(`Invalid model "${data.model}". Must be one of: ${VALID_MODELS.join(', ')}`);
  }

  // Validate tools is array
  if (!Array.isArray(data.tools)) {
    throw new Error('tools must be an array');
  }

  return {
    name: data.name,
    description: data.description,
    model: data.model,
    tools: data.tools,
    systemPrompt: content.trim(),
  };
}

export function loadAgentDefinition(agentName: string): ParsedAgent {
  // Agents are in src/agents/ relative to project root
  // In production, they're bundled with the app
  const agentPath = path.join(__dirname, '..', 'agents', `${agentName}.md`);

  if (!fs.existsSync(agentPath)) {
    throw new Error(`Agent definition not found: ${agentName}`);
  }

  const content = fs.readFileSync(agentPath, 'utf-8');
  return parseAgentDefinition(content);
}

export function listAgents(): string[] {
  const agentsDir = path.join(__dirname, '..', 'agents');

  if (!fs.existsSync(agentsDir)) {
    return [];
  }

  return fs.readdirSync(agentsDir)
    .filter(f => f.endsWith('.md') && !f.startsWith('_') && f !== 'README.md')
    .map(f => f.replace('.md', ''));
}
