import { extractProtocolMessages } from '@main/services/agent-protocol';
import type { AgentContainerSession } from './shared';

/**
 * Error patterns to detect in agent output (for non-Claude providers).
 * These patterns indicate API errors, auth failures, rate limits, etc.
 */
const ERROR_PATTERNS = [
  { pattern: /401 Unauthorized|Missing bearer.*authentication/i, message: 'Authentication failed (401 Unauthorized)' },
  { pattern: /429 Too Many Requests|rate limit/i, message: 'Rate limit exceeded (429 Too Many Requests)' },
  { pattern: /overloaded|503 Service/i, message: 'API overloaded (503 Service Unavailable)' },
  { pattern: /ECONNREFUSED|ENOTFOUND|network error|connection refused/i, message: 'Network error (connection failed)' },
  { pattern: /Error:\s*(.+)/i, message: (match: RegExpMatchArray) => `Codex error: ${match[1]}` },
] as const;

export interface ParsedStreamEvent {
  display?: string;
  text?: string;
  isAgentMessage?: boolean;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  };
}

/**
 * Detect errors in raw output text for non-Claude providers.
 * Returns the first detected error message, or undefined if no error found.
 */
export function detectErrorInOutput(text: string, provider?: string): string | undefined {
  if (provider === 'claude' || !provider) {
    return undefined;
  }

  for (const { pattern, message } of ERROR_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      if (typeof message === 'function') {
        return message(match);
      }
      return message;
    }
  }

  return undefined;
}

function formatToolUse(name: string, input: Record<string, unknown> | undefined): string {
  if (!input) return `[Tool: ${name}]`;

  switch (name) {
    case 'Read':
      return `[Read] ${input.file_path || ''}`;
    case 'Write':
      return `[Write] ${input.file_path || ''}`;
    case 'Edit':
      return `[Edit] ${input.file_path || ''}`;
    case 'Bash':
      return `[Bash] ${((input.command as string) || '').slice(0, 120)}`;
    case 'Glob':
      return `[Glob] ${input.pattern || ''}`;
    case 'Grep':
      return `[Grep] ${input.pattern || ''}`;
    default:
      return `[Tool: ${name}]`;
  }
}

export function combineUsageParts(
  usageParts: Array<NonNullable<ParsedStreamEvent['usage']>>
): NonNullable<ParsedStreamEvent['usage']> {
  return usageParts.reduce(
    (acc, usage) => ({
      inputTokens: acc.inputTokens + usage.inputTokens,
      outputTokens: acc.outputTokens + usage.outputTokens,
      costUsd: acc.costUsd + usage.costUsd,
    }),
    { inputTokens: 0, outputTokens: 0, costUsd: 0 }
  );
}

export function accumulateSessionUsage(
  session: Pick<AgentContainerSession, 'cumulativeUsage'>,
  usage: NonNullable<ParsedStreamEvent['usage']>
): void {
  session.cumulativeUsage.inputTokens += usage.inputTokens;
  session.cumulativeUsage.outputTokens += usage.outputTokens;
  session.cumulativeUsage.costUsd += usage.costUsd;
}

export function parseStreamEvent(event: Record<string, unknown>): ParsedStreamEvent {
  switch (event.type) {
    case 'system':
      return { display: '[Agent] Session started' };

    case 'assistant': {
      const message = event.message as Record<string, unknown> | undefined;
      const content = message?.content as Array<Record<string, unknown>> | undefined;
      if (!Array.isArray(content)) return {};

      const displayParts: string[] = [];
      let text = '';

      for (const item of content) {
        if (item.type === 'text' && typeof item.text === 'string') {
          displayParts.push(item.text);
          text += item.text;
        } else if (item.type === 'tool_use' && typeof item.name === 'string') {
          const name = item.name as string;
          const input = item.input as Record<string, unknown> | undefined;

          displayParts.push(formatToolUse(name, input));

          if (name === 'Bash') {
            const command = input?.command;
            if (typeof command === 'string' && command.includes('@@YOLIUM:')) {
              text += `${command}\n`;
            }
          }
        }
      }

      return {
        display: displayParts.length > 0 ? displayParts.join('\n') : undefined,
        text: text || undefined,
      };
    }

    case 'result': {
      const result = event.result as string | undefined;
      const costUsd = event.cost_usd as number | undefined;
      const usage = event.usage as { input_tokens?: number; output_tokens?: number } | undefined;
      const inputTokens = usage?.input_tokens ?? 0;
      const outputTokens = usage?.output_tokens ?? 0;
      const parts: string[] = [];

      if (result) parts.push(result);
      if (typeof costUsd === 'number') parts.push(`[Cost: $${costUsd.toFixed(4)}]`);

      return {
        display: parts.length > 0 ? parts.join('\n') : undefined,
        ...(typeof costUsd === 'number' || inputTokens > 0 || outputTokens > 0
          ? { usage: { inputTokens, outputTokens, costUsd: costUsd ?? 0 } }
          : {}),
      };
    }

    case 'thread.started':
      return { display: '[Agent] Codex session started' };

    case 'turn.started':
      return { display: '[Agent] Turn started' };

    case 'item.started': {
      const item = event.item as Record<string, unknown> | undefined;
      if (!item) return {};
      if (item.type === 'command_execution' && typeof item.command === 'string') {
        return { display: `[Bash] ${item.command.slice(0, 120)}` };
      }
      return {};
    }

    case 'item.completed': {
      const item = event.item as Record<string, unknown> | undefined;
      if (!item) return {};

      if (item.type === 'agent_message') {
        const content = item.content as Array<Record<string, unknown>> | undefined;
        if (!Array.isArray(content)) return {};

        const displayParts: string[] = [];
        let text = '';

        for (const block of content) {
          if (block.type === 'text' && typeof block.text === 'string') {
            displayParts.push(block.text);
            text += block.text;
          }
        }

        return {
          display: displayParts.length > 0 ? displayParts.join('\n') : undefined,
          text: text || undefined,
          isAgentMessage: true,
        };
      }

      if (item.type === 'command_execution') {
        const output = typeof item.output === 'string' ? item.output : '';
        const displayOutput = output.length > 500 ? `${output.slice(0, 500)}…` : output;

        return {
          display: displayOutput || undefined,
          text: output.includes('@@YOLIUM:') ? output : undefined,
        };
      }

      if (item.type === 'file_change') {
        const filename = typeof item.filename === 'string' ? item.filename : '';
        return { display: filename ? `[File] ${filename}` : undefined };
      }

      return {};
    }

    case 'turn.completed': {
      const usage = event.usage as Record<string, unknown> | undefined;
      if (!usage) return {};

      const inputTokens =
        (typeof usage.input_tokens === 'number' ? usage.input_tokens : 0) +
        (typeof usage.cached_input_tokens === 'number' ? usage.cached_input_tokens : 0);
      const outputTokens = typeof usage.output_tokens === 'number' ? usage.output_tokens : 0;
      const costUsd = (inputTokens * 2) / 1_000_000 + (outputTokens * 8) / 1_000_000;

      return {
        display: `[Cost: $${costUsd.toFixed(4)}]`,
        usage: { inputTokens, outputTokens, costUsd },
      };
    }

    default:
      return {};
  }
}

export function processStreamChunk(
  dataStr: string,
  lineBuffer: string
): {
  lineBuffer: string;
  displayParts: string[];
  textContent: string;
  usageParts: NonNullable<ParsedStreamEvent['usage']>[];
  agentMessageTexts: string[];
} {
  lineBuffer += dataStr;
  const lines = lineBuffer.split('\n');
  lineBuffer = lines.pop() || '';

  const displayParts: string[] = [];
  const usageParts: Array<NonNullable<ParsedStreamEvent['usage']>> = [];
  const agentMessageTexts: string[] = [];
  let textContent = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    try {
      const event = JSON.parse(trimmed);
      const parsed = parseStreamEvent(event);
      if (parsed.display) displayParts.push(parsed.display);
      if (parsed.text) textContent += `${parsed.text}\n`;
      if (parsed.usage) usageParts.push(parsed.usage);
      if (parsed.isAgentMessage && parsed.text) agentMessageTexts.push(parsed.text);
    } catch {
      displayParts.push(trimmed);
      textContent += `${trimmed}\n`;
    }
  }

  return { lineBuffer, displayParts, textContent, usageParts, agentMessageTexts };
}

export function flushLineBuffer(
  lineBuffer: string
): {
  textContent: string;
  protocolMessages: unknown[];
  usage?: NonNullable<ParsedStreamEvent['usage']>;
} {
  const trimmed = lineBuffer.trim();
  if (!trimmed) {
    return { textContent: '', protocolMessages: [] };
  }

  let textContent: string;
  let usage: NonNullable<ParsedStreamEvent['usage']> | undefined;

  try {
    const event = JSON.parse(trimmed);
    const parsed = parseStreamEvent(event);
    textContent = parsed.text ? `${parsed.text}\n` : '';
    usage = parsed.usage;
  } catch {
    textContent = `${trimmed}\n`;
  }

  const protocolMessages = textContent
    ? extractProtocolMessages(textContent.endsWith('\n') ? textContent.slice(0, -1) : textContent)
    : [];

  return { textContent, protocolMessages, usage };
}
