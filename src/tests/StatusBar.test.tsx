/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ThemeProvider } from '@renderer/theme';
import { StatusBar } from '@renderer/components/StatusBar';

vi.mock('@renderer/context/VimModeContext', () => {
  let mockValue = {
    mode: 'NORMAL' as const,
    activeZone: 'content' as const,
    setActiveZone: () => {},
    enterInsertMode: () => {},
    exitToNormal: () => {},
    suspendNavigation: () => () => {},
  };
  return {
    useVimModeContext: () => mockValue,
    __setMockVimMode: (overrides: Record<string, unknown>) => {
      mockValue = { ...mockValue, ...overrides };
    },
  };
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { __setMockVimMode } = await import('@renderer/context/VimModeContext') as any;

function renderStatusBar(overrides: Partial<React.ComponentProps<typeof StatusBar>> = {}) {
  const props: React.ComponentProps<typeof StatusBar> = {
    contextLabel: 'Scheduled Agents',
    onShowShortcuts: vi.fn(),
    onOpenSettings: vi.fn(),
    ...overrides,
  };

  return render(
    <ThemeProvider>
      <StatusBar {...props} />
    </ThemeProvider>,
  );
}

describe('StatusBar', () => {
  it('should render a generic status label when provided without git or container metadata', () => {
    renderStatusBar();

    expect(screen.getByTestId('status-label')).toHaveTextContent('Scheduled Agents');
    expect(screen.queryByTestId('status-path')).not.toBeInTheDocument();
    expect(screen.queryByTestId('status-container-state')).not.toBeInTheDocument();
  });

  it('should not render stop controls when containerState and onStop are omitted', () => {
    renderStatusBar();

    expect(screen.queryByTestId('stop-button')).not.toBeInTheDocument();
  });

  it('should render speech-to-text controls when recording handlers are provided', () => {
    renderStatusBar({
      onToggleRecording: vi.fn(),
      onOpenModelDialog: vi.fn(),
    });

    expect(screen.getByTestId('speech-to-text-button')).toBeInTheDocument();
    expect(screen.getByTestId('speech-model-select')).toBeInTheDocument();
  });

  it('should call the settings and shortcuts handlers from the shared action area', () => {
    const onOpenSettings = vi.fn();
    const onShowShortcuts = vi.fn();

    renderStatusBar({ onOpenSettings, onShowShortcuts });

    fireEvent.click(screen.getByTestId('settings-button'));
    fireEvent.click(screen.getByTestId('shortcuts-button'));

    expect(onOpenSettings).toHaveBeenCalledTimes(1);
    expect(onShowShortcuts).toHaveBeenCalledTimes(1);
  });

  it('should omit the project settings button when no project settings handler is passed', () => {
    renderStatusBar();

    expect(screen.queryByTestId('project-settings-button')).not.toBeInTheDocument();
  });

  it('should prefer the project path when both a path and generic label are provided', () => {
    renderStatusBar({
      folderPath: '/tmp/project',
      contextLabel: 'Scheduled Agents',
    });

    expect(screen.getByTestId('status-path')).toHaveTextContent('/tmp/project');
    expect(screen.queryByTestId('status-label')).not.toBeInTheDocument();
  });

  it('should display zone navigation shortcut hints (E, T, C, S) in NORMAL mode', () => {
    __setMockVimMode({ mode: 'NORMAL', activeZone: 'content' });
    renderStatusBar();

    const zoneHints = screen.getByTestId('zone-hints');
    expect(zoneHints).toBeInTheDocument();

    expect(screen.getByTestId('zone-hint-e')).toHaveTextContent('E');
    expect(screen.getByTestId('zone-hint-t')).toHaveTextContent('T');
    expect(screen.getByTestId('zone-hint-c')).toHaveTextContent('C');
    expect(screen.getByTestId('zone-hint-s')).toHaveTextContent('S');
  });

  it('should hide zone navigation shortcut hints in INSERT mode', () => {
    __setMockVimMode({ mode: 'INSERT', activeZone: 'content' });
    renderStatusBar();

    expect(screen.queryByTestId('zone-hints')).not.toBeInTheDocument();

    // Reset to NORMAL for other tests
    __setMockVimMode({ mode: 'NORMAL', activeZone: 'content' });
  });

  it('should highlight the active zone shortcut hint when its zone is focused', () => {
    __setMockVimMode({ mode: 'NORMAL', activeZone: 'sidebar' });
    renderStatusBar();

    const eHint = screen.getByTestId('zone-hint-e');
    expect(eHint.className).toContain('text-[var(--color-accent-primary)]');

    // Other hints should have muted styling
    const tHint = screen.getByTestId('zone-hint-t');
    expect(tHint.className).toContain('text-[var(--color-text-muted)]');

    // Reset
    __setMockVimMode({ mode: 'NORMAL', activeZone: 'content' });
  });
});
