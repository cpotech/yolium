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
  ServiceIntegration,
} from '@shared/types/schedule';

const VALID_MODELS = ['opus', 'sonnet', 'haiku'];
const VALID_MEMORY_STRATEGIES: MemoryStrategy[] = ['distill_daily', 'distill_weekly', 'raw'];

/**
 * Get the directory containing specialist CRON agent definitions.
 * In dev: src/agents/cron/
 * In prod: resources/agents/cron/
 */
export function getSpecialistsDir(): string {
  // Try Electron app path first (development)
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { app } = require('electron');
    const appPath = app.getAppPath();
    const devPath = path.join(appPath, 'src', 'agents', 'cron');
    if (fs.existsSync(devPath)) {
      return devPath;
    }
  } catch {
    // Electron not available (test environment)
  }

  // Try production path (process.resourcesPath)
  if (process.resourcesPath) {
    const prodPath = path.join(process.resourcesPath, 'agents', 'cron');
    if (fs.existsSync(prodPath)) {
      return prodPath;
    }
  }

  // Fallback for test environment
  return path.join(__dirname, '..', 'agents', 'cron');
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
 * Warn if a schedule's cron expression fires more frequently than its declared type implies.
 * For example, a 'daily' type with a cron that fires every 15 minutes is not actually daily.
 */
function warnScheduleMismatch(name: string, schedules: ScheduleConfig[]): void {
  for (const schedule of schedules) {
    if (schedule.type === 'daily') {
      const parts = schedule.cron.trim().split(/\s+/);
      if (parts.length < 5) continue;
      const [minute, hour] = parts;
      // A daily schedule should have specific minute and hour values (not wildcards or intervals)
      const isWildcardOrInterval = (field: string) => field === '*' || field.includes('/');
      if (isWildcardOrInterval(minute) || isWildcardOrInterval(hour)) {
        console.warn(
          `[specialist-loader] Schedule mismatch in "${name}": daily schedule has cron "${schedule.cron}" which fires more than once per day`
        );
      }
    } else if (schedule.type === 'weekly') {
      const parts = schedule.cron.trim().split(/\s+/);
      if (parts.length < 5) continue;
      const [minute, hour, , , dayOfWeek] = parts;
      const isWildcardOrInterval = (field: string) => field === '*' || field.includes('/');
      if (isWildcardOrInterval(minute) || isWildcardOrInterval(hour) || isWildcardOrInterval(dayOfWeek)) {
        console.warn(
          `[specialist-loader] Schedule mismatch in "${name}": weekly schedule has cron "${schedule.cron}" which fires more than once per week`
        );
      }
    }
  }
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

  // Validate cron-schedule-type consistency
  warnScheduleMismatch(data.name, schedules);

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

  // Parse integrations
  const integrations: ServiceIntegration[] = [];
  if (data.integrations && Array.isArray(data.integrations)) {
    for (const entry of data.integrations) {
      if (
        entry &&
        typeof entry === 'object' &&
        typeof entry.service === 'string' &&
        entry.env &&
        typeof entry.env === 'object'
      ) {
        // Detect likely YAML indentation errors: integration-level keys appearing inside env
        const INTEGRATION_KEYS = ['tools', 'service'];
        for (const key of Object.keys(entry.env)) {
          if (INTEGRATION_KEYS.includes(key)) {
            console.warn(
              `[specialist-loader] Likely YAML indentation error in "${data.name}": ` +
              `integration for "${entry.service}" has "${key}" inside env (should be a sibling of env)`
            );
          }
        }
        integrations.push({
          service: entry.service,
          env: entry.env as Record<string, string>,
          tools: Array.isArray(entry.tools) ? entry.tools : [],
        });
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
    integrations,
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

/**
 * Load raw markdown content of a specialist definition by name.
 * Returns the unprocessed file contents for cloning/editing.
 */
export function loadSpecialistRaw(name: string): string {
  const dir = getSpecialistsDir();
  const filePath = path.join(dir, `${name}.md`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Specialist "${name}" not found at ${filePath}`);
  }
  return fs.readFileSync(filePath, 'utf-8');
}
