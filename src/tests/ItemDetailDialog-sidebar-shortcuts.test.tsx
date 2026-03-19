/**
 * @vitest-environment jsdom
 *
 * Unit tests for the sidebar form control keyboard shortcut bug fix.
 * Verifies that single-key shortcuts and Ctrl+Shift agent shortcuts work
 * when sidebar form controls (<select>, <input>, <textarea>) have focus.
 */
import React from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ItemDetailDialog } from '@renderer/components/kanban/ItemDetailDialog'
import type { KanbanItem } from '@shared/types/kanban'

const mockVimMode = { current: 'NORMAL' as 'NORMAL' | 'INSERT' }
const mockExitToNormal = vi.fn()
const mockEnterInsertMode = vi.fn()

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
    }),
  }
})

vi.mock('@renderer/components/agent/AgentControls', () => ({
  AgentControls: ({
    item,
  }: {
    item: KanbanItem
  }) => <div data-testid="status-badge">{item.agentStatus}</div>,
}))

vi.mock('@renderer/components/code-review/GitDiffDialog', () => ({
  GitDiffDialog: () => null,
}))

vi.mock('@renderer/components/StatusBar', () => ({
  StatusBar: () => <div data-testid="status-bar-mock" />,
}))

const mockKanbanDeleteItem = vi.fn()
const mockGetActiveSession = vi.fn()
const mockRecover = vi.fn()

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
  mockGetActiveSession.mockResolvedValue(null)
  mockRecover.mockResolvedValue([])

  Object.defineProperty(window, 'electronAPI', {
    value: {
      kanban: {
        updateItem: vi.fn(),
        deleteItem: mockKanbanDeleteItem,
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
        getActiveSession: mockGetActiveSession,
        recover: mockRecover,
        readLog: vi.fn().mockResolvedValue(''),
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

describe('ItemDetailDialog sidebar form control shortcuts', () => {
  const getContainer = () => screen.getByTestId('item-detail-dialog').parentElement!

  function renderDialog(overrides: Partial<KanbanItem> = {}) {
    return render(
      <ItemDetailDialog
        isOpen={true}
        item={createMockItem(overrides)}
        projectPath="/test/project"
        onClose={vi.fn()}
        onUpdated={vi.fn()}
      />,
    )
  }

  it('should process sidebar single-key shortcuts when event.target is a <select> and focusZone is sidebar', async () => {
    const mockStart = vi.fn().mockResolvedValue({ sessionId: 'session-1' })
    window.electronAPI.agent.start = mockStart

    renderDialog({ agentStatus: 'idle' })
    const container = getContainer()

    // Switch to sidebar zone
    fireEvent.keyDown(container, { key: 'Tab' })
    expect(screen.getByTestId('sidebar-zone')).toHaveClass('ring-1')

    // Focus the column select (simulates user clicking on it)
    const columnSelect = screen.getByTestId('column-select')
    columnSelect.focus()
    expect(document.activeElement).toBe(columnSelect)

    // Press 'p' for plan-agent — should work even though a <select> has focus
    await act(async () => {
      fireEvent.keyDown(columnSelect, { key: 'p' })
    })

    expect(mockStart).toHaveBeenCalledWith(
      expect.objectContaining({ agentName: 'plan-agent' }),
    )
  })

  it('should process sidebar single-key shortcuts when event.target is an <input> checkbox and focusZone is sidebar', async () => {
    const mockStart = vi.fn().mockResolvedValue({ sessionId: 'session-1' })
    window.electronAPI.agent.start = mockStart

    renderDialog({ agentStatus: 'idle' })
    const container = getContainer()

    // Switch to sidebar zone
    fireEvent.keyDown(container, { key: 'Tab' })

    // Focus the verified checkbox
    const checkbox = screen.getByTestId('verified-checkbox')
    checkbox.focus()
    expect(document.activeElement).toBe(checkbox)

    // Press 'p' for plan-agent — should work even though checkbox has focus
    await act(async () => {
      fireEvent.keyDown(checkbox, { key: 'p' })
    })

    expect(mockStart).toHaveBeenCalledWith(
      expect.objectContaining({ agentName: 'plan-agent' }),
    )
  })

  it('should process Ctrl+Shift agent shortcuts when event.target is a <select>', async () => {
    const mockStart = vi.fn().mockResolvedValue({ sessionId: 'session-1' })
    window.electronAPI.agent.start = mockStart

    renderDialog({ agentStatus: 'idle' })

    // Focus a select element (no need to switch zone — Ctrl+Shift is zone-independent)
    const columnSelect = screen.getByTestId('column-select')
    columnSelect.focus()

    await act(async () => {
      fireEvent.keyDown(columnSelect, {
        key: 'S',
        ctrlKey: true,
        shiftKey: true,
      })
    })

    expect(mockStart).toHaveBeenCalledWith(
      expect.objectContaining({ agentName: 'scout-agent' }),
    )
  })

  it('should still block single-key shortcuts in editor zone when event.target is an <input> or <textarea>', async () => {
    const mockStart = vi.fn().mockResolvedValue({ sessionId: 'session-1' })
    window.electronAPI.agent.start = mockStart

    renderDialog({ agentStatus: 'idle' })

    // Stay in editor zone (default) — focus description textarea
    const textarea = screen.getByTestId('description-input')
    textarea.focus()

    // Press 'p' — should NOT fire any sidebar shortcut
    await act(async () => {
      fireEvent.keyDown(textarea, { key: 'p' })
    })

    expect(mockStart).not.toHaveBeenCalled()
  })

  it('should blur the focused form control and refocus dialogRef after a sidebar shortcut fires', async () => {
    mockKanbanDeleteItem.mockResolvedValue(undefined)

    renderDialog({ agentStatus: 'idle' })
    const container = getContainer()

    // Switch to sidebar zone
    fireEvent.keyDown(container, { key: 'Tab' })

    // Focus a select
    const columnSelect = screen.getByTestId('column-select')
    columnSelect.focus()
    expect(document.activeElement).toBe(columnSelect)

    // Press 'd' for delete — should fire and refocus dialog
    await act(async () => {
      fireEvent.keyDown(columnSelect, { key: 'd' })
    })

    // After the shortcut fires, focus should be back on the dialog container
    expect(document.activeElement).toBe(container)
  })
})
