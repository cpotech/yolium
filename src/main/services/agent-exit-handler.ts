import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createLogger } from '@main/lib/logger';
import {
  getOrCreateBoard,
  updateItem,
  addComment,
} from '@main/stores/kanban-store';
import { getAgentSession } from '@main/docker';
import { getCompletionColumn } from './agent-model';

const logger = createLogger('agent-exit-handler');

/** Try to read a file, returning its trimmed content or undefined. */
function readOutputFile(filePath: string, label: string, itemId: string): string | undefined {
  try {
    if (fs.existsSync(filePath)) {
      const text = fs.readFileSync(filePath, 'utf-8').trim();
      if (text.length > 0) {
        logger.info(`Read ${label}`, { itemId, length: text.length });
        return text;
      }
    }
  } catch (err) {
    logger.warn(`Failed to read ${label}`, { itemId, error: err instanceof Error ? err.message : String(err) });
  }
  return undefined;
}

export interface AgentExitParams {
  code: number;
  projectPath: string;
  itemId: string;
  agentName: string;
  provider: string;
  sessionId: string;
  events: EventEmitter;
  worktreePath: string | undefined;
  resolvedProjectPath: string;
  timeoutMinutes: number;
  originalItemDescription: string | undefined;
  onComplete?: (summary: string) => void;
  onError?: (message: string) => void;
}

/**
 * Synthesize missing protocol actions from non-Claude agent output.
 * Non-Claude providers (e.g., Codex) don't follow the @@YOLIUM protocol natively,
 * so we read file-based output and accumulated message texts on exit.
 */
export function synthesizeNonClaudeConclusion(params: {
  sessionId: string;
  agentName: string;
  itemId: string;
  projectPath: string;
  outputDir: string;
  originalItemDescription: string | undefined;
}): void {
  const { sessionId, agentName, itemId, projectPath, outputDir, originalItemDescription } = params;
  const agentSession = getAgentSession(sessionId);
  if (!agentSession) return;

  const board = getOrCreateBoard(projectPath);

  // Strategy 1: Read file-based output (Codex has internal reasoning and
  // doesn't externalize as text, so we read from known output files)
  const fileMap: Record<string, { file: string; label: string; updateDesc?: boolean }> = {
    'plan-agent': { file: '.yolium-plan.md', label: 'plan', updateDesc: true },
    'code-agent': { file: '.yolium-summary.md', label: 'summary' },
    'scout-agent': { file: '.yolium-scout.json', label: 'dossier' },
    'verify-agent': { file: '.yolium-verify.md', label: 'verification report' },
    'ba-agent': { file: '.yolium-ba-report.md', label: 'business analysis report' },
    'kb-agent': { file: '.yolium-kb-summary.md', label: 'KB update summary' },
  };

  const fileSpec = fileMap[agentName];
  if (fileSpec) {
    const skipPlan = agentName === 'plan-agent' && agentSession.receivedUpdateDescription;
    if (!skipPlan) {
      const text = readOutputFile(path.join(outputDir, fileSpec.file), fileSpec.label, itemId);
      if (text) {
        if (fileSpec.updateDesc) updateItem(board, itemId, { description: text });
        addComment(board, itemId, 'agent', text);
      }
    }
  }

  // Strategy 2: Fall back to accumulated agent message texts
  const accumulated = agentSession.agentMessageTexts || [];
  if (agentName === 'plan-agent' && !agentSession.receivedUpdateDescription && accumulated.length > 0) {
    // Only use if file-based approach didn't produce a description
    const currentItem = board.items.find(i => i.id === itemId);
    if (currentItem && currentItem.description === originalItemDescription) {
      const planText = accumulated.reduce((a, b) => a.length > b.length ? a : b, '');
      updateItem(board, itemId, { description: planText });
      addComment(board, itemId, 'agent', planText);
    }
  }
}

/**
 * Handle agent container exit. Updates kanban item status based on exit code,
 * detected errors, and protocol activity.
 */
export function handleAgentExit(params: AgentExitParams): void {
  const {
    code,
    projectPath,
    itemId,
    agentName,
    provider,
    sessionId,
    events,
    worktreePath,
    resolvedProjectPath,
    timeoutMinutes,
    originalItemDescription,
    onComplete,
    onError,
  } = params;

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

    // Conclusion synthesis for non-Claude providers
    if (isNonClaude && agentSession) {
      const outputDir = worktreePath || resolvedProjectPath;
      synthesizeNonClaudeConclusion({
        sessionId,
        agentName,
        itemId,
        projectPath,
        outputDir,
        originalItemDescription,
      });
    }
  } else if (code === 124) {
    // Timeout
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
}
