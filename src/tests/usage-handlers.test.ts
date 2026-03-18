import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IpcMain } from 'electron';

vi.mock('@main/lib/logger', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

vi.mock('@main/git/claude-oauth', () => ({
  hasHostClaudeOAuth: vi.fn(() => false),
  fetchClaudeUsage: vi.fn(() => null),
}));

import { registerUsageHandlers } from '@main/ipc/usage-handlers';
import { hasHostClaudeOAuth, fetchClaudeUsage } from '@main/git/claude-oauth';

function registerHandlersForTest(): Map<string, (...args: unknown[]) => unknown> {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const ipcMain = {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler);
    }),
  } as unknown as IpcMain;

  registerUsageHandlers(ipcMain);
  return handlers;
}

describe('usage:get-claude handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should register usage:get-claude channel', () => {
    const handlers = registerHandlersForTest();
    expect(handlers.has('usage:get-claude')).toBe(true);
  });

  it('should return hasOAuth false and null usage when no OAuth credentials', async () => {
    vi.mocked(hasHostClaudeOAuth).mockReturnValue(false);
    vi.mocked(fetchClaudeUsage).mockResolvedValue(null);

    const handlers = registerHandlersForTest();
    const handler = handlers.get('usage:get-claude')!;
    const result = await handler({});

    expect(result).toEqual({
      hasOAuth: false,
      usage: null,
    });
  });

  it('should return hasOAuth true with usage data when OAuth exists', async () => {
    vi.mocked(hasHostClaudeOAuth).mockReturnValue(true);
    vi.mocked(fetchClaudeUsage).mockResolvedValue({
      fiveHour: { utilization: 50, resetsAt: '2026-03-18T12:00:00Z' },
      sevenDay: { utilization: 75, resetsAt: '2026-03-20T12:00:00Z' },
    });

    const handlers = registerHandlersForTest();
    const handler = handlers.get('usage:get-claude')!;
    const result = await handler({});

    expect(result).toEqual({
      hasOAuth: true,
      usage: {
        fiveHour: { utilization: 50, resetsAt: '2026-03-18T12:00:00Z' },
        sevenDay: { utilization: 75, resetsAt: '2026-03-20T12:00:00Z' },
      },
    });
  });
});
