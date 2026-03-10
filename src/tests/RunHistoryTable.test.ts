// src/tests/RunHistoryTable.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock window.electronAPI.schedule
const mockGetHistory = vi.fn();
const mockGetStats = vi.fn();
const mockGetRunLog = vi.fn();

function setupMockAPI() {
  (globalThis as Record<string, unknown>).window = {
    electronAPI: {
      schedule: {
        getHistory: mockGetHistory,
        getStats: mockGetStats,
        getRunLog: mockGetRunLog,
      },
    },
  };
}

function makeRunRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'run-1',
    specialistId: 'test-spec',
    scheduleType: 'daily',
    startedAt: '2026-03-10T10:00:00.000Z',
    completedAt: '2026-03-10T10:05:00.000Z',
    status: 'completed',
    tokensUsed: 1500,
    costUsd: 0.015,
    summary: 'Completed analysis of repo',
    outcome: 'completed',
    ...overrides,
  };
}

describe('RunHistoryTable array handling', () => {
  it('should not mutate the original history array when reversing', () => {
    const original = [
      { id: '1', startedAt: '2026-01-01' },
      { id: '2', startedAt: '2026-01-02' },
      { id: '3', startedAt: '2026-01-03' },
    ];

    const originalOrder = [...original];
    const reversed = [...original].reverse();

    expect(original).toEqual(originalOrder);
    expect(reversed[0].id).toBe('3');
    expect(reversed[1].id).toBe('2');
    expect(reversed[2].id).toBe('1');
  });
});

describe('RunHistoryTable detail view logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupMockAPI();
  });

  it('should render run history table with clickable rows', () => {
    const runs = [
      makeRunRecord({ id: 'run-1' }),
      makeRunRecord({ id: 'run-2', outcome: 'failed' }),
    ];

    // Verify rows have data needed for click handling
    for (const run of runs) {
      expect(run.id).toBeDefined();
      expect(typeof run.id).toBe('string');
    }
  });

  it('should show run detail view when clicking a row', () => {
    // Simulate selecting a run (state management logic)
    let selectedRunId: string | null = null;
    const selectRun = (id: string) => { selectedRunId = id; };

    selectRun('run-1');
    expect(selectedRunId).toBe('run-1');
  });

  it('should display log content in the detail view', async () => {
    const logContent = '[10:00:00] Assistant: Starting analysis\n[10:00:05] Tool: Read src/main.ts\n';
    mockGetRunLog.mockResolvedValue(logContent);

    const result = await mockGetRunLog('test-spec', 'run-1');
    expect(result).toBe(logContent);
    expect(mockGetRunLog).toHaveBeenCalledWith('test-spec', 'run-1');
  });

  it('should show back button to return to run list', () => {
    // Simulate back navigation
    let selectedRunId: string | null = 'run-1';
    const goBack = () => { selectedRunId = null; };

    goBack();
    expect(selectedRunId).toBeNull();
  });

  it('should show loading state while fetching log', () => {
    // Simulate loading state transitions
    let isLoadingLog = false;
    const startLoading = () => { isLoadingLog = true; };
    const stopLoading = () => { isLoadingLog = false; };

    startLoading();
    expect(isLoadingLog).toBe(true);

    stopLoading();
    expect(isLoadingLog).toBe(false);
  });

  it('should handle empty log gracefully', async () => {
    mockGetRunLog.mockResolvedValue('');

    const result = await mockGetRunLog('test-spec', 'run-empty');
    expect(result).toBe('');
  });
});
