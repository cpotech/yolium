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

  Object.defineProperty(window, 'electronAPI', {
    value: {
      schedule: {
        getState: mockGetState,
        getSpecialists: mockGetSpecialists,
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
});
