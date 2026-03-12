import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createLogger } from '@main/lib/logger';
import { extractProtocolMessages } from './agent-protocol';
import { buildScheduledPrompt } from './agent-prompts';
import { resolveModel } from './agent-model';
import {
  createAgentContainer,
  checkAgentAuth,
  getAgentSession,
} from '@main/docker';
import { appendRunLog } from '@main/stores/run-history-store';
import { appendAction } from '@main/stores/action-log-store';
import { loadCredentials } from '@main/stores/specialist-credentials-store';
import type { ActionMessage, CompleteMessage, ErrorMessage, RunResultMessage } from '@shared/types/agent';
import type { SpecialistDefinition, ScheduleType, RunOutcome } from '@shared/types/schedule';

const logger = createLogger('agent-scheduled');

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

  // Check auth (scheduled agents use the default Claude provider)
  const auth = checkAgentAuth('claude');
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

  // Build prompt from specialist definition
  const prompt = buildScheduledPrompt({
    systemPrompt: specialist.systemPrompt,
    scheduleType,
    promptTemplate: specialist.promptTemplates[scheduleType],
    description: specialist.description,
    memoryContext,
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

    // Load specialist credentials for injection
    const specialistCreds = loadCredentials(specialist.name);
    const hasCredentials = Object.keys(specialistCreds).length > 0;

    createAgentContainer(
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
    ).then((sessionId) => {
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
