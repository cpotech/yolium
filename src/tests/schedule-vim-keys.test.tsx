/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { ThemeProvider } from '@renderer/theme';
import { VimModeProvider, useVimModeContext } from '@renderer/context/VimModeContext';
import { SchedulePanel } from '@renderer/components/schedule/SchedulePanel';

// jsdom doesn't implement scrollIntoView
Element.prototype.scrollIntoView = vi.fn();

const mockGetState = vi.fn();
const mockGetSpecialists = vi.fn();
const mockGetActionStats = vi.fn();
const mockGetRunning = vi.fn();
const mockToggleSpecialist = vi.fn();
const mockTriggerRun = vi.fn();
const mockReload = vi.fn();

vi.mock('@renderer/components/schedule/ActionsView', () => ({
  ActionsView: (props: { onBack?: () => void }) => {
    return <div data-testid="mock-actions-view" />;
  },
}));

vi.mock('@renderer/components/schedule/AddSpecialistDialog', () => ({
  AddSpecialistDialog: (props: {
    isOpen: boolean;
    onClose: () => void;
    onCreated: () => void;
    editingSpecialistId?: string | null;
  }) => {
    if (!props.isOpen) return null;
    return (
      <div data-testid="mock-add-specialist-dialog">
        <div data-testid="mock-editing-specialist-id">{props.editingSpecialistId ?? 'create'}</div>
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

function ZoneDisplay() {
  const { activeZone } = useVimModeContext();
  return <div data-testid="current-zone">{activeZone}</div>;
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

async function waitForVimReady() {
  await waitFor(() => {
    expect(
      screen.getByTestId('specialist-card-spec-1').getAttribute('data-vim-focused')
    ).toBe('true');
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetState.mockResolvedValue({
    specialists: {
      'spec-1': { id: 'spec-1', enabled: true, consecutiveNoAction: 0, consecutiveFailures: 0, totalRuns: 5, successRate: 100, weeklyCost: 0.1 },
      'spec-2': { id: 'spec-2', enabled: true, consecutiveNoAction: 0, consecutiveFailures: 0, totalRuns: 3, successRate: 80, weeklyCost: 0.2 },
    },
    globalEnabled: true,
  });
  mockGetSpecialists.mockResolvedValue({
    ...createSpecialist('spec-1', 'Spec One'),
    ...createSpecialist('spec-2', 'Spec Two'),
  });
  mockGetActionStats.mockResolvedValue({ totalActions: 0, actionCounts: {} });
  mockGetRunning.mockResolvedValue([]);
  mockToggleSpecialist.mockResolvedValue(undefined);
  mockTriggerRun.mockResolvedValue({ skipped: false });
  mockReload.mockResolvedValue(undefined);

  Object.defineProperty(window, 'electronAPI', {
    value: {
      schedule: {
        getState: mockGetState,
        getSpecialists: mockGetSpecialists,
        getActionStats: mockGetActionStats,
        getRunning: mockGetRunning,
        getHistory: vi.fn().mockResolvedValue([]),
        getStats: vi.fn().mockResolvedValue({ totalRuns: 0, successRate: 0, weeklyCost: 0, averageTokensPerRun: 0, averageDurationMs: 0 }),
        getRunLog: vi.fn().mockResolvedValue(''),
        getRunActions: vi.fn().mockResolvedValue([]),
        onAlert: vi.fn(() => vi.fn()),
        onStateChanged: vi.fn(() => vi.fn()),
        toggleGlobal: vi.fn(),
        toggleSpecialist: mockToggleSpecialist,
        triggerRun: mockTriggerRun,
        reload: mockReload,
        resetSpecialist: vi.fn(),
        deleteSpecialist: vi.fn(),
      },
      dialog: { confirmOkCancel: vi.fn().mockResolvedValue(true) },
    },
    writable: true,
  });
});

afterEach(() => {
  cleanup();
});

describe('Schedule vim key remapping', () => {
  it('should not consume t key (zone-switch to tabs) when in specialists view', async () => {
    renderWithVim(
      <>
        <ZoneSetter zone="schedule" />
        <ZoneDisplay />
        <SchedulePanel />
      </>
    );

    await waitForVimReady();

    const panel = screen.getByTestId('schedule-panel');
    fireEvent.keyDown(panel, { key: 't' });

    // 't' should NOT toggle specialist — it should pass through to global handler
    expect(mockToggleSpecialist).not.toHaveBeenCalled();

    // The global vim handler should switch to tabs zone
    await waitFor(() => {
      expect(screen.getByTestId('current-zone')).toHaveTextContent('tabs');
    });
  });

  it('should not consume c key (zone-switch to content) when in specialists view', async () => {
    renderWithVim(
      <>
        <ZoneSetter zone="schedule" />
        <ZoneDisplay />
        <SchedulePanel />
      </>
    );

    await waitForVimReady();

    const panel = screen.getByTestId('schedule-panel');
    fireEvent.keyDown(panel, { key: 'c' });

    // 'c' should NOT open configure — it should pass through to global handler
    expect(screen.queryByTestId('mock-add-specialist-dialog')).not.toBeInTheDocument();

    // The global vim handler should switch to content zone
    await waitFor(() => {
      expect(screen.getByTestId('current-zone')).toHaveTextContent('content');
    });
  });

  it('should handle d key to toggle specialist enabled state', async () => {
    renderWithVim(
      <>
        <ZoneSetter zone="schedule" />
        <SchedulePanel />
      </>
    );

    await waitForVimReady();

    const panel = screen.getByTestId('schedule-panel');
    fireEvent.keyDown(panel, { key: 'd' });

    await waitFor(() => {
      expect(mockToggleSpecialist).toHaveBeenCalledWith('spec-1', false);
    });
  });

  it('should handle o key to open specialist configuration', async () => {
    renderWithVim(
      <>
        <ZoneSetter zone="schedule" />
        <SchedulePanel />
      </>
    );

    await waitForVimReady();

    const panel = screen.getByTestId('schedule-panel');
    fireEvent.keyDown(panel, { key: 'o' });

    await waitFor(() => {
      expect(screen.getByTestId('mock-add-specialist-dialog')).toBeInTheDocument();
    });
    expect(screen.getByTestId('mock-editing-specialist-id')).toHaveTextContent('spec-1');
  });

  it('should handle 1/2 keys to switch views', async () => {
    renderWithVim(
      <>
        <ZoneSetter zone="schedule" />
        <SchedulePanel />
      </>
    );

    await waitForVimReady();

    const panel = screen.getByTestId('schedule-panel');

    // Switch to actions view with '2'
    fireEvent.keyDown(panel, { key: '2' });
    await waitFor(() => {
      expect(screen.getByTestId('mock-actions-view')).toBeInTheDocument();
    });

    // Switch back to specialists view with '1'
    fireEvent.keyDown(panel, { key: '1' });
    await waitForVimReady();
  });

  it('should handle zone-switching keys (e, s, a) without interference', async () => {
    renderWithVim(
      <>
        <ZoneSetter zone="schedule" />
        <ZoneDisplay />
        <SchedulePanel />
      </>
    );

    await waitForVimReady();

    const panel = screen.getByTestId('schedule-panel');

    // Press 'e' — should switch to sidebar zone
    fireEvent.keyDown(panel, { key: 'e' });
    await waitFor(() => {
      expect(screen.getByTestId('current-zone')).toHaveTextContent('sidebar');
    });
  });

  it('should attach data-vim-zone to history view', async () => {
    renderWithVim(
      <>
        <ZoneSetter zone="schedule" />
        <SchedulePanel />
      </>
    );

    await waitForVimReady();

    // Open history with Enter
    const panel = screen.getByTestId('schedule-panel');
    fireEvent.keyDown(panel, { key: 'Enter' });

    await waitFor(() => {
      expect(screen.getByTestId('schedule-panel-history')).toBeInTheDocument();
    });

    const historyView = screen.getByTestId('schedule-panel-history');
    expect(historyView.getAttribute('data-vim-zone')).toBe('schedule');
  });

  it('should restore focus when zone changes back to schedule in history view', async () => {
    const { rerender } = render(
      <ThemeProvider>
        <VimModeProvider>
          <ZoneSetter zone="schedule" />
          <SchedulePanel />
        </VimModeProvider>
      </ThemeProvider>,
    );

    await waitForVimReady();

    // Open history with Enter
    const panel = screen.getByTestId('schedule-panel');
    fireEvent.keyDown(panel, { key: 'Enter' });

    await waitFor(() => {
      expect(screen.getByTestId('schedule-panel-history')).toBeInTheDocument();
    });

    // Switch zone away
    rerender(
      <ThemeProvider>
        <VimModeProvider>
          <ZoneSetter zone="sidebar" />
          <SchedulePanel />
        </VimModeProvider>
      </ThemeProvider>,
    );

    // Switch back to schedule zone
    rerender(
      <ThemeProvider>
        <VimModeProvider>
          <ZoneSetter zone="schedule" />
          <SchedulePanel />
        </VimModeProvider>
      </ThemeProvider>,
    );

    // The history view should still be visible and have focus
    await waitFor(() => {
      const historyView = screen.getByTestId('schedule-panel-history');
      expect(historyView).toBeInTheDocument();
      expect(document.activeElement).toBe(historyView);
    });
  });
});
