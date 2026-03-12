/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockConfigDialog = vi.fn();
const mockAddDialog = vi.fn();
const mockGetState = vi.fn();
const mockGetSpecialists = vi.fn();
const mockGetActionStats = vi.fn();
const mockGetRunning = vi.fn();

vi.mock('@renderer/components/schedule/ActionsView', () => ({
  ActionsView: (props: {
    specialistIds: string[];
    specialistNames: Record<string, string>;
    initialSpecialist?: string | null;
  }) => {
    return (
      <div data-testid="mock-actions-view">
        <div data-testid="mock-actions-initial-specialist">{props.initialSpecialist ?? 'all'}</div>
      </div>
    );
  },
}));

vi.mock('@renderer/components/schedule/SpecialistConfigDialog', () => ({
  SpecialistConfigDialog: (props: {
    isOpen: boolean;
    specialistId: string | null;
    onClose: () => void;
    onEdit?: () => void;
  }) => {
    mockConfigDialog(props);
    if (!props.isOpen || !props.specialistId) return null;
    return (
      <div data-testid="mock-specialist-config-dialog">
        <div>{props.specialistId}</div>
        <button data-testid="mock-specialist-config-edit" onClick={() => props.onEdit?.()}>
          Edit definition
        </button>
        <button data-testid="mock-specialist-config-close" onClick={props.onClose}>
          Close
        </button>
      </div>
    );
  },
}));

vi.mock('@renderer/components/schedule/AddSpecialistDialog', () => ({
  AddSpecialistDialog: (props: {
    isOpen: boolean;
    onClose: () => void;
    onCreated: () => void;
    editingSpecialistId?: string | null;
  }) => {
    mockAddDialog(props);
    if (!props.isOpen) return null;
    return (
      <div data-testid="mock-add-specialist-dialog">
        <div data-testid="mock-editing-specialist-id">{props.editingSpecialistId ?? 'create'}</div>
        <button data-testid="mock-add-specialist-created" onClick={props.onCreated}>
          Save specialist
        </button>
        <button data-testid="mock-add-specialist-close" onClick={props.onClose}>
          Close
        </button>
      </div>
    );
  },
}));

import { SchedulePanel } from '@renderer/components/schedule/SchedulePanel';

beforeEach(() => {
  vi.clearAllMocks();
  mockGetState.mockResolvedValue({
    specialists: {
      'security-monitor': {
        id: 'security-monitor',
        enabled: true,
        consecutiveNoAction: 0,
        consecutiveFailures: 0,
        totalRuns: 2,
        successRate: 100,
        weeklyCost: 0.2,
      },
    },
    globalEnabled: true,
  });
  mockGetSpecialists.mockResolvedValue({
    'security-monitor': {
      name: 'security-monitor',
      description: 'Security scanning',
      model: 'haiku',
      schedules: [{ type: 'daily', cron: '0 0 * * *', enabled: true }],
      memory: { strategy: 'distill_daily', maxEntries: 300, retentionDays: 90 },
      escalation: { onFailure: 'alert_user' },
    },
  });
  mockGetActionStats.mockResolvedValue({
    totalActions: 7,
    actionCounts: { tweet_posted: 5, mentions_checked: 2 },
  });
  mockGetRunning.mockResolvedValue([]);

  Object.defineProperty(window, 'electronAPI', {
    value: {
      schedule: {
        getState: mockGetState,
        getSpecialists: mockGetSpecialists,
        getActionStats: mockGetActionStats,
        getRunning: mockGetRunning,
        onAlert: vi.fn(() => vi.fn()),
        onStateChanged: vi.fn(() => vi.fn()),
        toggleGlobal: vi.fn(),
        toggleSpecialist: vi.fn(),
        triggerRun: vi.fn(),
        reload: vi.fn(),
      },
    },
    writable: true,
  });
});

describe('SchedulePanel', () => {
  it('should request action stats while loading schedule state', async () => {
    render(<SchedulePanel />);

    await waitFor(() => {
      expect(mockGetActionStats).toHaveBeenCalledWith('security-monitor');
    });
  });

  it('should render the Actions stat on each specialist card', async () => {
    render(<SchedulePanel />);

    await waitFor(() => {
      expect(screen.getByTestId('specialist-card-security-monitor')).toBeInTheDocument();
    });

    const card = screen.getByTestId('specialist-card-security-monitor');
    expect(card).toHaveTextContent('Actions');
    expect(screen.getByTestId('specialist-actions-security-monitor')).toHaveTextContent('7');
  });

  it('should open the configure dialog for a specialist and launch the edit dialog from the Edit definition action', async () => {
    render(<SchedulePanel />);

    await waitFor(() => {
      expect(screen.getByTestId('configure-security-monitor')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('configure-security-monitor'));

    await waitFor(() => {
      expect(screen.getByTestId('mock-specialist-config-dialog')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('mock-specialist-config-edit'));

    await waitFor(() => {
      expect(screen.getByTestId('mock-add-specialist-dialog')).toBeInTheDocument();
    });

    expect(screen.getByTestId('mock-editing-specialist-id')).toHaveTextContent('security-monitor');
  });

  it('should reload the specialist list and close the editor after a successful scheduled-agent save', async () => {
    render(<SchedulePanel />);

    await waitFor(() => {
      expect(screen.getByTestId('configure-security-monitor')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('configure-security-monitor'));
    await waitFor(() => {
      expect(screen.getByTestId('mock-specialist-config-edit')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('mock-specialist-config-edit'));

    await waitFor(() => {
      expect(screen.getByTestId('mock-add-specialist-created')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('mock-add-specialist-created'));

    await waitFor(() => {
      expect(screen.queryByTestId('mock-add-specialist-dialog')).not.toBeInTheDocument();
    });

    expect(mockGetState).toHaveBeenCalledTimes(2);
    expect(mockGetSpecialists).toHaveBeenCalledTimes(2);
  });

  it('should render view toggle buttons for Specialists and Actions views', async () => {
    render(<SchedulePanel />);

    await waitFor(() => {
      expect(screen.getByTestId('specialist-card-security-monitor')).toBeInTheDocument();
    });

    expect(screen.getByTestId('view-toggle-specialists')).toBeInTheDocument();
    expect(screen.getByTestId('view-toggle-actions')).toBeInTheDocument();
  });

  it('should show ActionsView when Actions toggle is clicked', async () => {
    render(<SchedulePanel />);

    await waitFor(() => {
      expect(screen.getByTestId('view-toggle-actions')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('view-toggle-actions'));

    await waitFor(() => {
      expect(screen.getByTestId('mock-actions-view')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('specialist-card-security-monitor')).not.toBeInTheDocument();
  });

  it('should switch back to specialist cards when Specialists toggle is clicked', async () => {
    render(<SchedulePanel />);

    await waitFor(() => {
      expect(screen.getByTestId('view-toggle-actions')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('view-toggle-actions'));

    await waitFor(() => {
      expect(screen.getByTestId('mock-actions-view')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('view-toggle-specialists'));

    await waitFor(() => {
      expect(screen.getByTestId('specialist-card-security-monitor')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('mock-actions-view')).not.toBeInTheDocument();
  });

  it('should navigate to ActionsView filtered by specialist when action count is clicked', async () => {
    render(<SchedulePanel />);

    await waitFor(() => {
      expect(screen.getByTestId('specialist-actions-security-monitor')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('specialist-actions-security-monitor'));

    await waitFor(() => {
      expect(screen.getByTestId('mock-actions-view')).toBeInTheDocument();
    });

    expect(screen.getByTestId('mock-actions-initial-specialist')).toHaveTextContent('security-monitor');
  });
});
