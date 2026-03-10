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
  loadRedactedCredentials,
  saveCredentials,
  deleteCredentials,
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
  loadRedactedCredentials: vi.fn(),
  saveCredentials: vi.fn(),
  deleteCredentials: vi.fn(),
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

vi.mock('@main/stores/schedule-store', () => ({
  getScheduleState,
  saveScheduleState,
  toggleSpecialist,
  toggleGlobal,
}));

vi.mock('@main/stores/run-history-store', () => ({
  getRecentRuns,
  getRunStats,
}));

vi.mock('@main/stores/specialist-credentials-store', () => ({
  loadRedactedCredentials,
  saveCredentials,
  deleteCredentials,
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
