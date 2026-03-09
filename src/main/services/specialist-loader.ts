/**
 * @module src/main/services/specialist-loader
 * Load and validate specialist CRON agent definitions from Markdown + YAML frontmatter.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import matter from 'gray-matter';
import cron from 'node-cron';
import type {
  SpecialistDefinition,
  ScheduleConfig,
  MemoryStrategy,
  MemoryConfig,
  EscalationConfig,
} from '@shared/types/schedule';

const VALID_MODELS = ['opus', 'sonnet', 'haiku'];
const VALID_MEMORY_STRATEGIES: MemoryStrategy[] = ['distill_daily', 'distill_weekly', 'raw'];

/**
 * Get the directory containing specialist CRON agent definitions.
 * In dev: src/agents/cron/
 * In prod: resources/agents/cron/
 */
export function getSpecialistsDir(): string {
  // Check for bundled resources first (production)
  const resourcePath = path.join(process.resourcesPath || '', 'agents', 'cron');
  if (fs.existsSync(resourcePath)) {
    return resourcePath;
  }
  // Development: relative to project root
  return path.join(__dirname, '..', '..', 'agents', 'cron');
}

/**
 * Validate an array of schedule configurations.
 * Returns true if all cron expressions are valid.
 */
export function validateSchedules(schedules: ScheduleConfig[]): boolean {
  for (const schedule of schedules) {
    if (!cron.validate(schedule.cron)) {
      return false;
    }
  }
  return true;
}

/**
 * Parse a specialist definition from Markdown with YAML frontmatter.
 */
export function parseSpecialistDefinition(markdown: string): SpecialistDefinition {
  const { data, content } = matter(markdown);

  // Validate required fields
  if (!data.name || !data.description || !data.model || !data.tools) {
    throw new Error(`Specialist definition missing required fields: name, description, model, tools`);
  }

  if (!VALID_MODELS.includes(data.model)) {
    throw new Error(`Invalid model "${data.model}". Must be one of: ${VALID_MODELS.join(', ')}`);
  }

  // Parse schedules
  const schedules: ScheduleConfig[] = [];
  if (data.schedules && Array.isArray(data.schedules)) {
    for (const s of data.schedules) {
      schedules.push({
        type: s.type,
        cron: s.cron,
        enabled: s.enabled !== false,
      });
    }
  } else if (!data.schedules) {
    throw new Error(`Specialist "${data.name}" missing required schedules field`);
  }

  // Parse memory config
  const memoryData = data.memory || {};
  const memoryStrategy = memoryData.strategy || 'raw';
  if (!VALID_MEMORY_STRATEGIES.includes(memoryStrategy)) {
    throw new Error(`Invalid memory strategy "${memoryStrategy}". Must be one of: ${VALID_MEMORY_STRATEGIES.join(', ')}`);
  }

  const memory: MemoryConfig = {
    strategy: memoryStrategy,
    maxEntries: memoryData.maxEntries || 500,
    retentionDays: memoryData.retentionDays || 90,
  };

  // Parse escalation config
  const escalationData = data.escalation || {};
  const escalation: EscalationConfig = {
    onFailure: escalationData.onFailure,
    onPattern: escalationData.onPattern,
  };

  // Parse prompt templates
  const promptTemplates: Record<string, string> = {};
  if (data.promptTemplates && typeof data.promptTemplates === 'object') {
    for (const [key, value] of Object.entries(data.promptTemplates)) {
      if (typeof value === 'string') {
        promptTemplates[key] = value;
      }
    }
  }

  return {
    name: data.name,
    description: data.description,
    model: data.model,
    tools: data.tools,
    timeout: typeof data.timeout === 'number' && data.timeout > 0 ? data.timeout : undefined,
    systemPrompt: content.trim(),
    schedules,
    memory,
    escalation,
    promptTemplates,
  };
}

/**
 * List all specialist names (without .md extension) in the cron directory.
 * Excludes files starting with _ and README.
 */
export function listSpecialists(): string[] {
  const dir = getSpecialistsDir();
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.md') && !f.startsWith('_') && f !== 'README.md')
    .map(f => f.replace('.md', ''));
}

/**
 * Load a specialist definition by name.
 */
export function loadSpecialist(name: string): SpecialistDefinition {
  const dir = getSpecialistsDir();
  const filePath = path.join(dir, `${name}.md`);
  const content = fs.readFileSync(filePath, 'utf-8');
  return parseSpecialistDefinition(content);
}
