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
import type { KanbanBoard, KanbanItem } from '../types/kanban';
import type {
  AskQuestionMessage,
  CreateItemMessage,
  CompleteMessage,
  ErrorMessage,
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

export interface StartAgentParams {
  agentName: string;
  projectPath: string;
  itemId: string;
  goal: string;
  onOutput?: (data: string) => void;
  onQuestion?: (question: AskQuestionMessage) => void;
  onItemCreated?: (item: KanbanItem) => void;
  onComplete?: (summary: string) => void;
  onError?: (message: string) => void;
}

export async function startAgent(params: StartAgentParams): Promise<string> {
  const {
    agentName,
    projectPath,
    itemId,
    goal,
  } = params;

  const agent = loadAgentDefinition(agentName);
  const board = getOrCreateBoard(projectPath);
  const item = board.items.find(i => i.id === itemId);

  if (!item) {
    throw new Error(`Item not found: ${itemId}`);
  }

  const conversationHistory = buildConversationHistory(item);
  const prompt = buildAgentPrompt({
    systemPrompt: agent.systemPrompt,
    goal,
    conversationHistory,
  });

  // Update item status to running
  updateItem(board, itemId, { agentStatus: 'running' });
  addComment(board, itemId, 'system', `${agentName} started`);

  const sessionId = `agent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const events = new EventEmitter();

  const session: AgentSession = {
    id: sessionId,
    agentName,
    itemId,
    projectPath,
    process: null,
    events,
  };
  sessions.set(sessionId, session);

  // Build claude command
  // In production, this runs in a Docker container via docker-manager
  // For now, we'll prepare the command that docker-manager will execute
  const claudeArgs = [
    '--model', agent.model === 'opus' ? 'claude-opus-4-5-20251101' : agent.model,
    '-p', prompt,
    '--allowedTools', agent.tools.join(','),
    '--dangerously-skip-permissions',
  ];

  logger.info('Starting agent', { sessionId, agentName, claudeArgs: claudeArgs.slice(0, 4) });

  // The actual process spawning will be done by docker-manager
  // This function returns the session ID for tracking
  // The docker-manager will call handleAgentOutput with stdout data

  return sessionId;
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
        updateItem(board, session.itemId, {
          agentStatus: 'waiting',
          agentQuestion: q.text,
          agentQuestionOptions: q.options,
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
        });
        session.events.emit('itemCreated', newItem);
        break;
      }

      case 'complete': {
        const comp = message as CompleteMessage;
        updateItem(board, session.itemId, { agentStatus: 'completed' });
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

export function stopAgent(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (!session) return;

  if (session.process) {
    session.process.kill();
  }

  const board = getOrCreateBoard(session.projectPath);
  const item = board.items.find(i => i.id === session.itemId);
  if (item && item.agentStatus === 'running') {
    updateItem(board, session.itemId, { agentStatus: 'interrupted' });
    addComment(board, session.itemId, 'system', 'Agent was interrupted');
  }

  sessions.delete(sessionId);
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
