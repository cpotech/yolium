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

vi.mock('@renderer/components/StatusBar', () => ({
  StatusBar: () => <div data-testid="status-bar-mock" />,
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

function renderItemDetailDialog(overrides: Partial<Parameters<typeof ItemDetailDialog>[0]> = {}) {
  return renderWithVim(
    <ItemDetailDialog
      isOpen={true}
      item={createMockItem()}
      projectPath="/test/project"
      onClose={overrides.onClose ?? vi.fn()}
      onUpdated={overrides.onUpdated ?? vi.fn()}
      {...overrides}
    />,
  )
}

beforeEach(() => {
  vi.clearAllMocks()

  // jsdom doesn't implement scrollIntoView
  Element.prototype.scrollIntoView = vi.fn()

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

  it('should ignore Tab while the new item dialog is open (Tab cycling removed globally)', () => {
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

describe('ItemDetailDialog vim-aware navigation', () => {
  it('should allow mode switching (i key) while the item detail dialog is open', () => {
    renderItemDetailDialog()

    // Press 'i' globally — should enter INSERT mode even with dialog open
    fireEvent.keyDown(document, { key: 'i' })
    expect(screen.getByTestId('vim-mode')).toHaveTextContent('INSERT')
  })

  it('should allow Escape to exit INSERT to NORMAL without closing the item detail dialog', async () => {
    const onClose = vi.fn()
    renderItemDetailDialog({ onClose })

    // Enter INSERT mode
    fireEvent.keyDown(document, { key: 'i' })
    expect(screen.getByTestId('vim-mode')).toHaveTextContent('INSERT')

    // Press Escape — should exit to NORMAL, not close
    await act(async () => {
      fireEvent.keyDown(screen.getByTestId('item-detail-dialog').closest('[tabindex]')!, {
        key: 'Escape',
      })
    })

    expect(screen.getByTestId('vim-mode')).toHaveTextContent('NORMAL')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('should open ItemDetailDialog in NORMAL mode (not INSERT)', () => {
    renderItemDetailDialog()

    expect(screen.getByTestId('vim-mode')).toHaveTextContent('NORMAL')
  })

  it('should not auto-focus title input when ItemDetailDialog opens', () => {
    renderItemDetailDialog()

    expect(document.activeElement?.id).not.toBe('detail-title')
  })

  it('should focus the dialog container when ItemDetailDialog opens so keyboard events work', () => {
    renderItemDetailDialog()

    const container = screen.getByTestId('item-detail-dialog').closest('[tabindex]')
    expect(container).not.toBeNull()
  })

  it('should close the item detail dialog when Ctrl+Q is pressed in NORMAL mode', async () => {
    const onClose = vi.fn()
    renderItemDetailDialog({ onClose })

    // Dialog opens in NORMAL mode
    expect(screen.getByTestId('vim-mode')).toHaveTextContent('NORMAL')

    // Ctrl+Q in NORMAL mode -> close dialog
    await act(async () => {
      fireEvent.keyDown(screen.getByTestId('item-detail-dialog').closest('[tabindex]')!, {
        key: 'q',
        ctrlKey: true,
      })
    })

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('should still block zone switching keys (e/t/c/s) while the item detail dialog is open', () => {
    renderItemDetailDialog()

    fireEvent.keyDown(document, { key: 'e' })
    expect(screen.getByTestId('vim-zone')).toHaveTextContent('content')

    fireEvent.keyDown(document, { key: 't' })
    expect(screen.getByTestId('vim-zone')).toHaveTextContent('content')

    fireEvent.keyDown(document, { key: 's' })
    expect(screen.getByTestId('vim-zone')).toHaveTextContent('content')
  })

  it('should not change zone with Tab while the item detail dialog is open (Tab cycling removed globally)', () => {
    renderItemDetailDialog()

    fireEvent.keyDown(document, { key: 'Tab' })
    expect(screen.getByTestId('vim-zone')).toHaveTextContent('content')
  })

  it('should navigate between fields with j/k in NORMAL mode inside ItemDetailDialog', async () => {
    renderItemDetailDialog()

    // Dialog opens in NORMAL mode
    expect(screen.getByTestId('vim-mode')).toHaveTextContent('NORMAL')

    // focusedFieldIndex starts at 0 (title). Press j to go to description (1)
    fireEvent.keyDown(screen.getByTestId('item-detail-dialog').closest('[tabindex]')!, { key: 'j' })

    // The description field should now have the focus ring
    const descriptionField = document.getElementById('detail-description')!
    expect(descriptionField.closest('[data-field-index="1"]')).toBeTruthy()
  })

  it('should jump to first field with gg in NORMAL mode inside ItemDetailDialog', async () => {
    renderItemDetailDialog()

    // Dialog opens in NORMAL mode
    expect(screen.getByTestId('vim-mode')).toHaveTextContent('NORMAL')

    // Navigate to last field first
    fireEvent.keyDown(screen.getByTestId('item-detail-dialog').closest('[tabindex]')!, { key: 'G' })

    // Now gg to go back to first
    const container = screen.getByTestId('item-detail-dialog').closest('[tabindex]')!
    fireEvent.keyDown(container, { key: 'g' })
    fireEvent.keyDown(container, { key: 'g' })

    // Title field should have focus ring
    const titleField = document.getElementById('detail-title')!
    expect(titleField.closest('[data-field-index="0"]')).toBeTruthy()
  })

  it('should jump to last field with G in NORMAL mode inside ItemDetailDialog', async () => {
    renderItemDetailDialog()

    // Dialog opens in NORMAL mode
    expect(screen.getByTestId('vim-mode')).toHaveTextContent('NORMAL')

    fireEvent.keyDown(screen.getByTestId('item-detail-dialog').closest('[tabindex]')!, { key: 'G' })

    // Comment field should have focus ring
    const commentField = document.getElementById('comment-input')!
    expect(commentField.closest('[data-field-index="2"]')).toBeTruthy()
  })

  it('should focus highlighted field and enter INSERT when i is pressed in NORMAL mode inside ItemDetailDialog', async () => {
    renderItemDetailDialog()

    // Dialog opens in NORMAL mode
    expect(screen.getByTestId('vim-mode')).toHaveTextContent('NORMAL')

    // Navigate to description
    fireEvent.keyDown(screen.getByTestId('item-detail-dialog').closest('[tabindex]')!, { key: 'j' })

    // Press i to enter INSERT on highlighted field
    fireEvent.keyDown(screen.getByTestId('item-detail-dialog').closest('[tabindex]')!, { key: 'i' })

    expect(screen.getByTestId('vim-mode')).toHaveTextContent('INSERT')
    expect(document.activeElement?.id).toBe('detail-description')
  })

  it('should focus highlighted field and enter INSERT when Enter is pressed in NORMAL mode inside ItemDetailDialog', async () => {
    renderItemDetailDialog()

    // Dialog opens in NORMAL mode
    expect(screen.getByTestId('vim-mode')).toHaveTextContent('NORMAL')

    // Navigate to description
    fireEvent.keyDown(screen.getByTestId('item-detail-dialog').closest('[tabindex]')!, { key: 'j' })

    // Press Enter to enter INSERT on highlighted field
    fireEvent.keyDown(screen.getByTestId('item-detail-dialog').closest('[tabindex]')!, { key: 'Enter' })

    expect(screen.getByTestId('vim-mode')).toHaveTextContent('INSERT')
    expect(document.activeElement?.id).toBe('detail-description')
  })

  it('should show visual focus ring on the highlighted field in NORMAL mode', async () => {
    renderItemDetailDialog()

    // Dialog opens in NORMAL mode
    expect(screen.getByTestId('vim-mode')).toHaveTextContent('NORMAL')

    // Title field (index 0) should have focus ring in NORMAL mode
    const titleWrapper = document.getElementById('detail-title')!.closest('[data-field-index="0"]')!
    expect(titleWrapper.className).toContain('ring-2')
  })

  it('should not auto-focus title input when ItemDetailDialog opens', () => {
    renderItemDetailDialog()

    expect(document.activeElement?.id).not.toBe('detail-title')
  })

  it('should focus the dialog container when ItemDetailDialog opens so keyboard events work', () => {
    renderItemDetailDialog()

    const container = screen.getByTestId('item-detail-dialog').closest('[tabindex]')
    expect(container).not.toBeNull()
  })

  it('should enter INSERT mode when a field receives focus via click', async () => {
    renderItemDetailDialog()

    // Dialog opens in NORMAL mode
    expect(screen.getByTestId('vim-mode')).toHaveTextContent('NORMAL')

    // Click on description field
    fireEvent.focus(screen.getByTestId('description-input'))

    expect(screen.getByTestId('vim-mode')).toHaveTextContent('INSERT')
  })
})

describe('ItemDetailDialog shortcuts hint bar', () => {
  it('should display NORMAL mode shortcuts when in NORMAL mode', async () => {
    renderItemDetailDialog()

    // Dialog opens in NORMAL mode
    expect(screen.getByTestId('vim-mode')).toHaveTextContent('NORMAL')

    const hintsBar = screen.getByTestId('shortcuts-hint-bar')
    expect(hintsBar).toHaveTextContent('j/k')
    expect(hintsBar).toHaveTextContent('Navigate')
    expect(hintsBar).toHaveTextContent('gg')
    expect(hintsBar).toHaveTextContent('First')
    expect(hintsBar).toHaveTextContent('Last')
    expect(hintsBar).toHaveTextContent('Edit')
    expect(hintsBar).toHaveTextContent('Close')
  })

  it('should display INSERT mode shortcuts when in INSERT mode', () => {
    renderItemDetailDialog()

    // Enter INSERT mode explicitly (dialog opens in NORMAL)
    fireEvent.keyDown(screen.getByTestId('item-detail-dialog').closest('[tabindex]')!, { key: 'i' })
    expect(screen.getByTestId('vim-mode')).toHaveTextContent('INSERT')

    const hintsBar = screen.getByTestId('shortcuts-hint-bar')
    expect(hintsBar).toHaveTextContent('Normal mode')
    expect(hintsBar).toHaveTextContent('Ctrl+Enter')
    expect(hintsBar).toHaveTextContent('Save')
    expect(hintsBar).toHaveTextContent('Ctrl+Del')
    expect(hintsBar).toHaveTextContent('Delete')
  })

  it('should not show Plan/Code/Verify Ctrl+Shift shortcuts in hints bar', async () => {
    renderItemDetailDialog()

    // Dialog opens in NORMAL mode
    expect(screen.getByTestId('vim-mode')).toHaveTextContent('NORMAL')

    // Check agent shortcuts are NOT in NORMAL mode editor hints
    const hintsBar = screen.getByTestId('shortcuts-hint-bar')
    expect(hintsBar).not.toHaveTextContent('Ctrl+Shift+P')
    expect(hintsBar).not.toHaveTextContent('Ctrl+Shift+C')
    expect(hintsBar).not.toHaveTextContent('Ctrl+Shift+V')

    // Switch to INSERT mode and verify agent shortcuts still absent
    fireEvent.keyDown(screen.getByTestId('item-detail-dialog').closest('[tabindex]')!, { key: 'i' })

    expect(hintsBar).not.toHaveTextContent('Ctrl+Shift+P')
    expect(hintsBar).not.toHaveTextContent('Ctrl+Shift+C')
    expect(hintsBar).not.toHaveTextContent('Ctrl+Shift+V')
  })
})
