import { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createLogger } from '@main/lib/logger';
import { loadAgentDefinition } from './agent-loader';
import {
  createWorktree, deleteWorktree, generateBranchName,
  getWorktreePath, hasCommits, isGitRepo, sanitizeBranchName,
} from '@main/git/git-worktree';
import { loadGitConfig } from '@main/git/git-config';
import {
  getOrCreateBoard, updateItem, updateBoard,
  addComment, buildConversationHistory,
  listAttachments, copyAttachmentsToWorktree,
} from '@main/stores/kanban-store';
import { appendLog, appendSessionHeader } from '@main/stores/workitem-log-store';
import { createAgentContainer, stopAgentContainer, checkAgentAuth, ensureImage } from '@main/docker';
import type { KanbanItem } from '@shared/types/kanban';
import type { AskQuestionMessage, ProgressMessage } from '@shared/types/agent';

// Re-exports from extracted modules
export { buildAgentPrompt, buildScheduledPrompt } from './agent-prompts';
export type { BuildPromptParams } from './agent-prompts';
export { MODEL_MAP, resolveModel, getDisplayModel, getCompletionColumn } from './agent-model';
export { handleAgentExit, synthesizeNonClaudeConclusion } from './agent-exit-handler';
export type { AgentExitParams } from './agent-exit-handler';
export { handleAgentOutput, cleanupSessionDedup, clearAllDedup } from './agent-protocol-handler';
export { startScheduledAgent, HEADLESS_WEB_CONTENTS_ID } from './agent-scheduled';
export type { ScheduledAgentParams, ScheduledAgentResult } from './agent-scheduled';

import { buildAgentPrompt } from './agent-prompts';
import { resolveModel, getDisplayModel } from './agent-model';
import { handleAgentExit } from './agent-exit-handler';
import {
  handleAgentOutput as _handleAgentOutput,
  cleanupSessionDedup, clearAllDedup,
} from './agent-protocol-handler';

const logger = createLogger('agent-runner');

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

export function clearSessions(): void {
  for (const session of sessions.values()) {
    session.events.removeAllListeners();
  }
  sessions.clear();
  clearAllDedup();
}

function handleAgentOutput(sessionId: string, data: string): void {
  _handleAgentOutput(sessionId, data, (id) => sessions.get(id));
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
    webContentsId, agentName, projectPath, itemId, goal,
    agentProvider, onOutput, onQuestion, onItemCreated, onComplete, onError, onProgress,
  } = params;

  let agent;
  try {
    agent = loadAgentDefinition(agentName);
  } catch { /* agent definition not found or invalid — return error to caller */
    return { sessionId: '', error: `Unknown agent: ${agentName}. Valid agents: code-agent, plan-agent` };
  }

  const board = getOrCreateBoard(projectPath);
  const item = board.items.find(i => i.id === itemId);
  if (!item) {
    return { sessionId: '', error: `Item not found: ${itemId}` };
  }

  const gitConfig = loadGitConfig();
  const provider = agentProvider || item.agentProvider || gitConfig?.defaultProvider || 'claude';
  const auth = checkAgentAuth(provider);
  if (!auth.authenticated) {
    const keyType = provider === 'codex' ? 'OpenAI' : provider === 'xai' ? 'xAI' : provider === 'openrouter' ? 'OpenRouter' : 'Anthropic';
    return { sessionId: '', error: `${provider} is not authenticated. Add your ${keyType} API Key in Settings.` };
  }

  const effectiveGoal = goal.trim() || item.title;
  const conversationHistory = buildConversationHistory(item);
  const itemAttachments = listAttachments(itemId);

  updateItem(board, itemId, {
    agentStatus: 'running',
    activeAgentName: agentName,
    lastAgentName: agentName,
    column: 'in-progress',
  });
  updateBoard(board, { lastAgentName: agentName });

  const providerModelsList = gitConfig?.providerModels?.[provider];
  const settingsModel = providerModelsList?.[0] ?? gitConfig?.providerModelDefaults?.[provider];
  const displayModel = getDisplayModel(provider, item.model, settingsModel, agent.model);
  addComment(board, itemId, 'system', `${agentName} started (${provider}/${displayModel})`);

  // Worktree setup (best-effort, graceful fallback)
  const resolvedProjectPath = path.resolve(projectPath);
  let worktreePath: string | undefined;
  let worktreeOriginalPath: string | undefined;
  let branchName: string | undefined;

  try {
    if (isGitRepo(resolvedProjectPath) && hasCommits(resolvedProjectPath)) {
      branchName = sanitizeBranchName(item.branch || generateBranchName());
      if (branchName !== item.branch) {
        updateItem(board, itemId, { branch: branchName });
      }
      if (item.worktreePath && fs.existsSync(item.worktreePath)) {
        worktreePath = item.worktreePath;
        worktreeOriginalPath = resolvedProjectPath;
      } else {
        if (item.worktreePath) {
          updateItem(board, itemId, { worktreePath: undefined, mergeStatus: undefined });
        }
        worktreePath = createWorktree(resolvedProjectPath, branchName);
        worktreeOriginalPath = resolvedProjectPath;
        updateItem(board, itemId, { worktreePath, mergeStatus: 'unmerged' });
      }
    }
  } catch (err) { /* intentionally ignored */
    logger.warn('Failed to create worktree, running without isolation', {
      agentName, projectPath, error: err instanceof Error ? err.message : String(err),
    });
    worktreePath = undefined;
    worktreeOriginalPath = undefined;
    branchName = undefined;
  }

  const model = resolveModel(item.model, settingsModel, agent.model);

  // Copy attachments into the worktree (if any)
  if (itemAttachments.length > 0 && worktreePath) {
    try {
      copyAttachmentsToWorktree(projectPath, itemId, worktreePath);
    } catch (err) {
      logger.warn('Failed to copy attachments to worktree', {
        itemId, error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Build prompt after worktree setup so containerProjectPath is accurate
  const prompt = buildAgentPrompt({
    systemPrompt: agent.systemPrompt,
    goal: effectiveGoal,
    conversationHistory,
    provider,
    agentName,
    attachments: itemAttachments.length > 0 ? itemAttachments : undefined,
    containerProjectPath: worktreePath || resolvedProjectPath,
  });

  // Write system prompt as fallback reference for non-Claude providers
  if (provider !== 'claude') {
    const instructionsFile = `.yolium-${agentName}-instructions.md`;
    const writePath = worktreePath || resolvedProjectPath;
    try {
      fs.writeFileSync(path.join(writePath, instructionsFile), agent.systemPrompt);
    } catch (err) { /* intentionally ignored */
      logger.warn('Failed to write agent instructions file', { instructionsFile, error: err instanceof Error ? err.message : String(err) });
    }
  }

  appendSessionHeader(projectPath, itemId, agentName);

  const events = new EventEmitter();
  if (onQuestion) events.on('question', onQuestion);
  if (onItemCreated) events.on('itemCreated', onItemCreated);
  if (onComplete) events.on('complete', onComplete);
  if (onError) events.on('error', onError);
  if (onProgress) events.on('progress', onProgress);

  const originalItemDescription = item.description;
  let outputBuffer: string[] = [];
  let sessionReady = false;

  try {
    await ensureImage();

    const sessionId = await createAgentContainer(
      {
        webContentsId, projectPath, agentName,
        prompt, model, tools: agent.tools, itemId,
        agentProvider: provider,
        ...(worktreePath && { worktreePath, originalPath: worktreeOriginalPath, branchName }),
        ...(agent.timeout && { timeoutMs: agent.timeout * 60 * 1000 }),
      },
      {
        onOutput: (data: string) => {
          onOutput?.(data);
          if (sessionReady) {
            handleAgentOutput(sessionId, data);
          } else {
            outputBuffer.push(data);
          }
        },
        onDisplayOutput: (data: string) => {
          appendLog(projectPath, itemId, data + '\n');
        },
        onProtocolMessage: () => {},
        onExit: (code: number) => {
          handleAgentExit({
            code, projectPath, itemId, agentName, provider, sessionId,
            events, worktreePath, resolvedProjectPath,
            timeoutMinutes: agent.timeout || 30,
            originalItemDescription, onComplete, onError,
          });
          sessions.delete(sessionId);
          cleanupSessionDedup(sessionId);
        },
      }
    );

    const session: AgentSession = {
      id: sessionId, agentName, itemId, projectPath,
      process: null, events,
    };
    sessions.set(sessionId, session);
    sessionReady = true;

    for (const buffered of outputBuffer) {
      handleAgentOutput(sessionId, buffered);
    }
    outputBuffer = [];

    return { sessionId };
  } catch (err) { /* intentionally ignored */
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error('Failed to create agent container', { agentName, projectPath, error: errorMessage });
    if (worktreePath && worktreeOriginalPath) {
      try {
        deleteWorktree(worktreeOriginalPath, worktreePath);
      } catch (cleanupErr) { /* intentionally ignored */
        logger.error('Failed to clean up worktree', {
          worktreePath, error: cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr),
        });
      }
    }
    updateItem(board, itemId, { agentStatus: 'failed', activeAgentName: undefined });
    addComment(board, itemId, 'system', `Failed to start agent: ${errorMessage}`);
    return { sessionId: '', error: errorMessage };
  }
}

export function answerQuestion(sessionId: string, answer: string): void {
  const session = sessions.get(sessionId);
  if (!session) throw new Error(`Session not found: ${sessionId}`);
  const board = getOrCreateBoard(session.projectPath);
  addComment(board, session.itemId, 'user', answer);
  updateItem(board, session.itemId, {
    agentStatus: 'idle', agentQuestion: undefined, agentQuestionOptions: undefined,
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

export async function stopAllAgentsForProject(projectPath: string): Promise<void> {
  const matchingSessions = Array.from(sessions.values()).filter(s => s.projectPath === projectPath);
  if (matchingSessions.length === 0) return;
  logger.info('Stopping all agents for project', { projectPath, count: matchingSessions.length });
  const results = await Promise.allSettled(matchingSessions.map(s => stopAgent(s.id)));
  for (let i = 0; i < results.length; i++) {
    if (results[i].status === 'rejected') {
      const reason = (results[i] as PromiseRejectedResult).reason;
      logger.error('Failed to stop agent session', {
        sessionId: matchingSessions[i].id,
        error: reason instanceof Error ? reason.message : String(reason),
      });
    }
  }
}

export function answerAgentQuestion(projectPath: string, itemId: string, answer: string): void {
  const board = getOrCreateBoard(projectPath);
  const item = board.items.find(i => i.id === itemId);
  if (!item) throw new Error(`Item not found: ${itemId}`);
  if (item.agentStatus !== 'waiting') throw new Error(`Item is not waiting for an answer: ${item.agentStatus}`);
  addComment(board, itemId, 'user', answer);
  updateItem(board, itemId, {
    agentStatus: 'idle', agentQuestion: undefined, agentQuestionOptions: undefined,
  });
}

export async function resumeAgent(params: StartAgentParams): Promise<StartAgentResult> {
  const { projectPath, itemId } = params;
  const board = getOrCreateBoard(projectPath);
  const item = board.items.find(i => i.id === itemId);
  if (!item) return { sessionId: '', error: `Item not found: ${itemId}` };
  if (item.agentStatus !== 'idle' && item.agentStatus !== 'interrupted') {
    return { sessionId: '', error: `Item cannot be resumed in current state: ${item.agentStatus}` };
  }
  return startAgent(params);
}

export function getAgentEvents(sessionId: string): EventEmitter | undefined {
  return sessions.get(sessionId)?.events;
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

export function backfillWorktreePaths(projectPath: string): number {
  const board = getOrCreateBoard(projectPath);
  const resolvedPath = path.resolve(projectPath);
  let backfilled = 0;
  for (const item of board.items) {
    if (item.branch && !item.worktreePath && item.mergeStatus !== 'merged') {
      try {
        const sanitized = sanitizeBranchName(item.branch);
        if (sanitized !== item.branch) updateItem(board, item.id, { branch: sanitized });
        const expectedPath = getWorktreePath(resolvedPath, sanitized);
        if (fs.existsSync(expectedPath)) {
          updateItem(board, item.id, { worktreePath: expectedPath, mergeStatus: 'unmerged' });
          backfilled++;
        }
      } catch { /* Skip items with invalid branch names */
      }
    }
  }
  return backfilled;
}
