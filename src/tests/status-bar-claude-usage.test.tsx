/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ThemeProvider } from '@renderer/theme';
import { StatusBar } from '@renderer/components/StatusBar';
import type { ClaudeUsageData, ClaudeUsageState } from '@shared/types/agent';

function renderStatusBar(overrides: Partial<React.ComponentProps<typeof StatusBar>> = {}) {
  const props: React.ComponentProps<typeof StatusBar> = {
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

const sampleUsage: ClaudeUsageData = {
  fiveHour: { utilization: 37, resetsAt: new Date(Date.now() + 3600000).toISOString() },
  sevenDay: { utilization: 12, resetsAt: new Date(Date.now() + 86400000).toISOString() },
};

const readyState: ClaudeUsageState = {
  status: 'ready',
  hasOAuth: true,
  usage: sampleUsage,
};

describe('StatusBar Claude usage', () => {
  it('should show Claude-branded usage bars when claudeUsage.status is ready', () => {
    renderStatusBar({ claudeUsage: readyState });

    expect(screen.getByText('Claude')).toBeInTheDocument();
    expect(screen.getByText('5h')).toBeInTheDocument();
    expect(screen.getByText('7d')).toBeInTheDocument();
    expect(screen.getByText('37%')).toBeInTheDocument();
    expect(screen.getByText('12%')).toBeInTheDocument();
  });

  it('should show Claude login CTA when claudeUsage.status is no-oauth', () => {
    renderStatusBar({
      claudeUsage: { status: 'no-oauth', hasOAuth: false, usage: null },
    });

    expect(screen.getByText('Claude')).toBeInTheDocument();
    expect(screen.getByText(/log in/i)).toBeInTheDocument();
    expect(screen.queryByText('5h')).not.toBeInTheDocument();
  });

  it('should show a loading spinner only when claudeUsage.status is loading', () => {
    const { container } = renderStatusBar({
      claudeUsage: { status: 'loading', hasOAuth: true, usage: null },
    });

    expect(screen.getByText('Claude')).toBeInTheDocument();
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
    expect(screen.queryByText(/log in/i)).not.toBeInTheDocument();
    expect(screen.queryByText('5h')).not.toBeInTheDocument();
    expect(screen.queryByText(/unavailable/i)).not.toBeInTheDocument();
  });

  it('should show a non-spinning unavailable fallback when claudeUsage.status is unavailable', () => {
    const { container } = renderStatusBar({
      claudeUsage: { status: 'unavailable', hasOAuth: true, usage: null },
    });

    const button = screen.getByRole('button', { name: /claude unavailable/i });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('title', expect.stringContaining("Run 'claude' on your host to re-login"));
    expect(button).toHaveAttribute('title', expect.stringContaining('Ctrl+Shift+U'));
    expect(container.querySelector('.animate-spin')).not.toBeInTheDocument();
    expect(screen.queryByText('5h')).not.toBeInTheDocument();
  });

  it('should show refresh tooltip when claudeUsage.status is ready', () => {
    renderStatusBar({ claudeUsage: readyState });

    const display = screen.getByTestId('claude-usage-display');
    expect(display).toHaveAttribute('title', 'Click to refresh (Ctrl+Shift+U)');
  });

  it('should call onOpenSettings when the unavailable fallback is clicked', () => {
    const onOpenSettings = vi.fn();
    renderStatusBar({
      claudeUsage: { status: 'unavailable', hasOAuth: true, usage: null },
      onOpenSettings,
    });

    fireEvent.click(screen.getByRole('button', { name: /claude unavailable/i }));

    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it('should call onOpenSettings when the login CTA is clicked', () => {
    const onOpenSettings = vi.fn();
    renderStatusBar({
      claudeUsage: { status: 'no-oauth', hasOAuth: false, usage: null },
      onOpenSettings,
    });

    fireEvent.click(screen.getByText(/log in/i).closest('span[role="button"]') ?? screen.getByText(/log in/i));

    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });
});
