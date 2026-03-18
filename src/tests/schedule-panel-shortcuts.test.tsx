/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ThemeProvider } from '@renderer/theme';
import { VimModeProvider, useVimModeContext } from '@renderer/context/VimModeContext';
import { SchedulePanel } from '@renderer/components/schedule/SchedulePanel';

const mockAddDialog = vi.fn();
const mockGetState = vi.fn();
const mockGetSpecialists = vi.fn();
const mockGetActionStats = vi.fn();
const mockGetRunning = vi.fn();
const mockToggleSpecialist = vi.fn();
const mockTriggerRun = vi.fn();
const mockReload = vi.fn();
const mockToggleGlobal = vi.fn();

vi.mock('@renderer/components/schedule/ActionsView', () => ({
  ActionsView: () => <div data-testid="mock-actions-view" />,
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
        <button data-testid="mock-add-specialist-created" onClick={props.onCreated}>Save</button>
        <button data-testid="mock-add-specialist-close" onClick={props.onClose}>Close</button>
      </div>
    );
  },
}));

function renderWithVim(ui: React.ReactElement) {
  return render(
    <ThemeProvider>
      <VimModeProvider>
        {ui}
      </VimModeProvider>
    </ThemeProvider>,
  );
}

function ZoneSetter({ zone }: { zone: string }) {
  const { setActiveZone } = useVimModeContext();
  React.useEffect(() => {
    setActiveZone(zone as 'sidebar' | 'tabs' | 'content' | 'status-bar' | 'schedule');
  }, [zone, setActiveZone]);
  return null;
}

function createSpecialist(id: string, name: string) {
  return {
    [id]: {
      name,
      description: `Description for ${name}`,
      model: 'haiku',
      schedules: [{ type: 'daily', cron: '0 0 * * *', enabled: true }],
      memory: { strategy: 'distill_daily', maxEntries: 300, retentionDays: 90 },
      escalation: {},
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetState.mockResolvedValue({
    specialists: {
      'spec-1': { id: 'spec-1', enabled: true, consecutiveNoAction: 0, consecutiveFailures: 0, totalRuns: 5, successRate: 100, weeklyCost: 0.1 },
      'spec-2': { id: 'spec-2', enabled: true, consecutiveNoAction: 0, consecutiveFailures: 0, totalRuns: 3, successRate: 80, weeklyCost: 0.2 },
      'spec-3': { id: 'spec-3', enabled: false, consecutiveNoAction: 0, consecutiveFailures: 0, totalRuns: 1, successRate: 50, weeklyCost: 0.05 },
    },
    globalEnabled: true,
  });
  mockGetSpecialists.mockResolvedValue({
    ...createSpecialist('spec-1', 'Spec One'),
    ...createSpecialist('spec-2', 'Spec Two'),
    ...createSpecialist('spec-3', 'Spec Three'),
  });
  mockGetActionStats.mockResolvedValue({ totalActions: 0, actionCounts: {} });
  mockGetRunning.mockResolvedValue([]);
  mockToggleSpecialist.mockResolvedValue(undefined);
  mockTriggerRun.mockResolvedValue({ skipped: false });
  mockReload.mockResolvedValue(undefined);
  mockToggleGlobal.mockResolvedValue(undefined);

  Object.defineProperty(window, 'electronAPI', {
    value: {
      schedule: {
        getState: mockGetState,
        getSpecialists: mockGetSpecialists,
        getActionStats: mockGetActionStats,
        getRunning: mockGetRunning,
        onAlert: vi.fn(() => vi.fn()),
        onStateChanged: vi.fn(() => vi.fn()),
        toggleGlobal: mockToggleGlobal,
        toggleSpecialist: mockToggleSpecialist,
        triggerRun: mockTriggerRun,
        reload: mockReload,
        resetSpecialist: vi.fn(),
      },
      dialog: { confirmOkCancel: vi.fn().mockResolvedValue(true) },
    },
    writable: true,
  });
});

describe('SchedulePanel vim shortcuts', () => {
  it('should navigate to next specialist with j key', async () => {
    renderWithVim(
      <>
        <ZoneSetter zone="schedule" />
        <SchedulePanel />
      </>
    );

    await waitFor(() => {
      expect(screen.getByTestId('specialist-card-spec-1')).toBeInTheDocument();
    });

    const panel = screen.getByTestId('schedule-panel');
    fireEvent.keyDown(panel, { key: 'j' });

    const focusedCard = screen.getByTestId('specialist-card-spec-2');
    expect(focusedCard.getAttribute('data-vim-focused')).toBe('true');
  });

  it('should navigate to previous specialist with k key', async () => {
    renderWithVim(
      <>
        <ZoneSetter zone="schedule" />
        <SchedulePanel />
      </>
    );

    await waitFor(() => {
      expect(screen.getByTestId('specialist-card-spec-1')).toBeInTheDocument();
    });

    const panel = screen.getByTestId('schedule-panel');
    fireEvent.keyDown(panel, { key: 'j' });
    fireEvent.keyDown(panel, { key: 'k' });

    const focusedCard = screen.getByTestId('specialist-card-spec-1');
    expect(focusedCard.getAttribute('data-vim-focused')).toBe('true');
  });

  it('should jump to first specialist with gg', async () => {
    renderWithVim(
      <>
        <ZoneSetter zone="schedule" />
        <SchedulePanel />
      </>
    );

    await waitFor(() => {
      expect(screen.getByTestId('specialist-card-spec-1')).toBeInTheDocument();
    });

    const panel = screen.getByTestId('schedule-panel');
    fireEvent.keyDown(panel, { key: 'j' });
    fireEvent.keyDown(panel, { key: 'j' });
    fireEvent.keyDown(panel, { key: 'g' });
    fireEvent.keyDown(panel, { key: 'g' });

    const focusedCard = screen.getByTestId('specialist-card-spec-1');
    expect(focusedCard.getAttribute('data-vim-focused')).toBe('true');
  });

  it('should jump to last specialist with G', async () => {
    renderWithVim(
      <>
        <ZoneSetter zone="schedule" />
        <SchedulePanel />
      </>
    );

    await waitFor(() => {
      expect(screen.getByTestId('specialist-card-spec-1')).toBeInTheDocument();
    });

    const panel = screen.getByTestId('schedule-panel');
    fireEvent.keyDown(panel, { key: 'G' });

    const focusedCard = screen.getByTestId('specialist-card-spec-3');
    expect(focusedCard.getAttribute('data-vim-focused')).toBe('true');
  });

  it('should trigger run with r key on focused specialist', async () => {
    renderWithVim(
      <>
        <ZoneSetter zone="schedule" />
        <SchedulePanel />
      </>
    );

    await waitFor(() => {
      expect(screen.getByTestId('specialist-card-spec-1')).toBeInTheDocument();
    });

    const panel = screen.getByTestId('schedule-panel');
    fireEvent.keyDown(panel, { key: 'r' });

    await waitFor(() => {
      expect(mockTriggerRun).toHaveBeenCalledWith('spec-1', 'daily');
    });
  });

  it('should toggle enabled state with t key', async () => {
    renderWithVim(
      <>
        <ZoneSetter zone="schedule" />
        <SchedulePanel />
      </>
    );

    await waitFor(() => {
      expect(screen.getByTestId('specialist-card-spec-1')).toBeInTheDocument();
    });

    const panel = screen.getByTestId('schedule-panel');
    fireEvent.keyDown(panel, { key: 't' });

    await waitFor(() => {
      expect(mockToggleSpecialist).toHaveBeenCalledWith('spec-1', false);
    });
  });

  it('should open history with Enter key', async () => {
    renderWithVim(
      <>
        <ZoneSetter zone="schedule" />
        <SchedulePanel />
      </>
    );

    await waitFor(() => {
      expect(screen.getByTestId('specialist-card-spec-1')).toBeInTheDocument();
    });

    const panel = screen.getByTestId('schedule-panel');
    fireEvent.keyDown(panel, { key: 'Enter' });

    await waitFor(() => {
      expect(screen.getByTestId('schedule-panel-history')).toBeInTheDocument();
    });
  });

  it('should open configure dialog with c key', async () => {
    renderWithVim(
      <>
        <ZoneSetter zone="schedule" />
        <SchedulePanel />
      </>
    );

    await waitFor(() => {
      expect(screen.getByTestId('specialist-card-spec-1')).toBeInTheDocument();
    });

    const panel = screen.getByTestId('schedule-panel');
    fireEvent.keyDown(panel, { key: 'c' });

    await waitFor(() => {
      expect(screen.getByTestId('mock-add-specialist-dialog')).toBeInTheDocument();
    });
    expect(screen.getByTestId('mock-editing-specialist-id')).toHaveTextContent('spec-1');
  });

  it('should add new specialist with n key', async () => {
    renderWithVim(
      <>
        <ZoneSetter zone="schedule" />
        <SchedulePanel />
      </>
    );

    await waitFor(() => {
      expect(screen.getByTestId('specialist-card-spec-1')).toBeInTheDocument();
    });

    const panel = screen.getByTestId('schedule-panel');
    fireEvent.keyDown(panel, { key: 'n' });

    await waitFor(() => {
      expect(screen.getByTestId('mock-add-specialist-dialog')).toBeInTheDocument();
    });
    expect(screen.getByTestId('mock-editing-specialist-id')).toHaveTextContent('create');
  });

  it('should toggle shortcuts help with ? key', async () => {
    renderWithVim(
      <>
        <ZoneSetter zone="schedule" />
        <SchedulePanel />
      </>
    );

    await waitFor(() => {
      expect(screen.getByTestId('specialist-card-spec-1')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('schedule-shortcuts-help')).not.toBeInTheDocument();

    const panel = screen.getByTestId('schedule-panel');
    fireEvent.keyDown(panel, { key: '?' });

    await waitFor(() => {
      expect(screen.getByTestId('schedule-shortcuts-help')).toBeInTheDocument();
    });

    fireEvent.keyDown(panel, { key: '?' });

    await waitFor(() => {
      expect(screen.queryByTestId('schedule-shortcuts-help')).not.toBeInTheDocument();
    });
  });

  it('should show visual focus ring on focused specialist', async () => {
    renderWithVim(
      <>
        <ZoneSetter zone="schedule" />
        <SchedulePanel />
      </>
    );

    await waitFor(() => {
      expect(screen.getByTestId('specialist-card-spec-1')).toBeInTheDocument();
    });

    const focusedCard = screen.getByTestId('specialist-card-spec-1');
    expect(focusedCard.getAttribute('data-vim-focused')).toBe('true');
    expect(focusedCard.className).toContain('ring-2');
  });

  it('should wrap navigation from last to first specialist', async () => {
    renderWithVim(
      <>
        <ZoneSetter zone="schedule" />
        <SchedulePanel />
      </>
    );

    await waitFor(() => {
      expect(screen.getByTestId('specialist-card-spec-1')).toBeInTheDocument();
    });

    const panel = screen.getByTestId('schedule-panel');
    fireEvent.keyDown(panel, { key: 'G' });
    fireEvent.keyDown(panel, { key: 'j' });

    const focusedCard = screen.getByTestId('specialist-card-spec-1');
    expect(focusedCard.getAttribute('data-vim-focused')).toBe('true');
  });

  it('should handle empty specialist list gracefully', async () => {
    mockGetSpecialists.mockResolvedValue({});
    mockGetState.mockResolvedValue({ specialists: {}, globalEnabled: true });

    renderWithVim(
      <>
        <ZoneSetter zone="schedule" />
        <SchedulePanel />
      </>
    );

    await waitFor(() => {
      expect(screen.getByTestId('schedule-panel')).toBeInTheDocument();
    });

    const panel = screen.getByTestId('schedule-panel');
    fireEvent.keyDown(panel, { key: 'j' });
    fireEvent.keyDown(panel, { key: 'G' });
    fireEvent.keyDown(panel, { key: 'r' });
    fireEvent.keyDown(panel, { key: 't' });

    expect(mockTriggerRun).not.toHaveBeenCalled();
    expect(mockToggleSpecialist).not.toHaveBeenCalled();
  });

  it('should switch to specialists view with 1 key', async () => {
    renderWithVim(
      <>
        <ZoneSetter zone="schedule" />
        <SchedulePanel />
      </>
    );

    await waitFor(() => {
      expect(screen.getByTestId('specialist-card-spec-1')).toBeInTheDocument();
    });

    const panel = screen.getByTestId('schedule-panel');
    fireEvent.keyDown(panel, { key: '2' });

    await waitFor(() => {
      expect(screen.getByTestId('mock-actions-view')).toBeInTheDocument();
    });

    fireEvent.keyDown(panel, { key: '1' });

    await waitFor(() => {
      expect(screen.getByTestId('specialist-card-spec-1')).toBeInTheDocument();
    });
  });

  it('should not respond to shortcuts when dialog is open', async () => {
    renderWithVim(
      <>
        <ZoneSetter zone="schedule" />
        <SchedulePanel />
      </>
    );

    await waitFor(() => {
      expect(screen.getByTestId('specialist-card-spec-1')).toBeInTheDocument();
    });

    const panel = screen.getByTestId('schedule-panel');

    // Open the add dialog with 'n'
    fireEvent.keyDown(panel, { key: 'n' });
    await waitFor(() => {
      expect(screen.getByTestId('mock-add-specialist-dialog')).toBeInTheDocument();
    });

    // Now try navigation and actions — should be blocked by dialog guard
    fireEvent.keyDown(panel, { key: 'j' });
    fireEvent.keyDown(panel, { key: 'r' });
    fireEvent.keyDown(panel, { key: 't' });

    // Actions should not have been triggered since dialog is open
    expect(mockTriggerRun).not.toHaveBeenCalled();
    expect(mockToggleSpecialist).not.toHaveBeenCalled();
  });

  it('should switch to actions view with 2 key', async () => {
    renderWithVim(
      <>
        <ZoneSetter zone="schedule" />
        <SchedulePanel />
      </>
    );

    await waitFor(() => {
      expect(screen.getByTestId('specialist-card-spec-1')).toBeInTheDocument();
    });

    const panel = screen.getByTestId('schedule-panel');
    fireEvent.keyDown(panel, { key: '2' });

    await waitFor(() => {
      expect(screen.getByTestId('mock-actions-view')).toBeInTheDocument();
    });
  });
});
