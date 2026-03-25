/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { GitConfigDialog } from '@renderer/components/settings/GitConfigDialog';

// Mock VimModeContext
vi.mock('@renderer/context/VimModeContext', () => ({
  useSuspendVimNavigation: vi.fn(),
  useVimModeContext: () => ({
    mode: 'NORMAL' as const,
    activeZone: 'content' as const,
    setActiveZone: () => {},
    enterInsertMode: () => {},
    exitToNormal: () => {},
    suspendNavigation: () => () => {},
  }),
}));

// Mock electronAPI
const mockListDefinitions = vi.fn();

Object.defineProperty(window, 'electronAPI', {
  value: {
    gitConfig: {
      load: vi.fn().mockResolvedValue({
        name: 'Test User',
        email: 'test@example.com',
      }),
      loadPat: vi.fn().mockResolvedValue(null),
      detectClaudeOAuth: vi.fn().mockResolvedValue(false),
      detectCodexOAuth: vi.fn().mockResolvedValue(false),
      loadApiKey: vi.fn().mockResolvedValue(null),
      loadProviderModels: vi.fn().mockResolvedValue({}),
      loadProviderModelDefaults: vi.fn().mockResolvedValue({}),
    },
    docker: {
      getImageInfo: vi.fn().mockResolvedValue(null),
      onBuildProgress: vi.fn(() => vi.fn()),
    },
    agent: {
      listDefinitions: mockListDefinitions,
    },
  },
  writable: true,
});

describe('GitConfigDialog - Agent Definitions section', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    onSave: vi.fn(),
    initialConfig: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockListDefinitions.mockResolvedValue([
      { name: 'plan-agent', description: 'Plans work', model: 'opus', tools: ['Read'], order: 1, isBuiltin: true },
      { name: 'code-agent', description: 'Writes code', model: 'sonnet', tools: ['Write'], order: 2, isBuiltin: true },
      { name: 'my-custom', description: 'Custom agent', model: 'haiku', tools: ['Read'], order: 10, isBuiltin: false },
    ]);
  });

  it('should render a Manage Agents button in the Agent Definitions section', async () => {
    render(<GitConfigDialog {...defaultProps} onOpenAgentSettings={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText('Agent Definitions')).toBeInTheDocument();
    });
    expect(screen.getByTestId('manage-agents-button')).toBeInTheDocument();
  });

  it('should call onOpenAgentSettings when Manage Agents button is clicked', async () => {
    const onOpenAgentSettings = vi.fn();
    render(<GitConfigDialog {...defaultProps} onOpenAgentSettings={onOpenAgentSettings} />);
    await waitFor(() => {
      expect(screen.getByTestId('manage-agents-button')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('manage-agents-button'));
    expect(onOpenAgentSettings).toHaveBeenCalledTimes(1);
  });

  it('should not render Manage Agents button when dialog is closed', () => {
    render(<GitConfigDialog {...defaultProps} isOpen={false} onOpenAgentSettings={vi.fn()} />);
    expect(screen.queryByTestId('manage-agents-button')).not.toBeInTheDocument();
  });

  it('should display agent count when agents are loaded', async () => {
    render(<GitConfigDialog {...defaultProps} onOpenAgentSettings={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByTestId('agent-count')).toBeInTheDocument();
    });
    expect(screen.getByTestId('agent-count').textContent).toContain('3');
  });
});
