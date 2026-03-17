import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IpcMain } from 'electron';

const {
  schedulerReload,
  scaffoldSpecialist,
  getDefaultTemplate,
  loadSpecialistRaw,
  updateSpecialistDefinition,
  getScheduleState,
  saveScheduleState,
  toggleSpecialist,
  toggleGlobal,
  getRecentRuns,
  getRunStats,
  getRecentActions,
  getActionsByRun,
  getActionStats,
  loadRedactedCredentials,
  saveCredentials,
  deleteCredentials,
  resetSpecialist,
} = vi.hoisted(() => ({
  schedulerReload: vi.fn(),
  scaffoldSpecialist: vi.fn(),
  getDefaultTemplate: vi.fn(),
  loadSpecialistRaw: vi.fn(),
  updateSpecialistDefinition: vi.fn(),
  getScheduleState: vi.fn(),
  saveScheduleState: vi.fn(),
  toggleSpecialist: vi.fn(),
  toggleGlobal: vi.fn(),
  getRecentRuns: vi.fn(),
  getRunStats: vi.fn(),
  getRecentActions: vi.fn(),
  getActionsByRun: vi.fn(),
  getActionStats: vi.fn(),
  loadRedactedCredentials: vi.fn(),
  saveCredentials: vi.fn(),
  deleteCredentials: vi.fn(),
  resetSpecialist: vi.fn(),
}));

vi.mock('@main/services/scheduler', () => ({
  scheduler: {
    reload: schedulerReload,
    getSpecialists: vi.fn(() => new Map()),
    triggerRun: vi.fn(),
  },
}));

vi.mock('@main/services/specialist-scaffold', () => ({
  scaffoldSpecialist,
  getDefaultTemplate,
  updateSpecialistDefinition,
}));

vi.mock('@main/services/specialist-loader', () => ({
  loadSpecialistRaw,
}));

vi.mock('@main/stores/yolium-db', () => ({
  getScheduleState,
  saveScheduleState,
  toggleSpecialist,
  toggleGlobal,
  getRecentRuns,
  getRunStats,
  getRunLog: vi.fn(() => ''),
  getRecentActions,
  getAllRecentActions: vi.fn(() => []),
  getActionsByRun,
  getActionStats,
  loadRedactedCredentials,
  saveCredentials,
  deleteCredentials,
  resetSpecialist,
}));

import { registerScheduleHandlers } from '@main/ipc/schedule-handlers';

function registerHandlersForTest(): Map<string, unknown> {
  const handlers = new Map<string, unknown>();
  const ipcMain = {
    handle: vi.fn((channel: string, handler: unknown) => {
      handlers.set(channel, handler);
    }),
  } as unknown as IpcMain;

  registerScheduleHandlers(ipcMain);
  return handlers;
}

describe('schedule:update-definition handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateSpecialistDefinition.mockReturnValue('/tmp/agents/cron/security-monitor.md');
  });

  it('should register schedule:update-definition and reload the scheduler after a successful save', () => {
    const handlers = registerHandlersForTest();
    const handler = handlers.get('schedule:update-definition');

    expect(handler).toBeTypeOf('function');

    (handler as (event: unknown, specialistId: string, content: string) => unknown)(
      {},
      'security-monitor',
      'updated markdown'
    );

    expect(updateSpecialistDefinition).toHaveBeenCalledWith('security-monitor', 'updated markdown');
    expect(schedulerReload).toHaveBeenCalledTimes(1);
  });

  it('should return the saved file path from the update handler', () => {
    const handlers = registerHandlersForTest();
    const handler = handlers.get('schedule:update-definition');

    const result = (handler as (event: unknown, specialistId: string, content: string) => unknown)(
      {},
      'security-monitor',
      'updated markdown'
    );

    expect(result).toEqual({
      filePath: '/tmp/agents/cron/security-monitor.md',
    });
  });
});

describe('schedule action handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should register and return schedule:get-actions', async () => {
    getRecentActions.mockReturnValue([{ id: 'action-1' }]);
    const handlers = registerHandlersForTest();
    const handler = handlers.get('schedule:get-actions');

    expect(handler).toBeTypeOf('function');
    await expect(Promise.resolve((handler as (event: unknown, specialistId: string, limit: number) => unknown)({}, 'twitter-growth', 25)))
      .resolves
      .toEqual([{ id: 'action-1' }]);
    expect(getRecentActions).toHaveBeenCalledWith('twitter-growth', 25);
  });

  it('should register and return schedule:get-run-actions', async () => {
    getActionsByRun.mockReturnValue([{ id: 'action-2', runId: 'run-42' }]);
    const handlers = registerHandlersForTest();
    const handler = handlers.get('schedule:get-run-actions');

    expect(handler).toBeTypeOf('function');
    await expect(Promise.resolve((handler as (event: unknown, specialistId: string, runId: string) => unknown)({}, 'twitter-growth', 'run-42')))
      .resolves
      .toEqual([{ id: 'action-2', runId: 'run-42' }]);
    expect(getActionsByRun).toHaveBeenCalledWith('twitter-growth', 'run-42');
  });

  it('should register and return schedule:get-action-stats', async () => {
    getActionStats.mockReturnValue({ totalActions: 4, actionCounts: { tweet_posted: 3 } });
    const handlers = registerHandlersForTest();
    const handler = handlers.get('schedule:get-action-stats');

    expect(handler).toBeTypeOf('function');
    await expect(Promise.resolve((handler as (event: unknown, specialistId: string) => unknown)({}, 'twitter-growth')))
      .resolves
      .toEqual({ totalActions: 4, actionCounts: { tweet_posted: 3 } });
    expect(getActionStats).toHaveBeenCalledWith('twitter-growth');
  });
});

describe('schedule:reset-specialist', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call resetSpecialist and scheduler.reload and return updated state', () => {
    const initialState = {
      specialists: {
        'twitter-growth': {
          id: 'twitter-growth', enabled: true,
          consecutiveNoAction: 5, consecutiveFailures: 3,
          totalRuns: 50, successRate: 72, weeklyCost: 12.5, skipEveryN: 8,
        },
      },
      globalEnabled: true,
    };
    const resetState = {
      specialists: {
        'twitter-growth': {
          id: 'twitter-growth', enabled: true,
          consecutiveNoAction: 0, consecutiveFailures: 0,
          totalRuns: 0, successRate: 0, weeklyCost: 0,
        },
      },
      globalEnabled: true,
    };

    getScheduleState.mockReturnValue(initialState);
    resetSpecialist.mockReturnValue(resetState);

    const handlers = registerHandlersForTest();
    const handler = handlers.get('schedule:reset-specialist') as (event: unknown, id: string) => unknown;

    expect(handler).toBeTypeOf('function');

    const result = handler({}, 'twitter-growth');

    expect(getScheduleState).toHaveBeenCalled();
    expect(resetSpecialist).toHaveBeenCalledWith(initialState, 'twitter-growth');
    expect(saveScheduleState).toHaveBeenCalledWith(resetState);
    expect(schedulerReload).toHaveBeenCalledTimes(1);
    expect(result).toEqual(resetState);
  });

  it('should return current state if specialist does not exist', () => {
    const currentState = {
      specialists: {},
      globalEnabled: true,
    };

    getScheduleState.mockReturnValue(currentState);
    resetSpecialist.mockReturnValue(currentState);

    const handlers = registerHandlersForTest();
    const handler = handlers.get('schedule:reset-specialist') as (event: unknown, id: string) => unknown;

    const result = handler({}, 'nonexistent');

    expect(resetSpecialist).toHaveBeenCalledWith(currentState, 'nonexistent');
    expect(saveScheduleState).toHaveBeenCalledWith(currentState);
    expect(result).toEqual(currentState);
  });
});
