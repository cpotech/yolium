import { createLogger } from '@main/lib/logger';
import { extractProtocolMessages } from './agent-protocol';
import {
  getOrCreateBoard,
  addItem,
  updateItem,
  addComment,
} from '@main/stores/kanban-store';
import { getAgentSession } from '@main/docker';
import { getCompletionColumn } from './agent-model';
import type {
  AskQuestionMessage,
  CreateItemMessage,
  UpdateDescriptionMessage,
  AddCommentMessage,
  SetTestSpecsMessage,
  CompleteMessage,
  ErrorMessage,
  ProgressMessage,
} from '@shared/types/agent';

const logger = createLogger('agent-protocol-handler');

/** Minimal session shape required by the protocol handler. */
export interface ProtocolSession {
  agentName: string;
  itemId: string;
  projectPath: string;
  events: import('node:events').EventEmitter;
}

/**
 * Track processed protocol messages per session to prevent duplicates.
 * Some providers (e.g., Codex) repeat their full output as a result dump,
 * causing protocol messages to be extracted and handled twice.
 */
const processedProtocolMessages = new Map<string, Set<string>>();

export function cleanupSessionDedup(sessionId: string): void {
  processedProtocolMessages.delete(sessionId);
}

export function clearAllDedup(): void {
  processedProtocolMessages.clear();
}

export function handleAgentOutput(
  sessionId: string,
  data: string,
  getSession: (id: string) => ProtocolSession | undefined,
): void {
  const session = getSession(sessionId);
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
