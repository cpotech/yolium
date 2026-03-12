/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RunHistoryTable } from '@renderer/components/schedule/RunHistoryTable';

const mockGetHistory = vi.fn();
const mockGetStats = vi.fn();
const mockGetRunLog = vi.fn();
const mockGetRunActions = vi.fn();

function makeRunRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'run-1',
    specialistId: 'twitter-growth',
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

beforeEach(() => {
  vi.clearAllMocks();
  mockGetHistory.mockResolvedValue([makeRunRecord()]);
  mockGetStats.mockResolvedValue({
    totalRuns: 1,
    successRate: 100,
    weeklyCost: 0.015,
    averageTokensPerRun: 1500,
    averageDurationMs: 300000,
  });
  mockGetRunLog.mockResolvedValue('[2026-03-10T10:00:00.000Z] Drafted tweet');
  mockGetRunActions.mockResolvedValue([]);

  Object.defineProperty(window, 'electronAPI', {
    value: {
      schedule: {
        getHistory: mockGetHistory,
        getStats: mockGetStats,
        getRunLog: mockGetRunLog,
        getRunActions: mockGetRunActions,
      },
    },
    writable: true,
  });
});

describe('RunHistoryTable', () => {
  it('should request run actions when a run detail view is opened', async () => {
    render(React.createElement(RunHistoryTable, { specialistId: 'twitter-growth' }));

    await waitFor(() => {
      expect(screen.getByText('Completed analysis of repo')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Completed analysis of repo'));

    await waitFor(() => {
      expect(mockGetRunActions).toHaveBeenCalledWith('twitter-growth', 'run-1');
    });
  });

  it('should render an empty actions state when the selected run has no recorded actions', async () => {
    render(React.createElement(RunHistoryTable, { specialistId: 'twitter-growth' }));

    await waitFor(() => {
      expect(screen.getByText('Completed analysis of repo')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Completed analysis of repo'));

    await waitFor(() => {
      expect(screen.getByTestId('run-detail-actions-empty')).toHaveTextContent('No actions recorded for this run');
    });
  });

  it('should render action rows with timestamp, action label, and dry-run badge when actions exist', async () => {
    mockGetRunActions.mockResolvedValue([
      {
        id: 'action-1',
        runId: 'run-1',
        specialistId: 'twitter-growth',
        action: 'tweet_posted',
        data: {
          dryRun: true,
          tweetId: '123456789',
          text: 'Dry-run tweet draft',
        },
        timestamp: '2026-03-10T10:02:00.000Z',
      },
    ]);

    render(React.createElement(RunHistoryTable, { specialistId: 'twitter-growth' }));

    await waitFor(() => {
      expect(screen.getByText('Completed analysis of repo')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Completed analysis of repo'));

    await waitFor(() => {
      expect(screen.getByTestId('run-detail-actions')).toBeInTheDocument();
    });

    expect(screen.getByText('tweet_posted')).toBeInTheDocument();
    expect(screen.getByText('Dry run')).toBeInTheDocument();
    expect(screen.getByText('Dry-run tweet draft')).toBeInTheDocument();
    expect(screen.getByText(/123456789/)).toBeInTheDocument();
    expect(screen.getAllByText(/Mar/).length).toBeGreaterThan(0);
  });
});
