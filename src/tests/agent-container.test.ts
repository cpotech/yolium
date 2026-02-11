import { describe, it, expect, vi } from 'vitest';

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: () => [],
  },
}));

vi.mock('@main/lib/logger', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

import { parseStreamEvent } from '@main/docker/agent-container';
import { extractProtocolMessages } from '@main/services/agent-protocol';

describe('parseStreamEvent', () => {
  it('extracts @@YOLIUM messages from Bash tool_use commands', () => {
    const parsed = parseStreamEvent({
      type: 'assistant',
      message: {
        content: [
          {
            type: 'tool_use',
            name: 'Bash',
            input: {
              command: "echo '@@YOLIUM:{\"type\":\"comment\",\"text\":\"Posted from bash\"}'",
            },
          },
        ],
      },
    });

    expect(parsed.text).toContain('@@YOLIUM:');
    const messages = extractProtocolMessages(parsed.text || '');
    expect(messages).toEqual([{ type: 'add_comment', text: 'Posted from bash' }]);
  });

  it('extracts multiple @@YOLIUM messages from one Bash command', () => {
    const parsed = parseStreamEvent({
      type: 'assistant',
      message: {
        content: [
          {
            type: 'tool_use',
            name: 'Bash',
            input: {
              command: "echo '@@YOLIUM:{\"type\":\"progress\",\"step\":\"tests\",\"detail\":\"running\"}' && echo '@@YOLIUM:{\"type\":\"complete\",\"summary\":\"done\"}'",
            },
          },
        ],
      },
    });

    const messages = extractProtocolMessages(parsed.text || '');
    expect(messages).toEqual([
      { type: 'progress', step: 'tests', detail: 'running', attempt: undefined, maxAttempts: undefined },
      { type: 'complete', summary: 'done' },
    ]);
  });

  it('does not add non-protocol Bash commands to text output', () => {
    const parsed = parseStreamEvent({
      type: 'assistant',
      message: {
        content: [
          {
            type: 'tool_use',
            name: 'Bash',
            input: { command: 'echo hello world' },
          },
        ],
      },
    });

    expect(parsed.text).toBeUndefined();
  });

  it('keeps existing text-based protocol extraction behavior', () => {
    const parsed = parseStreamEvent({
      type: 'assistant',
      message: {
        content: [
          {
            type: 'text',
            text: '@@YOLIUM:{"type":"complete","summary":"done"}',
          },
        ],
      },
    });

    const messages = extractProtocolMessages(parsed.text || '');
    expect(messages).toEqual([{ type: 'complete', summary: 'done' }]);
  });

  it('extracts usage and cost from result events', () => {
    const parsed = parseStreamEvent({
      type: 'result',
      result: 'Done',
      cost_usd: 0.01234,
      usage: { input_tokens: 1234, output_tokens: 567 },
    });

    expect(parsed.usage).toEqual({
      inputTokens: 1234,
      outputTokens: 567,
      costUsd: 0.01234,
    });
  });

  it('returns usage with zero cost when cost is missing', () => {
    const parsed = parseStreamEvent({
      type: 'result',
      usage: { input_tokens: 10, output_tokens: 20 },
    });

    expect(parsed.usage).toEqual({
      inputTokens: 10,
      outputTokens: 20,
      costUsd: 0,
    });
  });

  it('omits usage when result event has no usage or cost', () => {
    const parsed = parseStreamEvent({ type: 'result' });
    expect(parsed.usage).toBeUndefined();
  });
});
