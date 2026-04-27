/**
 * @vitest-environment jsdom
 *
 * Integration test verifying the info bar mounts above the editor zone
 * when an item is open, that no info-bar controls leak into the sidebar
 * zone, and that the `p` keyboard shortcut still toggles the verified
 * checkbox after the move.
 */
import React from 'react'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ItemDetailDialog } from '@renderer/components/kanban/ItemDetailDialog'
import type { KanbanItem } from '@shared/types/kanban'

const mockVimMode = { current: 'NORMAL' as 'NORMAL' | 'INSERT' }

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
  GitDiffDialog: () => null,
}))

vi.mock('@renderer/components/StatusBar', () => ({
  StatusBar: () => <div data-testid="status-bar-mock" />,
}))

function createMockItem(overrides: Partial<KanbanItem> = {}): KanbanItem {
  return {
    id: 'item-1',
    title: 'Test Item',
    description: 'Test description',
    column: 'verify',
    branch: 'feature/test-item',
    worktreePath: '/tmp/wt',
    agentProvider: 'claude',
    order: 0,
    agentStatus: 'completed',
    comments: [],
    createdAt: '2024-01-15T10:00:00.000Z',
    updatedAt: '2024-01-15T12:00:00.000Z',
    ...overrides,
  }
}

const mockUpdateItem = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  Element.prototype.scrollIntoView = vi.fn()
  mockVimMode.current = 'NORMAL'
  mockUpdateItem.mockResolvedValue(undefined)

  Object.defineProperty(window, 'electronAPI', {
    value: {
      kanban: {
        updateItem: mockUpdateItem,
        deleteItem: vi.fn(),
        addComment: vi.fn(),
      },
      dialog: {
        confirmOkCancel: vi.fn().mockResolvedValue(true),
      },
      git: {
        loadConfig: vi.fn().mockResolvedValue({
          providerModels: {
            claude: ['sonnet'],
            codex: ['gpt-5-codex'],
            opencode: ['open-model'],
          },
        }),
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
        getActiveSession: vi.fn().mockResolvedValue(null),
        recover: vi.fn().mockResolvedValue([]),
        readLog: vi.fn().mockResolvedValue(''),
        clearLog: vi.fn().mockResolvedValue(undefined),
        listDefinitions: vi.fn().mockResolvedValue([]),
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

const dialogProps = {
  isOpen: true,
  projectPath: '/test/project',
  onClose: vi.fn(),
  onUpdated: vi.fn(),
}

describe('ItemDetailDialog - info bar mount', () => {
  it('renders info-bar between dialog header and editor zone', () => {
    render(<ItemDetailDialog {...dialogProps} item={createMockItem()} />)
    const bar = screen.getByTestId('info-bar')
    const editor = screen.getByTestId('editor-zone')
    expect(bar).toBeInTheDocument()
    const position = bar.compareDocumentPosition(editor)
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('places no info-bar controls (verified-checkbox, branch-display, worktree-path-display) inside sidebar-zone', () => {
    render(<ItemDetailDialog {...dialogProps} item={createMockItem()} />)
    const sidebar = screen.getByTestId('sidebar-zone')
    expect(within(sidebar).queryByTestId('verified-checkbox')).not.toBeInTheDocument()
    expect(within(sidebar).queryByTestId('branch-display')).not.toBeInTheDocument()
    expect(within(sidebar).queryByTestId('worktree-path-display')).not.toBeInTheDocument()
  })

  it('keeps non-info sidebar sections (Configuration agent-provider-select, Footer delete-button) intact', () => {
    render(<ItemDetailDialog {...dialogProps} item={createMockItem()} />)
    const sidebar = screen.getByTestId('sidebar-zone')
    expect(within(sidebar).getByTestId('agent-provider-select')).toBeInTheDocument()
    expect(within(sidebar).getByTestId('delete-button')).toBeInTheDocument()
  })

  it('still toggles verified state via the p keyboard shortcut after the move', async () => {
    render(<ItemDetailDialog {...dialogProps} item={createMockItem()} />)
    const dialog = screen.getByTestId('item-detail-dialog')

    await act(async () => {
      fireEvent.keyDown(dialog, { key: 'p' })
    })

    const checkbox = screen.getByTestId('verified-checkbox') as HTMLInputElement
    expect(checkbox.checked).toBe(true)
  })
})
