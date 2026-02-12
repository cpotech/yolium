import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IpcMain } from 'electron';

const { getSessionByItemId, getAgentSession } = vi.hoisted(() => ({
  getSessionByItemId: vi.fn(),
  getAgentSession: vi.fn(),
}));

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: vi.fn(() => []),
  },
}));

vi.mock('@main/lib/logger', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

vi.mock('@main/services/agent-runner', () => ({
  startAgent: vi.fn(),
  resumeAgent: vi.fn(),
  stopAgent: vi.fn(),
  answerAgentQuestion: vi.fn(),
  getAgentEvents: vi.fn(),
  getSessionByItemId,
  recoverInterruptedAgents: vi.fn(() => []),
}));

vi.mock('@main/services/agent-loader', () => ({
  listAgents: vi.fn(() => []),
  loadAgentDefinition: vi.fn(),
}));

vi.mock('@main/stores/workitem-log-store', () => ({
  readLog: vi.fn(() => ''),
  deleteLog: vi.fn(() => true),
}));

vi.mock('@main/docker', () => ({
  getAgentSession,
}));

import { registerAgentHandlers } from '@main/ipc/agent-handlers';

function registerHandlersForTest(): Map<string, unknown> {
  const handlers = new Map<string, unknown>();
  const ipcMain = {
    handle: vi.fn((channel: string, handler: unknown) => {
      handlers.set(channel, handler);
    }),
  } as unknown as IpcMain;

  registerAgentHandlers(ipcMain);
  return handlers;
}

describe('agent:get-active-session handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns sessionId and cumulative usage for active sessions', () => {
    getSessionByItemId.mockReturnValue({ id: 'session-1' });
    getAgentSession.mockReturnValue({
      cumulativeUsage: { inputTokens: 123, outputTokens: 456, costUsd: 0.0789 },
    });

    const handlers = registerHandlersForTest();
    const handler = handlers.get('agent:get-active-session');
    expect(handler).toBeTypeOf('function');

    const result = (handler as (event: unknown, projectPath: string, itemId: string) => unknown)(
      {},
      '/test/project',
      'item-1'
    );

    expect(getSessionByItemId).toHaveBeenCalledWith('/test/project', 'item-1');
    expect(getAgentSession).toHaveBeenCalledWith('session-1');
    expect(result).toEqual({
      sessionId: 'session-1',
      cumulativeUsage: { inputTokens: 123, outputTokens: 456, costUsd: 0.0789 },
    });
  });

  it('returns zeroed cumulative usage when container session is unavailable', () => {
    getSessionByItemId.mockReturnValue({ id: 'session-2' });
    getAgentSession.mockReturnValue(undefined);

    const handlers = registerHandlersForTest();
    const handler = handlers.get('agent:get-active-session');
    expect(handler).toBeTypeOf('function');

    const result = (handler as (event: unknown, projectPath: string, itemId: string) => unknown)(
      {},
      '/test/project',
      'item-2'
    );

    expect(result).toEqual({
      sessionId: 'session-2',
      cumulativeUsage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
    });
  });

  it('returns null when no active session exists', () => {
    getSessionByItemId.mockReturnValue(undefined);

    const handlers = registerHandlersForTest();
    const handler = handlers.get('agent:get-active-session');
    expect(handler).toBeTypeOf('function');

    const result = (handler as (event: unknown, projectPath: string, itemId: string) => unknown)(
      {},
      '/test/project',
      'item-3'
    );

    expect(getAgentSession).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });
});
