/**
 * @vitest-environment jsdom
 */
import React from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { VimModeProvider, useVimModeContext } from '@renderer/context/VimModeContext'
import { NewItemDialog } from '@renderer/components/kanban/NewItemDialog'
import { ItemDetailDialog } from '@renderer/components/kanban/ItemDetailDialog'
import type { KanbanItem } from '@shared/types/kanban'

vi.mock('@renderer/components/agent/AgentControls', () => ({
  AgentControls: ({
    item,
  }: {
    item: KanbanItem
  }) => <div data-testid="status-badge">{item.agentStatus}</div>,
}))

vi.mock('@renderer/components/code-review/GitDiffDialog', () => ({
  GitDiffDialog: ({
    isOpen,
    onClose,
  }: {
    isOpen: boolean
    onClose: () => void
  }) => (isOpen ? (
    <div data-testid="git-diff-dialog">
      <button data-testid="diff-dialog-close" onClick={onClose}>
        Close
      </button>
    </div>
  ) : null),
}))

const mockLoadConfig = vi.fn()
const mockKanbanAddItem = vi.fn()
const mockKanbanUpdateItem = vi.fn()
const mockKanbanDeleteItem = vi.fn()
const mockKanbanAddComment = vi.fn()
const mockWorktreeChangedFiles = vi.fn()
const mockWorktreeFileDiff = vi.fn()
const mockReadLog = vi.fn()
const mockGetActiveSession = vi.fn()
const mockRecover = vi.fn()

function createPendingPromise<T>(): Promise<T> {
  return new Promise(() => {})
}

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

function VimProbe(): React.ReactElement {
  const vim = useVimModeContext()

  return (
    <div>
      <div data-testid="vim-mode">{vim.mode}</div>
      <div data-testid="vim-zone">{vim.activeZone}</div>
      <button data-testid="enter-insert-mode" onClick={vim.enterInsertMode}>
        Enter insert mode
      </button>
    </div>
  )
}

function renderWithVim(ui: React.ReactElement) {
  return render(
    <VimModeProvider>
      <VimProbe />
      {ui}
    </VimModeProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()

  mockLoadConfig.mockImplementation(() => createPendingPromise())
  mockWorktreeChangedFiles.mockImplementation(() => createPendingPromise())
  mockWorktreeFileDiff.mockImplementation(() => createPendingPromise())
  mockReadLog.mockImplementation(() => createPendingPromise())
  mockGetActiveSession.mockImplementation(() => createPendingPromise())
  mockRecover.mockImplementation(() => createPendingPromise())
  mockKanbanAddItem.mockResolvedValue({
    id: 'new-item-1',
    description: '',
    agentProvider: 'claude',
  })
  mockKanbanUpdateItem.mockResolvedValue(undefined)
  mockKanbanDeleteItem.mockResolvedValue(undefined)
  mockKanbanAddComment.mockResolvedValue(undefined)

  Object.defineProperty(window, 'electronAPI', {
    value: {
      kanban: {
        addItem: mockKanbanAddItem,
        updateItem: mockKanbanUpdateItem,
        deleteItem: mockKanbanDeleteItem,
        addComment: mockKanbanAddComment,
      },
      dialog: {
        confirmOkCancel: vi.fn().mockResolvedValue(true),
      },
      git: {
        loadConfig: mockLoadConfig,
        worktreeChangedFiles: mockWorktreeChangedFiles,
        worktreeFileDiff: mockWorktreeFileDiff,
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
        listDefinitions: vi.fn().mockImplementation(() => createPendingPromise()),
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

describe('VimModeProvider dialog suspension', () => {
  it('should ignore zone-switch keys while the new item dialog is open', () => {
    renderWithVim(
      <NewItemDialog
        isOpen={true}
        projectPath="/test/project"
        onClose={vi.fn()}
        onCreated={vi.fn()}
      />,
    )

    fireEvent.keyDown(document, { key: 'e' })

    expect(screen.getByTestId('vim-zone')).toHaveTextContent('content')
  })

  it('should ignore Tab-based zone cycling while the new item dialog is open', () => {
    renderWithVim(
      <NewItemDialog
        isOpen={true}
        projectPath="/test/project"
        onClose={vi.fn()}
        onCreated={vi.fn()}
      />,
    )

    fireEvent.keyDown(document, { key: 'Tab' })

    expect(screen.getByTestId('vim-zone')).toHaveTextContent('content')
  })

  it('should ignore global INSERT-mode toggles and Escape handling while the item detail dialog is open', async () => {
    const onClose = vi.fn()

    renderWithVim(
      <ItemDetailDialog
        isOpen={true}
        item={createMockItem()}
        projectPath="/test/project"
        onClose={onClose}
        onUpdated={vi.fn()}
      />,
    )

    fireEvent.keyDown(document, { key: 'i' })
    expect(screen.getByTestId('vim-mode')).toHaveTextContent('NORMAL')

    fireEvent.click(screen.getByTestId('enter-insert-mode'))
    expect(screen.getByTestId('vim-mode')).toHaveTextContent('INSERT')

    await act(async () => {
      fireEvent.keyDown(screen.getByTestId('item-detail-dialog').parentElement!, {
        key: 'Escape',
      })
    })

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('vim-mode')).toHaveTextContent('INSERT')
  })

  it('should resume vim navigation after a kanban dialog closes', () => {
    const { rerender } = render(
      <VimModeProvider>
        <VimProbe />
        <NewItemDialog
          isOpen={true}
          projectPath="/test/project"
          onClose={vi.fn()}
          onCreated={vi.fn()}
        />
      </VimModeProvider>,
    )

    fireEvent.keyDown(document, { key: 'e' })
    expect(screen.getByTestId('vim-zone')).toHaveTextContent('content')

    rerender(
      <VimModeProvider>
        <VimProbe />
        <NewItemDialog
          isOpen={false}
          projectPath="/test/project"
          onClose={vi.fn()}
          onCreated={vi.fn()}
        />
      </VimModeProvider>,
    )

    fireEvent.keyDown(document, { key: 'e' })

    expect(screen.getByTestId('vim-zone')).toHaveTextContent('sidebar')
  })
})
