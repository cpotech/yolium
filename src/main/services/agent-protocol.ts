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
const VALID_TYPES = ['ask_question', 'create_item', 'update_description', 'add_comment', 'comment', 'complete', 'error', 'progress'] as const;

type AnyProtocolMessage = AskQuestionMessage | CreateItemMessage | UpdateDescriptionMessage | AddCommentMessage | CompleteMessage | ErrorMessage | ProgressMessage;

/**
 * Extract the first balanced JSON object from a string.
 * Handles nested objects and strings with escaped characters.
 * Returns the JSON substring or null if no balanced object is found.
 */
export function extractFirstJsonObject(input: string): string | null {
  const start = input.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < input.length; i++) {
    const ch = input[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (inString) {
      if (ch === '\\') escape = true;
      else if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return input.slice(start, i + 1);
    }
  }

  return null;
}

export function parseProtocolMessage(json: string): AnyProtocolMessage | null {
  try {
    // Extract just the first JSON object — Codex may concatenate multiple
    // protocol messages on a single line with trailing content after the '}'.
    const jsonStr = extractFirstJsonObject(json) || json;
    const parsed = JSON.parse(jsonStr);

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
      case 'comment':
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
    // Scan for ALL @@YOLIUM: occurrences in the line.
    // Codex may concatenate multiple protocol messages on a single line.
    let searchFrom = 0;
    while (searchFrom < line.length) {
      const prefixIndex = line.indexOf(PROTOCOL_PREFIX, searchFrom);
      if (prefixIndex === -1) break;

      const afterPrefix = line.slice(prefixIndex + PROTOCOL_PREFIX.length);
      const jsonStr = extractFirstJsonObject(afterPrefix);
      if (jsonStr) {
        const message = parseProtocolMessage(jsonStr);
        if (message) {
          messages.push(message);
        }
        // Move past this message to find the next one
        searchFrom = prefixIndex + PROTOCOL_PREFIX.length + afterPrefix.indexOf(jsonStr) + jsonStr.length;
      } else {
        // No valid JSON found, skip past this prefix
        searchFrom = prefixIndex + PROTOCOL_PREFIX.length;
      }
    }
  }

  return messages;
}
