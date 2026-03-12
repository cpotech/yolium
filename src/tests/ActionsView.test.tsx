/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ActionsView } from '@renderer/components/schedule/ActionsView';
import type { ActionLogEntry } from '@shared/types/schedule';

const mockGetAllActions = vi.fn();

function makeAction(overrides: Partial<ActionLogEntry> = {}): ActionLogEntry {
  return {
    id: 'action-1',
    runId: 'run-1',
    specialistId: 'twitter-growth',
    action: 'tweet_posted',
    data: { summary: 'Posted a tweet about TypeScript' },
    timestamp: '2026-03-11T09:00:00.000Z',
    ...overrides,
  };
}

const defaultProps = {
  specialistIds: ['twitter-growth', 'security-monitor'],
  specialistNames: {
    'twitter-growth': 'Twitter Growth',
    'security-monitor': 'Security Monitor',
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAllActions.mockResolvedValue([]);

  Object.defineProperty(window, 'electronAPI', {
    value: {
      schedule: {
        getAllActions: mockGetAllActions,
      },
    },
    writable: true,
  });
});

describe('ActionsView', () => {
  it('should render a loading spinner while fetching actions', () => {
    // Never resolve the promise so it stays loading
    mockGetAllActions.mockReturnValue(new Promise(() => {}));
    render(<ActionsView {...defaultProps} />);
    expect(screen.getByTestId('actions-view-loading')).toBeInTheDocument();
  });

  it('should render an empty state when no actions exist', async () => {
    mockGetAllActions.mockResolvedValue([]);
    render(<ActionsView {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByTestId('actions-view-empty')).toBeInTheDocument();
    });
  });

  it('should render action cards with timestamp, specialist badge, action type badge, and summary', async () => {
    mockGetAllActions.mockResolvedValue([
      makeAction({
        id: 'a1',
        specialistId: 'twitter-growth',
        action: 'tweet_posted',
        data: { summary: 'Posted a tweet about TypeScript' },
        timestamp: '2026-03-11T09:00:00.000Z',
      }),
    ]);

    render(<ActionsView {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByTestId('action-card-a1')).toBeInTheDocument();
    });

    // Specialist badge appears both in dropdown option and card badge
    const card = screen.getByTestId('action-card-a1');
    expect(card).toHaveTextContent('Twitter Growth');
    expect(card).toHaveTextContent('tweet_posted');
    expect(card).toHaveTextContent('Posted a tweet about TypeScript');
    expect(screen.getAllByText(/Mar/).length).toBeGreaterThan(0);
  });

  it('should render a dry-run indicator badge when action data has dryRun: true', async () => {
    mockGetAllActions.mockResolvedValue([
      makeAction({
        id: 'a1',
        data: { summary: 'Dry run tweet', dryRun: true },
      }),
    ]);

    render(<ActionsView {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Dry run')).toBeInTheDocument();
    });
  });

  it('should render external ID from externalId field', async () => {
    mockGetAllActions.mockResolvedValue([
      makeAction({
        id: 'a1',
        data: { summary: 'A tweet', externalId: 'ext-abc-123' },
      }),
    ]);

    render(<ActionsView {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText(/ext-abc-123/)).toBeInTheDocument();
    });
  });

  it('should fall back to tweetId for external ID in legacy actions', async () => {
    mockGetAllActions.mockResolvedValue([
      makeAction({
        id: 'a1',
        data: { summary: 'A tweet', tweetId: 'legacy-tweet-789' },
      }),
    ]);

    render(<ActionsView {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText(/legacy-tweet-789/)).toBeInTheDocument();
    });
  });

  it('should filter actions by specialist when specialist filter is changed', async () => {
    mockGetAllActions.mockResolvedValue([
      makeAction({ id: 'a1', specialistId: 'twitter-growth', data: { summary: 'Tweet action' } }),
      makeAction({ id: 'a2', specialistId: 'security-monitor', action: 'scan_completed', data: { summary: 'Scan action' } }),
    ]);

    render(<ActionsView {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByTestId('action-card-a1')).toBeInTheDocument();
      expect(screen.getByTestId('action-card-a2')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId('actions-filter-specialist'), {
      target: { value: 'twitter-growth' },
    });

    expect(screen.getByTestId('action-card-a1')).toBeInTheDocument();
    expect(screen.queryByTestId('action-card-a2')).not.toBeInTheDocument();
  });

  it('should filter actions by action type when action type filter is changed', async () => {
    mockGetAllActions.mockResolvedValue([
      makeAction({ id: 'a1', action: 'tweet_posted', data: { summary: 'Tweet' } }),
      makeAction({ id: 'a2', action: 'mentions_checked', data: { summary: 'Mentions' } }),
    ]);

    render(<ActionsView {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByTestId('action-card-a1')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId('actions-filter-action-type'), {
      target: { value: 'mentions_checked' },
    });

    expect(screen.queryByTestId('action-card-a1')).not.toBeInTheDocument();
    expect(screen.getByTestId('action-card-a2')).toBeInTheDocument();
  });

  it('should combine specialist and action type filters', async () => {
    mockGetAllActions.mockResolvedValue([
      makeAction({ id: 'a1', specialistId: 'twitter-growth', action: 'tweet_posted', data: { summary: 'Tweet' } }),
      makeAction({ id: 'a2', specialistId: 'twitter-growth', action: 'mentions_checked', data: { summary: 'Mentions' } }),
      makeAction({ id: 'a3', specialistId: 'security-monitor', action: 'tweet_posted', data: { summary: 'Security tweet' } }),
    ]);

    render(<ActionsView {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByTestId('action-card-a1')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId('actions-filter-specialist'), {
      target: { value: 'twitter-growth' },
    });
    fireEvent.change(screen.getByTestId('actions-filter-action-type'), {
      target: { value: 'tweet_posted' },
    });

    expect(screen.getByTestId('action-card-a1')).toBeInTheDocument();
    expect(screen.queryByTestId('action-card-a2')).not.toBeInTheDocument();
    expect(screen.queryByTestId('action-card-a3')).not.toBeInTheDocument();
  });

  it('should render expandable extra fields for non-standard data fields', async () => {
    mockGetAllActions.mockResolvedValue([
      makeAction({
        id: 'a1',
        data: { summary: 'A tweet', externalId: 'ext-1', customField: 'custom-value', anotherField: 42 },
      }),
    ]);

    render(<ActionsView {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Extra fields')).toBeInTheDocument();
    });

    expect(screen.getByText(/customField/)).toBeInTheDocument();
    expect(screen.getByText(/custom-value/)).toBeInTheDocument();
  });

  it('should accept an initialSpecialist prop to pre-filter to one specialist', async () => {
    mockGetAllActions.mockResolvedValue([
      makeAction({ id: 'a1', specialistId: 'twitter-growth', data: { summary: 'Tweet' } }),
      makeAction({ id: 'a2', specialistId: 'security-monitor', data: { summary: 'Scan' } }),
    ]);

    render(<ActionsView {...defaultProps} initialSpecialist="security-monitor" />);

    await waitFor(() => {
      expect(screen.getByTestId('action-card-a2')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('action-card-a1')).not.toBeInTheDocument();

    // Verify the filter dropdown shows the pre-selected value
    const specialistFilter = screen.getByTestId('actions-filter-specialist') as HTMLSelectElement;
    expect(specialistFilter.value).toBe('security-monitor');
  });
});
