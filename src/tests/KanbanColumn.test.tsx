/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { KanbanColumn } from '@renderer/components/kanban/KanbanColumn'
import type { KanbanItem, KanbanColumn as ColumnId } from '@shared/types/kanban'

const createMockItem = (overrides: Partial<KanbanItem> = {}): KanbanItem => ({
  id: 'test-1',
  title: 'Test Task Title',
  description: 'This is a test description for the kanban card',
  column: 'backlog',
  agentType: 'claude',
  agentStatus: 'idle',
  branch: undefined,
  order: 0,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  comments: [],
  ...overrides,
})

describe('KanbanColumn', () => {
  it('should render column title', () => {
    render(
      <KanbanColumn
        columnId="backlog"
        title="Backlog"
        items={[]}
        onCardClick={vi.fn()}
      />
    )

    expect(screen.getByText('Backlog')).toBeInTheDocument()
  })

  it('should render item count', () => {
    const items = [
      createMockItem({ id: '1', title: 'Task 1' }),
      createMockItem({ id: '2', title: 'Task 2' }),
      createMockItem({ id: '3', title: 'Task 3' }),
    ]

    render(
      <KanbanColumn
        columnId="backlog"
        title="Backlog"
        items={items}
        onCardClick={vi.fn()}
      />
    )

    expect(screen.getByTestId('item-count')).toHaveTextContent('3')
  })

  it('should render zero count when no items', () => {
    render(
      <KanbanColumn
        columnId="backlog"
        title="Backlog"
        items={[]}
        onCardClick={vi.fn()}
      />
    )

    expect(screen.getByTestId('item-count')).toHaveTextContent('0')
  })

  it('should render all items as cards', () => {
    const items = [
      createMockItem({ id: '1', title: 'Task 1' }),
      createMockItem({ id: '2', title: 'Task 2' }),
    ]

    render(
      <KanbanColumn
        columnId="backlog"
        title="Backlog"
        items={items}
        onCardClick={vi.fn()}
      />
    )

    expect(screen.getAllByTestId('kanban-card')).toHaveLength(2)
    expect(screen.getByText('Task 1')).toBeInTheDocument()
    expect(screen.getByText('Task 2')).toBeInTheDocument()
  })

  it('should show empty state when no items', () => {
    render(
      <KanbanColumn
        columnId="backlog"
        title="Backlog"
        items={[]}
        onCardClick={vi.fn()}
      />
    )

    expect(screen.getByText('No items')).toBeInTheDocument()
  })

  it('should not show empty state when there are items', () => {
    const items = [createMockItem()]

    render(
      <KanbanColumn
        columnId="backlog"
        title="Backlog"
        items={items}
        onCardClick={vi.fn()}
      />
    )

    expect(screen.queryByText('No items')).not.toBeInTheDocument()
  })

  it('should have gray top border for backlog column', () => {
    render(
      <KanbanColumn
        columnId="backlog"
        title="Backlog"
        items={[]}
        onCardClick={vi.fn()}
      />
    )

    expect(screen.getByTestId('kanban-column-backlog')).toHaveClass('border-t-gray-500')
  })

  it('should have blue top border for ready column', () => {
    render(
      <KanbanColumn
        columnId="ready"
        title="Ready"
        items={[]}
        onCardClick={vi.fn()}
      />
    )

    expect(screen.getByTestId('kanban-column-ready')).toHaveClass('border-t-blue-500')
  })

  it('should have yellow top border for in-progress column', () => {
    render(
      <KanbanColumn
        columnId="in-progress"
        title="In Progress"
        items={[]}
        onCardClick={vi.fn()}
      />
    )

    expect(screen.getByTestId('kanban-column-in-progress')).toHaveClass('border-t-yellow-500')
  })

  it('should have green top border for done column', () => {
    render(
      <KanbanColumn
        columnId="done"
        title="Done"
        items={[]}
        onCardClick={vi.fn()}
      />
    )

    expect(screen.getByTestId('kanban-column-done')).toHaveClass('border-t-green-500')
  })

  it('should have fixed width classes', () => {
    render(
      <KanbanColumn
        columnId="backlog"
        title="Backlog"
        items={[]}
        onCardClick={vi.fn()}
      />
    )

    const column = screen.getByTestId('kanban-column-backlog')
    expect(column).toHaveClass('w-72')
    expect(column).toHaveClass('min-w-72')
  })

  it('should pass onCardClick to cards', () => {
    const onCardClick = vi.fn()
    const item = createMockItem()

    render(
      <KanbanColumn
        columnId="backlog"
        title="Backlog"
        items={[item]}
        onCardClick={onCardClick}
      />
    )

    screen.getByTestId('kanban-card').click()
    expect(onCardClick).toHaveBeenCalledWith(item)
  })

  it('should show column empty state with data-testid', () => {
    render(
      <KanbanColumn
        columnId="backlog"
        title="Backlog"
        items={[]}
        onCardClick={vi.fn()}
      />
    )

    expect(screen.getByTestId('column-empty-state')).toBeInTheDocument()
  })

  it('should show running count badge when items are running', () => {
    const items = [
      createMockItem({ id: '1', title: 'Task 1', agentStatus: 'running' }),
      createMockItem({ id: '2', title: 'Task 2', agentStatus: 'idle' }),
      createMockItem({ id: '3', title: 'Task 3', agentStatus: 'running' }),
    ]

    render(
      <KanbanColumn
        columnId="in-progress"
        title="In Progress"
        items={items}
        onCardClick={vi.fn()}
      />
    )

    expect(screen.getByTestId('running-count')).toHaveTextContent('2 running')
  })

  it('should have aria-label with column name and item count', () => {
    const items = [
      createMockItem({ id: '1', title: 'Task 1' }),
      createMockItem({ id: '2', title: 'Task 2' }),
    ]

    render(
      <KanbanColumn
        columnId="backlog"
        title="Backlog"
        items={items}
        onCardClick={vi.fn()}
      />
    )

    expect(screen.getByTestId('kanban-column-backlog')).toHaveAttribute(
      'aria-label',
      'Backlog column, 2 items'
    )
  })

  it('should have aria-label for empty column', () => {
    render(
      <KanbanColumn
        columnId="ready"
        title="Ready"
        items={[]}
        onCardClick={vi.fn()}
      />
    )

    expect(screen.getByTestId('kanban-column-ready')).toHaveAttribute(
      'aria-label',
      'Ready column, 0 items'
    )
  })

  it('should not show running count badge when no items are running', () => {
    const items = [
      createMockItem({ id: '1', title: 'Task 1', agentStatus: 'idle' }),
    ]

    render(
      <KanbanColumn
        columnId="backlog"
        title="Backlog"
        items={items}
        onCardClick={vi.fn()}
      />
    )

    expect(screen.queryByTestId('running-count')).not.toBeInTheDocument()
  })
})
