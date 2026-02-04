/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { KanbanView } from '../components/KanbanView'
import type { KanbanBoard, KanbanItem } from '../types/kanban'

// Mock the electronAPI
const mockKanbanGetBoard = vi.fn()
const mockOnKanbanBoardUpdated = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  // Setup the mock on window.electronAPI
  Object.defineProperty(window, 'electronAPI', {
    value: {
      kanbanGetBoard: mockKanbanGetBoard,
      onKanbanBoardUpdated: mockOnKanbanBoardUpdated,
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

    expect(screen.getByTestId('project-path-display')).toHaveTextContent('/test/project')
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
})
