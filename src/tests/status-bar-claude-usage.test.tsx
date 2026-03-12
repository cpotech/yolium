/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ThemeProvider } from '@renderer/theme';
import { StatusBar } from '@renderer/components/StatusBar';
import type { ClaudeUsageState } from '@shared/types/agent';

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

const sampleUsage: ClaudeUsageState = {
  hasOAuth: true,
  usage: {
    fiveHour: { utilization: 37, resetsAt: new Date(Date.now() + 3600000).toISOString() },
    sevenDay: { utilization: 12, resetsAt: new Date(Date.now() + 86400000).toISOString() },
  },
};

describe('StatusBar Claude usage', () => {
  it('should show Claude-branded usage bars when claudeUsage data is provided', () => {
    renderStatusBar({ claudeUsage: sampleUsage });

    expect(screen.getByText('Claude')).toBeInTheDocument();
    expect(screen.getByText('5h')).toBeInTheDocument();
    expect(screen.getByText('7d')).toBeInTheDocument();
  });

  it('should show Claude login CTA when hasOAuth is false and no usage data', () => {
    renderStatusBar({ claudeUsage: { hasOAuth: false, usage: null } });

    expect(screen.getByText('Claude')).toBeInTheDocument();
    expect(screen.getByText(/log in/)).toBeInTheDocument();
  });

  it('should not show usage bars when hasOAuth is false', () => {
    renderStatusBar({ claudeUsage: { hasOAuth: false, usage: null } });

    expect(screen.queryByText('5h')).not.toBeInTheDocument();
    expect(screen.queryByText('7d')).not.toBeInTheDocument();
  });

  it('should show Claude label prefix before 5h and 7d bars', () => {
    renderStatusBar({ claudeUsage: sampleUsage });

    const claudeLabel = screen.getByText('Claude');
    const fiveHourLabel = screen.getByText('5h');

    // Claude label should appear before the usage bars in DOM order
    expect(claudeLabel.compareDocumentPosition(fiveHourLabel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('should call onOpenSettings when login CTA is clicked', () => {
    const onOpenSettings = vi.fn();
    renderStatusBar({
      claudeUsage: { hasOAuth: false, usage: null },
      onOpenSettings,
    });

    const loginCta = screen.getByText(/log in/);
    fireEvent.click(loginCta.closest('span[role="button"]') || loginCta);

    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it('should show Claude loading state when hasOAuth is true but usage is null', () => {
    renderStatusBar({ claudeUsage: { hasOAuth: true, usage: null } });

    expect(screen.getByText('Claude')).toBeInTheDocument();
    expect(screen.queryByText('5h')).not.toBeInTheDocument();
    expect(screen.queryByText('7d')).not.toBeInTheDocument();
    expect(screen.queryByText(/log in/)).not.toBeInTheDocument();
  });

  it('should show loading spinner when hasOAuth is true and usage is null', () => {
    const { container } = renderStatusBar({ claudeUsage: { hasOAuth: true, usage: null } });

    // Loader2 renders an SVG with the animate-spin class
    const spinner = container.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  it('should make Claude label clickable when hasOAuth is true but usage is null', () => {
    renderStatusBar({ claudeUsage: { hasOAuth: true, usage: null } });

    const button = screen.getByRole('button', { name: /claude/i });
    expect(button).toBeInTheDocument();
  });

  it('should call onOpenSettings when Claude fallback label is clicked', () => {
    const onOpenSettings = vi.fn();
    renderStatusBar({
      claudeUsage: { hasOAuth: true, usage: null },
      onOpenSettings,
    });

    const button = screen.getByRole('button', { name: /claude/i });
    fireEvent.click(button);

    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it('should show tooltip on fallback state indicating usage unavailable', () => {
    renderStatusBar({ claudeUsage: { hasOAuth: true, usage: null } });

    const button = screen.getByRole('button', { name: /claude/i });
    expect(button).toHaveAttribute('title');
    expect(button.getAttribute('title')).toBeTruthy();
  });

  it('should render usage bars with correct utilization percentages', () => {
    renderStatusBar({ claudeUsage: sampleUsage });

    expect(screen.getByText('37%')).toBeInTheDocument();
    expect(screen.getByText('12%')).toBeInTheDocument();
  });

  it('should show usage section in empty state status bar with Claude branding', () => {
    // This test validates that the StatusBar component correctly handles
    // Claude branding - the empty state in App.tsx uses the same StatusBar
    // component, so testing the component is sufficient
    renderStatusBar({
      claudeUsage: sampleUsage,
    });

    expect(screen.getByText('Claude')).toBeInTheDocument();
    expect(screen.getByText('37%')).toBeInTheDocument();
    expect(screen.getByText('12%')).toBeInTheDocument();
  });
});
