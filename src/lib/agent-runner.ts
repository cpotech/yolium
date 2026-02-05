// src/lib/agent-runner.ts
import { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { createLogger } from './logger';
import { loadAgentDefinition, ParsedAgent } from './agent-loader';
import { extractProtocolMessages } from './agent-protocol';
import {
  getOrCreateBoard,
  addItem,
  updateItem,
  addComment,
  buildConversationHistory,
} from './kanban-store';
import {
  createAgentContainer,
  stopAgentContainer,
  checkAgentAuth,
} from '../docker-manager';
import type { KanbanBoard, KanbanItem } from '../types/kanban';
import type {
  AskQuestionMessage,
  CreateItemMessage,
  CompleteMessage,
  ErrorMessage,
  ProgressMessage,
} from '../types/agent';

const logger = createLogger('agent-runner');

export interface BuildPromptParams {
  systemPrompt: string;
  goal: string;
  conversationHistory: string;
}

export function buildAgentPrompt(params: BuildPromptParams): string {
  const { systemPrompt, goal, conversationHistory } = params;

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

const MODEL_MAP: Record<string, string> = {
  opus: 'claude-opus-4-5-20251101',
  sonnet: 'claude-sonnet-4-5-20250929',
  haiku: 'claude-haiku-4-5-20251001',
};

/**
 * Resolve the model to use for an agent run.
 * Item-level model takes priority over agent-level model.
 */
export function resolveModel(itemModel: string | undefined, agentModel: string): string {
  const shortName = itemModel || agentModel;
  return MODEL_MAP[shortName] || shortName;
}

export interface StartAgentParams {
  webContentsId: number;
  agentName: string;
  projectPath: string;
  itemId: string;
  goal: string;
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
    onOutput,
    onQuestion,
    onItemCreated,
    onComplete,
    onError,
    onProgress,
  } = params;

  // Check if Claude is authenticated
  const auth = checkAgentAuth('claude');
  if (!auth.authenticated) {
    return {
      sessionId: '',
      error: 'Claude is not authenticated. Please authenticate Claude first using an interactive container.',
    };
  }

  const agent = loadAgentDefinition(agentName);
  const board = getOrCreateBoard(projectPath);
  const item = board.items.find(i => i.id === itemId);

  if (!item) {
    return {
      sessionId: '',
      error: `Item not found: ${itemId}`,
    };
  }

  const conversationHistory = buildConversationHistory(item);
  const prompt = buildAgentPrompt({
    systemPrompt: agent.systemPrompt,
    goal,
    conversationHistory,
  });

  // Update item status to running and move to in-progress column
  updateItem(board, itemId, { agentStatus: 'running', column: 'in-progress' });
  addComment(board, itemId, 'system', `${agentName} started`);

  // Resolve model: item-level model overrides agent-level model
  const model = resolveModel(item.model, agent.model);

  logger.info('Starting agent container', { agentName, projectPath, itemId, model });

  try {
    // Create the agent container
    const sessionId = await createAgentContainer(
      {
        webContentsId,
        projectPath,
        agentName,
        prompt,
        model,
        tools: agent.tools,
        itemId,
      },
      {
        onOutput: (data: string) => {
          // Forward raw output
          onOutput?.(data);
          // Also process via handleAgentOutput for protocol messages
          handleAgentOutput(sessionId, data);
        },
        onProtocolMessage: (message: unknown) => {
          // Protocol messages are handled in handleAgentOutput
          // This callback can be used for additional processing
        },
        onExit: (code: number) => {
          const session = sessions.get(sessionId);
          if (session) {
            const exitBoard = getOrCreateBoard(session.projectPath);
            const exitItem = exitBoard.items.find(i => i.id === session.itemId);

            if (code === 0) {
              // Success - check if already marked as completed
              if (exitItem && exitItem.agentStatus === 'running') {
                updateItem(exitBoard, session.itemId, { agentStatus: 'completed' });
                addComment(exitBoard, session.itemId, 'system', 'Agent finished successfully');
              }
            } else if (code === 124) {
              // Timeout
              updateItem(exitBoard, session.itemId, { agentStatus: 'failed' });
              addComment(exitBoard, session.itemId, 'system', 'Agent timed out (no activity for 10 minutes)');
              onError?.('Agent timed out');
            } else {
              // Non-zero exit that wasn't handled by protocol
              if (exitItem && exitItem.agentStatus === 'running') {
                updateItem(exitBoard, session.itemId, { agentStatus: 'failed' });
                addComment(exitBoard, session.itemId, 'system', `Agent exited with code ${code}`);
                onError?.(`Agent exited with code ${code}`);
              }
            }

            sessions.delete(sessionId);
          }
        },
      }
    );

    // Store session for tracking
    const events = new EventEmitter();
    const session: AgentSession = {
      id: sessionId,
      agentName,
      itemId,
      projectPath,
      process: null, // Container-based, no direct process reference
      events,
    };
    sessions.set(sessionId, session);

    // Wire up event listeners for callbacks
    if (onQuestion) {
      events.on('question', onQuestion);
    }
    if (onItemCreated) {
      events.on('itemCreated', onItemCreated);
    }
    if (onComplete) {
      events.on('complete', onComplete);
    }
    if (onError) {
      events.on('error', onError);
    }
    if (onProgress) {
      events.on('progress', onProgress);
    }

    return { sessionId };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error('Failed to create agent container', { agentName, projectPath, error: errorMessage });

    // Revert status on failure
    updateItem(board, itemId, { agentStatus: 'failed' });
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

  for (const message of messages) {
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
        addComment(board, session.itemId, 'agent', q.text);
        session.events.emit('question', q);
        break;
      }

      case 'create_item': {
        const c = message as CreateItemMessage;
        const newItem = addItem(board, {
          title: c.title,
          description: c.description,
          branch: c.branch,
          agentType: c.agentType,
          order: c.order,
          model: c.model,
        });
        session.events.emit('itemCreated', newItem);
        break;
      }

      case 'complete': {
        const comp = message as CompleteMessage;
        // Move to done column when agent completes successfully
        updateItem(board, session.itemId, { agentStatus: 'completed', column: 'done' });
        addComment(board, session.itemId, 'system', `Completed: ${comp.summary}`);
        session.events.emit('complete', comp.summary);
        break;
      }

      case 'error': {
        const err = message as ErrorMessage;
        updateItem(board, session.itemId, { agentStatus: 'failed' });
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

export async function stopAgent(sessionId: string): Promise<void> {
  const session = sessions.get(sessionId);
  if (!session) return;

  // Stop the container
  await stopAgentContainer(sessionId);

  const board = getOrCreateBoard(session.projectPath);
  const item = board.items.find(i => i.id === session.itemId);
  if (item && item.agentStatus === 'running') {
    updateItem(board, session.itemId, { agentStatus: 'interrupted' });
    addComment(board, session.itemId, 'system', 'Agent was interrupted');
  }

  sessions.delete(sessionId);
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
    if (item.agentStatus === 'running') {
      updateItem(board, item.id, { agentStatus: 'interrupted' });
      addComment(board, item.id, 'system', 'Agent was interrupted (app closed)');
      interrupted.push(item);
    }
  }

  return interrupted;
}
