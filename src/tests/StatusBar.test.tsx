/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ThemeProvider } from '@renderer/theme';
import { StatusBar } from '@renderer/components/StatusBar';

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
  beforeEach(() => {
    localStorage.clear();
  });

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
});
