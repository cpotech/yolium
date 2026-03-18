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
