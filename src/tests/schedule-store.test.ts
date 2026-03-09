// src/tests/schedule-store.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fs
vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(() => '{}'),
  readdirSync: vi.fn(() => []),
}));

vi.mock('node:os', () => ({
  homedir: vi.fn(() => '/home/test'),
}));

import {
  getScheduleState,
  saveScheduleState,
  updateSpecialistStatus,
  toggleSpecialist,
  toggleGlobal,
} from '@main/stores/schedule-store';
import type { ScheduleState } from '@shared/types/schedule';

describe('schedule-store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create default state when no file exists', async () => {
    const fs = await import('node:fs');
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const state = getScheduleState();
    expect(state.globalEnabled).toBe(false);
    expect(state.specialists).toEqual({});
  });

  it('should persist state to JSON file', async () => {
    const fs = await import('node:fs');
    const state: ScheduleState = {
      specialists: {},
      globalEnabled: true,
    };

    saveScheduleState(state);

    expect(fs.writeFileSync).toHaveBeenCalled();
    const writtenContent = vi.mocked(fs.writeFileSync).mock.calls[0][1] as string;
    expect(JSON.parse(writtenContent)).toEqual(state);
  });

  it('should load existing state from disk', async () => {
    const fs = await import('node:fs');
    const savedState: ScheduleState = {
      specialists: {
        'security-monitor': {
          id: 'security-monitor',
          enabled: true,
          consecutiveNoAction: 0,
          consecutiveFailures: 0,
          totalRuns: 5,
          successRate: 80,
          weeklyCost: 1.5,
        },
      },
      globalEnabled: true,
    };

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(savedState));

    const state = getScheduleState();
    expect(state.globalEnabled).toBe(true);
    expect(state.specialists['security-monitor'].totalRuns).toBe(5);
  });

  it('should update individual specialist status', async () => {
    const fs = await import('node:fs');
    vi.mocked(fs.existsSync).mockReturnValue(false);

    // Start with empty state
    const state = getScheduleState();
    state.specialists['test-specialist'] = {
      id: 'test-specialist',
      enabled: true,
      consecutiveNoAction: 0,
      consecutiveFailures: 0,
      totalRuns: 0,
      successRate: 0,
      weeklyCost: 0,
    };

    const updated = updateSpecialistStatus(state, 'test-specialist', { totalRuns: 10, successRate: 90 });
    expect(updated.specialists['test-specialist'].totalRuns).toBe(10);
    expect(updated.specialists['test-specialist'].successRate).toBe(90);
  });

  it('should toggle specialist enabled/disabled', async () => {
    const state: ScheduleState = {
      specialists: {
        'test-specialist': {
          id: 'test-specialist',
          enabled: true,
          consecutiveNoAction: 0,
          consecutiveFailures: 0,
          totalRuns: 0,
          successRate: 0,
          weeklyCost: 0,
        },
      },
      globalEnabled: true,
    };

    const updated = toggleSpecialist(state, 'test-specialist', false);
    expect(updated.specialists['test-specialist'].enabled).toBe(false);
  });

  it('should toggle global enabled/disabled', () => {
    const state: ScheduleState = {
      specialists: {},
      globalEnabled: true,
    };

    const updated = toggleGlobal(state, false);
    expect(updated.globalEnabled).toBe(false);
  });

  it('should preserve other specialists when updating one', () => {
    const state: ScheduleState = {
      specialists: {
        'specialist-a': {
          id: 'specialist-a',
          enabled: true,
          consecutiveNoAction: 0,
          consecutiveFailures: 0,
          totalRuns: 5,
          successRate: 100,
          weeklyCost: 1.0,
        },
        'specialist-b': {
          id: 'specialist-b',
          enabled: true,
          consecutiveNoAction: 0,
          consecutiveFailures: 0,
          totalRuns: 3,
          successRate: 66,
          weeklyCost: 0.5,
        },
      },
      globalEnabled: true,
    };

    const updated = updateSpecialistStatus(state, 'specialist-a', { totalRuns: 10 });
    expect(updated.specialists['specialist-a'].totalRuns).toBe(10);
    expect(updated.specialists['specialist-b'].totalRuns).toBe(3);
  });

  it('should handle corrupted JSON gracefully', async () => {
    const fs = await import('node:fs');
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('not valid json{{{');

    const state = getScheduleState();
    // Should fall back to default state
    expect(state.globalEnabled).toBe(false);
    expect(state.specialists).toEqual({});
  });

  it('should create directories recursively if needed', async () => {
    const fs = await import('node:fs');
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const state: ScheduleState = { specialists: {}, globalEnabled: true };
    saveScheduleState(state);

    expect(fs.mkdirSync).toHaveBeenCalledWith(expect.any(String), { recursive: true });
  });
});
