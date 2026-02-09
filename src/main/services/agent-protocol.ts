import type {
  AskQuestionMessage,
  CreateItemMessage,
  UpdateDescriptionMessage,
  AddCommentMessage,
  CompleteMessage,
  ErrorMessage,
  ProgressMessage,
} from '@shared/types/agent';

const PROTOCOL_PREFIX = '@@YOLIUM:';
const VALID_TYPES = ['ask_question', 'create_item', 'update_description', 'add_comment', 'complete', 'error', 'progress'] as const;

type AnyProtocolMessage = AskQuestionMessage | CreateItemMessage | UpdateDescriptionMessage | AddCommentMessage | CompleteMessage | ErrorMessage | ProgressMessage;

export function parseProtocolMessage(json: string): AnyProtocolMessage | null {
  try {
    const parsed = JSON.parse(json);

    if (!parsed.type || !VALID_TYPES.includes(parsed.type)) {
      return null;
    }

    // Validate required fields per message type
    switch (parsed.type) {
      case 'ask_question':
        if (typeof parsed.text !== 'string') return null;
        return {
          type: 'ask_question',
          text: parsed.text,
          options: Array.isArray(parsed.options) ? parsed.options : undefined,
        };

      case 'create_item':
        if (typeof parsed.title !== 'string') {
          return null;
        }
        return {
          type: 'create_item',
          title: parsed.title,
          description: typeof parsed.description === 'string' ? parsed.description : '',
          branch: parsed.branch,
          agentProvider: parsed.agentProvider || parsed.agentType || 'claude',
          order: typeof parsed.order === 'number' ? parsed.order : 0,
          model: typeof parsed.model === 'string' ? parsed.model : undefined,
        };

      case 'update_description':
        if (typeof parsed.description !== 'string') return null;
        return {
          type: 'update_description',
          description: parsed.description,
        };

      case 'add_comment':
        if (typeof parsed.text !== 'string') return null;
        return {
          type: 'add_comment',
          text: parsed.text,
        };

      case 'complete':
        if (typeof parsed.summary !== 'string') return null;
        return {
          type: 'complete',
          summary: parsed.summary,
        };

      case 'error':
        if (typeof parsed.message !== 'string') return null;
        return {
          type: 'error',
          message: parsed.message,
        };

      case 'progress':
        if (typeof parsed.step !== 'string' || typeof parsed.detail !== 'string') return null;
        return {
          type: 'progress',
          step: parsed.step,
          detail: parsed.detail,
          attempt: typeof parsed.attempt === 'number' ? parsed.attempt : undefined,
          maxAttempts: typeof parsed.maxAttempts === 'number' ? parsed.maxAttempts : undefined,
        };

      default:
        return null;
    }
  } catch {
    return null;
  }
}

export function extractProtocolMessages(output: string): AnyProtocolMessage[] {
  const messages: AnyProtocolMessage[] = [];
  const lines = output.split('\n');

  for (const line of lines) {
    const prefixIndex = line.indexOf(PROTOCOL_PREFIX);
    if (prefixIndex === -1) continue;

    const json = line.slice(prefixIndex + PROTOCOL_PREFIX.length).trim();
    const message = parseProtocolMessage(json);
    if (message) {
      messages.push(message);
    }
  }

  return messages;
}
