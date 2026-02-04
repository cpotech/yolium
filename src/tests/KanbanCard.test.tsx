/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { KanbanCard } from '../components/KanbanCard'
import type { KanbanItem } from '../types/kanban'

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

describe('KanbanCard', () => {
  it('should render title', () => {
    const item = createMockItem({ title: 'My Task Title' })
    render(<KanbanCard item={item} onClick={vi.fn()} />)

    expect(screen.getByText('My Task Title')).toBeInTheDocument()
  })

  it('should render agent type badge', () => {
    const item = createMockItem({ agentType: 'claude' })
    render(<KanbanCard item={item} onClick={vi.fn()} />)

    expect(screen.getByTestId('agent-type-badge')).toHaveTextContent('Claude')
  })

  it('should render codex agent type badge', () => {
    const item = createMockItem({ agentType: 'codex' })
    render(<KanbanCard item={item} onClick={vi.fn()} />)

    expect(screen.getByTestId('agent-type-badge')).toHaveTextContent('Codex')
  })

  it('should render opencode agent type badge', () => {
    const item = createMockItem({ agentType: 'opencode' })
    render(<KanbanCard item={item} onClick={vi.fn()} />)

    expect(screen.getByTestId('agent-type-badge')).toHaveTextContent('OpenCode')
  })

  it('should render claude agent type badge for default', () => {
    const item = createMockItem({ agentType: 'claude' })
    render(<KanbanCard item={item} onClick={vi.fn()} />)

    expect(screen.getByTestId('agent-type-badge')).toHaveTextContent('Claude')
  })

  it('should show branch when set', () => {
    const item = createMockItem({ branch: 'feature/my-branch' })
    render(<KanbanCard item={item} onClick={vi.fn()} />)

    expect(screen.getByText('feature/my-branch')).toBeInTheDocument()
    expect(screen.getByTestId('branch-info')).toBeInTheDocument()
  })

  it('should not show branch info when branch is not set', () => {
    const item = createMockItem({ branch: undefined })
    render(<KanbanCard item={item} onClick={vi.fn()} />)

    expect(screen.queryByTestId('branch-info')).not.toBeInTheDocument()
  })

  it('should show description', () => {
    const item = createMockItem({ description: 'A detailed task description' })
    render(<KanbanCard item={item} onClick={vi.fn()} />)

    expect(screen.getByText('A detailed task description')).toBeInTheDocument()
  })

  it('should show no indicator for idle status', () => {
    const item = createMockItem({ agentStatus: 'idle' })
    render(<KanbanCard item={item} onClick={vi.fn()} />)

    expect(screen.queryByTestId('status-indicator')).not.toBeInTheDocument()
  })

  it('should show running status indicator', () => {
    const item = createMockItem({ agentStatus: 'running' })
    render(<KanbanCard item={item} onClick={vi.fn()} />)

    expect(screen.getByTestId('status-indicator')).toBeInTheDocument()
    expect(screen.getByText('Agent working...')).toBeInTheDocument()
  })

  it('should show waiting status indicator', () => {
    const item = createMockItem({ agentStatus: 'waiting' })
    render(<KanbanCard item={item} onClick={vi.fn()} />)

    expect(screen.getByTestId('status-indicator')).toBeInTheDocument()
    expect(screen.getByText('Needs input')).toBeInTheDocument()
  })

  it('should show interrupted status indicator', () => {
    const item = createMockItem({ agentStatus: 'interrupted' })
    render(<KanbanCard item={item} onClick={vi.fn()} />)

    expect(screen.getByTestId('status-indicator')).toBeInTheDocument()
    expect(screen.getByText('Interrupted')).toBeInTheDocument()
  })

  it('should show completed status indicator', () => {
    const item = createMockItem({ agentStatus: 'completed' })
    render(<KanbanCard item={item} onClick={vi.fn()} />)

    expect(screen.getByTestId('status-indicator')).toBeInTheDocument()
    expect(screen.getByText('Completed')).toBeInTheDocument()
  })

  it('should show failed status indicator', () => {
    const item = createMockItem({ agentStatus: 'failed' })
    render(<KanbanCard item={item} onClick={vi.fn()} />)

    expect(screen.getByTestId('status-indicator')).toBeInTheDocument()
    expect(screen.getByText('Failed')).toBeInTheDocument()
  })

  it('should call onClick with item when card is clicked', () => {
    const item = createMockItem()
    const onClick = vi.fn()
    render(<KanbanCard item={item} onClick={onClick} />)

    fireEvent.click(screen.getByTestId('kanban-card'))
    expect(onClick).toHaveBeenCalledWith(item)
  })

  it('should have cursor pointer style', () => {
    const item = createMockItem()
    render(<KanbanCard item={item} onClick={vi.fn()} />)

    expect(screen.getByTestId('kanban-card')).toHaveClass('cursor-pointer')
  })
})
