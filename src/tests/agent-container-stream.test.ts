import { describe, it, expect } from 'vitest';
import type { AgentContainerSession } from '@main/docker';
import { extractProtocolMessages } from '@main/services/agent-protocol';
import {
  detectErrorInOutput,
  parseStreamEvent,
  processStreamChunk,
  flushLineBuffer,
  combineUsageParts,
  accumulateSessionUsage,
} from '@main/docker/agent-container-stream';

describe('agent-container stream helpers', () => {
  it('parseStreamEvent extracts @@YOLIUM protocol text from Claude Bash tool_use commands without surfacing non-protocol Bash commands as raw text', () => {
    const protocolParsed = parseStreamEvent({
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

    expect(protocolParsed.display).toContain('[Bash]');
    expect(protocolParsed.text).toContain('@@YOLIUM:');
    expect(extractProtocolMessages(protocolParsed.text || '')).toEqual([
      { type: 'add_comment', text: 'Posted from bash' },
    ]);

    const nonProtocolParsed = parseStreamEvent({
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

    expect(nonProtocolParsed.display).toContain('[Bash]');
    expect(nonProtocolParsed.text).toBeUndefined();
  });

  it('parseStreamEvent converts Codex turn.completed usage fields into inputTokens, outputTokens, and estimated costUsd', () => {
    const parsed = parseStreamEvent({
      type: 'turn.completed',
      usage: {
        input_tokens: 500,
        output_tokens: 200,
        cached_input_tokens: 100,
      },
    });

    expect(parsed.usage).toEqual({
      inputTokens: 600,
      outputTokens: 200,
      costUsd: 0.0028,
    });
    expect(parsed.display).toBe('[Cost: $0.0028]');
  });

  it('detectErrorInOutput ignores Claude output and returns the first matching non-Claude error pattern', () => {
    expect(detectErrorInOutput('401 Unauthorized', 'claude')).toBeUndefined();
    expect(
      detectErrorInOutput(
        'Rate limit exceeded (429 Too Many Requests). Error: Something else happened.',
        'codex'
      )
    ).toBe('Rate limit exceeded (429 Too Many Requests)');
  });

  it('processStreamChunk buffers an incomplete JSON line across chunks and emits parsed display/text once the line completes', () => {
    const partial = processStreamChunk('{"type":"ass', '');

    expect(partial.lineBuffer).toBe('{"type":"ass');
    expect(partial.displayParts).toEqual([]);
    expect(partial.textContent).toBe('');

    const completed = processStreamChunk(
      'istant","message":{"content":[{"type":"text","text":"hello"}]}}\n',
      partial.lineBuffer
    );

    expect(completed.lineBuffer).toBe('');
    expect(completed.displayParts).toEqual(['hello']);
    expect(completed.textContent).toBe('hello\n');
  });

  it('processStreamChunk preserves raw non-JSON stderr or entrypoint lines while still collecting agentMessageTexts from Codex agent_message events', () => {
    const result = processStreamChunk(
      [
        'Starting agent...',
        '{"type":"item.completed","item":{"type":"agent_message","content":[{"type":"text","text":"Analysis complete: found 3 issues in the codebase"}]}}',
        '{"type":"item.completed","item":{"type":"command_execution","command":"ls","output":"plain output"}}',
      ].join('\n') + '\n',
      ''
    );

    expect(result.displayParts).toContain('Starting agent...');
    expect(result.displayParts).toContain('Analysis complete: found 3 issues in the codebase');
    expect(result.displayParts).toContain('plain output');
    expect(result.textContent).toContain('Starting agent...');
    expect(result.agentMessageTexts).toEqual(['Analysis complete: found 3 issues in the codebase']);
  });

  it('flushLineBuffer extracts protocol messages and usage from a final buffered result event without duplicating text', () => {
    const protocolResult = flushLineBuffer(
      '{"type":"assistant","message":{"content":[{"type":"text","text":"@@YOLIUM:{\\"type\\":\\"complete\\",\\"summary\\":\\"done\\"}"}]}}'
    );

    expect(protocolResult.textContent).toBe('@@YOLIUM:{"type":"complete","summary":"done"}\n');
    expect(protocolResult.protocolMessages).toEqual([{ type: 'complete', summary: 'done' }]);

    const usageResult = flushLineBuffer(
      '{"type":"result","cost_usd":0.05,"usage":{"input_tokens":100,"output_tokens":50}}'
    );

    expect(usageResult.textContent).toBe('');
    expect(usageResult.protocolMessages).toEqual([]);
    expect(usageResult.usage).toEqual({
      inputTokens: 100,
      outputTokens: 50,
      costUsd: 0.05,
    });
  });

  it('parseStreamEvent result event does not duplicate assistant text in display output', () => {
    const parsed = parseStreamEvent({
      type: 'result',
      result: 'This is the agent response text that was already shown by the assistant event',
      cost_usd: 0.0123,
      usage: { input_tokens: 500, output_tokens: 200 },
    });

    // Should only show the cost line, not the duplicated result text
    expect(parsed.display).toBe('[Cost: $0.0123]');
    expect(parsed.display).not.toContain('agent response text');
    expect(parsed.usage).toEqual({
      inputTokens: 500,
      outputTokens: 200,
      costUsd: 0.0123,
    });
  });

  it('parseStreamEvent result event with no cost returns no display', () => {
    const parsed = parseStreamEvent({
      type: 'result',
      result: 'Some text that should not appear',
    });

    expect(parsed.display).toBeUndefined();
  });

  it('combines usage parts and accumulates them into the session total', () => {
    const combined = combineUsageParts([
      { inputTokens: 100, outputTokens: 50, costUsd: 0.001 },
      { inputTokens: 40, outputTokens: 80, costUsd: 0.0025 },
    ]);

    expect(combined).toEqual({
      inputTokens: 140,
      outputTokens: 130,
      costUsd: 0.0035,
    });

    const session = {
      cumulativeUsage: { inputTokens: 10, outputTokens: 20, costUsd: 0.0009 },
    } as AgentContainerSession;

    accumulateSessionUsage(session, combined);

    expect(session.cumulativeUsage).toEqual({
      inputTokens: 150,
      outputTokens: 150,
      costUsd: 0.0044,
    });
  });
});
