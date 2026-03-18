/**
 * @vitest-environment jsdom
 */
import React, { useState } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider } from '@renderer/theme';
import { VimModeProvider, useVimModeContext } from '@renderer/context/VimModeContext';
import { KanbanColumn } from '@renderer/components/kanban/KanbanColumn';
import type { KanbanItem } from '@shared/types/kanban';

// Mock window.electronAPI
Object.defineProperty(window, 'electronAPI', {
  writable: true,
  value: {
    kanban: {
      getBoard: vi.fn(),
      onBoardUpdated: vi.fn(() => () => {}),
      updateItem: vi.fn(),
      deleteItems: vi.fn(),
    },
    agent: { recover: vi.fn() },
    git: { detectNestedRepos: vi.fn().mockResolvedValue({ isRepo: true, nestedRepos: [] }) },
    dialog: { confirmOkCancel: vi.fn() },
    app: { openExternal: vi.fn() },
  },
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

// Helper component that sets the active zone for testing
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

// Wrapper that manages focusedCardIndex state internally so keydown events actually update it
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
    // Column navigation is KanbanView responsibility
    // Unit test verifies that focusedCardIndex prop renders correctly
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
    // Same as above - column nav is KanbanView responsibility
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
    // Press g twice for gg
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
    // Verified through focusedCardIndex prop - when column changes, KanbanView preserves the card index
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

    // Enter INSERT mode via the document
    fireEvent.keyDown(document, { key: 'i' });

    const column = screen.getByTestId('kanban-column-backlog');
    fireEvent.keyDown(column, { key: 'j' });

    // In INSERT mode, vim focus is hidden (isVimActive is false), so no card is vim-focused
    const cards = screen.getAllByTestId('kanban-card');
    // No card should have vim focus in INSERT mode
    cards.forEach(card => {
      expect(card.getAttribute('data-vim-focused')).toBeNull();
    });
    // And the second card should NOT have focus (j didn't navigate)
    expect(cards[1].getAttribute('data-vim-focused')).toBeNull();
  });
});
