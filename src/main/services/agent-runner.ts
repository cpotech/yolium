// src/lib/agent-runner.ts
import { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createLogger } from '@main/lib/logger';
import { loadAgentDefinition, ParsedAgent } from './agent-loader';
import { extractProtocolMessages } from './agent-protocol';
import {
  createWorktree,
  deleteWorktree,
  generateBranchName,
  getWorktreePath,
  hasCommits,
  isGitRepo,
  sanitizeBranchName,
} from '@main/git/git-worktree';
import { loadGitConfig } from '@main/git/git-config';
import {
  getOrCreateBoard,
  addItem,
  updateItem,
  updateBoard,
  addComment,
  buildConversationHistory,
} from '@main/stores/kanban-store';
import {
  appendLog,
  appendSessionHeader,
} from '@main/stores/workitem-log-store';
import { appendRunLog } from '@main/stores/run-history-store';
import {
  createAgentContainer,
  stopAgentContainer,
  checkAgentAuth,
  getAgentSession,
} from '@main/docker';
import type { KanbanBoard, KanbanColumn, KanbanItem } from '@shared/types/kanban';
import type {
  AskQuestionMessage,
  CreateItemMessage,
  UpdateDescriptionMessage,
  AddCommentMessage,
  SetTestSpecsMessage,
  CompleteMessage,
  ErrorMessage,
  ProgressMessage,
  RunResultMessage,
} from '@shared/types/agent';
import type { SpecialistDefinition, ScheduleType, RunOutcome } from '@shared/types/schedule';
import { loadCredentials } from '@main/stores/specialist-credentials-store';

const logger = createLogger('agent-runner');

export interface BuildPromptParams {
  systemPrompt: string;
  goal: string;
  conversationHistory: string;
  provider?: string;
  agentName?: string;
}

/**
 * Inline protocol reference for non-Claude providers.
 * Embeds the full @@YOLIUM: protocol directly in the prompt so models
 * that deprioritize file-based instructions still follow the protocol.
 */
const INLINE_PROTOCOL = `## @@YOLIUM: Protocol (MANDATORY)

You MUST communicate with Yolium by outputting JSON messages prefixed with \`@@YOLIUM:\` as plain text lines in your output.
Your work will be marked as FAILED if you do not output these messages.

### Message Types

**progress** — Report step progress (does not pause execution):
\`\`\`
@@YOLIUM:{"type":"progress","step":"<step>","detail":"<what you are doing>"}
\`\`\`
Fields: step (string, required), detail (string, required), attempt (number, optional), maxAttempts (number, optional)

**comment** — Post commentary to the work item thread:
\`\`\`
@@YOLIUM:{"type":"comment","text":"<your commentary>"}
\`\`\`
Fields: text (string, required — supports markdown)

**ask_question** — Pause and wait for user input (only when truly blocked):
\`\`\`
@@YOLIUM:{"type":"ask_question","text":"<question>","options":["A","B"]}
\`\`\`
Fields: text (string, required), options (string[], optional)

**complete** — Signal successful completion (MUST be your last protocol message):
\`\`\`
@@YOLIUM:{"type":"complete","summary":"<what you accomplished>"}
\`\`\`
Fields: summary (string, required)

**error** — Signal failure:
\`\`\`
@@YOLIUM:{"type":"error","message":"<reason for failure>"}
\`\`\`
Fields: message (string, required)

**create_item** — Create a new kanban work item:
\`\`\`
@@YOLIUM:{"type":"create_item","title":"<title>","description":"<details>","agentProvider":"claude","order":1}
\`\`\`
Fields: title (string, required), description (string, optional), branch (string, optional), agentProvider (enum: claude|codex|opencode, required), order (number, required), model (string, optional)

**update_description** — Update the current work item's description:
\`\`\`
@@YOLIUM:{"type":"update_description","description":"<new description>"}
\`\`\`
Fields: description (string, required)

**set_test_specs** — Attach concrete test specifications to the work item (plan agents use this so code agents implement tests first):
\`\`\`
@@YOLIUM:{"type":"set_test_specs","specs":[{"file":"src/tests/foo.test.ts","description":"Unit tests for foo module","specs":["should return empty array when no items","should throw on invalid input"]}]}
\`\`\`
Fields: specs (array, required — each element: file (string), description (string), specs (string[]))

### Required Protocol Usage

1. Your FIRST output MUST be a progress message: \`@@YOLIUM:{"type":"progress","step":"analyze","detail":"Starting analysis"}\`
2. Output progress messages at each major step of your work
3. Post comment messages with your findings and results
4. Your LAST protocol message MUST be either a complete or error message
5. Output these as plain text lines — they will be parsed from your stdout`;

/**
 * File-based output instructions for non-Claude plan agents.
 * Codex models have internal reasoning and often don't externalize their
 * analysis as text. This forces them to write their plan to a file that
 * the system reads after the agent exits.
 */
const FILE_OUTPUT_PLAN = `## CRITICAL: Write Your Plan to a File

After completing your analysis, you MUST write your final implementation plan to a file named \`.yolium-plan.md\` in the project root directory.

The file must include:
- Context and summary of your findings
- Chosen approach and rationale
- Ordered implementation steps with specific files to modify
- Acceptance criteria

This file is MANDATORY — the system reads it to capture your plan. If you do not write this file, your work will be lost.`;

/**
 * File-based output instructions for non-Claude code agents.
 * Ensures Codex writes a summary of changes for visibility.
 */
const FILE_OUTPUT_CODE = `## CRITICAL: Write Your Summary to a File

After completing your implementation and committing changes, you MUST write a summary to a file named \`.yolium-summary.md\` in the project root directory.

The file must include:
- What was implemented
- Files modified and why
- Tests added and results
- Any caveats or follow-up items

This file is MANDATORY — the system reads it to capture your work summary. If you do not write this file, your conclusions will be lost.`;

/**
 * File-based output instructions for non-Claude scout agents.
 * Ensures the scout dossier is written to a known path for capture.
 */
const FILE_OUTPUT_SCOUT = `## CRITICAL: Write Your Dossier to a File

After completing your research, you MUST write the final JSON dossier array to a file named \`.yolium-scout.json\` in the project root directory.

The file must be a valid JSON array of lead dossier objects, each containing:
- company (name, website, industry, description, headquarters, employeeCount)
- contacts (name, title, relevance)
- techStack (array of technologies)
- signals (recentFunding, hiring, recentNews, growthIndicators)
- qualification (grade, mustHavesMet, confidence, notes)
- sources (array of URLs)

This file is MANDATORY — the system reads it to capture your dossier. If you do not write this file, your research will be lost.`;

/**
 * File-based output instructions for non-Claude verify agents.
 * Ensures the verification report is written to a known path for capture.
 */
const FILE_OUTPUT_VERIFY = `## CRITICAL: Write Your Verification Report to a File

After completing your verification, you MUST write your final verification report to a file named \`.yolium-verify.md\` in the project root directory.

The file must include:
- Verification status (PASS / FAIL / PARTIAL)
- Task completion assessment
- Issues found (if any)
- Code quality observations
- Guideline compliance
- Test results
- Recommendation (approve, request changes, or needs re-work)

This file is MANDATORY — the system reads it to capture your verification report. If you do not write this file, your report will be lost.`;

export function buildAgentPrompt(params: BuildPromptParams): string {
  const { systemPrompt, goal, conversationHistory, provider, agentName } = params;

  // For non-Claude providers, inline the protocol and system prompt
  // so the model has everything in its primary prompt context
  if (provider && provider !== 'claude') {
    let prompt = `# Yolium Agent Instructions\n\n${INLINE_PROTOCOL}\n\n---\n\n${systemPrompt}\n\n## Current Goal\n\n${goal}`;

    // Add file-based output instructions (Codex models don't reliably emit
    // protocol messages, so we also ask them to write output to files that
    // the system reads after the agent exits)
    if (agentName === 'plan-agent') {
      prompt += `\n\n${FILE_OUTPUT_PLAN}`;
    } else if (agentName === 'code-agent') {
      prompt += `\n\n${FILE_OUTPUT_CODE}`;
    } else if (agentName === 'scout-agent') {
      prompt += `\n\n${FILE_OUTPUT_SCOUT}`;
    } else if (agentName === 'verify-agent') {
      prompt += `\n\n${FILE_OUTPUT_VERIFY}`;
    }

    if (conversationHistory.trim()) {
      prompt += `\n\n## Previous conversation:\n\n${conversationHistory}\n\nContinue from where you left off.`;
    }

    prompt += `\n\n---\n\nREMINDER: You MUST output @@YOLIUM: protocol messages throughout your work. Start NOW with a progress message.`;

    return prompt;
  }

  // Claude path: system prompt + goal (protocol is already woven into agent definitions)
  let prompt = `${systemPrompt}\n\n## Current Goal\n\n${goal}`;

  if (conversationHistory.trim()) {
    prompt += `\n\n## Previous conversation:\n\n${conversationHistory}\n\nContinue from where you left off.`;
  }

  return prompt;
}

export interface AgentSession {
  id: string;
  agentName: string;
  itemId: string;
  projectPath: string;
  process: ChildProcess | null;
  events: EventEmitter;
}

const sessions = new Map<string, AgentSession>();

function normalizeProjectPath(projectPath: string): string {
  let normalized = path.resolve(projectPath).replace(/\\/g, '/');
  if (normalized.endsWith('/') && normalized.length > 1) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

/**
 * Track processed protocol messages per session to prevent duplicates.
 * Some providers (e.g., Codex) repeat their full output as a result dump,
 * causing protocol messages to be extracted and handled twice.
 */
const processedProtocolMessages = new Map<string, Set<string>>();

function cleanupSessionDedup(sessionId: string): void {
  processedProtocolMessages.delete(sessionId);
}

/**
 * Clear all sessions from memory. Call on app startup to prevent
 * stale sessions from accumulating after crashes.
 */
export function clearSessions(): void {
  for (const session of sessions.values()) {
    session.events.removeAllListeners();
  }
  sessions.clear();
  processedProtocolMessages.clear();
}

const MODEL_MAP: Record<string, string> = {
  opus: 'claude-opus-4-6',
  sonnet: 'claude-sonnet-4-5-20250929',
  haiku: 'claude-haiku-4-5-20251001',
};

/**
 * Determine which kanban column an item moves to on agent completion.
 * - plan-agent → 'ready' (plan complete, waiting for code agent)
 * - scout-agent → 'done' (intelligence dossier is a finished deliverable)
 * - all others → 'verify' (code changes need review)
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
  return agentModel;
}

export interface StartAgentParams {
  webContentsId: number;
  agentName: string;
  projectPath: string;
  itemId: string;
  goal: string;
  agentProvider?: string;
  onOutput?: (data: string) => void;
  onQuestion?: (question: AskQuestionMessage) => void;
  onItemCreated?: (item: KanbanItem) => void;
  onComplete?: (summary: string) => void;
  onError?: (message: string) => void;
  onProgress?: (progress: ProgressMessage) => void;
}

export interface StartAgentResult {
  sessionId: string;
  error?: string;
}

export async function startAgent(params: StartAgentParams): Promise<StartAgentResult> {
  const {
    webContentsId,
    agentName,
    projectPath,
    itemId,
    goal,
    agentProvider,
    onOutput,
    onQuestion,
    onItemCreated,
    onComplete,
    onError,
    onProgress,
  } = params;

  const agentStartupStart = performance.now();
  let agentPhaseStart = agentStartupStart;

  let agent: ParsedAgent;
  try {
    agent = loadAgentDefinition(agentName);
  } catch {
    return {
      sessionId: '',
      error: `Unknown agent: ${agentName}. Valid agents: code-agent, plan-agent`,
    };
  }
  logger.info('Agent definition loaded', { agentName, elapsedMs: Math.round(performance.now() - agentPhaseStart) });

  agentPhaseStart = performance.now();
  const board = getOrCreateBoard(projectPath);
  const item = board.items.find(i => i.id === itemId);

  if (!item) {
    return {
      sessionId: '',
      error: `Item not found: ${itemId}`,
    };
  }

  // Use provided agentProvider or fall back to the item's stored provider
  const provider = agentProvider || item.agentProvider || 'claude';

  // Check if the selected agent is authenticated
  const auth = checkAgentAuth(provider);
  if (!auth.authenticated) {
    const keyType = provider === 'codex' ? 'OpenAI' : 'Anthropic';
    return {
      sessionId: '',
      error: `${provider} is not authenticated. Add your ${keyType} API Key in Settings.`,
    };
  }
  logger.info('Board loaded and auth checked', { agentName, itemId, provider, elapsedMs: Math.round(performance.now() - agentPhaseStart) });

  // Use title as fallback when no description is provided
  const effectiveGoal = goal.trim() || item.title;

  agentPhaseStart = performance.now();
  const conversationHistory = buildConversationHistory(item);
  const prompt = buildAgentPrompt({
    systemPrompt: agent.systemPrompt,
    goal: effectiveGoal,
    conversationHistory,
    provider,
    agentName,
  });
  logger.info('Prompt built', { agentName, promptLength: prompt.length, elapsedMs: Math.round(performance.now() - agentPhaseStart) });

  // Update item status to running and move to in-progress column
  updateItem(board, itemId, {
    agentStatus: 'running',
    activeAgentName: agentName,
    lastAgentName: agentName,
    column: 'in-progress',
  });
  updateBoard(board, { lastAgentName: agentName });
  // Load settings-level model default for this provider
  // Prefer providerModels (multi-model list, first is default), fall back to providerModelDefaults
  const gitConfig = loadGitConfig();
  const providerModelsList = gitConfig?.providerModels?.[provider];
  const settingsModel = providerModelsList?.[0] ?? gitConfig?.providerModelDefaults?.[provider];

  const displayModel = getDisplayModel(provider, item.model, settingsModel, agent.model);
  addComment(board, itemId, 'system', `${agentName} started (${provider}/${displayModel})`);

  // Create or reuse worktree for branch isolation (best-effort, graceful fallback)
  agentPhaseStart = performance.now();
  const resolvedProjectPath = path.resolve(projectPath);
  let worktreePath: string | undefined;
  let worktreeOriginalPath: string | undefined;
  let branchName: string | undefined;

  try {
    if (isGitRepo(resolvedProjectPath) && hasCommits(resolvedProjectPath)) {
      branchName = sanitizeBranchName(item.branch || generateBranchName());

      // Persist branch name to kanban item (sanitized or auto-generated)
      if (branchName !== item.branch) {
        updateItem(board, itemId, { branch: branchName });
      }

      // Check if item already has a worktree path (resume / subsequent agent scenario)
      if (item.worktreePath && fs.existsSync(item.worktreePath)) {
        // Reuse existing worktree
        worktreePath = item.worktreePath;
        worktreeOriginalPath = resolvedProjectPath;
        logger.info('Reusing existing worktree', { agentName, branchName, worktreePath, elapsedMs: Math.round(performance.now() - agentPhaseStart) });
      } else {
        // Clear stale path if directory is gone
        if (item.worktreePath) {
          logger.info('Clearing stale worktree path', { worktreePath: item.worktreePath });
          updateItem(board, itemId, { worktreePath: undefined, mergeStatus: undefined });
        }

        // Create fresh worktree
        worktreePath = createWorktree(resolvedProjectPath, branchName);
        worktreeOriginalPath = resolvedProjectPath;
        logger.info('Created agent worktree', { agentName, branchName, worktreePath, elapsedMs: Math.round(performance.now() - agentPhaseStart) });

        // Persist worktree path on the kanban item
        updateItem(board, itemId, { worktreePath, mergeStatus: 'unmerged' });
      }
    } else {
      logger.info('Skipping worktree: not a git repo or no commits', { projectPath, elapsedMs: Math.round(performance.now() - agentPhaseStart) });
    }
  } catch (err) {
    logger.warn('Failed to create worktree, running without isolation', {
      agentName,
      projectPath,
      error: err instanceof Error ? err.message : String(err),
      elapsedMs: Math.round(performance.now() - agentPhaseStart),
    });
    worktreePath = undefined;
    worktreeOriginalPath = undefined;
    branchName = undefined;
  }

  // Resolve model: item-level > settings default > agent frontmatter
  const model = resolveModel(item.model, settingsModel, agent.model);

  // For non-Claude providers, write system prompt to an instructions file as a
  // fallback reference. The full protocol + system prompt is already inlined in
  // the prompt by buildAgentPrompt(), so this file is just a backup.
  agentPhaseStart = performance.now();
  const agentPrompt = prompt;
  if (provider !== 'claude') {
    const instructionsFile = `.yolium-${agentName}-instructions.md`;
    const writePath = worktreePath || resolvedProjectPath;
    try {
      fs.writeFileSync(path.join(writePath, instructionsFile), agent.systemPrompt);
      logger.info('Wrote agent instructions file as fallback reference', { instructionsFile, provider });
    } catch {
      logger.warn('Failed to write agent instructions file', { instructionsFile });
    }
  }

  logger.info('Starting agent container', { agentName, projectPath, itemId, model, branchName, promptPrepElapsedMs: Math.round(performance.now() - agentPhaseStart) });

  // Write a session header to the persistent log
  appendSessionHeader(projectPath, itemId, agentName);

  // Create EventEmitter early so callbacks are wired before container output arrives
  const events = new EventEmitter();
  if (onQuestion) events.on('question', onQuestion);
  if (onItemCreated) events.on('itemCreated', onItemCreated);
  if (onComplete) events.on('complete', onComplete);
  if (onError) events.on('error', onError);
  if (onProgress) events.on('progress', onProgress);

  // Buffer output received before session is registered in the map
  let outputBuffer: string[] = [];
  let sessionReady = false;

  try {
    // Create the agent container
    agentPhaseStart = performance.now();
    const sessionId = await createAgentContainer(
      {
        webContentsId,
        projectPath,
        agentName,
        prompt: agentPrompt,
        model,
        tools: agent.tools,
        itemId,
        agentProvider: provider,
        ...(worktreePath && { worktreePath, originalPath: worktreeOriginalPath, branchName }),
        ...(agent.timeout && { timeoutMs: agent.timeout * 60 * 1000 }),
      },
      {
        onOutput: (data: string) => {
          // Forward raw output
          onOutput?.(data);
          // Buffer protocol messages until session is registered
          if (sessionReady) {
            handleAgentOutput(sessionId, data);
          } else {
            outputBuffer.push(data);
          }
        },
        onDisplayOutput: (data: string) => {
          // Persist display output to the work item log file
          appendLog(projectPath, itemId, data + '\n');
        },
        onProtocolMessage: (message: unknown) => {
          // Protocol messages are handled in handleAgentOutput
          // This callback can be used for additional processing
        },
        onExit: (code: number) => {
          // Use closure variables directly to avoid race with session registration
          const exitBoard = getOrCreateBoard(projectPath);
          const exitItem = exitBoard.items.find(i => i.id === itemId);

          if (code === 0) {
            // Exit code 0 - but need to check for detected errors and protocol activity
            const agentSession = getAgentSession(sessionId);
            const detectedError = agentSession?.detectedError;
            const protocolCount = agentSession?.protocolMessageCount ?? 0;
            const isNonClaude = provider !== 'claude';

            if (exitItem && exitItem.agentStatus === 'running') {
              if (detectedError) {
                // Exit code 0 but error was detected in output - mark as failed
                updateItem(exitBoard, itemId, { agentStatus: 'failed', activeAgentName: undefined });
                addComment(exitBoard, itemId, 'system', `Agent failed: ${detectedError}`);
                events.emit('error', detectedError);
                onError?.(detectedError);
              } else if (isNonClaude && protocolCount === 0) {
                // Non-Claude provider exited cleanly with no protocol messages.
                // The agent likely completed its work but didn't output @@YOLIUM: messages.
                // Treat as success — exit code 0 means the agent finished without errors.
                const completionColumn = getCompletionColumn(agentName);
                updateItem(exitBoard, itemId, { agentStatus: 'completed', activeAgentName: undefined, column: completionColumn });
                addComment(exitBoard, itemId, 'system', 'Agent finished (no progress messages reported — check agent log for details)');
                events.emit('complete', 'Agent finished successfully');
                onComplete?.('Agent finished successfully');
              } else if (protocolCount > 0) {
                // Agent sent protocol messages but never sent 'complete' — it stopped mid-workflow.
                // Common cause: model hit its output token limit (e.g., free-tier models).
                const incompleteMsg = 'Agent stopped without completing (no completion signal received). You can resume to continue.';
                updateItem(exitBoard, itemId, { agentStatus: 'interrupted', activeAgentName: undefined });
                addComment(exitBoard, itemId, 'system', incompleteMsg);
                events.emit('error', incompleteMsg);
                onError?.(incompleteMsg);
              } else {
                // Exit code 0, no protocol messages, Claude provider — treat as success
                const completionColumn = getCompletionColumn(agentName);
                updateItem(exitBoard, itemId, { agentStatus: 'completed', activeAgentName: undefined, column: completionColumn });
                addComment(exitBoard, itemId, 'system', 'Agent finished successfully');
                events.emit('complete', 'Agent finished successfully');
              }
            }

            // Conclusion synthesis for non-Claude providers (e.g., Codex).
            // These providers don't follow the @@YOLIUM protocol natively, so we
            // synthesize missing protocol actions from their output.
            if (isNonClaude && agentSession) {
              const outputDir = worktreePath || resolvedProjectPath;

              // Strategy 1: Read file-based output (most reliable for Codex,
              // which has internal reasoning and doesn't externalize as text).
              // The prompt instructs non-Claude agents to write their output here.
              if (agentName === 'plan-agent' && !agentSession.receivedUpdateDescription) {
                const planFile = path.join(outputDir, '.yolium-plan.md');
                try {
                  if (fs.existsSync(planFile)) {
                    const planText = fs.readFileSync(planFile, 'utf-8').trim();
                    if (planText.length > 0) {
                      updateItem(exitBoard, itemId, { description: planText });
                      addComment(exitBoard, itemId, 'agent', planText);
                      logger.info('Read plan from .yolium-plan.md', { itemId, planLength: planText.length });
                    }
                  }
                } catch (err) {
                  logger.warn('Failed to read .yolium-plan.md', { itemId, error: err instanceof Error ? err.message : String(err) });
                }
              }

              if (agentName === 'code-agent') {
                const summaryFile = path.join(outputDir, '.yolium-summary.md');
                try {
                  if (fs.existsSync(summaryFile)) {
                    const summaryText = fs.readFileSync(summaryFile, 'utf-8').trim();
                    if (summaryText.length > 0) {
                      addComment(exitBoard, itemId, 'agent', summaryText);
                      logger.info('Read summary from .yolium-summary.md', { itemId, summaryLength: summaryText.length });
                    }
                  }
                } catch (err) {
                  logger.warn('Failed to read .yolium-summary.md', { itemId, error: err instanceof Error ? err.message : String(err) });
                }
              }

              if (agentName === 'scout-agent') {
                const scoutFile = path.join(outputDir, '.yolium-scout.json');
                try {
                  if (fs.existsSync(scoutFile)) {
                    const scoutText = fs.readFileSync(scoutFile, 'utf-8').trim();
                    if (scoutText.length > 0) {
                      addComment(exitBoard, itemId, 'agent', scoutText);
                      logger.info('Read dossier from .yolium-scout.json', { itemId, dossierLength: scoutText.length });
                    }
                  }
                } catch (err) {
                  logger.warn('Failed to read .yolium-scout.json', { itemId, error: err instanceof Error ? err.message : String(err) });
                }
              }

              if (agentName === 'verify-agent') {
                const verifyFile = path.join(outputDir, '.yolium-verify.md');
                try {
                  if (fs.existsSync(verifyFile)) {
                    const verifyText = fs.readFileSync(verifyFile, 'utf-8').trim();
                    if (verifyText.length > 0) {
                      addComment(exitBoard, itemId, 'agent', verifyText);
                      logger.info('Read verification report from .yolium-verify.md', { itemId, reportLength: verifyText.length });
                    }
                  }
                } catch (err) {
                  logger.warn('Failed to read .yolium-verify.md', { itemId, error: err instanceof Error ? err.message : String(err) });
                }
              }

              // Strategy 2: Fall back to accumulated agent message texts
              // (for providers that do externalize reasoning, like some OpenCode setups)
              const accumulated = agentSession.agentMessageTexts || [];
              if (agentName === 'plan-agent' && !agentSession.receivedUpdateDescription && accumulated.length > 0) {
                // Only use if file-based approach didn't produce a description
                const currentItem = exitBoard.items.find(i => i.id === itemId);
                const originalItem = board.items.find(i => i.id === itemId);
                if (currentItem && currentItem.description === originalItem?.description) {
                  const planText = accumulated.reduce((a, b) => a.length > b.length ? a : b, '');
                  updateItem(exitBoard, itemId, { description: planText });
                  addComment(exitBoard, itemId, 'agent', planText);
                }
              }
            }
          } else if (code === 124) {
            // Timeout
            const timeoutMinutes = agent.timeout || 30;
            updateItem(exitBoard, itemId, { agentStatus: 'failed', activeAgentName: undefined });
            addComment(exitBoard, itemId, 'system', `Agent timed out (no activity for ${timeoutMinutes} minutes)`);
            events.emit('error', 'Agent timed out');
            onError?.('Agent timed out');
          } else {
            // Non-zero exit that wasn't handled by protocol - include any detected error
            const agentSession = getAgentSession(sessionId);
            const detectedError = agentSession?.detectedError;
            const errorMessage = detectedError
              ? `Agent exited with code ${code}: ${detectedError}`
              : `Agent exited with code ${code}`;

            if (exitItem && exitItem.agentStatus === 'running') {
              updateItem(exitBoard, itemId, { agentStatus: 'failed', activeAgentName: undefined });
              addComment(exitBoard, itemId, 'system', errorMessage);
              events.emit('error', errorMessage);
              onError?.(errorMessage);
            }
          }

          sessions.delete(sessionId);
          cleanupSessionDedup(sessionId);
        },
      }
    );

    logger.info('Agent container created', { agentName, sessionId, elapsedMs: Math.round(performance.now() - agentPhaseStart) });
    logger.info('Full agent startup complete', { agentName, sessionId, totalElapsedMs: Math.round(performance.now() - agentStartupStart) });

    // Register session immediately after getting sessionId
    const session: AgentSession = {
      id: sessionId,
      agentName,
      itemId,
      projectPath,
      process: null, // Container-based, no direct process reference
      events,
    };
    sessions.set(sessionId, session);
    sessionReady = true;

    // Process any output that arrived before session registration
    for (const buffered of outputBuffer) {
      handleAgentOutput(sessionId, buffered);
    }
    outputBuffer = [];

    return { sessionId };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error('Failed to create agent container', { agentName, projectPath, error: errorMessage });

    // Clean up worktree if container creation failed
    if (worktreePath && worktreeOriginalPath) {
      try {
        deleteWorktree(worktreeOriginalPath, worktreePath);
        logger.info('Cleaned up worktree after container creation failure', { worktreePath });
      } catch (cleanupErr) {
        logger.error('Failed to clean up worktree after error', {
          worktreePath,
          error: cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr),
        });
      }
    }

    // Revert status on failure
    updateItem(board, itemId, { agentStatus: 'failed', activeAgentName: undefined });
    addComment(board, itemId, 'system', `Failed to start agent: ${errorMessage}`);

    return {
      sessionId: '',
      error: errorMessage,
    };
  }
}

export function handleAgentOutput(sessionId: string, data: string): void {
  const session = sessions.get(sessionId);
  if (!session) {
    logger.warn('Output for unknown session', { sessionId });
    return;
  }

  session.events.emit('output', data);

  // Parse protocol messages
  const messages = extractProtocolMessages(data);
  const board = getOrCreateBoard(session.projectPath);

  // Get or create dedup set for this session
  if (!processedProtocolMessages.has(sessionId)) {
    processedProtocolMessages.set(sessionId, new Set());
  }
  const seen = processedProtocolMessages.get(sessionId)!;

  for (const message of messages) {
    // Deduplicate: skip exact duplicate messages (e.g., Codex repeats output in result dump)
    const messageKey = JSON.stringify(message);
    if (seen.has(messageKey)) {
      logger.debug('Skipping duplicate protocol message', { sessionId, type: message.type });
      continue;
    }
    seen.add(messageKey);

    switch (message.type) {
      case 'ask_question': {
        const q = message as AskQuestionMessage;
        // Move back to ready column when agent needs user input
        updateItem(board, session.itemId, {
          agentStatus: 'waiting',
          agentQuestion: q.text,
          agentQuestionOptions: q.options,
          column: 'ready',
        });
        addComment(board, session.itemId, 'agent', q.text, q.options);
        session.events.emit('question', q);
        break;
      }

      case 'create_item': {
        const c = message as CreateItemMessage;
        const newItem = addItem(board, {
          title: c.title,
          description: c.description || '',
          branch: c.branch,
          agentProvider: c.agentProvider,
          order: c.order,
          model: c.model,
        });
        session.events.emit('itemCreated', newItem);
        break;
      }

      case 'update_description': {
        const ud = message as UpdateDescriptionMessage;
        updateItem(board, session.itemId, { description: ud.description });
        addComment(board, session.itemId, 'agent', ud.description);
        session.events.emit('descriptionUpdated', ud.description);
        // Track that agent sent update_description (for non-Claude conclusion synthesis)
        const udSession = getAgentSession(sessionId);
        if (udSession) udSession.receivedUpdateDescription = true;
        break;
      }

      case 'add_comment': {
        const ac = message as AddCommentMessage;
        addComment(board, session.itemId, 'agent', ac.text);
        session.events.emit('commentAdded', ac.text);
        break;
      }

      case 'set_test_specs': {
        const ts = message as SetTestSpecsMessage;
        updateItem(board, session.itemId, { testSpecs: ts.specs });
        const specCount = ts.specs.reduce((sum, s) => sum + s.specs.length, 0);
        addComment(board, session.itemId, 'system', `Test specs set: ${specCount} specs across ${ts.specs.length} files`);
        session.events.emit('testSpecsSet', ts.specs);
        break;
      }

      case 'complete': {
        const comp = message as CompleteMessage;
        const completionColumn = getCompletionColumn(session.agentName);
        updateItem(board, session.itemId, { agentStatus: 'completed', activeAgentName: undefined, column: completionColumn });
        addComment(board, session.itemId, 'system', `Completed: ${comp.summary}`);

        session.events.emit('complete', comp.summary);
        break;
      }

      case 'error': {
        const err = message as ErrorMessage;
        updateItem(board, session.itemId, { agentStatus: 'failed', activeAgentName: undefined });
        addComment(board, session.itemId, 'system', `Error: ${err.message}`);
        session.events.emit('error', err.message);
        break;
      }

      case 'progress': {
        const prog = message as ProgressMessage;
        const detail = prog.attempt
          ? `[${prog.step}] ${prog.detail} (attempt ${prog.attempt}/${prog.maxAttempts || '?'})`
          : `[${prog.step}] ${prog.detail}`;
        addComment(board, session.itemId, 'system', detail);
        session.events.emit('progress', prog);
        break;
      }

    }
  }
}

export function answerQuestion(sessionId: string, answer: string): void {
  const session = sessions.get(sessionId);
  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  const board = getOrCreateBoard(session.projectPath);
  addComment(board, session.itemId, 'user', answer);
  updateItem(board, session.itemId, {
    agentStatus: 'idle', // Will be set to 'running' when resumed
    agentQuestion: undefined,
    agentQuestionOptions: undefined,
  });
}

export function getSession(sessionId: string): AgentSession | undefined {
  return sessions.get(sessionId);
}

export function getSessionByItemId(projectPath: string, itemId: string): AgentSession | undefined {
  const targetProjectPath = normalizeProjectPath(projectPath);
  for (const session of sessions.values()) {
    if (normalizeProjectPath(session.projectPath) === targetProjectPath && session.itemId === itemId) {
      return session;
    }
  }
  return undefined;
}

export async function stopAgent(sessionId: string): Promise<void> {
  const session = sessions.get(sessionId);
  if (!session) return;

  // Stop the container
  await stopAgentContainer(sessionId);

  const board = getOrCreateBoard(session.projectPath);
  const item = board.items.find(i => i.id === session.itemId);
  if (item && item.agentStatus === 'running') {
    updateItem(board, session.itemId, { agentStatus: 'interrupted', activeAgentName: undefined });
    addComment(board, session.itemId, 'system', 'Agent was interrupted');
  }

  sessions.delete(sessionId);
  cleanupSessionDedup(sessionId);
}

/**
 * Stop all running agents for a given project.
 * Iterates sessions, finds matching projectPath, calls stopAgent on each.
 * Logs failures but does not throw.
 */
export async function stopAllAgentsForProject(projectPath: string): Promise<void> {
  const matchingSessions = Array.from(sessions.values()).filter(
    s => s.projectPath === projectPath
  );

  if (matchingSessions.length === 0) return;

  logger.info('Stopping all agents for project', { projectPath, count: matchingSessions.length });

  const results = await Promise.allSettled(
    matchingSessions.map(s => stopAgent(s.id))
  );

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === 'rejected') {
      logger.error('Failed to stop agent session', {
        sessionId: matchingSessions[i].id,
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
    }
  }
}

/**
 * Answer a question for an agent task.
 * Records the answer and marks the item as ready to resume.
 */
export function answerAgentQuestion(
  projectPath: string,
  itemId: string,
  answer: string
): void {
  const board = getOrCreateBoard(projectPath);
  const item = board.items.find(i => i.id === itemId);

  if (!item) {
    throw new Error(`Item not found: ${itemId}`);
  }

  if (item.agentStatus !== 'waiting') {
    throw new Error(`Item is not waiting for an answer: ${item.agentStatus}`);
  }

  // Record the answer as a user comment
  addComment(board, itemId, 'user', answer);

  // Clear the question and mark as ready to resume
  updateItem(board, itemId, {
    agentStatus: 'idle',
    agentQuestion: undefined,
    agentQuestionOptions: undefined,
  });
}

/**
 * Resume an agent task after it was waiting for user input.
 */
export async function resumeAgent(params: StartAgentParams): Promise<StartAgentResult> {
  const { projectPath, itemId } = params;

  const board = getOrCreateBoard(projectPath);
  const item = board.items.find(i => i.id === itemId);

  if (!item) {
    return {
      sessionId: '',
      error: `Item not found: ${itemId}`,
    };
  }

  // Verify item is in a resumable state (idle after answering a question, or interrupted)
  if (item.agentStatus !== 'idle' && item.agentStatus !== 'interrupted') {
    return {
      sessionId: '',
      error: `Item cannot be resumed in current state: ${item.agentStatus}`,
    };
  }

  // Start the agent - it will pick up conversation history including the answer
  return startAgent(params);
}

/**
 * Get agent events emitter for a session.
 * Returns undefined if session doesn't exist.
 */
export function getAgentEvents(sessionId: string): EventEmitter | undefined {
  const session = sessions.get(sessionId);
  return session?.events;
}

export function recoverInterruptedAgents(projectPath: string): KanbanItem[] {
  const board = getOrCreateBoard(projectPath);
  const interrupted: KanbanItem[] = [];

  for (const item of board.items) {
    if (item.agentStatus === 'running' && !getSessionByItemId(projectPath, item.id)) {
      updateItem(board, item.id, { agentStatus: 'interrupted', activeAgentName: undefined });
      addComment(board, item.id, 'system', 'Agent was interrupted (app closed)');
      interrupted.push(item);
    }
  }

  return interrupted;
}

/**
 * Backfill worktreePath for existing items that have a branch but no worktreePath.
 * Checks if a worktree directory exists on disk at the expected path.
 */
export function backfillWorktreePaths(projectPath: string): number {
  const board = getOrCreateBoard(projectPath);
  const resolvedPath = path.resolve(projectPath);
  let backfilled = 0;

  for (const item of board.items) {
    if (item.branch && !item.worktreePath && item.mergeStatus !== 'merged') {
      try {
        const sanitized = sanitizeBranchName(item.branch);
        if (sanitized !== item.branch) {
          updateItem(board, item.id, { branch: sanitized });
        }
        const expectedPath = getWorktreePath(resolvedPath, sanitized);
        if (fs.existsSync(expectedPath)) {
          updateItem(board, item.id, { worktreePath: expectedPath, mergeStatus: 'unmerged' });
          logger.info('Backfilled worktree path', { itemId: item.id, branch: sanitized, worktreePath: expectedPath });
          backfilled++;
        }
      } catch {
        // Skip items with invalid branch names
      }
    }
  }

  return backfilled;
}

// ─── Scheduled Agent Execution ──────────────────────────────────────────────

/**
 * Sentinel value for headless agent containers (no renderer window).
 * Using -1 means getWebContents() returns undefined, naturally skipping all IPC to renderer.
 */
const HEADLESS_WEB_CONTENTS_ID = -1;

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
 * Build the full prompt for a scheduled agent run.
 * Uses the prompt template if available, otherwise generates a fallback
 * directive from the specialist's description and schedule type.
 */
export function buildScheduledPrompt(params: {
  systemPrompt: string;
  scheduleType: ScheduleType;
  promptTemplate: string | undefined;
  description: string;
  memoryContext: string;
}): string {
  const { systemPrompt, scheduleType, promptTemplate, description, memoryContext } = params;
  let prompt = systemPrompt;

  const template = promptTemplate?.trim();
  if (template) {
    prompt += `\n\n## Schedule: ${scheduleType}\n\n${template}`;
  } else {
    prompt += `\n\n## Schedule: ${scheduleType}\n\nExecute your ${scheduleType} task: ${description}. Review recent run history to avoid repeating work, then report findings and actions taken.`;
  }

  if (memoryContext) {
    prompt += `\n\n${memoryContext}`;
  }

  return prompt;
}

/**
 * Start a scheduled agent run (headless — no renderer window required).
 * Builds prompt from specialist definition + memory context, creates a Docker container,
 * parses output for protocol messages, and resolves with the run result.
 */
export async function startScheduledAgent(params: ScheduledAgentParams): Promise<ScheduledAgentResult> {
  const { specialist, scheduleType, memoryContext, runId } = params;

  // Check auth (scheduled agents use the default Claude provider)
  const auth = checkAgentAuth('claude');
  if (!auth.authenticated) {
    return {
      outcome: 'failed',
      summary: 'Claude is not authenticated. Add your Anthropic API Key in Settings.',
      tokensUsed: 0,
      costUsd: 0,
      durationMs: 0,
    };
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

  let outcome: RunOutcome = 'completed';
  let summary = 'Run completed';
  let lastRunResult: RunResultMessage | undefined;

  // Load specialist credentials for injection
  const specialistCreds = loadCredentials(specialist.name);
  const hasCredentials = Object.keys(specialistCreds).length > 0;

  // Deferred promise for exit result
  let resolveExit: (value: { code: number; durationMs: number }) => void;
  const exitPromise = new Promise<{ code: number; durationMs: number }>((resolve) => {
    resolveExit = resolve;
  });

  try {
    const capturedSessionId = await createAgentContainer(
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
      },
      {
        onOutput: (data: string) => {
          // Parse protocol messages from agent output
          const messages = extractProtocolMessages(data);
          for (const msg of messages) {
            if (msg.type === 'run_result') {
              lastRunResult = msg as RunResultMessage;
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
          resolveExit({ code, durationMs: Date.now() - startTime });
        },
      }
    );

    const { code, durationMs } = await exitPromise;
    const session = capturedSessionId ? getAgentSession(capturedSessionId) : undefined;
    const costUsd = session?.cumulativeUsage?.costUsd ?? 0;
    const tokensUsed = session?.cumulativeUsage
      ? session.cumulativeUsage.inputTokens + session.cumulativeUsage.outputTokens
      : 0;

    // Use run_result protocol message if agent sent one
    if (lastRunResult) {
      return {
        outcome: lastRunResult.outcome as RunOutcome,
        summary: lastRunResult.summary,
        tokensUsed: lastRunResult.tokensUsed ?? tokensUsed,
        costUsd,
        durationMs,
      };
    }

    if (code === 124) {
      outcome = 'timeout';
      summary = 'Agent timed out';
    } else if (code !== 0 && outcome !== 'failed') {
      outcome = 'failed';
      summary = `Agent exited with code ${code}`;
    }

    return { outcome, summary, tokensUsed, costUsd, durationMs };
  } catch (err) {
    return {
      outcome: 'failed',
      summary: err instanceof Error ? err.message : String(err),
      tokensUsed: 0,
      costUsd: 0,
      durationMs: Date.now() - startTime,
    };
  }
}
