// src/lib/agent-loader.ts
// eslint-disable-next-line @typescript-eslint/no-var-requires
const matter = require('gray-matter');
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AgentDefinition } from '@shared/types/agent';

export interface ParsedAgent extends AgentDefinition {
  systemPrompt: string;
}

const VALID_MODELS = ['opus', 'sonnet', 'haiku'] as const;

/**
 * Get the agents directory path.
 * Works in:
 * - Development: uses app.getAppPath() -> src/agents
 * - Production: uses process.resourcesPath -> resources/agents
 * - Test environment: fallback to __dirname -> ../agents
 */
export function getAgentsDir(): string {
  // Try Electron app path first (development)
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { app } = require('electron');
    const appPath = app.getAppPath();
    const devPath = path.join(appPath, 'src', 'agents');
    if (fs.existsSync(devPath)) {
      return devPath;
    }
  } catch {
    // Electron not available (test environment or non-Electron context)
  }

  // Try production path (process.resourcesPath)
  if (process.resourcesPath) {
    const prodPath = path.join(process.resourcesPath, 'agents');
    if (fs.existsSync(prodPath)) {
      return prodPath;
    }
  }

  // Fallback for test environment or when running directly
  // __dirname is dist/lib in built code, src/lib in dev
  const fallbackPath = path.join(__dirname, '..', 'agents');
  return fallbackPath;
}

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

  // Parse optional timeout (must be a positive number if present)
  const timeout = data.timeout != null && typeof data.timeout === 'number' && data.timeout > 0
    ? data.timeout
    : undefined;

  return {
    name: data.name,
    description: data.description,
    model: data.model,
    tools: data.tools,
    timeout,
    systemPrompt: content.trim(),
  };
}

export function loadAgentDefinition(agentName: string): ParsedAgent {
  const agentsDir = getAgentsDir();
  const agentPath = path.join(agentsDir, `${agentName}.md`);

  if (!fs.existsSync(agentPath)) {
    throw new Error(`Agent definition not found: ${agentName}`);
  }

  const content = fs.readFileSync(agentPath, 'utf-8');
  return parseAgentDefinition(content);
}

export function listAgents(): string[] {
  const agentsDir = getAgentsDir();

  if (!fs.existsSync(agentsDir)) {
    return [];
  }

  return fs.readdirSync(agentsDir)
    .filter(f => f.endsWith('.md') && !f.startsWith('_') && f !== 'README.md')
    .map(f => f.replace('.md', ''));
}
