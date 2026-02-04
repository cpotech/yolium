/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ItemDetailDialog } from '../components/ItemDetailDialog'
import type { KanbanItem } from '../types/kanban'

// Mock the electronAPI
const mockKanbanUpdateItem = vi.fn()
const mockKanbanDeleteItem = vi.fn()
const mockShowConfirmOkCancel = vi.fn()
const mockOnAgentOutput = vi.fn().mockReturnValue(() => {}) // Returns cleanup function

beforeEach(() => {
  vi.clearAllMocks()
  // Setup the mock on window.electronAPI
  Object.defineProperty(window, 'electronAPI', {
    value: {
      kanbanUpdateItem: mockKanbanUpdateItem,
      kanbanDeleteItem: mockKanbanDeleteItem,
      showConfirmOkCancel: mockShowConfirmOkCancel,
      onAgentOutput: mockOnAgentOutput,
    },
    writable: true,
  })
})

const createMockItem = (overrides: Partial<KanbanItem> = {}): KanbanItem => ({
  id: 'item-1',
  title: 'Test Item',
  description: 'Test description',
  column: 'backlog',
  branch: 'feature/test',
  agentType: 'claude',
  order: 0,
  agentStatus: 'idle',
  comments: [],
  createdAt: '2024-01-15T10:00:00.000Z',
  updatedAt: '2024-01-15T12:00:00.000Z',
  ...overrides,
})

describe('ItemDetailDialog', () => {
  it('should not render when isOpen is false', () => {
    render(
      <ItemDetailDialog
        isOpen={false}
        item={createMockItem()}
        projectPath="/test/project"
        onClose={vi.fn()}
        onUpdated={vi.fn()}
      />
    )

    expect(screen.queryByTestId('item-detail-dialog')).not.toBeInTheDocument()
  })

  it('should not render when item is null', () => {
    render(
      <ItemDetailDialog
        isOpen={true}
        item={null}
        projectPath="/test/project"
        onClose={vi.fn()}
        onUpdated={vi.fn()}
      />
    )

    expect(screen.queryByTestId('item-detail-dialog')).not.toBeInTheDocument()
  })

  it('should render item details when open with item', () => {
    const item = createMockItem({
      title: 'My Task Title',
      description: 'My task description text',
      branch: 'feature/my-feature',
      agentType: 'codex',
    })

    render(
      <ItemDetailDialog
        isOpen={true}
        item={item}
        projectPath="/test/project"
        onClose={vi.fn()}
        onUpdated={vi.fn()}
      />
    )

    expect(screen.getByTestId('item-detail-dialog')).toBeInTheDocument()
    expect(screen.getByTestId('title-input')).toHaveValue('My Task Title')
    expect(screen.getByTestId('description-input')).toHaveValue('My task description text')
    expect(screen.getByTestId('branch-display')).toHaveTextContent('feature/my-feature')
    expect(screen.getByTestId('agent-type-display')).toHaveTextContent('Codex')
  })

  it('should render column selector with current column selected', () => {
    const item = createMockItem({ column: 'in-progress' })

    render(
      <ItemDetailDialog
        isOpen={true}
        item={item}
        projectPath="/test/project"
        onClose={vi.fn()}
        onUpdated={vi.fn()}
      />
    )

    const columnSelect = screen.getByTestId('column-select')
    expect(columnSelect).toHaveValue('in-progress')
  })

  it('should show comments list', () => {
    const item = createMockItem({
      comments: [
        { id: 'c1', source: 'user', text: 'User comment here', timestamp: '2024-01-15T10:30:00.000Z' },
        { id: 'c2', source: 'agent', text: 'Agent reply here', timestamp: '2024-01-15T10:35:00.000Z' },
        { id: 'c3', source: 'system', text: 'System notification', timestamp: '2024-01-15T10:40:00.000Z' },
      ],
    })

    render(
      <ItemDetailDialog
        isOpen={true}
        item={item}
        projectPath="/test/project"
        onClose={vi.fn()}
        onUpdated={vi.fn()}
      />
    )

    expect(screen.getByTestId('comments-section')).toBeInTheDocument()
    expect(screen.getByText('User comment here')).toBeInTheDocument()
    expect(screen.getByText('Agent reply here')).toBeInTheDocument()
    expect(screen.getByText('System notification')).toBeInTheDocument()

    // Check badges
    const userBadge = screen.getByTestId('comment-badge-c1')
    const agentBadge = screen.getByTestId('comment-badge-c2')
    const systemBadge = screen.getByTestId('comment-badge-c3')

    expect(userBadge).toHaveTextContent('user')
    expect(agentBadge).toHaveTextContent('agent')
    expect(systemBadge).toHaveTextContent('system')
  })

  it('should show agent status with correct color for idle', () => {
    const item = createMockItem({ agentStatus: 'idle' })

    render(
      <ItemDetailDialog
        isOpen={true}
        item={item}
        projectPath="/test/project"
        onClose={vi.fn()}
        onUpdated={vi.fn()}
      />
    )

    const statusBadge = screen.getByTestId('status-badge')
    expect(statusBadge).toHaveTextContent('idle')
    expect(statusBadge).toHaveClass('bg-gray-500')
  })

  it('should show agent status with correct color for running', () => {
    const item = createMockItem({ agentStatus: 'running' })

    render(
      <ItemDetailDialog
        isOpen={true}
        item={item}
        projectPath="/test/project"
        onClose={vi.fn()}
        onUpdated={vi.fn()}
      />
    )

    const statusBadge = screen.getByTestId('status-badge')
    expect(statusBadge).toHaveTextContent('running')
    expect(statusBadge).toHaveClass('bg-yellow-500')
  })

  it('should show agent status with correct color for waiting', () => {
    const item = createMockItem({ agentStatus: 'waiting' })

    render(
      <ItemDetailDialog
        isOpen={true}
        item={item}
        projectPath="/test/project"
        onClose={vi.fn()}
        onUpdated={vi.fn()}
      />
    )

    const statusBadge = screen.getByTestId('status-badge')
    expect(statusBadge).toHaveTextContent('waiting')
    expect(statusBadge).toHaveClass('bg-orange-500')
  })

  it('should show agent status with correct color for interrupted', () => {
    const item = createMockItem({ agentStatus: 'interrupted' })

    render(
      <ItemDetailDialog
        isOpen={true}
        item={item}
        projectPath="/test/project"
        onClose={vi.fn()}
        onUpdated={vi.fn()}
      />
    )

    const statusBadge = screen.getByTestId('status-badge')
    expect(statusBadge).toHaveTextContent('interrupted')
    expect(statusBadge).toHaveClass('bg-orange-500')
  })

  it('should show agent status with correct color for completed', () => {
    const item = createMockItem({ agentStatus: 'completed' })

    render(
      <ItemDetailDialog
        isOpen={true}
        item={item}
        projectPath="/test/project"
        onClose={vi.fn()}
        onUpdated={vi.fn()}
      />
    )

    const statusBadge = screen.getByTestId('status-badge')
    expect(statusBadge).toHaveTextContent('completed')
    expect(statusBadge).toHaveClass('bg-green-500')
  })

  it('should show agent status with correct color for failed', () => {
    const item = createMockItem({ agentStatus: 'failed' })

    render(
      <ItemDetailDialog
        isOpen={true}
        item={item}
        projectPath="/test/project"
        onClose={vi.fn()}
        onUpdated={vi.fn()}
      />
    )

    const statusBadge = screen.getByTestId('status-badge')
    expect(statusBadge).toHaveTextContent('failed')
    expect(statusBadge).toHaveClass('bg-red-500')
  })

  it('should call kanbanUpdateItem on save with updated values', async () => {
    mockKanbanUpdateItem.mockResolvedValueOnce({ id: 'item-1' })
    const onUpdated = vi.fn()
    const item = createMockItem()

    render(
      <ItemDetailDialog
        isOpen={true}
        item={item}
        projectPath="/test/project"
        onClose={vi.fn()}
        onUpdated={onUpdated}
      />
    )

    // Edit title
    fireEvent.change(screen.getByTestId('title-input'), {
      target: { value: 'Updated Title' },
    })

    // Edit description
    fireEvent.change(screen.getByTestId('description-input'), {
      target: { value: 'Updated description' },
    })

    // Change column
    fireEvent.change(screen.getByTestId('column-select'), {
      target: { value: 'ready' },
    })

    // Click save
    fireEvent.click(screen.getByTestId('save-button'))

    await waitFor(() => {
      expect(mockKanbanUpdateItem).toHaveBeenCalledWith('/test/project', 'item-1', {
        title: 'Updated Title',
        description: 'Updated description',
        column: 'ready',
      })
    })

    await waitFor(() => {
      expect(onUpdated).toHaveBeenCalled()
    })
  })

  it('should confirm before delete and call kanbanDeleteItem if confirmed', async () => {
    mockShowConfirmOkCancel.mockResolvedValueOnce(true)
    mockKanbanDeleteItem.mockResolvedValueOnce(true)
    const onUpdated = vi.fn()
    const onClose = vi.fn()
    const item = createMockItem()

    render(
      <ItemDetailDialog
        isOpen={true}
        item={item}
        projectPath="/test/project"
        onClose={onClose}
        onUpdated={onUpdated}
      />
    )

    // Click delete
    fireEvent.click(screen.getByTestId('delete-button'))

    await waitFor(() => {
      expect(mockShowConfirmOkCancel).toHaveBeenCalledWith(
        'Delete Item',
        'Are you sure you want to delete "Test Item"? This action cannot be undone.'
      )
    })

    await waitFor(() => {
      expect(mockKanbanDeleteItem).toHaveBeenCalledWith('/test/project', 'item-1')
    })

    await waitFor(() => {
      expect(onUpdated).toHaveBeenCalled()
    })

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled()
    })
  })

  it('should not delete if user cancels confirmation', async () => {
    mockShowConfirmOkCancel.mockResolvedValueOnce(false)
    const onUpdated = vi.fn()
    const item = createMockItem()

    render(
      <ItemDetailDialog
        isOpen={true}
        item={item}
        projectPath="/test/project"
        onClose={vi.fn()}
        onUpdated={onUpdated}
      />
    )

    // Click delete
    fireEvent.click(screen.getByTestId('delete-button'))

    await waitFor(() => {
      expect(mockShowConfirmOkCancel).toHaveBeenCalled()
    })

    expect(mockKanbanDeleteItem).not.toHaveBeenCalled()
    expect(onUpdated).not.toHaveBeenCalled()
  })

  it('should close dialog on close button click', () => {
    const onClose = vi.fn()
    const item = createMockItem()

    render(
      <ItemDetailDialog
        isOpen={true}
        item={item}
        projectPath="/test/project"
        onClose={onClose}
        onUpdated={vi.fn()}
      />
    )

    fireEvent.click(screen.getByTestId('close-button'))
    expect(onClose).toHaveBeenCalled()
  })

  it('should show timestamps', () => {
    const item = createMockItem({
      createdAt: '2024-01-15T10:00:00.000Z',
      updatedAt: '2024-01-15T12:00:00.000Z',
    })

    render(
      <ItemDetailDialog
        isOpen={true}
        item={item}
        projectPath="/test/project"
        onClose={vi.fn()}
        onUpdated={vi.fn()}
      />
    )

    expect(screen.getByTestId('created-at')).toBeInTheDocument()
    expect(screen.getByTestId('updated-at')).toBeInTheDocument()
  })

  it('should sync local state when item changes', () => {
    const item1 = createMockItem({ title: 'First Title' })
    const item2 = createMockItem({ id: 'item-2', title: 'Second Title' })

    const { rerender } = render(
      <ItemDetailDialog
        isOpen={true}
        item={item1}
        projectPath="/test/project"
        onClose={vi.fn()}
        onUpdated={vi.fn()}
      />
    )

    expect(screen.getByTestId('title-input')).toHaveValue('First Title')

    // Re-render with different item
    rerender(
      <ItemDetailDialog
        isOpen={true}
        item={item2}
        projectPath="/test/project"
        onClose={vi.fn()}
        onUpdated={vi.fn()}
      />
    )

    expect(screen.getByTestId('title-input')).toHaveValue('Second Title')
  })

  it('should show branch as N/A when not set', () => {
    const item = createMockItem({ branch: undefined })

    render(
      <ItemDetailDialog
        isOpen={true}
        item={item}
        projectPath="/test/project"
        onClose={vi.fn()}
        onUpdated={vi.fn()}
      />
    )

    expect(screen.getByTestId('branch-display')).toHaveTextContent('N/A')
  })

  it('should show empty comments section when no comments', () => {
    const item = createMockItem({ comments: [] })

    render(
      <ItemDetailDialog
        isOpen={true}
        item={item}
        projectPath="/test/project"
        onClose={vi.fn()}
        onUpdated={vi.fn()}
      />
    )

    expect(screen.getByTestId('comments-section')).toBeInTheDocument()
    expect(screen.getByTestId('no-comments')).toBeInTheDocument()
  })
})
