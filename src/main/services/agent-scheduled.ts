import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createLogger } from '@main/lib/logger';
import { extractProtocolMessages } from './agent-protocol';
import { buildScheduledPrompt } from './agent-prompts';
import { resolveModel } from './agent-model';
import { checkSpecialistReadiness } from './specialist-readiness';
import { resolveToolDir } from './tools-resolver';
import { loadGitConfig } from '@main/git/git-config';
import {
  createAgentContainer,
  checkAgentAuth,
  getAgentSession,
  ensureImage,
} from '@main/docker';
import { appendRunLog, appendAction, loadCredentials, pruneCredentials } from '@main/stores/yolium-db';
import { getAllProjectPaths } from '@main/stores/kanban-db';
import { getAllRegisteredPaths } from '@main/stores/registry-db';
import type { ActionMessage, CompleteMessage, ErrorMessage, RunResultMessage } from '@shared/types/agent';
import type { SpecialistDefinition, ScheduleType, RunOutcome } from '@shared/types/schedule';

const logger = createLogger('agent-scheduled');

/**
 * Resolve specialist project paths.
 * If the array contains "all", resolves all project paths from kanban boards.
 * Otherwise uses explicit paths. Filters to existing paths and deduplicates.
 */
export function resolveSpecialistProjects(projects: string[]): string[] {
  if (projects.length === 0) return [];

  let paths: string[];
  if (projects.includes('all')) {
    paths = [...getAllProjectPaths(), ...getAllRegisteredPaths()];
  } else {
    paths = projects;
  }

  // Filter to existing paths and deduplicate
  const seen = new Set<string>();
  const result: string[] = [];
  for (const p of paths) {
    if (!seen.has(p) && fs.existsSync(p)) {
      seen.add(p);
      result.push(p);
    }
  }
  return result;
}

/**
 * Compute host-to-container path mappings for project mounts.
 * Handles basename collisions by appending an index suffix.
 */
export function computeProjectMappings(projectPaths: string[]): Array<{ hostPath: string; containerPath: string }> {
  const baseCounts = new Map<string, number>();
  return projectPaths.map((hostPath) => {
    let basename = path.basename(hostPath);
    const count = (baseCounts.get(basename) ?? 0) + 1;
    baseCounts.set(basename, count);
    if (count > 1) {
      basename = `${basename}-${count}`;
    }
    return { hostPath, containerPath: `/projects/${basename}` };
  });
}

/**
 * Sentinel value for headless agent containers (no renderer window).
 * Using -1 means getWebContents() returns undefined, naturally skipping all IPC to renderer.
 */
export const HEADLESS_WEB_CONTENTS_ID = -1;

export interface ScheduledAgentParams {
  specialist: SpecialistDefinition;
  scheduleType: ScheduleType;
  memoryContext: string;
  runId: string;
}

export interface ScheduledAgentResult {
  outcome: RunOutcome;
  summary: string;
  tokensUsed: number;
  costUsd: number;
  durationMs: number;
}

/**
 * Start a scheduled agent run (headless — no renderer window required).
 * Builds prompt from specialist definition + memory context, creates a Docker container,
 * parses output for protocol messages, and resolves with the run result.
 */
export function startScheduledAgent(params: ScheduledAgentParams): Promise<ScheduledAgentResult> {
  const { specialist, scheduleType, memoryContext, runId } = params;

  // Check auth (scheduled agents use the configured default provider)
  const gitConfig = loadGitConfig();
  const defaultProvider = gitConfig?.defaultProvider || 'claude';
  const auth = checkAgentAuth(defaultProvider);
  if (!auth.authenticated) {
    return Promise.resolve({
      outcome: 'failed',
      summary: 'Claude is not authenticated. Add your Anthropic API Key in Settings.',
      tokensUsed: 0,
      costUsd: 0,
      durationMs: 0,
    });
  }

  const startTime = Date.now();

  // Resolve project paths if declared
  const resolvedProjects = specialist.projects?.length
    ? resolveSpecialistProjects(specialist.projects)
    : [];
  const projectMappings = resolvedProjects.length > 0
    ? computeProjectMappings(resolvedProjects)
    : undefined;

  // Build prompt from specialist definition
  const prompt = buildScheduledPrompt({
    systemPrompt: specialist.systemPrompt,
    scheduleType,
    promptTemplate: specialist.promptTemplates[scheduleType],
    description: specialist.description,
    memoryContext,
    projectPaths: projectMappings,
  });

  // Resolve model
  const model = resolveModel(undefined, undefined, specialist.model);

  // Create dedicated workspace for CRON agents (not process.cwd())
  const workspaceDir = path.join(
    os.homedir(), '.yolium', 'schedules', specialist.name, 'workspace'
  );
  if (!fs.existsSync(workspaceDir)) {
    fs.mkdirSync(workspaceDir, { recursive: true });
  }

  return new Promise<ScheduledAgentResult>((resolve) => {
    let outcome: RunOutcome = 'completed';
    let summary = 'Run completed';
    let lastRunResult: RunResultMessage | undefined;
    let capturedSessionId: string | undefined;

    // Prune stale credential keys that no longer match the definition
    if (specialist.integrations?.length) {
      const pruned = pruneCredentials(specialist.name, specialist.integrations);
      if (pruned > 0) {
        logger.info('Pruned stale credentials', { specialistId: specialist.name, keysRemoved: pruned });
      }
    }

    // Load specialist credentials for injection
    const specialistCreds = loadCredentials(specialist.name);
    const hasCredentials = Object.keys(specialistCreds).length > 0;

    // Log tools and service credentials at startup
    const integrationTools: Record<string, string[]> = {};
    if (specialist.integrations) {
      for (const integration of specialist.integrations) {
        for (const toolName of integration.tools ?? []) {
          const toolDir = resolveToolDir(toolName);
          if (toolDir) {
            try {
              integrationTools[toolName] = fs.readdirSync(toolDir).filter(f => !f.startsWith('.'));
            } catch { /* toolDir exists but cannot be read */
              integrationTools[toolName] = [`<unreadable: ${toolDir}>`];
            }
          } else {
            integrationTools[toolName] = ['<not found>'];
          }
        }
      }
    }

    logger.info('Agent starting', {
      specialistId: specialist.name,
      scheduleType,
      claudeTools: specialist.tools,
      integrationTools,
      serviceCredentials: Object.fromEntries(
        Object.entries(specialistCreds).map(([serviceId, keys]) => [
          serviceId,
          Object.keys(keys),
        ])
      ),
    });

    // Pre-flight readiness check: verify credentials and tools before starting
    const readiness = checkSpecialistReadiness(specialist, specialistCreds);
    if (!readiness.ready) {
      const summary = `Specialist not ready: ${readiness.reasons.join('; ')}`;
      logger.warn('Specialist readiness check failed', { specialistId: specialist.name, reasons: readiness.reasons });
      resolve({
        outcome: 'failed',
        summary,
        tokensUsed: 0,
        costUsd: 0,
        durationMs: 0,
      });
      return;
    }

    ensureImage().then(() => createAgentContainer(
      {
        webContentsId: HEADLESS_WEB_CONTENTS_ID,
        projectPath: workspaceDir,
        agentName: `cron-${specialist.name}`,
        prompt,
        model,
        tools: specialist.tools,
        itemId: `scheduled-${specialist.name}-${Date.now()}`,
        agentProvider: 'claude',
        timeoutMs: (specialist.timeout || 30) * 60 * 1000,
        ...(hasCredentials && { specialistCredentials: specialistCreds }),
        ...(specialist.integrations?.length && { integrations: specialist.integrations }),
        ...(resolvedProjects.length > 0 && { projectPaths: resolvedProjects }),
      },
      {
        onOutput: (data: string) => {
          // Parse protocol messages from agent output
          const messages = extractProtocolMessages(data);
          for (const msg of messages) {
            if (msg.type === 'run_result') {
              lastRunResult = msg as RunResultMessage;
            } else if (msg.type === 'action') {
              const actionMessage = msg as ActionMessage;
              appendAction(specialist.name, {
                id: `action-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
                runId,
                specialistId: specialist.name,
                action: actionMessage.action,
                data: actionMessage.data,
                timestamp: actionMessage.timestamp || new Date().toISOString(),
              });
            } else if (msg.type === 'complete') {
              outcome = 'completed';
              summary = (msg as CompleteMessage).summary;
            } else if (msg.type === 'error') {
              outcome = 'failed';
              summary = (msg as ErrorMessage).message;
            }
          }
        },
        onDisplayOutput: (data: string) => {
          // Persist display output to per-run log file
          appendRunLog(specialist.name, runId, data);
        },
        onExit: (code: number) => {
          const durationMs = Date.now() - startTime;
          const session = capturedSessionId ? getAgentSession(capturedSessionId) : undefined;
          const costUsd = session?.cumulativeUsage?.costUsd ?? 0;
          const tokensUsed = session?.cumulativeUsage
            ? session.cumulativeUsage.inputTokens + session.cumulativeUsage.outputTokens
            : 0;

          // Use run_result protocol message if agent sent one
          if (lastRunResult) {
            resolve({
              outcome: lastRunResult.outcome as RunOutcome,
              summary: lastRunResult.summary,
              tokensUsed: lastRunResult.tokensUsed ?? tokensUsed,
              costUsd,
              durationMs,
            });
            return;
          }

          if (code === 124) {
            outcome = 'timeout';
            summary = 'Agent timed out';
          } else if (code !== 0 && outcome !== 'failed') {
            outcome = 'failed';
            summary = `Agent exited with code ${code}`;
          }

          resolve({ outcome, summary, tokensUsed, costUsd, durationMs });
        },
      }
    )).then((sessionId) => {
      capturedSessionId = sessionId;
    }).catch((err) => {
      resolve({
        outcome: 'failed',
        summary: err instanceof Error ? err.message : String(err),
        tokensUsed: 0,
        costUsd: 0,
        durationMs: Date.now() - startTime,
      });
    });
  });
}
