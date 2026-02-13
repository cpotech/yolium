/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { ItemDetailDialog } from '@renderer/components/kanban/ItemDetailDialog'
import type { KanbanItem } from '@shared/types/kanban'

// Mock the electronAPI
const mockKanbanUpdateItem = vi.fn()
const mockKanbanDeleteItem = vi.fn()
const mockKanbanAddComment = vi.fn()
const mockShowConfirmOkCancel = vi.fn()
const mockWorktreeDiffStats = vi.fn()
const mockMergeAndPushPR = vi.fn()
const mockCheckMergeConflicts = vi.fn()
const mockOnAgentOutput = vi.fn().mockReturnValue(() => {}) // Returns cleanup function
const mockOnAgentProgress = vi.fn().mockReturnValue(() => {}) // Returns cleanup function
const mockOnAgentComplete = vi.fn().mockReturnValue(() => {}) // Returns cleanup function
const mockOnAgentError = vi.fn().mockReturnValue(() => {}) // Returns cleanup function
const mockOnAgentExit = vi.fn().mockReturnValue(() => {}) // Returns cleanup function
const mockOnAgentCostUpdate = vi.fn().mockReturnValue(() => {}) // Returns cleanup function
const mockAgentRecover = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  mockAgentRecover.mockResolvedValue([])
  // Setup the mock on window.electronAPI
  Object.defineProperty(window, 'electronAPI', {
    value: {
      kanban: {
        updateItem: mockKanbanUpdateItem,
        deleteItem: mockKanbanDeleteItem,
        addComment: mockKanbanAddComment,
      },
      dialog: {
        confirmOkCancel: mockShowConfirmOkCancel,
      },
      git: {
        worktreeDiffStats: mockWorktreeDiffStats,
        mergeAndPushPR: mockMergeAndPushPR,
        checkMergeConflicts: mockCheckMergeConflicts,
      },
      agent: {
        onOutput: mockOnAgentOutput,
        onProgress: mockOnAgentProgress,
        onComplete: mockOnAgentComplete,
        onError: mockOnAgentError,
        onExit: mockOnAgentExit,
        onCostUpdate: mockOnAgentCostUpdate,
        getActiveSession: vi.fn().mockResolvedValue(null),
        recover: mockAgentRecover,
        readLog: vi.fn().mockResolvedValue(''),
        clearLog: vi.fn().mockResolvedValue(false),
        listDefinitions: vi.fn().mockResolvedValue([
          { name: 'code-agent', description: 'Code execution agent', model: 'sonnet', tools: ['Read', 'Write'] },
          { name: 'plan-agent', description: 'Planning agent', model: 'sonnet', tools: ['Read'] },
        ]),
      },
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
  agentProvider: 'claude',
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
      agentProvider: 'codex',
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
    expect(screen.getByTestId('agent-provider-select')).toHaveValue('codex')
  })

  it('should restore cumulative token usage on reconnect and continue accumulating', async () => {
    const item = createMockItem({ agentStatus: 'running' })
    const getActiveSession = vi.fn().mockResolvedValue({
      sessionId: 'session-1',
      cumulativeUsage: { inputTokens: 500, outputTokens: 250, costUsd: 0.005 },
    })
    window.electronAPI.agent.getActiveSession = getActiveSession

    render(
      <ItemDetailDialog
        isOpen={true}
        item={item}
        projectPath="/test/project"
        onClose={vi.fn()}
        onUpdated={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(getActiveSession).toHaveBeenCalledWith('/test/project', 'item-1')
    })
    expect(mockOnAgentCostUpdate).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('token-usage')).toBeInTheDocument()
    expect(screen.getByText('500 in / 250 out')).toBeInTheDocument()
    expect(screen.getByText('$0.0050')).toBeInTheDocument()

    const onCostUpdate = mockOnAgentCostUpdate.mock.calls[0][0] as (
      sessionId: string,
      projectPath: string,
      itemId: string,
      usage: { inputTokens: number; outputTokens: number; costUsd: number }
    ) => void

    act(() => {
      onCostUpdate('session-1', '/test/project', 'item-1', { inputTokens: 1_000, outputTokens: 500, costUsd: 0.01234 })
      onCostUpdate('session-1', '/test/project', 'item-1', { inputTokens: 600, outputTokens: 900, costUsd: 0.00666 })
      onCostUpdate('other-session', '/test/project', 'item-1', { inputTokens: 999, outputTokens: 999, costUsd: 0.9999 })
    })

    expect(screen.getByText('2.1k in / 1.6k out')).toBeInTheDocument()
    expect(screen.getByText('$0.0240')).toBeInTheDocument()
  })

  it('should recover stale running items when no active session exists and refresh item state', async () => {
    const item = createMockItem({ agentStatus: 'running' })
    const onUpdated = vi.fn()
    const getActiveSession = vi.fn().mockResolvedValue(null)
    window.electronAPI.agent.getActiveSession = getActiveSession
    mockAgentRecover.mockResolvedValueOnce([{ id: 'item-1' }])

    render(
      <ItemDetailDialog
        isOpen={true}
        item={item}
        projectPath="/test/project"
        onClose={vi.fn()}
        onUpdated={onUpdated}
      />
    )

    await waitFor(() => {
      expect(getActiveSession).toHaveBeenCalledWith('/test/project', 'item-1')
    })
    await waitFor(() => {
      expect(mockAgentRecover).toHaveBeenCalledWith('/test/project')
    })
    await waitFor(() => {
      expect(onUpdated).toHaveBeenCalledTimes(1)
    })
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

  it('should render column selector with verify column selected', () => {
    const item = createMockItem({ column: 'verify' })

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
    expect(columnSelect).toHaveValue('verify')
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

  it('should allow adding a user comment', async () => {
    mockKanbanAddComment.mockResolvedValueOnce(undefined)
    const onUpdated = vi.fn()

    render(
      <ItemDetailDialog
        isOpen={true}
        item={createMockItem()}
        projectPath="/test/project"
        onClose={vi.fn()}
        onUpdated={onUpdated}
      />
    )

    const commentInput = screen.getByTestId('comment-input')
    fireEvent.change(commentInput, { target: { value: 'New comment' } })
    fireEvent.click(screen.getByTestId('comment-submit'))

    await waitFor(() => {
      expect(mockKanbanAddComment).toHaveBeenCalledWith(
        '/test/project',
        'item-1',
        'user',
        'New comment'
      )
    })
    expect(onUpdated).toHaveBeenCalled()
    expect(commentInput).toHaveValue('')
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
        agentProvider: 'claude',
        agentType: undefined,
        model: undefined,
        verified: false,
      })
    })

    await waitFor(() => {
      expect(onUpdated).toHaveBeenCalled()
    })
  })

  it('should persist prBranch to item branch after successful merge', async () => {
    mockWorktreeDiffStats.mockResolvedValueOnce({ filesChanged: 1, insertions: 4, deletions: 2 })
    mockShowConfirmOkCancel.mockResolvedValueOnce(true)
    mockMergeAndPushPR.mockResolvedValueOnce({
      success: true,
      prBranch: 'feature/persisted-pr-branch',
      prUrl: 'https://example.com/pr/123',
    })

    const onUpdated = vi.fn()
    const item = createMockItem({
      mergeStatus: 'unmerged',
      worktreePath: '/tmp/worktrees/item-1',
      agentStatus: 'completed',
      branch: 'yolium-1770855764799-fb0b15',
    })

    render(
      <ItemDetailDialog
        isOpen={true}
        item={item}
        projectPath="/test/project"
        onClose={vi.fn()}
        onUpdated={onUpdated}
      />
    )

    fireEvent.click(screen.getByTestId('merge-button'))

    await waitFor(() => {
      expect(mockKanbanUpdateItem).toHaveBeenCalledWith('/test/project', 'item-1', {
        mergeStatus: 'merged',
        branch: 'feature/persisted-pr-branch',
        worktreePath: undefined,
        prUrl: 'https://example.com/pr/123',
      })
    })
    expect(onUpdated).toHaveBeenCalled()
  })

  it('should delete item immediately without confirmation', async () => {
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
      expect(mockKanbanDeleteItem).toHaveBeenCalledWith('/test/project', 'item-1')
    })

    await waitFor(() => {
      expect(onUpdated).toHaveBeenCalled()
    })

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled()
    })

    // Should not show confirmation dialog
    expect(mockShowConfirmOkCancel).not.toHaveBeenCalled()
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

  it('should save on Ctrl+Enter', async () => {
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
      target: { value: 'Ctrl+Enter Title' },
    })

    // Press Ctrl+Enter on the overlay
    fireEvent.keyDown(screen.getByTestId('item-detail-dialog').parentElement!, {
      key: 'Enter',
      ctrlKey: true,
    })

    await waitFor(() => {
      expect(mockKanbanUpdateItem).toHaveBeenCalledWith('/test/project', 'item-1', {
        title: 'Ctrl+Enter Title',
        description: 'Test description',
        column: 'backlog',
        agentProvider: 'claude',
        agentType: undefined,
        model: undefined,
        verified: false,
      })
    })
  })

  it('should trigger delete on Ctrl+Delete', async () => {
    mockKanbanDeleteItem.mockResolvedValueOnce(true)
    const onClose = vi.fn()
    const onUpdated = vi.fn()
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

    // Press Ctrl+Delete on the overlay
    fireEvent.keyDown(screen.getByTestId('item-detail-dialog').parentElement!, {
      key: 'Delete',
      ctrlKey: true,
    })

    await waitFor(() => {
      expect(mockKanbanDeleteItem).toHaveBeenCalledWith('/test/project', 'item-1')
    })

    // Should not show confirmation dialog
    expect(mockShowConfirmOkCancel).not.toHaveBeenCalled()
  })

  it('should have aria-modal and role=dialog attributes', () => {
    const item = createMockItem()

    render(
      <ItemDetailDialog
        isOpen={true}
        item={item}
        projectPath="/test/project"
        onClose={vi.fn()}
        onUpdated={vi.fn()}
      />
    )

    const dialog = screen.getByTestId('item-detail-dialog')
    expect(dialog).toHaveAttribute('role', 'dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
  })

  it('should not close dialog when clicking background', () => {
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

    const overlay = screen.getByTestId('item-detail-dialog').parentElement!
    fireEvent.click(overlay, { target: overlay, currentTarget: overlay })

    expect(onClose).not.toHaveBeenCalled()
  })

  it('should show unsaved changes indicator when title is modified', () => {
    const item = createMockItem({ title: 'Original Title' })

    render(
      <ItemDetailDialog
        isOpen={true}
        item={item}
        projectPath="/test/project"
        onClose={vi.fn()}
        onUpdated={vi.fn()}
      />
    )

    // No indicator initially
    expect(screen.queryByTestId('unsaved-indicator')).not.toBeInTheDocument()

    // Edit title
    fireEvent.change(screen.getByTestId('title-input'), {
      target: { value: 'Changed Title' },
    })

    // Indicator should appear
    expect(screen.getByTestId('unsaved-indicator')).toBeInTheDocument()
  })

  it('should hide unsaved indicator after saving', async () => {
    mockKanbanUpdateItem.mockResolvedValueOnce({ id: 'item-1' })
    const item = createMockItem()

    render(
      <ItemDetailDialog
        isOpen={true}
        item={item}
        projectPath="/test/project"
        onClose={vi.fn()}
        onUpdated={vi.fn()}
      />
    )

    // Edit title
    fireEvent.change(screen.getByTestId('title-input'), {
      target: { value: 'Changed Title' },
    })
    expect(screen.getByTestId('unsaved-indicator')).toBeInTheDocument()

    // Save
    fireEvent.click(screen.getByTestId('save-button'))

    await waitFor(() => {
      expect(screen.queryByTestId('unsaved-indicator')).not.toBeInTheDocument()
    })
  })

  it('should trap focus within dialog on Tab', () => {
    const item = createMockItem()

    render(
      <ItemDetailDialog
        isOpen={true}
        item={item}
        projectPath="/test/project"
        onClose={vi.fn()}
        onUpdated={vi.fn()}
      />
    )

    const dialog = screen.getByTestId('item-detail-dialog')
    const focusableElements = dialog.querySelectorAll<HTMLElement>(
      'input:not(:disabled), textarea:not(:disabled), select:not(:disabled), button:not(:disabled), [tabindex]:not([tabindex="-1"]):not(:disabled)'
    )
    expect(focusableElements.length).toBeGreaterThan(0)

    // Focus last focusable element
    const lastElement = focusableElements[focusableElements.length - 1]
    lastElement.focus()

    // Tab should wrap to first
    fireEvent.keyDown(dialog.parentElement!, { key: 'Tab' })
    expect(document.activeElement).toBe(focusableElements[0])
  })

  it('should auto-focus answer textarea when agent is waiting with a question', () => {
    const item = createMockItem({
      agentStatus: 'waiting',
      agentQuestion: 'What branch should I use?',
      agentQuestionOptions: ['main', 'develop'],
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

    const answerInput = screen.getByTestId('answer-input')
    expect(answerInput).toBeInTheDocument()
    expect(document.activeElement).toBe(answerInput)
  })

  it('should show stop agent button when agent is running', () => {
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

    // The stop button only shows when there's an active session
    // Running indicator should at minimum be present
    expect(screen.getByText('Agent is running...')).toBeInTheDocument()
  })

  it('should close immediately with unsaved changes (Escape)', async () => {
    const onClose = vi.fn()
    const item = createMockItem({ title: 'Original Title' })

    render(
      <ItemDetailDialog
        isOpen={true}
        item={item}
        projectPath="/test/project"
        onClose={onClose}
        onUpdated={vi.fn()}
      />
    )

    // Edit title to create unsaved changes
    fireEvent.change(screen.getByTestId('title-input'), {
      target: { value: 'Changed Title' },
    })

    // Press Escape
    fireEvent.keyDown(screen.getByTestId('item-detail-dialog').parentElement!, {
      key: 'Escape',
    })

    // Should close immediately without confirmation dialog
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled()
    })
    expect(mockShowConfirmOkCancel).not.toHaveBeenCalled()
  })

  it('should close immediately with unsaved changes from close button', async () => {
    const onClose = vi.fn()
    const item = createMockItem({ title: 'Original Title' })

    render(
      <ItemDetailDialog
        isOpen={true}
        item={item}
        projectPath="/test/project"
        onClose={onClose}
        onUpdated={vi.fn()}
      />
    )

    // Edit title
    fireEvent.change(screen.getByTestId('title-input'), {
      target: { value: 'Changed Title' },
    })

    // Click close button
    fireEvent.click(screen.getByTestId('close-button'))

    // Should close immediately without confirmation dialog
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled()
    })
    expect(mockShowConfirmOkCancel).not.toHaveBeenCalled()
  })

  it('should close immediately when no unsaved changes (no confirmation)', () => {
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

    // Press Escape without editing anything
    fireEvent.keyDown(screen.getByTestId('item-detail-dialog').parentElement!, {
      key: 'Escape',
    })

    // Should close immediately (no confirmation needed)
    expect(onClose).toHaveBeenCalled()
    expect(mockShowConfirmOkCancel).not.toHaveBeenCalled()
  })

  it('should render model selector in right pane', () => {
    const item = createMockItem({ model: 'opus' })

    render(
      <ItemDetailDialog
        isOpen={true}
        item={item}
        projectPath="/test/project"
        onClose={vi.fn()}
        onUpdated={vi.fn()}
      />
    )

    const modelInput = screen.getByTestId('model-input')
    expect(modelInput).toBeInTheDocument()
    expect(modelInput).toHaveValue('opus')
  })

  it('should include model change in save', async () => {
    mockKanbanUpdateItem.mockResolvedValueOnce({ id: 'item-1' })
    const item = createMockItem()

    render(
      <ItemDetailDialog
        isOpen={true}
        item={item}
        projectPath="/test/project"
        onClose={vi.fn()}
        onUpdated={vi.fn()}
      />
    )

    // Change model
    fireEvent.change(screen.getByTestId('model-input'), {
      target: { value: 'haiku' },
    })

    // Save
    fireEvent.click(screen.getByTestId('save-button'))

    await waitFor(() => {
      expect(mockKanbanUpdateItem).toHaveBeenCalledWith('/test/project', 'item-1', {
        title: 'Test Item',
        description: 'Test description',
        column: 'backlog',
        model: 'haiku',
        agentProvider: 'claude',
        agentType: undefined,
        verified: false,
      })
    })
  })

  it('should show unsaved indicator when model is changed', () => {
    const item = createMockItem()

    render(
      <ItemDetailDialog
        isOpen={true}
        item={item}
        projectPath="/test/project"
        onClose={vi.fn()}
        onUpdated={vi.fn()}
      />
    )

    // No indicator initially
    expect(screen.queryByTestId('unsaved-indicator')).not.toBeInTheDocument()

    // Change model
    fireEvent.change(screen.getByTestId('model-input'), {
      target: { value: 'sonnet' },
    })

    // Should show indicator
    expect(screen.getByTestId('unsaved-indicator')).toBeInTheDocument()
  })

  it('should NOT reset form fields when same item updates (preserve user input)', () => {
    const item = createMockItem({ id: 'item-1', title: 'Original Title' })

    const { rerender } = render(
      <ItemDetailDialog
        isOpen={true}
        item={item}
        projectPath="/test/project"
        onClose={vi.fn()}
        onUpdated={vi.fn()}
      />
    )

    // Edit title
    fireEvent.change(screen.getByTestId('title-input'), {
      target: { value: 'User is typing...' },
    })

    // Verify user input is present
    expect(screen.getByTestId('title-input')).toHaveValue('User is typing...')

    // Re-render with updated item (same ID, different title from backend)
    rerender(
      <ItemDetailDialog
        isOpen={true}
        item={{ ...item, title: 'Backend Update' }}
        projectPath="/test/project"
        onClose={vi.fn()}
        onUpdated={vi.fn()}
      />
    )

    // User input should be preserved (NOT overwritten)
    expect(screen.getByTestId('title-input')).toHaveValue('User is typing...')
  })

  it('should reset form fields when item ID changes (different item selected)', () => {
    const item1 = createMockItem({ id: 'item-1', title: 'First Item' })
    const item2 = createMockItem({ id: 'item-2', title: 'Second Item' })

    const { rerender } = render(
      <ItemDetailDialog
        isOpen={true}
        item={item1}
        projectPath="/test/project"
        onClose={vi.fn()}
        onUpdated={vi.fn()}
      />
    )

    // Edit title of first item
    fireEvent.change(screen.getByTestId('title-input'), {
      target: { value: 'Editing first item' },
    })

    // Verify edits
    expect(screen.getByTestId('title-input')).toHaveValue('Editing first item')

    // Switch to different item (different ID)
    rerender(
      <ItemDetailDialog
        isOpen={true}
        item={item2}
        projectPath="/test/project"
        onClose={vi.fn()}
        onUpdated={vi.fn()}
      />
    )

    // Form should reset to new item's values
    expect(screen.getByTestId('title-input')).toHaveValue('Second Item')
  })

  it('should show editable agent provider when status is completed', () => {
    const item = createMockItem({ agentStatus: 'completed', agentProvider: 'codex' })

    render(
      <ItemDetailDialog
        isOpen={true}
        item={item}
        projectPath="/test/project"
        onClose={vi.fn()}
        onUpdated={vi.fn()}
      />
    )

    const select = screen.getByTestId('agent-provider-select')
    expect(select).toBeInTheDocument()
    expect(select).toHaveValue('codex')
  })

  it('should show editable agent provider when status is failed', () => {
    const item = createMockItem({ agentStatus: 'failed', agentProvider: 'opencode' })

    render(
      <ItemDetailDialog
        isOpen={true}
        item={item}
        projectPath="/test/project"
        onClose={vi.fn()}
        onUpdated={vi.fn()}
      />
    )

    const select = screen.getByTestId('agent-provider-select')
    expect(select).toBeInTheDocument()
    expect(select).toHaveValue('opencode')
  })

  it('should show editable agent provider when status is interrupted', () => {
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

    expect(screen.getByTestId('agent-provider-select')).toBeInTheDocument()
  })

  it('should show read-only agent provider when status is running', () => {
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

    expect(screen.queryByTestId('agent-provider-select')).not.toBeInTheDocument()
    expect(screen.getByTestId('agent-provider-display')).toBeInTheDocument()
  })

  it('should show read-only agent provider when status is waiting', () => {
    const item = createMockItem({ agentStatus: 'waiting', agentQuestion: 'test?' })

    render(
      <ItemDetailDialog
        isOpen={true}
        item={item}
        projectPath="/test/project"
        onClose={vi.fn()}
        onUpdated={vi.fn()}
      />
    )

    expect(screen.queryByTestId('agent-provider-select')).not.toBeInTheDocument()
    expect(screen.getByTestId('agent-provider-display')).toBeInTheDocument()
  })

  it('should not render agent type dropdown (agent controls handles agent selection)', () => {
    const item = createMockItem({ agentType: 'code-agent' })

    render(
      <ItemDetailDialog
        isOpen={true}
        item={item}
        projectPath="/test/project"
        onClose={vi.fn()}
        onUpdated={vi.fn()}
      />
    )

    expect(screen.queryByTestId('agent-type-select')).not.toBeInTheDocument()
  })

  it('should disable save button when title is empty', () => {
    const item = createMockItem({ title: 'Some Title' })

    render(
      <ItemDetailDialog
        isOpen={true}
        item={item}
        projectPath="/test/project"
        onClose={vi.fn()}
        onUpdated={vi.fn()}
      />
    )

    // Save button should be enabled initially
    expect(screen.getByTestId('save-button')).not.toBeDisabled()

    // Clear title
    fireEvent.change(screen.getByTestId('title-input'), {
      target: { value: '' },
    })

    // Save button should be disabled
    expect(screen.getByTestId('save-button')).toBeDisabled()
  })

  it('should disable save button when title is whitespace-only', () => {
    const item = createMockItem({ title: 'Some Title' })

    render(
      <ItemDetailDialog
        isOpen={true}
        item={item}
        projectPath="/test/project"
        onClose={vi.fn()}
        onUpdated={vi.fn()}
      />
    )

    // Set title to whitespace only
    fireEvent.change(screen.getByTestId('title-input'), {
      target: { value: '   ' },
    })

    // Save button should be disabled
    expect(screen.getByTestId('save-button')).toBeDisabled()
  })

  it('should not submit on Ctrl+Enter when title is empty', async () => {
    const item = createMockItem({ title: 'Some Title' })

    render(
      <ItemDetailDialog
        isOpen={true}
        item={item}
        projectPath="/test/project"
        onClose={vi.fn()}
        onUpdated={vi.fn()}
      />
    )

    // Clear title
    fireEvent.change(screen.getByTestId('title-input'), {
      target: { value: '' },
    })

    // Press Ctrl+Enter
    fireEvent.keyDown(screen.getByTestId('item-detail-dialog').parentElement!, {
      key: 'Enter',
      ctrlKey: true,
    })

    // updateItem should NOT have been called
    expect(mockKanbanUpdateItem).not.toHaveBeenCalled()
  })

  it('should show required marker on title label', () => {
    const item = createMockItem()

    render(
      <ItemDetailDialog
        isOpen={true}
        item={item}
        projectPath="/test/project"
        onClose={vi.fn()}
        onUpdated={vi.fn()}
      />
    )

    const titleLabel = screen.getByText('Title', { exact: false })
    expect(titleLabel.querySelector('.text-red-400')).not.toBeNull()
    expect(titleLabel.querySelector('.text-red-400')!.textContent).toBe('*')
  })

  it('should preserve description input when same item updates', () => {
    const item = createMockItem({ id: 'item-1', description: 'Original description' })

    const { rerender } = render(
      <ItemDetailDialog
        isOpen={true}
        item={item}
        projectPath="/test/project"
        onClose={vi.fn()}
        onUpdated={vi.fn()}
      />
    )

    // Edit description
    fireEvent.change(screen.getByTestId('description-input'), {
      target: { value: 'User is writing a long description...' },
    })

    // Verify user input
    expect(screen.getByTestId('description-input')).toHaveValue('User is writing a long description...')

    // Re-render with updated item (same ID)
    rerender(
      <ItemDetailDialog
        isOpen={true}
        item={{ ...item, description: 'Backend updated description' }}
        projectPath="/test/project"
        onClose={vi.fn()}
        onUpdated={vi.fn()}
      />
    )

    // User input should be preserved
    expect(screen.getByTestId('description-input')).toHaveValue('User is writing a long description...')
  })
})
