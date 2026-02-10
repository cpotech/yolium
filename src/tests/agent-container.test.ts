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

describe('parseStreamEvent', () => {
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
