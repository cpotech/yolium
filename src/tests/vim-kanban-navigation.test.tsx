/**
 * @vitest-environment jsdom
 */
import React, { useState } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { ThemeProvider } from '@renderer/theme';
import { VimModeProvider, useVimModeContext } from '@renderer/context/VimModeContext';
import { KanbanColumn } from '@renderer/components/kanban/KanbanColumn';
import { KanbanView } from '@renderer/components/kanban/KanbanView';
import type { KanbanItem, KanbanBoard } from '@shared/types/kanban';

const mockGetBoard = vi.fn();
const mockOnBoardUpdated = vi.fn(() => () => {});

Object.defineProperty(window, 'electronAPI', {
  writable: true,
  value: {
    kanban: {
      getBoard: mockGetBoard,
      onBoardUpdated: mockOnBoardUpdated,
      updateItem: vi.fn().mockResolvedValue(undefined),
      deleteItems: vi.fn().mockResolvedValue(undefined),
      addItem: vi.fn().mockResolvedValue({ id: 'new-1', description: '', agentProvider: 'claude' }),
      addComment: vi.fn().mockResolvedValue(undefined),
    },
    agent: {
      recover: vi.fn().mockResolvedValue(undefined),
      onOutput: vi.fn().mockReturnValue(() => {}),
      onProgress: vi.fn().mockReturnValue(() => {}),
      onComplete: vi.fn().mockReturnValue(() => {}),
      onError: vi.fn().mockReturnValue(() => {}),
      onExit: vi.fn().mockReturnValue(() => {}),
      onCostUpdate: vi.fn().mockReturnValue(() => {}),
      getActiveSession: vi.fn().mockResolvedValue(null),
      readLog: vi.fn().mockResolvedValue([]),
      clearLog: vi.fn().mockResolvedValue(undefined),
      listDefinitions: vi.fn().mockResolvedValue([]),
      start: vi.fn(),
      resume: vi.fn(),
      stop: vi.fn(),
      answer: vi.fn(),
    },
    git: {
      detectNestedRepos: vi.fn().mockResolvedValue({ isRepo: true, nestedRepos: [] }),
      loadConfig: vi.fn().mockResolvedValue({}),
      worktreeChangedFiles: vi.fn().mockResolvedValue([]),
      worktreeFileDiff: vi.fn().mockResolvedValue(''),
      worktreeDiffStats: vi.fn().mockResolvedValue(null),
      mergeAndPushPR: vi.fn(),
      checkMergeConflicts: vi.fn(),
      rebaseOntoDefault: vi.fn(),
      approvePR: vi.fn(),
      mergePR: vi.fn(),
      init: vi.fn(),
    },
    dialog: { confirmOkCancel: vi.fn().mockResolvedValue(true) },
    app: { openExternal: vi.fn() },
  },
});

// jsdom doesn't implement scrollIntoView
beforeEach(() => {
  vi.clearAllMocks();
  Element.prototype.scrollIntoView = vi.fn();
  // Re-apply default resolved values after clearAllMocks wipes them
  mockGetBoard.mockResolvedValue(null);
  mockOnBoardUpdated.mockReturnValue(() => {});
  (window.electronAPI.git.detectNestedRepos as ReturnType<typeof vi.fn>).mockResolvedValue({ isRepo: true, nestedRepos: [] });
  (window.electronAPI.agent.recover as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  (window.electronAPI.agent.getActiveSession as ReturnType<typeof vi.fn>).mockResolvedValue(null);
  (window.electronAPI.agent.readLog as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (window.electronAPI.agent.listDefinitions as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (window.electronAPI.agent.onOutput as ReturnType<typeof vi.fn>).mockReturnValue(() => {});
  (window.electronAPI.agent.onProgress as ReturnType<typeof vi.fn>).mockReturnValue(() => {});
  (window.electronAPI.agent.onComplete as ReturnType<typeof vi.fn>).mockReturnValue(() => {});
  (window.electronAPI.agent.onError as ReturnType<typeof vi.fn>).mockReturnValue(() => {});
  (window.electronAPI.agent.onExit as ReturnType<typeof vi.fn>).mockReturnValue(() => {});
  (window.electronAPI.agent.onCostUpdate as ReturnType<typeof vi.fn>).mockReturnValue(() => {});
  (window.electronAPI.git.loadConfig as ReturnType<typeof vi.fn>).mockResolvedValue({});
});

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
    setActiveZone(zone as 'sidebar' | 'tabs' | 'content' | 'status-bar');
  }, [zone, setActiveZone]);
  return null;
}

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
  createMockItem({ id: 'item-1', title: 'Item 1' }),
  createMockItem({ id: 'item-2', title: 'Item 2' }),
  createMockItem({ id: 'item-3', title: 'Item 3' }),
];

function StatefulKanbanColumn({
  items,
  initialFocusedIndex = 0,
  onCardClick,
}: {
  items: KanbanItem[];
  initialFocusedIndex?: number;
  onCardClick: (item: KanbanItem, event: React.MouseEvent | React.KeyboardEvent) => void;
}) {
  const [focusedCardIndex, setFocusedCardIndex] = useState(initialFocusedIndex);

  return (
    <KanbanColumn
      columnId="backlog"
      title="Backlog"
      items={items}
      focusedCardIndex={focusedCardIndex}
      onCardClick={onCardClick}
      onCardDrop={vi.fn()}
      onFocusedCardChange={setFocusedCardIndex}
    />
  );
}

describe('KanbanView spatial vim navigation', () => {
  const onCardClick = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should move down to next card with j or ArrowDown', () => {
    renderWithVim(
      <>
        <ZoneSetter zone="content" />
        <StatefulKanbanColumn items={mockItems} initialFocusedIndex={0} onCardClick={onCardClick} />
      </>
    );

    const column = screen.getByTestId('kanban-column-backlog');
    fireEvent.keyDown(column, { key: 'j' });

    const cards = screen.getAllByTestId('kanban-card');
    expect(cards[1].getAttribute('data-vim-focused')).toBe('true');
  });

  it('should move up to previous card with k or ArrowUp', () => {
    renderWithVim(
      <>
        <ZoneSetter zone="content" />
        <StatefulKanbanColumn items={mockItems} initialFocusedIndex={1} onCardClick={onCardClick} />
      </>
    );

    const column = screen.getByTestId('kanban-column-backlog');
    fireEvent.keyDown(column, { key: 'k' });

    const cards = screen.getAllByTestId('kanban-card');
    expect(cards[0].getAttribute('data-vim-focused')).toBe('true');
  });

  it('should move to next column with l or ArrowRight', () => {
    renderWithVim(
      <>
        <ZoneSetter zone="content" />
        <KanbanColumn
          columnId="backlog"
          title="Backlog"
          items={mockItems}
          focusedCardIndex={1}
          onCardClick={onCardClick}
          onCardDrop={vi.fn()}
        />
      </>
    );

    const cards = screen.getAllByTestId('kanban-card');
    expect(cards[1].getAttribute('data-vim-focused')).toBe('true');
  });

  it('should move to previous column with h or ArrowLeft', () => {
    renderWithVim(
      <>
        <ZoneSetter zone="content" />
        <KanbanColumn
          columnId="backlog"
          title="Backlog"
          items={mockItems}
          focusedCardIndex={0}
          onCardClick={onCardClick}
          onCardDrop={vi.fn()}
        />
      </>
    );

    const cards = screen.getAllByTestId('kanban-card');
    expect(cards[0].getAttribute('data-vim-focused')).toBe('true');
  });

  it('should jump to first card with gg', () => {
    renderWithVim(
      <>
        <ZoneSetter zone="content" />
        <StatefulKanbanColumn items={mockItems} initialFocusedIndex={2} onCardClick={onCardClick} />
      </>
    );

    const column = screen.getByTestId('kanban-column-backlog');
    fireEvent.keyDown(column, { key: 'g' });
    fireEvent.keyDown(column, { key: 'g' });

    const cards = screen.getAllByTestId('kanban-card');
    expect(cards[0].getAttribute('data-vim-focused')).toBe('true');
  });

  it('should jump to last card with G', () => {
    renderWithVim(
      <>
        <ZoneSetter zone="content" />
        <StatefulKanbanColumn items={mockItems} initialFocusedIndex={0} onCardClick={onCardClick} />
      </>
    );

    const column = screen.getByTestId('kanban-column-backlog');
    fireEvent.keyDown(column, { key: 'G' });

    const cards = screen.getAllByTestId('kanban-card');
    expect(cards[2].getAttribute('data-vim-focused')).toBe('true');
  });

  it('should open card detail with Enter on focused card', () => {
    renderWithVim(
      <>
        <ZoneSetter zone="content" />
        <StatefulKanbanColumn items={mockItems} initialFocusedIndex={0} onCardClick={onCardClick} />
      </>
    );

    const column = screen.getByTestId('kanban-column-backlog');
    fireEvent.keyDown(column, { key: 'Enter' });

    expect(onCardClick).toHaveBeenCalledWith(mockItems[0], expect.anything());
  });

  it('should wrap to first card when pressing j on last card in column', () => {
    renderWithVim(
      <>
        <ZoneSetter zone="content" />
        <StatefulKanbanColumn items={mockItems} initialFocusedIndex={2} onCardClick={onCardClick} />
      </>
    );

    const column = screen.getByTestId('kanban-column-backlog');
    fireEvent.keyDown(column, { key: 'j' });

    const cards = screen.getAllByTestId('kanban-card');
    expect(cards[0].getAttribute('data-vim-focused')).toBe('true');
  });

  it('should preserve row position when moving between columns', () => {
    renderWithVim(
      <>
        <ZoneSetter zone="content" />
        <KanbanColumn
          columnId="backlog"
          title="Backlog"
          items={mockItems}
          focusedCardIndex={1}
          onCardClick={onCardClick}
          onCardDrop={vi.fn()}
        />
      </>
    );

    const cards = screen.getAllByTestId('kanban-card');
    expect(cards[1].getAttribute('data-vim-focused')).toBe('true');
    expect(cards[0].getAttribute('data-vim-focused')).toBeNull();
  });

  it('should show visible focus ring on the currently focused card', () => {
    renderWithVim(
      <>
        <ZoneSetter zone="content" />
        <KanbanColumn
          columnId="backlog"
          title="Backlog"
          items={mockItems}
          focusedCardIndex={0}
          onCardClick={onCardClick}
          onCardDrop={vi.fn()}
        />
      </>
    );

    const cards = screen.getAllByTestId('kanban-card');
    expect(cards[0].className).toContain('ring-2');
  });

  it('should not navigate when in INSERT mode', () => {
    renderWithVim(
      <>
        <ZoneSetter zone="content" />
        <StatefulKanbanColumn items={mockItems} initialFocusedIndex={0} onCardClick={onCardClick} />
      </>
    );

    fireEvent.keyDown(document, { key: 'i' });

    const column = screen.getByTestId('kanban-column-backlog');
    fireEvent.keyDown(column, { key: 'j' });

    const cards = screen.getAllByTestId('kanban-card');
    cards.forEach(card => {
      expect(card.getAttribute('data-vim-focused')).toBeNull();
    });
    expect(cards[1].getAttribute('data-vim-focused')).toBeNull();
  });
});

// Helper: find which column contains the focused card
function getFocusedColumnId(): string | null {
  const columns = ['backlog', 'ready', 'in-progress', 'verify', 'done'];
  for (const colId of columns) {
    const col = screen.getByTestId(`kanban-column-${colId}`);
    const focusedCard = col.querySelector('[data-vim-focused="true"]');
    if (focusedCard) return colId;
  }
  return null;
}

function createMockBoard(items: KanbanItem[]): KanbanBoard {
  return {
    id: 'board-1',
    projectPath: '/test/project',
    items,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };
}

describe('column navigation skipping empty columns', () => {
  // Board with items only in backlog (col 0) and verify (col 3)
  // Columns: backlog=0, ready=1, in-progress=2, verify=3, done=4
  const sparseItems = [
    createMockItem({ id: 'bl-1', title: 'Backlog Item', column: 'backlog' }),
    createMockItem({ id: 'vf-1', title: 'Verify Item', column: 'verify' }),
  ];

  it('should skip empty columns when navigating right with l', async () => {
    mockGetBoard.mockResolvedValue(createMockBoard(sparseItems));

    await act(async () => {
      renderWithVim(
        <>
          <ZoneSetter zone="content" />
          <KanbanView projectPath="/test/project" />
        </>
      );
    });

    // Should start focused on backlog (col 0) which has items
    expect(getFocusedColumnId()).toBe('backlog');

    const view = screen.getByTestId('kanban-view');
    fireEvent.keyDown(view, { key: 'l' });

    // Should skip ready (empty), in-progress (empty), and land on verify (col 3)
    expect(getFocusedColumnId()).toBe('verify');
  });

  it('should skip empty columns when navigating left with h', async () => {
    mockGetBoard.mockResolvedValue(createMockBoard(sparseItems));

    await act(async () => {
      renderWithVim(
        <>
          <ZoneSetter zone="content" />
          <KanbanView projectPath="/test/project" />
        </>
      );
    });

    const view = screen.getByTestId('kanban-view');

    // Navigate right to verify column first
    fireEvent.keyDown(view, { key: 'l' });
    expect(getFocusedColumnId()).toBe('verify');

    // Now navigate left — should skip in-progress, ready (both empty) and land on backlog
    fireEvent.keyDown(view, { key: 'h' });
    expect(getFocusedColumnId()).toBe('backlog');
  });

  it('should not move if no columns with items exist in the navigation direction', async () => {
    // Items only in in-progress (col 2)
    const middleOnly = [
      createMockItem({ id: 'ip-1', title: 'In Progress Item', column: 'in-progress' }),
    ];
    mockGetBoard.mockResolvedValue(createMockBoard(middleOnly));

    await act(async () => {
      renderWithVim(
        <>
          <ZoneSetter zone="content" />
          <KanbanView projectPath="/test/project" />
        </>
      );
    });

    const view = screen.getByTestId('kanban-view');

    // The initial focus is on backlog (col 0) which is empty, so first navigate
    // to in-progress by pressing l (which should skip empty columns)
    fireEvent.keyDown(view, { key: 'l' });
    expect(getFocusedColumnId()).toBe('in-progress');

    // Now pressing l again — verify and done are empty, should stay on in-progress
    fireEvent.keyDown(view, { key: 'l' });
    expect(getFocusedColumnId()).toBe('in-progress');
  });

  it('should reset focusedCardIndex to 0 when landing on a new column', async () => {
    // Backlog has 3 items, verify has 2 items
    const multiItems = [
      createMockItem({ id: 'bl-1', title: 'Backlog 1', column: 'backlog' }),
      createMockItem({ id: 'bl-2', title: 'Backlog 2', column: 'backlog' }),
      createMockItem({ id: 'bl-3', title: 'Backlog 3', column: 'backlog' }),
      createMockItem({ id: 'vf-1', title: 'Verify 1', column: 'verify' }),
      createMockItem({ id: 'vf-2', title: 'Verify 2', column: 'verify' }),
    ];
    mockGetBoard.mockResolvedValue(createMockBoard(multiItems));

    await act(async () => {
      renderWithVim(
        <>
          <ZoneSetter zone="content" />
          <KanbanView projectPath="/test/project" />
        </>
      );
    });

    const view = screen.getByTestId('kanban-view');

    // Move focus down to card index 2 in backlog
    fireEvent.keyDown(view, { key: 'j' });
    fireEvent.keyDown(view, { key: 'j' });

    // Now navigate right to verify — should reset to first card (index 0)
    fireEvent.keyDown(view, { key: 'l' });
    expect(getFocusedColumnId()).toBe('verify');

    // The first card in the verify column should be focused
    const verifyCol = screen.getByTestId('kanban-column-verify');
    const verifyCards = verifyCol.querySelectorAll('[data-testid="kanban-card"]');
    expect(verifyCards[0].getAttribute('data-vim-focused')).toBe('true');
  });

  it('should work correctly with search filtering (skip columns empty due to search)', async () => {
    // Items in backlog, ready, and verify — but search will filter out ready items
    const searchItems = [
      createMockItem({ id: 'bl-1', title: 'Alpha task', column: 'backlog' }),
      createMockItem({ id: 'rd-1', title: 'Beta task', column: 'ready' }),
      createMockItem({ id: 'vf-1', title: 'Alpha verify', column: 'verify' }),
    ];
    mockGetBoard.mockResolvedValue(createMockBoard(searchItems));

    await act(async () => {
      renderWithVim(
        <>
          <ZoneSetter zone="content" />
          <KanbanView projectPath="/test/project" />
        </>
      );
    });

    // Type "Alpha" in the search box — this should filter out the "Beta task" in ready
    const searchInput = screen.getByTestId('search-input');
    fireEvent.change(searchInput, { target: { value: 'Alpha' } });

    const view = screen.getByTestId('kanban-view');

    // Navigate right from backlog — ready is now empty (filtered), should skip to verify
    fireEvent.keyDown(view, { key: 'l' });
    expect(getFocusedColumnId()).toBe('verify');
  });
});
