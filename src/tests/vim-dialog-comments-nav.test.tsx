/**
 * @vitest-environment jsdom
 */
import React from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { VimModeProvider, useVimModeContext } from '@renderer/context/VimModeContext'
import { ItemDetailDialog } from '@renderer/components/kanban/ItemDetailDialog'
import type { KanbanItem, KanbanComment } from '@shared/types/kanban'

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

function makeComment(id: string, text: string): KanbanComment {
  return {
    id,
    source: 'user',
    text,
    timestamp: new Date().toISOString(),
  }
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
      item={createMockItem(overrides.item ? overrides.item as Partial<KanbanItem> as KanbanItem : undefined)}
      projectPath="/test/project"
      onClose={overrides.onClose ?? vi.fn()}
      onUpdated={overrides.onUpdated ?? vi.fn()}
      {...overrides}
    />,
  )
}

function getDialogContainer() {
  return screen.getByTestId('item-detail-dialog').closest('[tabindex]')!
}

beforeEach(() => {
  vi.clearAllMocks()
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

  // Mock clipboard
  Object.defineProperty(navigator, 'clipboard', {
    value: {
      writeText: vi.fn().mockResolvedValue(undefined),
    },
    writable: true,
    configurable: true,
  })

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

describe('Comment navigation with j/k', () => {
  const threeComments = [
    makeComment('c1', 'First comment'),
    makeComment('c2', 'Second comment'),
    makeComment('c3', 'Third comment'),
  ]

  it('should navigate from comment-input to first comment with j when comments exist', () => {
    renderItemDetailDialog({
      item: createMockItem({ comments: threeComments }),
    })

    const container = getDialogContainer()
    // Navigate: title -> description -> comment-input -> c3 (first visible comment)
    fireEvent.keyDown(container, { key: 'j' }) // description
    fireEvent.keyDown(container, { key: 'j' }) // comment-input
    fireEvent.keyDown(container, { key: 'j' }) // c3

    // Newest comment (c3) should have focus ring
    const commentEl = document.querySelector('[data-comment-id="c3"]')
    expect(commentEl).not.toBeNull()
    expect(commentEl!.className).toContain('ring-2')
  })

  it('should navigate through individual comments with repeated j presses', () => {
    renderItemDetailDialog({
      item: createMockItem({ comments: threeComments }),
    })

    const container = getDialogContainer()
    // Navigate: title -> description -> comment-input -> c3 -> c2 -> c1 (reverse order: newest first)
    fireEvent.keyDown(container, { key: 'j' }) // description
    fireEvent.keyDown(container, { key: 'j' }) // comment-input
    fireEvent.keyDown(container, { key: 'j' }) // c3
    fireEvent.keyDown(container, { key: 'j' }) // c2
    fireEvent.keyDown(container, { key: 'j' }) // c1

    const c1 = document.querySelector('[data-comment-id="c1"]')
    expect(c1).not.toBeNull()
    expect(c1!.className).toContain('ring-2')
  })

  it('should navigate back up through comments with k', () => {
    renderItemDetailDialog({
      item: createMockItem({ comments: threeComments }),
    })

    const container = getDialogContainer()
    // Go down to c2 (reverse order: title -> desc -> comment-input -> c3 -> c2)
    fireEvent.keyDown(container, { key: 'j' }) // description
    fireEvent.keyDown(container, { key: 'j' }) // comment-input
    fireEvent.keyDown(container, { key: 'j' }) // c3
    fireEvent.keyDown(container, { key: 'j' }) // c2

    // Press k to go back to c3
    fireEvent.keyDown(container, { key: 'k' })

    const c3 = document.querySelector('[data-comment-id="c3"]')
    expect(c3).not.toBeNull()
    expect(c3!.className).toContain('ring-2')
  })

  it('should navigate from first comment to comment-input with k', () => {
    renderItemDetailDialog({
      item: createMockItem({ comments: threeComments }),
    })

    const container = getDialogContainer()
    // Go to first comment (title -> desc -> comment-input -> c3)
    fireEvent.keyDown(container, { key: 'j' }) // description
    fireEvent.keyDown(container, { key: 'j' }) // comment-input
    fireEvent.keyDown(container, { key: 'j' }) // c3

    // Press k to go back to comment-input
    fireEvent.keyDown(container, { key: 'k' })

    // comment-input field should have focus ring
    const commentInputWrapper = document.getElementById('comment-input')!.closest('[data-field-index]')!
    expect(commentInputWrapper.className).toContain('ring-2')
  })

  it('should navigate from description to comment-input with j', () => {
    renderItemDetailDialog({
      item: createMockItem({ comments: threeComments }),
    })

    const container = getDialogContainer()
    // Navigate: title -> description -> comment-input
    fireEvent.keyDown(container, { key: 'j' }) // description
    fireEvent.keyDown(container, { key: 'j' }) // comment-input

    // comment-input field should have focus ring
    const commentInputWrapper = document.getElementById('comment-input')!.closest('[data-field-index]')!
    expect(commentInputWrapper.className).toContain('ring-2')
  })

  it('should navigate from first comment back to comment-input with k', () => {
    renderItemDetailDialog({
      item: createMockItem({ comments: threeComments }),
    })

    const container = getDialogContainer()
    // Navigate: title -> description -> comment-input -> c3 (first comment)
    fireEvent.keyDown(container, { key: 'j' }) // description
    fireEvent.keyDown(container, { key: 'j' }) // comment-input
    fireEvent.keyDown(container, { key: 'j' }) // c3
    // Press k to go back to comment-input
    fireEvent.keyDown(container, { key: 'k' })

    const commentInputWrapper = document.getElementById('comment-input')!.closest('[data-field-index]')!
    expect(commentInputWrapper.className).toContain('ring-2')
  })

  it('should show focus ring on the currently focused comment', () => {
    renderItemDetailDialog({
      item: createMockItem({ comments: threeComments }),
    })

    const container = getDialogContainer()
    // Navigate to c2: title -> description -> comment-input -> c3 -> c2
    fireEvent.keyDown(container, { key: 'j' }) // description
    fireEvent.keyDown(container, { key: 'j' }) // comment-input
    fireEvent.keyDown(container, { key: 'j' }) // c3
    fireEvent.keyDown(container, { key: 'j' }) // c2

    // Only c2 should have ring, not c1 or c3
    const c1 = document.querySelector('[data-comment-id="c1"]')
    const c2 = document.querySelector('[data-comment-id="c2"]')
    const c3 = document.querySelector('[data-comment-id="c3"]')
    expect(c1!.className).not.toContain('ring-2')
    expect(c2!.className).toContain('ring-2')
    expect(c3!.className).not.toContain('ring-2')
  })

  it('should jump to first navigable element with gg (title field)', () => {
    renderItemDetailDialog({
      item: createMockItem({ comments: threeComments }),
    })

    const container = getDialogContainer()
    // Navigate to some comment
    fireEvent.keyDown(container, { key: 'j' })
    fireEvent.keyDown(container, { key: 'j' })
    fireEvent.keyDown(container, { key: 'j' })

    // gg to jump to first
    fireEvent.keyDown(container, { key: 'g' })
    fireEvent.keyDown(container, { key: 'g' })

    const titleWrapper = document.getElementById('detail-title')!.closest('[data-field-index="0"]')!
    expect(titleWrapper.className).toContain('ring-2')
  })

  it('should jump to last navigable element with G (last comment)', () => {
    renderItemDetailDialog({
      item: createMockItem({ comments: threeComments }),
    })

    const container = getDialogContainer()
    fireEvent.keyDown(container, { key: 'G' })

    // Last navigable item is now c1 (oldest comment, last in reversed list)
    const c1 = document.querySelector('[data-comment-id="c1"]')
    expect(c1).not.toBeNull()
    expect(c1!.className).toContain('ring-2')
  })

  it('should enter INSERT mode and focus the current field when i is pressed on a field (not a comment)', () => {
    renderItemDetailDialog({
      item: createMockItem({ comments: threeComments }),
    })

    const container = getDialogContainer()
    // Navigate to description (a field)
    fireEvent.keyDown(container, { key: 'j' })
    // Press i
    fireEvent.keyDown(container, { key: 'i' })

    expect(screen.getByTestId('vim-mode')).toHaveTextContent('INSERT')
    expect(document.activeElement?.id).toBe('detail-description')
  })

  it('should not enter INSERT mode when i is pressed while a comment is focused', () => {
    renderItemDetailDialog({
      item: createMockItem({ comments: threeComments }),
    })

    const container = getDialogContainer()
    // Navigate to first comment: title -> description -> comment-input -> c3
    fireEvent.keyDown(container, { key: 'j' }) // description
    fireEvent.keyDown(container, { key: 'j' }) // comment-input
    fireEvent.keyDown(container, { key: 'j' }) // c3
    // Press i — should be a no-op
    fireEvent.keyDown(container, { key: 'i' })

    expect(screen.getByTestId('vim-mode')).toHaveTextContent('NORMAL')
  })

  it('should still work with zero comments (j goes title -> description -> comment-input as before)', () => {
    renderItemDetailDialog({
      item: createMockItem({ comments: [] }),
    })

    const container = getDialogContainer()
    fireEvent.keyDown(container, { key: 'j' }) // description
    fireEvent.keyDown(container, { key: 'j' }) // comment-input

    const commentInputWrapper = document.getElementById('comment-input')!.closest('[data-field-index]')!
    expect(commentInputWrapper.className).toContain('ring-2')
  })

  it('should update navigable items when comments change (added/removed)', () => {
    const { rerender } = render(
      <VimModeProvider>
        <VimProbe />
        <ItemDetailDialog
          isOpen={true}
          item={createMockItem({ comments: [makeComment('c1', 'Only comment')] })}
          projectPath="/test/project"
          onClose={vi.fn()}
          onUpdated={vi.fn()}
        />
      </VimModeProvider>,
    )

    const container = getDialogContainer()
    // Navigate to c1 (title -> desc -> comment-input -> c1)
    fireEvent.keyDown(container, { key: 'j' }) // description
    fireEvent.keyDown(container, { key: 'j' }) // comment-input
    fireEvent.keyDown(container, { key: 'j' }) // c1

    const c1 = document.querySelector('[data-comment-id="c1"]')
    expect(c1).not.toBeNull()
    expect(c1!.className).toContain('ring-2')

    // Now rerender with 2 comments
    rerender(
      <VimModeProvider>
        <VimProbe />
        <ItemDetailDialog
          isOpen={true}
          item={createMockItem({
            comments: [
              makeComment('c1', 'Only comment'),
              makeComment('c2', 'New comment'),
            ],
          })}
          projectPath="/test/project"
          onClose={vi.fn()}
          onUpdated={vi.fn()}
        />
      </VimModeProvider>,
    )

    // The second comment should now be navigable
    const c2 = document.querySelector('[data-comment-id="c2"]')
    expect(c2).not.toBeNull()
  })
})

describe('Dialog VISUAL mode', () => {
  const twoComments = [
    makeComment('c1', 'First comment text'),
    makeComment('c2', 'Second comment text'),
  ]

  it('should enter VISUAL mode when V is pressed in NORMAL mode editor zone', () => {
    renderItemDetailDialog({
      item: createMockItem({ comments: twoComments }),
    })

    const container = getDialogContainer()
    // Navigate to first comment (title -> desc -> comment-input -> c2)
    fireEvent.keyDown(container, { key: 'j' }) // description
    fireEvent.keyDown(container, { key: 'j' }) // comment-input
    fireEvent.keyDown(container, { key: 'j' }) // c2

    // Press V (Shift+V)
    fireEvent.keyDown(container, { key: 'V', shiftKey: true })

    // Hints bar should show VISUAL mode indicators
    const hintsBar = screen.getByTestId('shortcuts-hint-bar')
    expect(hintsBar).toHaveTextContent('Extend')
    expect(hintsBar).toHaveTextContent('Yank')
  })

  it('should highlight the focused comment when entering VISUAL mode on a comment', () => {
    renderItemDetailDialog({
      item: createMockItem({ comments: twoComments }),
    })

    const container = getDialogContainer()
    // Navigate to c2 (title -> desc -> comment-input -> c2)
    fireEvent.keyDown(container, { key: 'j' }) // description
    fireEvent.keyDown(container, { key: 'j' }) // comment-input
    fireEvent.keyDown(container, { key: 'j' }) // c2

    // Enter VISUAL mode
    fireEvent.keyDown(container, { key: 'V', shiftKey: true })

    // c2 should have selection highlight
    const c2 = document.querySelector('[data-comment-id="c2"]')
    expect(c2!.className).toContain('bg-')
  })

  it('should extend selection down through comments with j in VISUAL mode', () => {
    renderItemDetailDialog({
      item: createMockItem({ comments: twoComments }),
    })

    const container = getDialogContainer()
    // Navigate to c2 (title -> desc -> comment-input -> c2)
    fireEvent.keyDown(container, { key: 'j' }) // description
    fireEvent.keyDown(container, { key: 'j' }) // comment-input
    fireEvent.keyDown(container, { key: 'j' }) // c2

    // Enter VISUAL mode
    fireEvent.keyDown(container, { key: 'V', shiftKey: true })

    // Extend to c1
    fireEvent.keyDown(container, { key: 'j' })

    // Both c1 and c2 should be selected
    const c1 = document.querySelector('[data-comment-id="c1"]')
    const c2 = document.querySelector('[data-comment-id="c2"]')
    // Both should have selection styling
    expect(c1!.className).toContain('bg-')
    expect(c2!.className).toContain('bg-')
  })

  it('should extend selection up through comments with k in VISUAL mode', () => {
    renderItemDetailDialog({
      item: createMockItem({ comments: twoComments }),
    })

    const container = getDialogContainer()
    // Navigate to c1 (title -> desc -> comment-input -> c2 -> c1)
    fireEvent.keyDown(container, { key: 'j' }) // description
    fireEvent.keyDown(container, { key: 'j' }) // comment-input
    fireEvent.keyDown(container, { key: 'j' }) // c2
    fireEvent.keyDown(container, { key: 'j' }) // c1

    // Enter VISUAL mode on c1
    fireEvent.keyDown(container, { key: 'V', shiftKey: true })

    // Extend up to c2
    fireEvent.keyDown(container, { key: 'k' })

    // Both should be selected
    const c1 = document.querySelector('[data-comment-id="c1"]')
    const c2 = document.querySelector('[data-comment-id="c2"]')
    expect(c1!.className).toContain('bg-')
    expect(c2!.className).toContain('bg-')
  })

  it('should copy selected comment text to clipboard when y is pressed in VISUAL mode', async () => {
    renderItemDetailDialog({
      item: createMockItem({ comments: twoComments }),
    })

    const container = getDialogContainer()
    // Navigate to first visible comment (c2 in reverse order: title -> desc -> comment-input -> c2)
    fireEvent.keyDown(container, { key: 'j' }) // description
    fireEvent.keyDown(container, { key: 'j' }) // comment-input
    fireEvent.keyDown(container, { key: 'j' }) // c2

    // Enter VISUAL mode, select c2 + c1 (reverse order)
    fireEvent.keyDown(container, { key: 'V', shiftKey: true })
    fireEvent.keyDown(container, { key: 'j' }) // extend to c1

    // Yank
    await act(async () => {
      fireEvent.keyDown(container, { key: 'y' })
    })

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      'Second comment text\n\nFirst comment text',
    )
  })

  it('should exit VISUAL mode after yanking with y', async () => {
    renderItemDetailDialog({
      item: createMockItem({ comments: twoComments }),
    })

    const container = getDialogContainer()
    // Navigate to first comment (title -> desc -> comment-input -> c2)
    fireEvent.keyDown(container, { key: 'j' }) // description
    fireEvent.keyDown(container, { key: 'j' }) // comment-input
    fireEvent.keyDown(container, { key: 'j' }) // c2
    fireEvent.keyDown(container, { key: 'V', shiftKey: true })

    await act(async () => {
      fireEvent.keyDown(container, { key: 'y' })
    })

    // Should be back in NORMAL mode, hints bar should not show VISUAL hints
    const hintsBar = screen.getByTestId('shortcuts-hint-bar')
    expect(hintsBar).not.toHaveTextContent('Yank')
  })

  it('should exit VISUAL mode and clear selection when Escape is pressed', () => {
    renderItemDetailDialog({
      item: createMockItem({ comments: twoComments }),
    })

    const container = getDialogContainer()
    // Navigate to first comment (title -> desc -> comment-input -> c2)
    fireEvent.keyDown(container, { key: 'j' }) // description
    fireEvent.keyDown(container, { key: 'j' }) // comment-input
    fireEvent.keyDown(container, { key: 'j' }) // c2
    fireEvent.keyDown(container, { key: 'V', shiftKey: true })

    fireEvent.keyDown(container, { key: 'Escape' })

    const hintsBar = screen.getByTestId('shortcuts-hint-bar')
    expect(hintsBar).not.toHaveTextContent('Yank')

    // Selection should be cleared
    const c1 = document.querySelector('[data-comment-id="c1"]')
    expect(c1!.className).not.toContain('bg-[var(--color-accent-primary)]')
  })

  it('should exit VISUAL mode and clear selection when V is pressed again', () => {
    renderItemDetailDialog({
      item: createMockItem({ comments: twoComments }),
    })

    const container = getDialogContainer()
    fireEvent.keyDown(container, { key: 'j' })
    fireEvent.keyDown(container, { key: 'j' })
    fireEvent.keyDown(container, { key: 'V', shiftKey: true })

    // Press V again to exit
    fireEvent.keyDown(container, { key: 'V', shiftKey: true })

    const hintsBar = screen.getByTestId('shortcuts-hint-bar')
    expect(hintsBar).not.toHaveTextContent('Yank')
  })

  it('should show VISUAL mode indicator in hints bar when in VISUAL mode', () => {
    renderItemDetailDialog({
      item: createMockItem({ comments: twoComments }),
    })

    const container = getDialogContainer()
    fireEvent.keyDown(container, { key: 'j' })
    fireEvent.keyDown(container, { key: 'j' })
    fireEvent.keyDown(container, { key: 'V', shiftKey: true })

    const hintsBar = screen.getByTestId('shortcuts-hint-bar')
    expect(hintsBar).toHaveTextContent('j/k')
    expect(hintsBar).toHaveTextContent('Extend')
    expect(hintsBar).toHaveTextContent('y')
    expect(hintsBar).toHaveTextContent('Yank')
    expect(hintsBar).toHaveTextContent('Esc')
    expect(hintsBar).toHaveTextContent('Exit')
  })

  it('should show V Visual hint in NORMAL editor mode hints bar', () => {
    renderItemDetailDialog({
      item: createMockItem({ comments: twoComments }),
    })

    const hintsBar = screen.getByTestId('shortcuts-hint-bar')
    expect(hintsBar).toHaveTextContent('V')
    expect(hintsBar).toHaveTextContent('Visual')
  })
})
