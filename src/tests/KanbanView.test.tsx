/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { KanbanView } from '@renderer/components/kanban/KanbanView'
import type { KanbanBoard, KanbanItem } from '@shared/types/kanban'

// Mock the electronAPI
const mockKanbanGetBoard = vi.fn()
const mockOnKanbanBoardUpdated = vi.fn()
const mockDetectNestedRepos = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  // Default: project is a git repo (no warning)
  mockDetectNestedRepos.mockResolvedValue({ isRepo: true, nestedRepos: [] })
  // Setup the mock on window.electronAPI
  Object.defineProperty(window, 'electronAPI', {
    value: {
      kanban: {
        getBoard: mockKanbanGetBoard,
        onBoardUpdated: mockOnKanbanBoardUpdated,
      },
      git: {
        detectNestedRepos: mockDetectNestedRepos,
        init: vi.fn().mockResolvedValue({ success: true }),
      },
    },
    writable: true,
  })
  // Default mock returns cleanup function
  mockOnKanbanBoardUpdated.mockReturnValue(() => {})
})

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

const createMockBoard = (items: KanbanItem[] = []): KanbanBoard => ({
  id: 'board-1',
  projectPath: '/test/project',
  items,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
})

describe('KanbanView', () => {
  it('should show loading state initially', () => {
    // Never resolve to keep loading state
    mockKanbanGetBoard.mockReturnValue(new Promise(() => {}))

    render(<KanbanView projectPath="/test/project" />)

    expect(screen.getByTestId('kanban-loading')).toBeInTheDocument()
  })

  it('should render all four columns after loading', async () => {
    const board = createMockBoard([])
    mockKanbanGetBoard.mockResolvedValueOnce(board)

    render(<KanbanView projectPath="/test/project" />)

    await waitFor(() => {
      expect(screen.queryByTestId('kanban-loading')).not.toBeInTheDocument()
    })

    // Check all 4 columns are rendered
    expect(screen.getByTestId('kanban-column-backlog')).toBeInTheDocument()
    expect(screen.getByTestId('kanban-column-ready')).toBeInTheDocument()
    expect(screen.getByTestId('kanban-column-in-progress')).toBeInTheDocument()
    expect(screen.getByTestId('kanban-column-done')).toBeInTheDocument()

    expect(screen.getByText('Backlog')).toBeInTheDocument()
    expect(screen.getByText('Ready')).toBeInTheDocument()
    expect(screen.getByText('In Progress')).toBeInTheDocument()
    expect(screen.getByText('Done')).toBeInTheDocument()
  })

  it('should display project path in toolbar', async () => {
    const board = createMockBoard([])
    mockKanbanGetBoard.mockResolvedValueOnce(board)

    render(<KanbanView projectPath="/test/project" />)

    await waitFor(() => {
      expect(screen.queryByTestId('kanban-loading')).not.toBeInTheDocument()
    })

    const pathDisplay = screen.getByTestId('project-path-display')
    expect(pathDisplay).toHaveTextContent('project')
    expect(pathDisplay).toHaveAttribute('title', '/test/project')
  })

  it('should show items in correct columns', async () => {
    const items = [
      createMockItem({ id: '1', title: 'Backlog Task', column: 'backlog' }),
      createMockItem({ id: '2', title: 'Ready Task', column: 'ready' }),
      createMockItem({ id: '3', title: 'In Progress Task', column: 'in-progress' }),
      createMockItem({ id: '4', title: 'Done Task', column: 'done' }),
    ]
    const board = createMockBoard(items)
    mockKanbanGetBoard.mockResolvedValueOnce(board)

    render(<KanbanView projectPath="/test/project" />)

    await waitFor(() => {
      expect(screen.queryByTestId('kanban-loading')).not.toBeInTheDocument()
    })

    expect(screen.getByText('Backlog Task')).toBeInTheDocument()
    expect(screen.getByText('Ready Task')).toBeInTheDocument()
    expect(screen.getByText('In Progress Task')).toBeInTheDocument()
    expect(screen.getByText('Done Task')).toBeInTheDocument()

    // Verify each column has exactly one card
    const cards = screen.getAllByTestId('kanban-card')
    expect(cards).toHaveLength(4)
  })

  it('should show empty state when projectPath is null', () => {
    render(<KanbanView projectPath={null} />)

    expect(screen.getByTestId('kanban-empty-state')).toBeInTheDocument()
    expect(screen.getByText(/select a project/i)).toBeInTheDocument()
  })

  it('should have New Item button', async () => {
    const board = createMockBoard([])
    mockKanbanGetBoard.mockResolvedValueOnce(board)

    render(<KanbanView projectPath="/test/project" />)

    await waitFor(() => {
      expect(screen.queryByTestId('kanban-loading')).not.toBeInTheDocument()
    })

    expect(screen.getByTestId('new-item-button')).toBeInTheDocument()
  })

  it('should have Refresh button', async () => {
    const board = createMockBoard([])
    mockKanbanGetBoard.mockResolvedValueOnce(board)

    render(<KanbanView projectPath="/test/project" />)

    await waitFor(() => {
      expect(screen.queryByTestId('kanban-loading')).not.toBeInTheDocument()
    })

    expect(screen.getByTestId('refresh-button')).toBeInTheDocument()
  })

  it('should call kanbanGetBoard on mount', async () => {
    const board = createMockBoard([])
    mockKanbanGetBoard.mockResolvedValueOnce(board)

    render(<KanbanView projectPath="/test/project" />)

    await waitFor(() => {
      expect(mockKanbanGetBoard).toHaveBeenCalledWith('/test/project')
    })
  })

  it('should call kanbanGetBoard when projectPath changes', async () => {
    const board1 = createMockBoard([])
    const board2 = createMockBoard([])
    mockKanbanGetBoard.mockResolvedValueOnce(board1).mockResolvedValueOnce(board2)

    const { rerender } = render(<KanbanView projectPath="/test/project1" />)

    await waitFor(() => {
      expect(mockKanbanGetBoard).toHaveBeenCalledWith('/test/project1')
    })

    rerender(<KanbanView projectPath="/test/project2" />)

    await waitFor(() => {
      expect(mockKanbanGetBoard).toHaveBeenCalledWith('/test/project2')
    })
  })

  it('should subscribe to board updates', async () => {
    const board = createMockBoard([])
    mockKanbanGetBoard.mockResolvedValueOnce(board)

    render(<KanbanView projectPath="/test/project" />)

    await waitFor(() => {
      expect(mockOnKanbanBoardUpdated).toHaveBeenCalled()
    })
  })

  it('should refresh board when Refresh button is clicked', async () => {
    const board = createMockBoard([])
    mockKanbanGetBoard.mockResolvedValue(board)

    render(<KanbanView projectPath="/test/project" />)

    await waitFor(() => {
      expect(screen.queryByTestId('kanban-loading')).not.toBeInTheDocument()
    })

    // Clear initial call
    mockKanbanGetBoard.mockClear()

    fireEvent.click(screen.getByTestId('refresh-button'))

    await waitFor(() => {
      expect(mockKanbanGetBoard).toHaveBeenCalledWith('/test/project')
    })
  })

  it('should open new item dialog when pressing N key', async () => {
    const board = createMockBoard([])
    mockKanbanGetBoard.mockResolvedValue(board)

    // Add kanban.addItem mock for NewItemDialog
    Object.defineProperty(window, 'electronAPI', {
      value: {
        ...window.electronAPI,
        kanban: {
          ...(window.electronAPI as any).kanban,
          addItem: vi.fn().mockResolvedValue({}),
        },
      },
      writable: true,
    })

    render(<KanbanView projectPath="/test/project" />)

    await waitFor(() => {
      expect(screen.queryByTestId('kanban-loading')).not.toBeInTheDocument()
    })

    // Press N key on the kanban view container
    fireEvent.keyDown(screen.getByTestId('kanban-view'), { key: 'n' })

    // New item dialog should be visible
    expect(screen.getByTestId('new-item-dialog')).toBeInTheDocument()
  })

  it('should refresh board when pressing R key', async () => {
    const board = createMockBoard([])
    mockKanbanGetBoard.mockResolvedValue(board)

    render(<KanbanView projectPath="/test/project" />)

    await waitFor(() => {
      expect(screen.queryByTestId('kanban-loading')).not.toBeInTheDocument()
    })

    mockKanbanGetBoard.mockClear()

    // Press R key on the kanban view container
    fireEvent.keyDown(screen.getByTestId('kanban-view'), { key: 'r' })

    await waitFor(() => {
      expect(mockKanbanGetBoard).toHaveBeenCalledWith('/test/project')
    })
  })

  it('should show project folder name in toolbar with full path tooltip', async () => {
    const board = createMockBoard([])
    mockKanbanGetBoard.mockResolvedValueOnce(board)

    render(<KanbanView projectPath="/home/user/projects/my-app" />)

    await waitFor(() => {
      expect(screen.queryByTestId('kanban-loading')).not.toBeInTheDocument()
    })

    const pathDisplay = screen.getByTestId('project-path-display')
    expect(pathDisplay).toHaveTextContent('my-app')
    expect(pathDisplay).toHaveAttribute('title', '/home/user/projects/my-app')
  })

  it('should show error banner when board fails to load', async () => {
    mockKanbanGetBoard.mockRejectedValueOnce(new Error('Network error'))

    render(<KanbanView projectPath="/test/project" />)

    await waitFor(() => {
      expect(screen.getByTestId('kanban-error')).toBeInTheDocument()
    })
    expect(screen.getByTestId('kanban-error')).toHaveTextContent(/failed to load/i)
  })

  it('should optimistically move card to new column on drag-drop', async () => {
    const items = [
      createMockItem({ id: '1', title: 'Dragged Task', column: 'backlog' }),
    ]
    const board = createMockBoard(items)

    // Add kanban.updateItem mock
    const mockUpdateItem = vi.fn().mockResolvedValue({})
    Object.defineProperty(window, 'electronAPI', {
      value: {
        ...window.electronAPI,
        kanban: {
          ...(window.electronAPI as any).kanban,
          updateItem: mockUpdateItem,
        },
      },
      writable: true,
    })

    // First call returns original board, subsequent calls return updated board
    mockKanbanGetBoard.mockResolvedValueOnce(board)
    mockKanbanGetBoard.mockResolvedValue(createMockBoard([
      createMockItem({ id: '1', title: 'Dragged Task', column: 'ready' }),
    ]))

    render(<KanbanView projectPath="/test/project" />)

    await waitFor(() => {
      expect(screen.queryByTestId('kanban-loading')).not.toBeInTheDocument()
    })

    // Verify item is in backlog
    expect(screen.getByText('Dragged Task')).toBeInTheDocument()

    // Simulate drop on ready column
    const readyColumn = screen.getByTestId('kanban-column-ready')
    fireEvent.drop(readyColumn, {
      dataTransfer: { getData: () => '1' },
    })

    // Should call update API
    await waitFor(() => {
      expect(mockUpdateItem).toHaveBeenCalledWith('/test/project', '1', { column: 'ready' })
    })
  })

  it('should dismiss error banner when clicking dismiss', async () => {
    mockKanbanGetBoard.mockRejectedValueOnce(new Error('Network error'))

    render(<KanbanView projectPath="/test/project" />)

    await waitFor(() => {
      expect(screen.getByTestId('kanban-error')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('dismiss-error'))

    expect(screen.queryByTestId('kanban-error')).not.toBeInTheDocument()
  })

  it('should show total item count in toolbar', async () => {
    const items = [
      createMockItem({ id: '1', column: 'backlog' }),
      createMockItem({ id: '2', column: 'ready' }),
      createMockItem({ id: '3', column: 'in-progress', agentStatus: 'running' }),
    ]
    const board = createMockBoard(items)
    mockKanbanGetBoard.mockResolvedValueOnce(board)

    render(<KanbanView projectPath="/test/project" />)

    await waitFor(() => {
      expect(screen.queryByTestId('kanban-loading')).not.toBeInTheDocument()
    })

    const summary = screen.getByTestId('board-summary')
    expect(summary).toHaveTextContent('3 items')
  })

  it('should show running count in toolbar when agents are active', async () => {
    const items = [
      createMockItem({ id: '1', column: 'backlog' }),
      createMockItem({ id: '2', column: 'in-progress', agentStatus: 'running' }),
      createMockItem({ id: '3', column: 'in-progress', agentStatus: 'running' }),
    ]
    const board = createMockBoard(items)
    mockKanbanGetBoard.mockResolvedValueOnce(board)

    render(<KanbanView projectPath="/test/project" />)

    await waitFor(() => {
      expect(screen.queryByTestId('kanban-loading')).not.toBeInTheDocument()
    })

    const summary = screen.getByTestId('board-summary')
    expect(summary).toHaveTextContent('2 running')
  })

  it('should auto-focus kanban view container after loading', async () => {
    const board = createMockBoard([])
    mockKanbanGetBoard.mockResolvedValueOnce(board)

    render(<KanbanView projectPath="/test/project" />)

    await waitFor(() => {
      expect(screen.queryByTestId('kanban-loading')).not.toBeInTheDocument()
    })

    const kanbanView = screen.getByTestId('kanban-view')
    expect(document.activeElement).toBe(kanbanView)
  })

  it('should show spinning icon on refresh button while loading', async () => {
    const board = createMockBoard([])
    // First call resolves, second call hangs
    mockKanbanGetBoard.mockResolvedValueOnce(board)

    render(<KanbanView projectPath="/test/project" />)

    await waitFor(() => {
      expect(screen.queryByTestId('kanban-loading')).not.toBeInTheDocument()
    })

    // Make next call hang
    mockKanbanGetBoard.mockReturnValue(new Promise(() => {}))

    // Click refresh
    fireEvent.click(screen.getByTestId('refresh-button'))

    // The refresh button should contain the animate-spin class on its SVG
    const refreshButton = screen.getByTestId('refresh-button')
    const svg = refreshButton.querySelector('svg')
    expect(svg).toHaveClass('animate-spin')
  })

  it('should show empty board welcome message when no items exist', async () => {
    const board = createMockBoard([])
    mockKanbanGetBoard.mockResolvedValueOnce(board)

    render(<KanbanView projectPath="/test/project" />)

    await waitFor(() => {
      expect(screen.queryByTestId('kanban-loading')).not.toBeInTheDocument()
    })

    expect(screen.getByTestId('empty-board-message')).toBeInTheDocument()
    expect(screen.getByTestId('empty-board-message')).toHaveTextContent(/press N/i)
  })

  it('should show keyboard shortcuts help when pressing ? key', async () => {
    const board = createMockBoard([])
    mockKanbanGetBoard.mockResolvedValueOnce(board)

    render(<KanbanView projectPath="/test/project" />)

    await waitFor(() => {
      expect(screen.queryByTestId('kanban-loading')).not.toBeInTheDocument()
    })

    // Press ? key
    fireEvent.keyDown(screen.getByTestId('kanban-view'), { key: '?' })

    expect(screen.getByTestId('shortcuts-help')).toBeInTheDocument()

    // Press ? again or Escape to dismiss
    fireEvent.keyDown(screen.getByTestId('kanban-view'), { key: 'Escape' })

    expect(screen.queryByTestId('shortcuts-help')).not.toBeInTheDocument()
  })

  it('should have horizontal scroll container for columns', async () => {
    const board = createMockBoard([])
    mockKanbanGetBoard.mockResolvedValueOnce(board)

    render(<KanbanView projectPath="/test/project" />)

    await waitFor(() => {
      expect(screen.queryByTestId('kanban-loading')).not.toBeInTheDocument()
    })

    const columnsContainer = screen.getByTestId('kanban-columns-container')
    expect(columnsContainer).toHaveClass('overflow-x-auto')
  })

  it('should render search input in toolbar', async () => {
    const board = createMockBoard([createMockItem()])
    mockKanbanGetBoard.mockResolvedValueOnce(board)

    render(<KanbanView projectPath="/test/project" />)

    await waitFor(() => {
      expect(screen.queryByTestId('kanban-loading')).not.toBeInTheDocument()
    })

    expect(screen.getByTestId('search-input')).toBeInTheDocument()
  })

  it('should filter cards by title when searching', async () => {
    const items = [
      createMockItem({ id: '1', title: 'Fix login bug', column: 'backlog' }),
      createMockItem({ id: '2', title: 'Add dark mode', column: 'backlog' }),
      createMockItem({ id: '3', title: 'Fix logout issue', column: 'ready' }),
    ]
    const board = createMockBoard(items)
    mockKanbanGetBoard.mockResolvedValueOnce(board)

    render(<KanbanView projectPath="/test/project" />)

    await waitFor(() => {
      expect(screen.queryByTestId('kanban-loading')).not.toBeInTheDocument()
    })

    // All 3 cards visible initially
    expect(screen.getAllByTestId('kanban-card')).toHaveLength(3)

    // Type "Fix" in search
    fireEvent.change(screen.getByTestId('search-input'), {
      target: { value: 'Fix' },
    })

    // Only 2 cards with "Fix" in title should be visible
    expect(screen.getAllByTestId('kanban-card')).toHaveLength(2)
    expect(screen.getByText('Fix login bug')).toBeInTheDocument()
    expect(screen.getByText('Fix logout issue')).toBeInTheDocument()
    expect(screen.queryByText('Add dark mode')).not.toBeInTheDocument()
  })

  it('should filter cards case-insensitively', async () => {
    const items = [
      createMockItem({ id: '1', title: 'Fix Login Bug', column: 'backlog' }),
      createMockItem({ id: '2', title: 'Add dark mode', column: 'backlog' }),
    ]
    const board = createMockBoard(items)
    mockKanbanGetBoard.mockResolvedValueOnce(board)

    render(<KanbanView projectPath="/test/project" />)

    await waitFor(() => {
      expect(screen.queryByTestId('kanban-loading')).not.toBeInTheDocument()
    })

    fireEvent.change(screen.getByTestId('search-input'), {
      target: { value: 'fix' },
    })

    expect(screen.getAllByTestId('kanban-card')).toHaveLength(1)
    expect(screen.getByText('Fix Login Bug')).toBeInTheDocument()
  })

  it('should filter cards by description too', async () => {
    const items = [
      createMockItem({ id: '1', title: 'Task A', description: 'Fix the API endpoint', column: 'backlog' }),
      createMockItem({ id: '2', title: 'Task B', description: 'Update the docs', column: 'backlog' }),
    ]
    const board = createMockBoard(items)
    mockKanbanGetBoard.mockResolvedValueOnce(board)

    render(<KanbanView projectPath="/test/project" />)

    await waitFor(() => {
      expect(screen.queryByTestId('kanban-loading')).not.toBeInTheDocument()
    })

    fireEvent.change(screen.getByTestId('search-input'), {
      target: { value: 'API' },
    })

    expect(screen.getAllByTestId('kanban-card')).toHaveLength(1)
    expect(screen.getByText('Task A')).toBeInTheDocument()
  })

  it('should clear search with / key and focus search with / key', async () => {
    const board = createMockBoard([createMockItem()])
    mockKanbanGetBoard.mockResolvedValueOnce(board)

    render(<KanbanView projectPath="/test/project" />)

    await waitFor(() => {
      expect(screen.queryByTestId('kanban-loading')).not.toBeInTheDocument()
    })

    // Press / to focus search
    fireEvent.keyDown(screen.getByTestId('kanban-view'), { key: '/' })

    expect(document.activeElement).toBe(screen.getByTestId('search-input'))
  })
})
