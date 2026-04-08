/**
 * @vitest-environment jsdom
 *
 * Unit tests for dialog-sidebar direct keyboard shortcuts.
 * Verifies that single-key shortcuts and Ctrl+N agent dispatch work
 * directly in NORMAL mode (no leader prefix).
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
      enterVisualMode: vi.fn(),
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
const mockUpdateItem = vi.fn()
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
          { name: 'plan-agent', description: 'Plans work', model: 'opus', tools: ['Read'], order: 1 },
          { name: 'code-agent', description: 'Code', model: 'sonnet', tools: ['Read'], order: 2 },
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

describe('ItemDetailDialog direct sidebar shortcuts (no leader)', () => {
  const getContainer = () => screen.getByTestId('item-detail-dialog').parentElement!

  const dialogProps = {
    isOpen: true,
    projectPath: '/test/project',
    onClose: vi.fn(),
    onUpdated: vi.fn(),
  }

  function renderDialog(overrides: Partial<KanbanItem> = {}) {
    return render(
      <ItemDetailDialog
        {...dialogProps}
        item={createMockItem(overrides)}
      />,
    )
  }

  it('should toggle browser preview with direct b key (no leader)', async () => {
    renderDialog()
    const container = getContainer()

    await act(async () => {
      fireEvent.keyDown(container, { key: 'b' })
    })

    // b toggles browser preview — checking no error occurred
    expect(container).toBeInTheDocument()
  })

  it('should delete item with direct d key (no leader)', async () => {
    mockKanbanDeleteItem.mockResolvedValue(undefined)
    renderDialog()
    const container = getContainer()

    await act(async () => {
      fireEvent.keyDown(container, { key: 'd' })
    })

    expect(mockKanbanDeleteItem).toHaveBeenCalled()
  })

  it('should toggle verified with direct p key (no leader)', async () => {
    mockUpdateItem.mockResolvedValue(undefined)
    window.electronAPI.kanban.updateItem = mockUpdateItem
    renderDialog({ verified: false })
    const container = getContainer()

    await act(async () => {
      fireEvent.keyDown(container, { key: 'p' })
    })

    const checkbox = screen.getByTestId('verified-checkbox') as HTMLInputElement
    expect(checkbox.checked).toBe(true)
  })

  it('should cycle provider with direct 1 key (no leader)', async () => {
    const overrides = { agentProvider: 'claude' as const, agentStatus: 'idle' as const }
    renderDialog(overrides)
    const container = getContainer()

    await act(async () => {
      fireEvent.keyDown(container, { key: '1' })
    })

    const select = screen.getByTestId('agent-provider-select') as HTMLSelectElement
    expect(select.value).toBe('opencode')
  })

  it('should cycle model with direct 2 key (no leader)', async () => {
    const overrides = { agentProvider: 'claude' as const, model: '', agentStatus: 'idle' as const }
    let result: ReturnType<typeof render>
    await act(async () => {
      result = renderDialog(overrides)
    })
    const container = getContainer()

    await act(async () => {
      fireEvent.keyDown(container, { key: '2' })
    })

    const select = screen.getByTestId('model-select') as HTMLSelectElement
    expect(select.value).toBe('sonnet')
  })

  it('should cycle column with direct 3 key (no leader)', async () => {
    const overrides = { column: 'backlog' as const, agentStatus: 'idle' as const }
    renderDialog(overrides)
    const container = getContainer()

    await act(async () => {
      fireEvent.keyDown(container, { key: '3' })
    })

    const select = screen.getByTestId('column-select') as HTMLSelectElement
    expect(select.value).toBe('ready')
  })

  it('should start agent N with Ctrl+1', async () => {
    const mockStart = vi.fn().mockResolvedValue({ sessionId: 'session-1' })
    window.electronAPI.agent.start = mockStart
    renderDialog({ agentStatus: 'idle' })

    // Wait for listDefinitions() promise to resolve and populate sortedAgents
    await act(async () => { await new Promise(r => setTimeout(r, 0)) })

    const container = getContainer()

    await act(async () => {
      fireEvent.keyDown(container, { key: '1', ctrlKey: true })
    })

    expect(mockStart).toHaveBeenCalledWith(
      expect.objectContaining({ agentName: 'plan-agent' }),
    )
  })

  it('should start agent 2 with Ctrl+2', async () => {
    const mockStart = vi.fn().mockResolvedValue({ sessionId: 'session-1' })
    window.electronAPI.agent.start = mockStart
    renderDialog({ agentStatus: 'idle' })

    // Wait for listDefinitions() promise to resolve and populate sortedAgents
    await act(async () => { await new Promise(r => setTimeout(r, 0)) })

    const container = getContainer()

    await act(async () => {
      fireEvent.keyDown(container, { key: '2', ctrlKey: true })
    })

    expect(mockStart).toHaveBeenCalledWith(
      expect.objectContaining({ agentName: 'code-agent' }),
    )
  })

  it('should stop agent with direct x key (no leader)', async () => {
    const mockStop = vi.fn().mockResolvedValue(undefined)
    window.electronAPI.agent.stop = mockStop
    // Need running status and a current session
    mockGetActiveSession.mockResolvedValue({ sessionId: 'session-1' })
    renderDialog({ agentStatus: 'running' })

    // Wait for async hooks to resolve (getActiveSession, listDefinitions)
    await act(async () => { await new Promise(r => setTimeout(r, 0)) })

    const container = getContainer()

    await act(async () => {
      fireEvent.keyDown(container, { key: 'x' })
    })

    expect(mockStop).toHaveBeenCalled()
  })

  it('should resume agent with direct R key (no leader)', async () => {
    const mockResume = vi.fn().mockResolvedValue({ sessionId: 'session-1' })
    window.electronAPI.agent.resume = mockResume
    renderDialog({ agentStatus: 'interrupted', activeAgentName: 'code-agent' })
    const container = getContainer()

    await act(async () => {
      fireEvent.keyDown(container, { key: 'R', shiftKey: true })
    })

    expect(mockResume).toHaveBeenCalled()
  })

  it('should not process sidebar numbered shortcuts in INSERT mode', async () => {
    const mockStart = vi.fn().mockResolvedValue({ sessionId: 'session-1' })
    window.electronAPI.agent.start = mockStart

    mockVimMode.current = 'INSERT'
    await act(async () => {
      renderDialog({ agentStatus: 'idle' })
    })
    const container = getContainer()

    await act(async () => {
      fireEvent.keyDown(container, { key: '1' })
    })

    expect(mockStart).not.toHaveBeenCalled()
  })

  it('should NOT process agent shortcuts with bare key (p does nothing)', async () => {
    const mockStart = vi.fn().mockResolvedValue({ sessionId: 'session-1' })
    window.electronAPI.agent.start = mockStart

    renderDialog({ agentStatus: 'idle' })
    const container = getContainer()

    await act(async () => {
      fireEvent.keyDown(container, { key: 'p' })
    })

    expect(mockStart).not.toHaveBeenCalled()
  })

  it('should not cycle agent provider when agent is running', async () => {
    const overrides = { agentProvider: 'claude' as const, agentStatus: 'running' as const }
    renderDialog(overrides)
    const container = getContainer()

    await act(async () => {
      fireEvent.keyDown(container, { key: '1' })
    })

    // When running, the provider is displayed as text not a select
    const display = screen.getByTestId('agent-provider-display')
    expect(display).toBeInTheDocument()
  })

  it('should navigate up with k when item has no mergeStatus', async () => {
    renderDialog({ mergeStatus: undefined })
    const container = getContainer()

    // Focus is on first navigable item by default (index 0)
    // Pressing k should attempt to navigate up via handleFieldNavKeys
    await act(async () => {
      fireEvent.keyDown(container, { key: 'k' })
    })

    // k should NOT trigger any conflict-related IPC
    expect(window.electronAPI.git.checkMergeConflicts).not.toHaveBeenCalled()
    expect(container).toBeInTheDocument()
  })

  it('should navigate up with k when item has mergeStatus (not conflict)', async () => {
    renderDialog({ mergeStatus: 'clean', worktreePath: '/tmp/wt' })
    const container = getContainer()

    await act(async () => {
      fireEvent.keyDown(container, { key: 'k' })
    })

    // k should NOT trigger checkConflicts — it should reach field navigation
    expect(window.electronAPI.git.checkMergeConflicts).not.toHaveBeenCalled()
    expect(container).toBeInTheDocument()
  })

  it('should navigate up with k when item has mergeStatus === conflict but agent is running', async () => {
    renderDialog({ mergeStatus: 'conflict', agentStatus: 'running', worktreePath: '/tmp/wt' })
    const container = getContainer()

    await act(async () => {
      fireEvent.keyDown(container, { key: 'k' })
    })

    // Agent is running so fix-conflicts can't start — k should pass through to field nav
    expect(window.electronAPI.git.checkMergeConflicts).not.toHaveBeenCalled()
    expect(container).toBeInTheDocument()
  })

  it('should trigger checkConflicts with c when item has mergeStatus', async () => {
    renderDialog({ mergeStatus: 'clean', worktreePath: '/tmp/wt' })
    const container = getContainer()

    await act(async () => {
      fireEvent.keyDown(container, { key: 'c' })
    })

    expect(window.electronAPI.git.checkMergeConflicts).toHaveBeenCalled()
  })

  it('should refocus dialog container after sidebar shortcut fires', async () => {
    mockKanbanDeleteItem.mockResolvedValue(undefined)
    renderDialog()
    const container = getContainer()

    // Focus a select
    const columnSelect = screen.getByTestId('column-select')
    columnSelect.focus()
    expect(document.activeElement).toBe(columnSelect)

    // Press d for delete (direct, no leader)
    await act(async () => {
      fireEvent.keyDown(columnSelect, { key: 'd' })
    })

    // After the shortcut fires, focus should be back on the dialog container
    expect(document.activeElement).toBe(container)
  })
})
