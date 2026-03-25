/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { KanbanView } from '@renderer/components/kanban/KanbanView'
import { CommentsList } from '@renderer/components/kanban/CommentsList'
import { ThemeProvider } from '@renderer/theme'
import type { KanbanBoard, KanbanItem, KanbanComment } from '@shared/types/kanban'

// --- Vim mock ---
const mockExitToNormal = vi.fn()
const mockEnterInsertMode = vi.fn()
const mockVimMode = { current: 'NORMAL' as string }

vi.mock('@renderer/context/VimModeContext', async () => {
  const actual = await vi.importActual<typeof import('@renderer/context/VimModeContext')>('@renderer/context/VimModeContext')
  return {
    ...actual,
    useVimModeContext: () => ({
      mode: mockVimMode.current,
      activeZone: 'content' as const,
      setActiveZone: vi.fn(),
      enterInsertMode: mockEnterInsertMode,
      exitToNormal: mockExitToNormal,
      suspendNavigation: () => () => {},
      leaderPending: false,
      leaderZone: null,
      leaderGroupKey: null,
      clearLeader: vi.fn(),
      triggerLeader: vi.fn(),
      setLeaderGroup: vi.fn(),
      enterVisualMode: vi.fn(),
    }),
  }
})

// --- electronAPI mock ---
const mockKanbanGetBoard = vi.fn()
const mockOnKanbanBoardUpdated = vi.fn()

beforeEach(() => {
  vi.resetAllMocks()
  mockOnKanbanBoardUpdated.mockReturnValue(() => {})
  mockVimMode.current = 'NORMAL'

  Object.defineProperty(window, 'electronAPI', {
    value: {
      kanban: {
        getBoard: mockKanbanGetBoard,
        onBoardUpdated: mockOnKanbanBoardUpdated,
        deleteItems: vi.fn().mockResolvedValue([]),
      },
      dialog: {
        confirmOkCancel: vi.fn().mockResolvedValue(true),
      },
      git: {
        detectNestedRepos: vi.fn().mockResolvedValue({ isRepo: true, nestedRepos: [] }),
        init: vi.fn().mockResolvedValue({ success: true }),
        loadConfig: vi.fn().mockResolvedValue(null),
      },
      agent: {
        start: vi.fn().mockResolvedValue({ sessionId: 'session-1' }),
        resume: vi.fn().mockResolvedValue({ sessionId: 'session-1' }),
        recover: vi.fn().mockResolvedValue([]),
        listDefinitions: vi.fn().mockResolvedValue([]),
        readLog: vi.fn().mockResolvedValue(''),
        destroy: vi.fn().mockResolvedValue(() => {}),
        clearLog: vi.fn().mockResolvedValue(undefined),
        getActiveSession: vi.fn().mockResolvedValue(null),
        onOutput: vi.fn(() => () => {}),
        onProgress: vi.fn(() => () => {}),
        onComplete: vi.fn(() => () => {}),
        onError: vi.fn(() => () => {}),
        onExit: vi.fn(() => () => {}),
        onCostUpdate: vi.fn(() => () => {}),
      },
      app: {
        openExternal: vi.fn().mockResolvedValue(undefined),
      },
      fs: {
        readFile: vi.fn().mockResolvedValue({ success: true, content: '', error: null }),
        listDirectory: vi.fn().mockResolvedValue({ success: true, basePath: '', entries: [], error: null }),
        createDirectory: vi.fn().mockResolvedValue({ success: true, path: null, error: null }),
      },
      report: {
        openFile: vi.fn().mockResolvedValue({ success: true }),
      },
    },
    writable: true,
  })
})

const createMockItem = (overrides: Partial<KanbanItem> = {}): KanbanItem => ({
  id: 'test-1',
  title: 'Test Task',
  description: 'Test description',
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

const createMockBoard = (items: KanbanItem[] = []): KanbanBoard => ({
  id: 'board-1',
  projectPath: '/test/project',
  items,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
})

describe('KanbanView search Escape behavior', () => {
  it('pressing Escape in search input should exit vim INSERT mode', async () => {
    const board = createMockBoard([createMockItem()])
    mockKanbanGetBoard.mockResolvedValueOnce(board)
    mockVimMode.current = 'INSERT'

    render(<KanbanView projectPath="/test/project" />)

    await waitFor(() => {
      expect(screen.queryByTestId('kanban-loading')).not.toBeInTheDocument()
    })

    const searchInput = screen.getByTestId('search-input')
    fireEvent.keyDown(searchInput, { key: 'Escape' })

    expect(mockExitToNormal).toHaveBeenCalled()
  })

  it('pressing Escape in search input should clear searchQuery and focus viewRef', async () => {
    const board = createMockBoard([createMockItem()])
    mockKanbanGetBoard.mockResolvedValueOnce(board)

    render(<KanbanView projectPath="/test/project" />)

    await waitFor(() => {
      expect(screen.queryByTestId('kanban-loading')).not.toBeInTheDocument()
    })

    const searchInput = screen.getByTestId('search-input')
    // Type something first
    fireEvent.change(searchInput, { target: { value: 'test query' } })
    expect(searchInput).toHaveValue('test query')

    // Press Escape
    fireEvent.keyDown(searchInput, { key: 'Escape' })

    // Query should be cleared
    expect(searchInput).toHaveValue('')
  })

  it('onBlur of search input should exit vim INSERT mode', async () => {
    const board = createMockBoard([createMockItem()])
    mockKanbanGetBoard.mockResolvedValueOnce(board)
    mockVimMode.current = 'INSERT'

    render(<KanbanView projectPath="/test/project" />)

    await waitFor(() => {
      expect(screen.queryByTestId('kanban-loading')).not.toBeInTheDocument()
    })

    const searchInput = screen.getByTestId('search-input')
    fireEvent.blur(searchInput)

    expect(mockExitToNormal).toHaveBeenCalled()
  })
})

describe('CommentsList search Escape behavior', () => {
  const comments: KanbanComment[] = [
    { id: 'c1', source: 'user', text: 'Hello world', timestamp: new Date().toISOString() },
    { id: 'c2', source: 'agent', text: 'Reply here', timestamp: new Date().toISOString() },
  ]

  it('pressing Escape in search input should blur the input', () => {
    render(<CommentsList comments={comments} />)

    const searchInput = screen.getByTestId('comment-search-input')
    searchInput.focus()
    expect(document.activeElement).toBe(searchInput)

    fireEvent.keyDown(searchInput, { key: 'Escape' })

    expect(document.activeElement).not.toBe(searchInput)
  })

  it('pressing Escape in search input should clear the search query', () => {
    render(<CommentsList comments={comments} />)

    const searchInput = screen.getByTestId('comment-search-input')
    fireEvent.change(searchInput, { target: { value: 'Hello' } })
    expect(searchInput).toHaveValue('Hello')

    fireEvent.keyDown(searchInput, { key: 'Escape' })

    expect(searchInput).toHaveValue('')
  })

  it('pressing Escape in empty search input should still blur', () => {
    render(<CommentsList comments={comments} />)

    const searchInput = screen.getByTestId('comment-search-input')
    searchInput.focus()
    expect(document.activeElement).toBe(searchInput)

    fireEvent.keyDown(searchInput, { key: 'Escape' })

    expect(document.activeElement).not.toBe(searchInput)
  })
})
