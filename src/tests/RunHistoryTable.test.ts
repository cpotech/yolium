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
  it('should render the run list inside its own bounded scroll container', async () => {
    render(React.createElement(RunHistoryTable, { specialistId: 'twitter-growth' }));

    await waitFor(() => {
      expect(screen.getByText('Completed analysis of repo')).toBeInTheDocument();
    });

    expect(screen.getByTestId('run-history-table')).toHaveClass('h-full', 'min-h-0', 'flex-col');
    expect(screen.getByTestId('run-history-list')).toHaveClass('flex-1', 'min-h-0', 'overflow-auto');
  });

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

    expect(screen.getByTestId('run-history-detail-shell')).toHaveClass('h-full', 'min-h-0', 'overflow-hidden');
    expect(screen.getByTestId('run-detail-view')).toHaveClass('h-full', 'min-h-0', 'overflow-hidden');
  });

  it('should use the shared scrollbar styling for run logs', async () => {
    render(React.createElement(RunHistoryTable, { specialistId: 'twitter-growth' }));

    await waitFor(() => {
      expect(screen.getByText('Completed analysis of repo')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Completed analysis of repo'));

    await waitFor(() => {
      expect(screen.getByTestId('run-detail-log')).toBeInTheDocument();
    });

    expect(screen.getByTestId('run-detail-log')).toHaveClass('yolium-scrollbar', 'overflow-auto');
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

  it('should render action with summary field instead of text/tweetText', async () => {
    mockGetRunActions.mockResolvedValue([
      {
        id: 'action-summary-1',
        runId: 'run-1',
        specialistId: 'twitter-growth',
        action: 'tweet_posted',
        data: {
          summary: 'Posted educational thread about TypeScript',
          externalId: 'ext-999',
        },
        timestamp: '2026-03-10T10:02:00.000Z',
      },
    ]);

    render(React.createElement(RunHistoryTable, { specialistId: 'twitter-growth' }));
    await waitFor(() => { expect(screen.getByText('Completed analysis of repo')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Completed analysis of repo'));

    await waitFor(() => {
      expect(screen.getByText('Posted educational thread about TypeScript')).toBeInTheDocument();
    });
  });

  it('should render externalId instead of tweetId', async () => {
    mockGetRunActions.mockResolvedValue([
      {
        id: 'action-ext-1',
        runId: 'run-1',
        specialistId: 'twitter-growth',
        action: 'tweet_posted',
        data: {
          summary: 'A tweet',
          externalId: 'external-abc-123',
        },
        timestamp: '2026-03-10T10:02:00.000Z',
      },
    ]);

    render(React.createElement(RunHistoryTable, { specialistId: 'twitter-growth' }));
    await waitFor(() => { expect(screen.getByText('Completed analysis of repo')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Completed analysis of repo'));

    await waitFor(() => {
      expect(screen.getByText(/external-abc-123/)).toBeInTheDocument();
    });
  });

  it('should fall back to tweetText for legacy action logs', async () => {
    mockGetRunActions.mockResolvedValue([
      {
        id: 'action-legacy-text',
        runId: 'run-1',
        specialistId: 'twitter-growth',
        action: 'tweet_posted',
        data: {
          tweetText: 'Legacy tweet text here',
          tweetId: 'legacy-tweet-id',
        },
        timestamp: '2026-03-10T10:02:00.000Z',
      },
    ]);

    render(React.createElement(RunHistoryTable, { specialistId: 'twitter-growth' }));
    await waitFor(() => { expect(screen.getByText('Completed analysis of repo')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Completed analysis of repo'));

    await waitFor(() => {
      expect(screen.getByText('Legacy tweet text here')).toBeInTheDocument();
    });
  });

  it('should fall back to tweetId for legacy action logs', async () => {
    mockGetRunActions.mockResolvedValue([
      {
        id: 'action-legacy-id',
        runId: 'run-1',
        specialistId: 'twitter-growth',
        action: 'tweet_posted',
        data: {
          tweetId: 'legacy-id-456',
          text: 'Some tweet',
        },
        timestamp: '2026-03-10T10:02:00.000Z',
      },
    ]);

    render(React.createElement(RunHistoryTable, { specialistId: 'twitter-growth' }));
    await waitFor(() => { expect(screen.getByText('Completed analysis of repo')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Completed analysis of repo'));

    await waitFor(() => {
      expect(screen.getByText(/legacy-id-456/)).toBeInTheDocument();
    });
  });

  it('should render collapsible extra fields for provider-specific data', async () => {
    mockGetRunActions.mockResolvedValue([
      {
        id: 'action-extra-1',
        runId: 'run-1',
        specialistId: 'twitter-growth',
        action: 'tweet_posted',
        data: {
          summary: 'A tweet',
          externalId: 'ext-1',
          customField: 'custom-value',
          anotherField: 42,
        },
        timestamp: '2026-03-10T10:02:00.000Z',
      },
    ]);

    render(React.createElement(RunHistoryTable, { specialistId: 'twitter-growth' }));
    await waitFor(() => { expect(screen.getByText('Completed analysis of repo')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Completed analysis of repo'));

    await waitFor(() => {
      expect(screen.getByText('Extra fields')).toBeInTheDocument();
    });
    expect(screen.getByText(/customField/)).toBeInTheDocument();
    expect(screen.getByText(/custom-value/)).toBeInTheDocument();
  });

  it('should apply yolium-scrollbar class to the run history list for visible scrollbar styling', async () => {
    render(React.createElement(RunHistoryTable, { specialistId: 'twitter-growth' }));

    await waitFor(() => {
      expect(screen.getByText('Completed analysis of repo')).toBeInTheDocument();
    });

    const list = screen.getByTestId('run-history-list');
    expect(list).toHaveClass('yolium-scrollbar');
    expect(list).toHaveClass('overflow-auto');
  });

  it('should constrain the actions section with max-height and overflow-auto in run detail view', async () => {
    mockGetRunActions.mockResolvedValue([
      {
        id: 'action-constrain-1',
        runId: 'run-1',
        specialistId: 'twitter-growth',
        action: 'tweet_posted',
        data: { summary: 'Test action' },
        timestamp: '2026-03-10T10:02:00.000Z',
      },
    ]);

    render(React.createElement(RunHistoryTable, { specialistId: 'twitter-growth' }));
    await waitFor(() => { expect(screen.getByText('Completed analysis of repo')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Completed analysis of repo'));

    await waitFor(() => {
      expect(screen.getByTestId('run-detail-actions')).toBeInTheDocument();
    });

    const actions = screen.getByTestId('run-detail-actions');
    expect(actions).toHaveClass('shrink-0');
    expect(actions).toHaveClass('max-h-[40%]');
    expect(actions).toHaveClass('overflow-auto');
  });

  it('should apply yolium-scrollbar class to the actions scroll container in run detail view', async () => {
    mockGetRunActions.mockResolvedValue([
      {
        id: 'action-scrollbar-1',
        runId: 'run-1',
        specialistId: 'twitter-growth',
        action: 'tweet_posted',
        data: { summary: 'Test action' },
        timestamp: '2026-03-10T10:02:00.000Z',
      },
    ]);

    render(React.createElement(RunHistoryTable, { specialistId: 'twitter-growth' }));
    await waitFor(() => { expect(screen.getByText('Completed analysis of repo')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Completed analysis of repo'));

    await waitFor(() => {
      expect(screen.getByTestId('run-detail-actions')).toBeInTheDocument();
    });

    expect(screen.getByTestId('run-detail-actions')).toHaveClass('yolium-scrollbar');
  });

  it('should keep the log panel visible when actions section is present', async () => {
    mockGetRunActions.mockResolvedValue([
      {
        id: 'action-log-visible-1',
        runId: 'run-1',
        specialistId: 'twitter-growth',
        action: 'tweet_posted',
        data: { summary: 'Test action' },
        timestamp: '2026-03-10T10:02:00.000Z',
      },
    ]);

    render(React.createElement(RunHistoryTable, { specialistId: 'twitter-growth' }));
    await waitFor(() => { expect(screen.getByText('Completed analysis of repo')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Completed analysis of repo'));

    await waitFor(() => {
      expect(screen.getByTestId('run-detail-actions')).toBeInTheDocument();
    });

    expect(screen.getByTestId('run-detail-log')).toBeInTheDocument();
    expect(screen.getByTestId('run-detail-actions')).toBeInTheDocument();
  });

  it('should render action with no extra fields without collapsible section', async () => {
    mockGetRunActions.mockResolvedValue([
      {
        id: 'action-no-extra',
        runId: 'run-1',
        specialistId: 'twitter-growth',
        action: 'mentions_checked',
        data: {
          summary: 'Checked mentions',
          count: 5,
        },
        timestamp: '2026-03-10T10:02:00.000Z',
      },
    ]);

    render(React.createElement(RunHistoryTable, { specialistId: 'twitter-growth' }));
    await waitFor(() => { expect(screen.getByText('Completed analysis of repo')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Completed analysis of repo'));

    await waitFor(() => {
      expect(screen.getByText('Checked mentions')).toBeInTheDocument();
    });
    expect(screen.queryByText('Extra fields')).not.toBeInTheDocument();
  });
});
