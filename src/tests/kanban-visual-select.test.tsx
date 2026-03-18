/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { ThemeProvider } from '@renderer/theme';
import { VimModeProvider, useVimModeContext } from '@renderer/context/VimModeContext';
import { KanbanView } from '@renderer/components/kanban/KanbanView';
import type { KanbanBoard, KanbanItem } from '@shared/types/kanban';

function createMockItem(overrides: Partial<KanbanItem> = {}): KanbanItem {
  return {
    id: `item-${Math.random().toString(36).slice(2, 8)}`,
    title: 'Test Item',
    description: 'Test description',
    column: 'backlog',
    agentStatus: 'idle',
    agentType: 'code-agent',
    agentProvider: 'claude',
    comments: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as KanbanItem;
}

const mockItems = [
  createMockItem({ id: 'item-1', title: 'Item 1', column: 'backlog' }),
  createMockItem({ id: 'item-2', title: 'Item 2', column: 'backlog' }),
  createMockItem({ id: 'item-3', title: 'Item 3', column: 'backlog' }),
  createMockItem({ id: 'item-4', title: 'Item 4', column: 'backlog' }),
];

const mockBoard: KanbanBoard = {
  projectPath: '/test/project',
  items: mockItems,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

Object.defineProperty(window, 'electronAPI', {
  writable: true,
  value: {
    kanban: {
      getBoard: vi.fn().mockResolvedValue(mockBoard),
      onBoardUpdated: vi.fn(() => () => {}),
      updateItem: vi.fn(),
      deleteItems: vi.fn().mockResolvedValue(undefined),
    },
    agent: {
      recover: vi.fn().mockResolvedValue(undefined),
      start: vi.fn().mockResolvedValue({ sessionId: 'session-1' }),
      resume: vi.fn().mockResolvedValue({ sessionId: 'session-1' }),
      listDefinitions: vi.fn().mockResolvedValue([]),
      readLog: vi.fn().mockResolvedValue(''),
      destroy: vi.fn().mockResolvedValue(() => {}),
      clearLog: vi.fn().mockResolvedValue(undefined),
      getActiveSession: vi.fn().mockResolvedValue(null),
      onOutput: vi.fn(() => () => {}),
      onProgress: vi.fn(() => () => {}),
      onComplete: vi.fn(() => () => {}),
      onError: vi.fn(() => () => {}),
      onExit: vi.fn(() => () => {}),
      onCostUpdate: vi.fn(() => () => {}),
    },
    git: {
      detectNestedRepos: vi.fn().mockResolvedValue({ isRepo: true, nestedRepos: [] }),
      init: vi.fn().mockResolvedValue({ success: true }),
      loadConfig: vi.fn().mockResolvedValue(null),
    },
    dialog: { confirmOkCancel: vi.fn() },
  },
});

function ZoneSetter({ zone }: { zone: string }) {
  const { setActiveZone } = useVimModeContext();
  React.useEffect(() => {
    setActiveZone(zone as 'sidebar' | 'tabs' | 'content' | 'status-bar');
  }, [zone, setActiveZone]);
  return null;
}

function renderKanbanWithVim() {
  return render(
    <ThemeProvider>
      <VimModeProvider>
        <ZoneSetter zone="content" />
        <KanbanView projectPath="/test/project" />
      </VimModeProvider>
    </ThemeProvider>,
  );
}

describe('Kanban visual selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (window.electronAPI.kanban.getBoard as ReturnType<typeof vi.fn>).mockResolvedValue(mockBoard);
  });

  it('should select focused card when entering visual mode with v', async () => {
    renderKanbanWithVim();
    await waitFor(() => expect(screen.getByTestId('kanban-view')).toBeInTheDocument());

    const view = screen.getByTestId('kanban-view');

    // Press v to enter visual mode — should select the focused card
    fireEvent.keyDown(view, { key: 'v' });

    // The bulk action bar should appear with 1 item selected
    await waitFor(() => {
      expect(screen.getByTestId('bulk-action-bar')).toBeInTheDocument();
      expect(screen.getByTestId('selection-count')).toHaveTextContent('1 item selected');
    });
  });

  it('should extend selection downward when pressing j in visual mode', async () => {
    renderKanbanWithVim();
    await waitFor(() => expect(screen.getByTestId('kanban-view')).toBeInTheDocument());

    const view = screen.getByTestId('kanban-view');

    // Enter visual mode
    fireEvent.keyDown(view, { key: 'v' });
    // Press j to extend selection down
    fireEvent.keyDown(view, { key: 'j' });

    await waitFor(() => {
      expect(screen.getByTestId('selection-count')).toHaveTextContent('2 items selected');
    });
  });

  it('should extend selection upward when pressing k in visual mode', async () => {
    renderKanbanWithVim();
    await waitFor(() => expect(screen.getByTestId('kanban-view')).toBeInTheDocument());

    const view = screen.getByTestId('kanban-view');

    // Move focus down first (flush state between each to ensure focusedCardIndex updates)
    await act(async () => { fireEvent.keyDown(view, { key: 'j' }); });
    await act(async () => { fireEvent.keyDown(view, { key: 'j' }); });

    // Enter visual mode at position 2
    await act(async () => { fireEvent.keyDown(view, { key: 'v' }); });
    // Extend selection upward
    await act(async () => { fireEvent.keyDown(view, { key: 'k' }); });

    await waitFor(() => {
      expect(screen.getByTestId('selection-count')).toHaveTextContent('2 items selected');
    });
  });

  it('should clear selection and exit visual mode on Escape', async () => {
    renderKanbanWithVim();
    await waitFor(() => expect(screen.getByTestId('kanban-view')).toBeInTheDocument());

    const view = screen.getByTestId('kanban-view');

    // Enter visual mode and select some items
    fireEvent.keyDown(view, { key: 'v' });
    fireEvent.keyDown(view, { key: 'j' });

    await waitFor(() => {
      expect(screen.getByTestId('selection-count')).toHaveTextContent('2 items selected');
    });

    // Press Escape — should clear selection
    fireEvent.keyDown(view, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByTestId('bulk-action-bar')).not.toBeInTheDocument();
    });
  });

  it('should toggle visual mode off with second v press', async () => {
    renderKanbanWithVim();
    await waitFor(() => expect(screen.getByTestId('kanban-view')).toBeInTheDocument());

    const view = screen.getByTestId('kanban-view');

    // Enter visual mode and extend selection
    fireEvent.keyDown(view, { key: 'v' });
    fireEvent.keyDown(view, { key: 'j' });

    await waitFor(() => {
      expect(screen.getByTestId('selection-count')).toHaveTextContent('2 items selected');
    });

    // Press v again — should keep selection but exit visual mode
    fireEvent.keyDown(view, { key: 'v' });

    // Selection should still be visible (not cleared)
    await waitFor(() => {
      expect(screen.getByTestId('bulk-action-bar')).toBeInTheDocument();
      expect(screen.getByTestId('selection-count')).toHaveTextContent('2 items selected');
    });
  });

  it('should show VISUAL indicator in bulk action bar during visual mode', async () => {
    renderKanbanWithVim();
    await waitFor(() => expect(screen.getByTestId('kanban-view')).toBeInTheDocument());

    const view = screen.getByTestId('kanban-view');

    // Enter visual mode
    fireEvent.keyDown(view, { key: 'v' });

    await waitFor(() => {
      expect(screen.getByTestId('visual-mode-indicator')).toHaveTextContent('-- VISUAL --');
    });
  });

  it('should allow bulk delete of visually selected items with Delete key', async () => {
    renderKanbanWithVim();
    await waitFor(() => expect(screen.getByTestId('kanban-view')).toBeInTheDocument());

    const view = screen.getByTestId('kanban-view');

    // Enter visual mode and select 2 items
    fireEvent.keyDown(view, { key: 'v' });
    fireEvent.keyDown(view, { key: 'j' });

    await waitFor(() => {
      expect(screen.getByTestId('selection-count')).toHaveTextContent('2 items selected');
    });

    // Exit visual mode (keep selection), then delete
    fireEvent.keyDown(view, { key: 'v' });
    fireEvent.keyDown(view, { key: 'Delete' });

    await waitFor(() => {
      expect(window.electronAPI.kanban.deleteItems).toHaveBeenCalled();
    });
  });

  it('should not interfere with Ctrl+Click multi-select', async () => {
    renderKanbanWithVim();
    await waitFor(() => expect(screen.getByTestId('kanban-view')).toBeInTheDocument());

    const cards = screen.getAllByTestId('kanban-card');

    // Ctrl+Click on first card
    fireEvent.click(cards[0], { ctrlKey: true });

    await waitFor(() => {
      expect(screen.getByTestId('bulk-action-bar')).toBeInTheDocument();
      expect(screen.getByTestId('selection-count')).toHaveTextContent('1 item selected');
    });

    // Ctrl+Click on second card
    fireEvent.click(cards[1], { ctrlKey: true });

    await waitFor(() => {
      expect(screen.getByTestId('selection-count')).toHaveTextContent('2 items selected');
    });
  });

  it('should not interfere with Shift+Click range select', async () => {
    renderKanbanWithVim();
    await waitFor(() => expect(screen.getByTestId('kanban-view')).toBeInTheDocument());

    const cards = screen.getAllByTestId('kanban-card');

    // Click first card to establish anchor
    fireEvent.click(cards[0], { ctrlKey: true });

    // Shift+Click third card for range
    fireEvent.click(cards[2], { shiftKey: true });

    await waitFor(() => {
      expect(screen.getByTestId('selection-count')).toHaveTextContent('3 items selected');
    });
  });
});
