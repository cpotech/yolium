/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { KanbanCard } from '@renderer/components/kanban/KanbanCard'
import type { KanbanItem } from '@shared/types/kanban'

const createMockItem = (overrides: Partial<KanbanItem> = {}): KanbanItem => ({
  id: 'test-1',
  title: 'Test Task Title',
  description: 'This is a test description for the kanban card',
  column: 'backlog',
  agentProvider: 'claude',
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
    const item = createMockItem({ agentProvider: 'claude' })
    render(<KanbanCard item={item} onClick={vi.fn()} />)

    expect(screen.getByTestId('agent-type-badge')).toHaveTextContent('Claude')
  })

  it('should render codex agent type badge', () => {
    const item = createMockItem({ agentProvider: 'codex' })
    render(<KanbanCard item={item} onClick={vi.fn()} />)

    expect(screen.getByTestId('agent-type-badge')).toHaveTextContent('Codex')
  })

  it('should render opencode agent type badge', () => {
    const item = createMockItem({ agentProvider: 'opencode' })
    render(<KanbanCard item={item} onClick={vi.fn()} />)

    expect(screen.getByTestId('agent-type-badge')).toHaveTextContent('OpenCode')
  })

  it('should render claude agent type badge for default', () => {
    const item = createMockItem({ agentProvider: 'claude' })
    render(<KanbanCard item={item} onClick={vi.fn()} />)

    expect(screen.getByTestId('agent-type-badge')).toHaveTextContent('Claude')
  })

  it('should show agent role label when activeAgentName is set', () => {
    const item = createMockItem({ agentProvider: 'claude', activeAgentName: 'code-agent' })
    render(<KanbanCard item={item} onClick={vi.fn()} />)

    expect(screen.getByTestId('agent-type-badge')).toHaveTextContent('Code')
  })

  it('should show plan agent role label when activeAgentName is plan-agent', () => {
    const item = createMockItem({ agentProvider: 'claude', activeAgentName: 'plan-agent' })
    render(<KanbanCard item={item} onClick={vi.fn()} />)

    expect(screen.getByTestId('agent-type-badge')).toHaveTextContent('Plan')
  })

  it('should fall back to runtime label when activeAgentName is not set', () => {
    const item = createMockItem({ agentProvider: 'codex', activeAgentName: undefined })
    render(<KanbanCard item={item} onClick={vi.fn()} />)

    expect(screen.getByTestId('agent-type-badge')).toHaveTextContent('Codex')
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

  it('should have role=button and tabIndex for accessibility', () => {
    const item = createMockItem()
    render(<KanbanCard item={item} onClick={vi.fn()} />)

    const card = screen.getByTestId('kanban-card')
    expect(card).toHaveAttribute('role', 'button')
    expect(card).toHaveAttribute('tabindex', '0')
  })

  it('should have aria-label with title and status', () => {
    const item = createMockItem({ title: 'My Task', agentStatus: 'running' })
    render(<KanbanCard item={item} onClick={vi.fn()} />)

    const card = screen.getByTestId('kanban-card')
    expect(card).toHaveAttribute('aria-label', 'My Task - running')
  })

  it('should open on Enter keypress', () => {
    const item = createMockItem()
    const onClick = vi.fn()
    render(<KanbanCard item={item} onClick={onClick} />)

    fireEvent.keyDown(screen.getByTestId('kanban-card'), { key: 'Enter' })
    expect(onClick).toHaveBeenCalledWith(item)
  })

  it('should open on Space keypress', () => {
    const item = createMockItem()
    const onClick = vi.fn()
    render(<KanbanCard item={item} onClick={onClick} />)

    fireEvent.keyDown(screen.getByTestId('kanban-card'), { key: ' ' })
    expect(onClick).toHaveBeenCalledWith(item)
  })

  it('should have pulsing border for running agent cards', () => {
    const item = createMockItem({ agentStatus: 'running' })
    render(<KanbanCard item={item} onClick={vi.fn()} />)

    const card = screen.getByTestId('kanban-card')
    expect(card).toHaveClass('border-yellow-500/50')
  })

  it('should not have pulsing border for idle cards', () => {
    const item = createMockItem({ agentStatus: 'idle' })
    render(<KanbanCard item={item} onClick={vi.fn()} />)

    const card = screen.getByTestId('kanban-card')
    expect(card).not.toHaveClass('border-yellow-500/50')
  })

  it('should show comment count when card has comments', () => {
    const item = createMockItem({
      comments: [
        { id: 'c1', source: 'user', text: 'First comment', timestamp: '2024-01-01T00:00:00Z' },
        { id: 'c2', source: 'agent', text: 'Second comment', timestamp: '2024-01-01T01:00:00Z' },
      ],
    })
    render(<KanbanCard item={item} onClick={vi.fn()} />)

    const badge = screen.getByTestId('comment-count')
    expect(badge).toHaveTextContent('2')
  })

  it('should not show comment count when card has no comments', () => {
    const item = createMockItem({ comments: [] })
    render(<KanbanCard item={item} onClick={vi.fn()} />)

    expect(screen.queryByTestId('comment-count')).not.toBeInTheDocument()
  })

  it('should reduce opacity while dragging', () => {
    const item = createMockItem()
    render(<KanbanCard item={item} onClick={vi.fn()} />)

    const card = screen.getByTestId('kanban-card')

    // Start dragging
    fireEvent.dragStart(card, {
      dataTransfer: { setData: vi.fn(), effectAllowed: 'move' },
    })

    expect(card).toHaveClass('opacity-50')

    // End dragging
    fireEvent.dragEnd(card)

    expect(card).not.toHaveClass('opacity-50')
  })

  it('should be draggable', () => {
    const item = createMockItem()
    render(<KanbanCard item={item} onClick={vi.fn()} />)

    const card = screen.getByTestId('kanban-card')
    expect(card).toHaveAttribute('draggable', 'true')
  })

  // Action button tests
  it('should show retry button for failed status', () => {
    const item = createMockItem({ agentStatus: 'failed' })
    const onRetryAgent = vi.fn()
    render(<KanbanCard item={item} onClick={vi.fn()} onRetryAgent={onRetryAgent} />)

    expect(screen.getByTestId('retry-agent-card-btn')).toBeInTheDocument()
  })

  it('should not show retry button for failed status when callback not provided', () => {
    const item = createMockItem({ agentStatus: 'failed' })
    render(<KanbanCard item={item} onClick={vi.fn()} />)

    expect(screen.queryByTestId('retry-agent-card-btn')).not.toBeInTheDocument()
  })

  it('should call onRetryAgent when retry button clicked', () => {
    const item = createMockItem({ id: 'test-123', agentStatus: 'failed' })
    const onRetryAgent = vi.fn()
    const onClick = vi.fn()
    render(<KanbanCard item={item} onClick={onClick} onRetryAgent={onRetryAgent} />)

    fireEvent.click(screen.getByTestId('retry-agent-card-btn'))
    expect(onRetryAgent).toHaveBeenCalledWith('test-123')
    expect(onClick).not.toHaveBeenCalled() // Should not open card detail
  })

  it('should show resume button for interrupted status', () => {
    const item = createMockItem({ agentStatus: 'interrupted' })
    const onResumeAgent = vi.fn()
    render(<KanbanCard item={item} onClick={vi.fn()} onResumeAgent={onResumeAgent} />)

    expect(screen.getByTestId('resume-agent-card-btn')).toBeInTheDocument()
  })

  it('should not show resume button for interrupted status when callback not provided', () => {
    const item = createMockItem({ agentStatus: 'interrupted' })
    render(<KanbanCard item={item} onClick={vi.fn()} />)

    expect(screen.queryByTestId('resume-agent-card-btn')).not.toBeInTheDocument()
  })

  it('should call onResumeAgent when resume button clicked', () => {
    const item = createMockItem({ id: 'test-456', agentStatus: 'interrupted' })
    const onResumeAgent = vi.fn()
    const onClick = vi.fn()
    render(<KanbanCard item={item} onClick={onClick} onResumeAgent={onResumeAgent} />)

    fireEvent.click(screen.getByTestId('resume-agent-card-btn'))
    expect(onResumeAgent).toHaveBeenCalledWith('test-456')
    expect(onClick).not.toHaveBeenCalled() // Should not open card detail
  })

  it('should show run-again button for completed status', () => {
    const item = createMockItem({ agentStatus: 'completed' })
    const onRunAgainAgent = vi.fn()
    render(<KanbanCard item={item} onClick={vi.fn()} onRunAgainAgent={onRunAgainAgent} />)

    expect(screen.getByTestId('run-again-card-btn')).toBeInTheDocument()
  })

  it('should not show run-again button for completed status when callback not provided', () => {
    const item = createMockItem({ agentStatus: 'completed' })
    render(<KanbanCard item={item} onClick={vi.fn()} />)

    expect(screen.queryByTestId('run-again-card-btn')).not.toBeInTheDocument()
  })

  it('should call onRunAgainAgent when run-again button clicked', () => {
    const item = createMockItem({ id: 'test-789', agentStatus: 'completed' })
    const onRunAgainAgent = vi.fn()
    const onClick = vi.fn()
    render(<KanbanCard item={item} onClick={onClick} onRunAgainAgent={onRunAgainAgent} />)

    fireEvent.click(screen.getByTestId('run-again-card-btn'))
    expect(onRunAgainAgent).toHaveBeenCalledWith('test-789')
    expect(onClick).not.toHaveBeenCalled() // Should not open card detail
  })

  it('should not show action buttons for idle status', () => {
    const item = createMockItem({ agentStatus: 'idle' })
    render(<KanbanCard
      item={item}
      onClick={vi.fn()}
      onRetryAgent={vi.fn()}
      onResumeAgent={vi.fn()}
      onRunAgainAgent={vi.fn()}
    />)

    expect(screen.queryByTestId('retry-agent-card-btn')).not.toBeInTheDocument()
    expect(screen.queryByTestId('resume-agent-card-btn')).not.toBeInTheDocument()
    expect(screen.queryByTestId('run-again-card-btn')).not.toBeInTheDocument()
  })

  it('should not show action buttons for running status', () => {
    const item = createMockItem({ agentStatus: 'running' })
    render(<KanbanCard
      item={item}
      onClick={vi.fn()}
      onRetryAgent={vi.fn()}
      onResumeAgent={vi.fn()}
      onRunAgainAgent={vi.fn()}
    />)

    expect(screen.queryByTestId('retry-agent-card-btn')).not.toBeInTheDocument()
    expect(screen.queryByTestId('resume-agent-card-btn')).not.toBeInTheDocument()
    expect(screen.queryByTestId('run-again-card-btn')).not.toBeInTheDocument()
  })

  it('should not show action buttons for waiting status', () => {
    const item = createMockItem({ agentStatus: 'waiting' })
    render(<KanbanCard
      item={item}
      onClick={vi.fn()}
      onRetryAgent={vi.fn()}
      onResumeAgent={vi.fn()}
      onRunAgainAgent={vi.fn()}
    />)

    expect(screen.queryByTestId('retry-agent-card-btn')).not.toBeInTheDocument()
    expect(screen.queryByTestId('resume-agent-card-btn')).not.toBeInTheDocument()
    expect(screen.queryByTestId('run-again-card-btn')).not.toBeInTheDocument()
  })
})
