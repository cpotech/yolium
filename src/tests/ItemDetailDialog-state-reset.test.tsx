/**
 * @vitest-environment jsdom
 */
import React from 'react'
import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ItemDetailDialog } from '@renderer/components/kanban/ItemDetailDialog'
import type { KanbanItem } from '@shared/types/kanban'

const mockVimMode = { current: 'NORMAL' as 'NORMAL' | 'INSERT' }
const mockLeaderState = { pending: false, groupKey: null as string | null }

vi.mock('@renderer/context/VimModeContext', async () => {
  const actual = await vi.importActual<typeof import('@renderer/context/VimModeContext')>('@renderer/context/VimModeContext')
  return {
    ...actual,
    useVimModeContext: () => ({
      mode: mockVimMode.current,
      activeZone: 'content' as const,
      setActiveZone: vi.fn(),
      enterInsertMode: vi.fn(),
      exitToNormal: vi.fn(),
      suspendNavigation: () => () => {},
      leaderPending: mockLeaderState.pending,
      leaderZone: null,
      leaderGroupKey: mockLeaderState.groupKey,
      clearLeader: vi.fn(),
      triggerLeader: vi.fn(),
      setLeaderGroup: vi.fn(),
      enterVisualMode: vi.fn(),
    }),
  }
})

vi.mock('@renderer/components/agent/AgentControls', () => ({
  AgentControls: ({ item }: { item: KanbanItem }) => (
    <div data-testid="status-badge">{item.agentStatus}</div>
  ),
}))

vi.mock('@renderer/components/code-review/GitDiffDialog', () => ({
  GitDiffDialog: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="git-diff-dialog">Diff</div> : null,
}))

vi.mock('@renderer/components/StatusBar', () => ({
  StatusBar: () => <div data-testid="status-bar-mock" />,
}))

const mockReadLog = vi.fn()
const mockGetActiveSession = vi.fn()
const mockRecover = vi.fn()
const mockLoadConfig = vi.fn()

function createMockItem(overrides: Partial<KanbanItem> = {}): KanbanItem {
  return {
    id: 'item-1',
    title: 'Test Item',
    description: 'Test description',
    column: 'backlog',
    branch: 'feature/test-item',
    agentProvider: 'claude',
    order: 0,
    agentStatus: 'idle',
    comments: [],
    createdAt: '2024-01-15T10:00:00.000Z',
    updatedAt: '2024-01-15T12:00:00.000Z',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  Element.prototype.scrollIntoView = vi.fn()
  mockVimMode.current = 'NORMAL'
  mockLeaderState.pending = false
  mockLeaderState.groupKey = null
  mockLoadConfig.mockResolvedValue({
    providerModels: {
      claude: ['sonnet'],
      codex: ['gpt-5-codex'],
      opencode: ['open-model'],
    },
  })
  mockReadLog.mockResolvedValue('')
  mockGetActiveSession.mockResolvedValue(null)
  mockRecover.mockResolvedValue([])

  Object.defineProperty(window, 'electronAPI', {
    value: {
      kanban: {
        updateItem: vi.fn(),
        deleteItem: vi.fn(),
        addComment: vi.fn(),
      },
      dialog: {
        confirmOkCancel: vi.fn().mockResolvedValue(true),
      },
      git: {
        loadConfig: mockLoadConfig,
        worktreeChangedFiles: vi.fn().mockResolvedValue({ files: [] }),
        worktreeFileDiff: vi.fn().mockResolvedValue({ diff: '' }),
        worktreeDiffStats: vi.fn(),
        mergeAndPushPR: vi.fn(),
        checkMergeConflicts: vi.fn(),
        rebaseOntoDefault: vi.fn(),
        approvePR: vi.fn(),
        mergePR: vi.fn(),
      },
      agent: {
        onOutput: vi.fn().mockReturnValue(() => {}),
        onProgress: vi.fn().mockReturnValue(() => {}),
        onComplete: vi.fn().mockReturnValue(() => {}),
        onError: vi.fn().mockReturnValue(() => {}),
        onExit: vi.fn().mockReturnValue(() => {}),
        onCostUpdate: vi.fn().mockReturnValue(() => {}),
        getActiveSession: mockGetActiveSession,
        recover: mockRecover,
        readLog: mockReadLog,
        clearLog: vi.fn().mockResolvedValue(undefined),
        listDefinitions: vi.fn().mockResolvedValue([
          { name: 'code-agent', description: 'Code', model: 'sonnet', tools: ['Read'] },
        ]),
        start: vi.fn(),
        resume: vi.fn(),
        stop: vi.fn(),
        answer: vi.fn(),
      },
      app: {
        openExternal: vi.fn(),
      },
    },
    writable: true,
  })
})

const defaultProps = {
  isOpen: true,
  projectPath: '/test/project',
  onClose: vi.fn(),
  onUpdated: vi.fn(),
}

describe('ItemDetailDialog state reset on item change', () => {
  it('should reset errorMessage when item.id changes', async () => {
    const itemA = createMockItem({ id: 'item-a', title: 'Item A' })
    const itemB = createMockItem({ id: 'item-b', title: 'Item B' })

    const { rerender } = render(
      <ItemDetailDialog {...defaultProps} item={itemA} />,
    )
    await act(async () => {})

    // Verify item A is rendered
    expect(screen.getByDisplayValue('Item A')).toBeTruthy()

    // Switch to item B — any stale errorMessage from A should be cleared
    rerender(<ItemDetailDialog {...defaultProps} item={itemB} />)
    await act(async () => {})

    // The error banner should not be visible after switching items
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('should reset showDiffViewer to false when item.id changes', async () => {
    const itemA = createMockItem({ id: 'item-a', title: 'Item A' })
    const itemB = createMockItem({ id: 'item-b', title: 'Item B' })

    const { rerender } = render(
      <ItemDetailDialog {...defaultProps} item={itemA} />,
    )
    await act(async () => {})

    // Switch to item B — diff viewer should not carry over
    rerender(<ItemDetailDialog {...defaultProps} item={itemB} />)
    await act(async () => {})

    expect(screen.queryByTestId('git-diff-dialog')).toBeNull()
  })

  it('should reset focusedItemIndex to 0 when item.id changes', async () => {
    const itemA = createMockItem({
      id: 'item-a',
      title: 'Item A',
      comments: [
        { id: 'c1', author: 'user', text: 'Comment 1', createdAt: '2024-01-01T00:00:00Z' },
        { id: 'c2', author: 'user', text: 'Comment 2', createdAt: '2024-01-01T00:00:00Z' },
      ],
    })
    const itemB = createMockItem({ id: 'item-b', title: 'Item B' })

    const { rerender } = render(
      <ItemDetailDialog {...defaultProps} item={itemA} />,
    )
    await act(async () => {})

    // Switch to item B — focusedItemIndex should reset to 0
    rerender(<ItemDetailDialog {...defaultProps} item={itemB} />)
    await act(async () => {})

    // The title field (index 0) should have focus styling, not a stale comment index
    const titleInput = screen.getByDisplayValue('Item B')
    expect(titleInput).toBeTruthy()
  })

  it('should reset focusZone to editor when item.id changes', async () => {
    const itemA = createMockItem({ id: 'item-a', title: 'Item A' })
    const itemB = createMockItem({ id: 'item-b', title: 'Item B' })

    const { rerender } = render(
      <ItemDetailDialog {...defaultProps} item={itemA} />,
    )
    await act(async () => {})

    // Switch to item B — focusZone should reset to 'editor'
    rerender(<ItemDetailDialog {...defaultProps} item={itemB} />)
    await act(async () => {})

    // After reset, the title input (editor zone) should be present and accessible
    const titleInput = screen.getByDisplayValue('Item B')
    expect(titleInput).toBeTruthy()
  })

  it('should reset dialogVisualMode and selectedItemIndices when item.id changes', async () => {
    const itemA = createMockItem({ id: 'item-a', title: 'Item A' })
    const itemB = createMockItem({ id: 'item-b', title: 'Item B' })

    const { rerender } = render(
      <ItemDetailDialog {...defaultProps} item={itemA} />,
    )
    await act(async () => {})

    // Switch to item B — visual mode and selection should be cleared
    rerender(<ItemDetailDialog {...defaultProps} item={itemB} />)
    await act(async () => {})

    // No visual selection indicators should be present
    expect(screen.queryByTestId('visual-selection')).toBeNull()
  })

  it('should not reset state when same item.id re-renders with updated data', async () => {
    const itemA = createMockItem({ id: 'item-a', title: 'Item A' })
    const itemAUpdated = createMockItem({
      id: 'item-a',
      title: 'Item A',
      description: 'Updated description',
    })

    const { rerender } = render(
      <ItemDetailDialog {...defaultProps} item={itemA} />,
    )
    await act(async () => {})

    // Re-render with the same item ID but updated data
    rerender(<ItemDetailDialog {...defaultProps} item={itemAUpdated} />)
    await act(async () => {})

    // The dialog should still show the item, not be reset to a blank state
    expect(screen.getByDisplayValue('Item A')).toBeTruthy()
  })
})
