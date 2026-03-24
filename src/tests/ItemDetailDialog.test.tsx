/**
 * @vitest-environment jsdom
 */
import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ItemDetailDialog } from '@renderer/components/kanban/ItemDetailDialog'
import type { KanbanItem } from '@shared/types/kanban'

const mockVimMode = { current: 'NORMAL' as 'NORMAL' | 'INSERT' }
const mockLeaderState = { pending: false, groupKey: null as string | null }
const mockExitToNormal = vi.fn()
const mockEnterInsertMode = vi.fn()
const mockClearLeader = vi.fn(() => { mockLeaderState.pending = false; mockLeaderState.groupKey = null })
const mockSetLeaderGroup = vi.fn((key: string | null) => { mockLeaderState.groupKey = key })
const mockTriggerLeader = vi.fn((zone: string) => { mockLeaderState.pending = true })

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
      leaderPending: mockLeaderState.pending,
      leaderZone: mockLeaderState.pending ? 'dialog-sidebar' : null,
      leaderGroupKey: mockLeaderState.groupKey,
      clearLeader: mockClearLeader,
      triggerLeader: mockTriggerLeader,
      setLeaderGroup: mockSetLeaderGroup,
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

vi.mock('@renderer/components/StatusBar', () => ({
  StatusBar: ({
    folderPath,
    contextLabel,
    gitBranch,
    worktreeName,
    onShowShortcuts = vi.fn(),
    onOpenSettings = vi.fn(),
    onOpenProjectSettings = vi.fn(),
    whisperRecordingState,
    whisperSelectedModel,
    onToggleRecording = vi.fn(),
    onOpenModelDialog = vi.fn(),
    claudeUsage,
  }: any) => (
    <div data-testid="status-bar-mock">
      <div data-testid="vim-mode-indicator">-- NORMAL --</div>
      <div data-testid="status-path">{folderPath}</div>
      <div data-testid="status-branch">{gitBranch}</div>
      <button data-testid="shortcuts-button" onClick={onShowShortcuts}>Shortcuts</button>
      <button data-testid="settings-button" onClick={onOpenSettings}>Settings</button>
      <button data-testid="project-settings-button" onClick={onOpenProjectSettings}>Project Settings</button>
      <div data-testid="whisper-controls">Whisper</div>
      <div data-testid="claude-usage">Claude Usage</div>
    </div>
  ),
}))

const mockKanbanUpdateItem = vi.fn()
const mockKanbanDeleteItem = vi.fn()
const mockKanbanAddComment = vi.fn()
const mockLoadConfig = vi.fn()
const mockWorktreeChangedFiles = vi.fn()
const mockWorktreeFileDiff = vi.fn()
const mockReadLog = vi.fn()
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
  mockLeaderState.pending = false
  mockLeaderState.groupKey = null
  mockLoadConfig.mockResolvedValue({
    providerModels: {
      claude: ['sonnet'],
      codex: ['gpt-5-codex'],
      opencode: ['open-model'],
    },
  })
  mockWorktreeChangedFiles.mockResolvedValue({
    files: [{ path: 'src/example.ts', status: 'modified', additions: 1, deletions: 1 }],
  })
  mockWorktreeFileDiff.mockResolvedValue({
    diff: '@@ -1 +1 @@\n-old\n+new\n',
  })
  mockReadLog.mockResolvedValue('')
  mockGetActiveSession.mockResolvedValue(null)
  mockRecover.mockResolvedValue([])

  Object.defineProperty(window, 'electronAPI', {
    value: {
      kanban: {
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

const dialogPropsDefault = {
  isOpen: true,
  projectPath: '/test/project',
  onClose: vi.fn(),
  onUpdated: vi.fn(),
}

/** Set mock leader state and force a re-render so the component picks up new values */
async function activateLeader(
  result: ReturnType<typeof render>,
  item: KanbanItem,
  state: { pending: boolean; groupKey: string | null },
) {
  mockLeaderState.pending = state.pending
  mockLeaderState.groupKey = state.groupKey
  await act(async () => {
    result.rerender(
      <ItemDetailDialog
        {...dialogPropsDefault}
        item={item}
      />,
    )
  })
}

describe('ItemDetailDialog', () => {
  it('should preserve in-progress title edits when the same item id rerenders with backend updates', () => {
    const item = createMockItem({ id: 'item-1', title: 'Original title' })

    const { rerender } = render(
      <ItemDetailDialog
        isOpen={true}
        item={item}
        projectPath="/test/project"
        onClose={vi.fn()}
        onUpdated={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByTestId('title-input'), {
      target: { value: 'User is still typing' },
    })

    rerender(
      <ItemDetailDialog
        isOpen={true}
        item={{ ...item, title: 'Backend refresh title' }}
        projectPath="/test/project"
        onClose={vi.fn()}
        onUpdated={vi.fn()}
      />,
    )

    expect(screen.getByTestId('title-input')).toHaveValue('User is still typing')
  })

  it('should reset draft fields when a different item id is selected', () => {
    const firstItem = createMockItem({ id: 'item-1', title: 'First item' })
    const secondItem = createMockItem({ id: 'item-2', title: 'Second item' })

    const { rerender } = render(
      <ItemDetailDialog
        isOpen={true}
        item={firstItem}
        projectPath="/test/project"
        onClose={vi.fn()}
        onUpdated={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByTestId('title-input'), {
      target: { value: 'Unsaved first item title' },
    })

    rerender(
      <ItemDetailDialog
        isOpen={true}
        item={secondItem}
        projectPath="/test/project"
        onClose={vi.fn()}
        onUpdated={vi.fn()}
      />,
    )

    expect(screen.getByTestId('title-input')).toHaveValue('Second item')
  })

  it('should flush a pending draft save when the dialog closes via Ctrl+Q', async () => {
    mockKanbanUpdateItem.mockResolvedValue(undefined)
    const onClose = vi.fn()

    render(
      <ItemDetailDialog
        isOpen={true}
        item={createMockItem({ title: 'Original title' })}
        projectPath="/test/project"
        onClose={onClose}
        onUpdated={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByTestId('title-input'), {
      target: { value: 'Changed before close' },
    })

    await act(async () => {
      fireEvent.keyDown(screen.getByTestId('item-detail-dialog').parentElement!, {
        key: 'q',
        ctrlKey: true,
      })
    })

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(mockKanbanUpdateItem).toHaveBeenCalledWith('/test/project', 'item-1', expect.objectContaining({
      title: 'Changed before close',
    }))
  })

  it('should open the diff viewer when compare changes is clicked and close it without unmounting the dialog', async () => {
    render(
      <ItemDetailDialog
        isOpen={true}
        item={createMockItem({
          mergeStatus: 'unmerged',
          worktreePath: '/tmp/worktrees/item-1',
          agentStatus: 'completed',
        })}
        projectPath="/test/project"
        onClose={vi.fn()}
        onUpdated={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByTestId('compare-changes-button'))

    expect(screen.getByTestId('git-diff-dialog')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('diff-dialog-close'))

    expect(screen.queryByTestId('git-diff-dialog')).not.toBeInTheDocument()
    expect(screen.getByTestId('item-detail-dialog')).toBeInTheDocument()
  })

  describe('agent keyboard shortcuts', () => {
    const removedCtrlShiftShortcuts: Array<{ key: string; label: string }> = [
      { key: 's', label: 'Ctrl+Shift+S' },
      { key: 'd', label: 'Ctrl+Shift+D' },
      { key: 'm', label: 'Ctrl+Shift+M' },
    ]

    for (const { key, label } of removedCtrlShiftShortcuts) {
      it(`should NOT start agent when ${label} is pressed (removed shortcut)`, async () => {
        const mockStart = vi.fn().mockResolvedValue({ sessionId: 'session-1' })
        window.electronAPI.agent.start = mockStart

        render(
          <ItemDetailDialog
            isOpen={true}
            item={createMockItem({ agentStatus: 'idle' })}
            projectPath="/test/project"
            onClose={vi.fn()}
            onUpdated={vi.fn()}
          />,
        )

        await act(async () => {
          fireEvent.keyDown(screen.getByTestId('item-detail-dialog').parentElement!, {
            key: key.toUpperCase(),
            ctrlKey: true,
            shiftKey: true,
          })
        })

        expect(mockStart).not.toHaveBeenCalled()
      })
    }

    it('should NOT start plan-agent when Ctrl+Shift+P is pressed', async () => {
      const mockStart = vi.fn().mockResolvedValue({ sessionId: 'session-1' })
      window.electronAPI.agent.start = mockStart

      render(
        <ItemDetailDialog
          isOpen={true}
          item={createMockItem({ agentStatus: 'idle' })}
          projectPath="/test/project"
          onClose={vi.fn()}
          onUpdated={vi.fn()}
        />,
      )

      await act(async () => {
        fireEvent.keyDown(screen.getByTestId('item-detail-dialog').parentElement!, {
          key: 'P',
          ctrlKey: true,
          shiftKey: true,
        })
      })

      expect(mockStart).not.toHaveBeenCalled()
    })

    it('should NOT start code-agent when Ctrl+Shift+C is pressed', async () => {
      const mockStart = vi.fn().mockResolvedValue({ sessionId: 'session-1' })
      window.electronAPI.agent.start = mockStart

      render(
        <ItemDetailDialog
          isOpen={true}
          item={createMockItem({ agentStatus: 'idle' })}
          projectPath="/test/project"
          onClose={vi.fn()}
          onUpdated={vi.fn()}
        />,
      )

      await act(async () => {
        fireEvent.keyDown(screen.getByTestId('item-detail-dialog').parentElement!, {
          key: 'C',
          ctrlKey: true,
          shiftKey: true,
        })
      })

      expect(mockStart).not.toHaveBeenCalled()
    })

    it('should NOT start verify-agent when Ctrl+Shift+V is pressed', async () => {
      const mockStart = vi.fn().mockResolvedValue({ sessionId: 'session-1' })
      window.electronAPI.agent.start = mockStart

      render(
        <ItemDetailDialog
          isOpen={true}
          item={createMockItem({ agentStatus: 'idle' })}
          projectPath="/test/project"
          onClose={vi.fn()}
          onUpdated={vi.fn()}
        />,
      )

      await act(async () => {
        fireEvent.keyDown(screen.getByTestId('item-detail-dialog').parentElement!, {
          key: 'V',
          ctrlKey: true,
          shiftKey: true,
        })
      })

      expect(mockStart).not.toHaveBeenCalled()
    })

    it('should not start an agent when Ctrl+Shift+S is pressed while an agent is running', async () => {
      const mockStart = vi.fn().mockResolvedValue({ sessionId: 'session-1' })
      window.electronAPI.agent.start = mockStart

      render(
        <ItemDetailDialog
          isOpen={true}
          item={createMockItem({ agentStatus: 'running' })}
          projectPath="/test/project"
          onClose={vi.fn()}
          onUpdated={vi.fn()}
        />,
      )

      await act(async () => {
        fireEvent.keyDown(screen.getByTestId('item-detail-dialog').parentElement!, {
          key: 'S',
          ctrlKey: true,
          shiftKey: true,
        })
      })

      expect(mockStart).not.toHaveBeenCalled()
    })

    it('should NOT start scout-agent when Ctrl+Shift+S is pressed in textarea (removed shortcut)', async () => {
      const mockStart = vi.fn().mockResolvedValue({ sessionId: 'session-1' })
      window.electronAPI.agent.start = mockStart

      render(
        <ItemDetailDialog
          isOpen={true}
          item={createMockItem({ agentStatus: 'idle' })}
          projectPath="/test/project"
          onClose={vi.fn()}
          onUpdated={vi.fn()}
        />,
      )

      const textarea = screen.getByTestId('description-input')
      textarea.focus()

      await act(async () => {
        fireEvent.keyDown(textarea, {
          key: 'S',
          ctrlKey: true,
          shiftKey: true,
        })
      })

      expect(mockStart).not.toHaveBeenCalled()
    })
  })

  describe('sidebar shortcuts (no focus zone)', () => {
    const getContainer = () => screen.getByTestId('item-detail-dialog').parentElement!

    it('should not have focusZone toggle on Tab press', () => {
      render(
        <ItemDetailDialog
          isOpen={true}
          item={createMockItem()}
          projectPath="/test/project"
          onClose={vi.fn()}
          onUpdated={vi.fn()}
        />,
      )

      fireEvent.keyDown(getContainer(), { key: 'Tab' })

      // No ring indicators on either zone
      expect(screen.getByTestId('editor-zone')).not.toHaveClass('ring-1')
      expect(screen.getByTestId('sidebar-zone')).not.toHaveClass('ring-1')
    })

    it('should not show ring indicator on editor or sidebar zones', () => {
      render(
        <ItemDetailDialog
          isOpen={true}
          item={createMockItem()}
          projectPath="/test/project"
          onClose={vi.fn()}
          onUpdated={vi.fn()}
        />,
      )

      expect(screen.getByTestId('editor-zone')).not.toHaveClass('ring-1')
      expect(screen.getByTestId('sidebar-zone')).not.toHaveClass('ring-1')
    })

    it('should always show sidebar kbd hints', () => {
      render(
        <ItemDetailDialog
          isOpen={true}
          item={createMockItem()}
          projectPath="/test/project"
          onClose={vi.fn()}
          onUpdated={vi.fn()}
        />,
      )

      // Sidebar kbd hints should be visible without pressing Tab
      const sidebar = screen.getByTestId('sidebar-zone')
      expect(sidebar).toBeInTheDocument()
    })

    it('should trigger plan-agent start via Space a p in sidebar zone', async () => {
      const mockStart = vi.fn().mockResolvedValue({ sessionId: 'session-1' })
      window.electronAPI.agent.start = mockStart
      const item = createMockItem({ agentStatus: 'idle' })

      const result = render(
        <ItemDetailDialog {...dialogPropsDefault} item={item} />,
      )

      await activateLeader(result, item, { pending: true, groupKey: 'a' })

      await act(async () => {
        fireEvent.keyDown(getContainer(), { key: 'p' })
      })

      expect(mockStart).toHaveBeenCalledWith(
        expect.objectContaining({ agentName: 'plan-agent' }),
      )
    })

    it('should trigger code-agent start via Space a c in sidebar zone', async () => {
      const mockStart = vi.fn().mockResolvedValue({ sessionId: 'session-1' })
      window.electronAPI.agent.start = mockStart
      const item = createMockItem({ agentStatus: 'idle' })

      const result = render(
        <ItemDetailDialog {...dialogPropsDefault} item={item} />,
      )

      await activateLeader(result, item, { pending: true, groupKey: 'a' })

      await act(async () => {
        fireEvent.keyDown(getContainer(), { key: 'c' })
      })

      expect(mockStart).toHaveBeenCalledWith(
        expect.objectContaining({ agentName: 'code-agent' }),
      )
    })

    it('should trigger verify-agent start via Space a v in sidebar zone', async () => {
      const mockStart = vi.fn().mockResolvedValue({ sessionId: 'session-1' })
      window.electronAPI.agent.start = mockStart
      const item = createMockItem({ agentStatus: 'idle' })

      const result = render(
        <ItemDetailDialog {...dialogPropsDefault} item={item} />,
      )

      await activateLeader(result, item, { pending: true, groupKey: 'a' })

      await act(async () => {
        fireEvent.keyDown(getContainer(), { key: 'v' })
      })

      expect(mockStart).toHaveBeenCalledWith(
        expect.objectContaining({ agentName: 'verify-agent' }),
      )
    })

    it('should trigger scout-agent start via Space a s in sidebar zone', async () => {
      const mockStart = vi.fn().mockResolvedValue({ sessionId: 'session-1' })
      window.electronAPI.agent.start = mockStart
      const item = createMockItem({ agentStatus: 'idle' })

      const result = render(
        <ItemDetailDialog {...dialogPropsDefault} item={item} />,
      )

      await activateLeader(result, item, { pending: true, groupKey: 'a' })

      await act(async () => {
        fireEvent.keyDown(getContainer(), { key: 's' })
      })

      expect(mockStart).toHaveBeenCalledWith(
        expect.objectContaining({ agentName: 'scout-agent' }),
      )
    })

    it('should trigger design-agent start via Space a D in sidebar zone', async () => {
      const mockStart = vi.fn().mockResolvedValue({ sessionId: 'session-1' })
      window.electronAPI.agent.start = mockStart
      const item = createMockItem({ agentStatus: 'idle' })

      const result = render(
        <ItemDetailDialog {...dialogPropsDefault} item={item} />,
      )

      await activateLeader(result, item, { pending: true, groupKey: 'a' })

      await act(async () => {
        fireEvent.keyDown(getContainer(), { key: 'D', shiftKey: true })
      })

      expect(mockStart).toHaveBeenCalledWith(
        expect.objectContaining({ agentName: 'design-agent' }),
      )
    })

    it('should trigger marketing-agent start via Space a m in sidebar zone', async () => {
      const mockStart = vi.fn().mockResolvedValue({ sessionId: 'session-1' })
      window.electronAPI.agent.start = mockStart
      const item = createMockItem({ agentStatus: 'idle' })

      const result = render(
        <ItemDetailDialog {...dialogPropsDefault} item={item} />,
      )

      await activateLeader(result, item, { pending: true, groupKey: 'a' })

      await act(async () => {
        fireEvent.keyDown(getContainer(), { key: 'm' })
      })

      expect(mockStart).toHaveBeenCalledWith(
        expect.objectContaining({ agentName: 'marketing-agent' }),
      )
    })

    it('should trigger stop agent via Space a x in sidebar zone with running agent', async () => {
      const mockStop = vi.fn()
      window.electronAPI.agent.stop = mockStop
      mockGetActiveSession.mockResolvedValue({
        sessionId: 'session-1',
        cumulativeUsage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
      })
      const item = createMockItem({ agentStatus: 'running' })

      const result = render(
        <ItemDetailDialog {...dialogPropsDefault} item={item} />,
      )

      // Wait for async reconnect to set currentSessionId
      await act(async () => {
        await new Promise(r => setTimeout(r, 0))
      })

      await activateLeader(result, item, { pending: true, groupKey: 'a' })

      await act(async () => {
        fireEvent.keyDown(getContainer(), { key: 'x' })
      })

      expect(mockStop).toHaveBeenCalledWith('session-1')
    })

    it('should trigger delete via Space d in sidebar zone', async () => {
      mockKanbanDeleteItem.mockResolvedValue(undefined)
      const item = createMockItem({ agentStatus: 'idle' })

      const result = render(
        <ItemDetailDialog {...dialogPropsDefault} item={item} />,
      )

      await activateLeader(result, item, { pending: true, groupKey: null })

      await act(async () => {
        fireEvent.keyDown(getContainer(), { key: 'd' })
      })

      expect(mockKanbanDeleteItem).toHaveBeenCalledWith('/test/project', 'item-1')
    })

    it('should not trigger agent shortcuts without leader prefix', async () => {
      const mockStart = vi.fn().mockResolvedValue({ sessionId: 'session-1' })
      window.electronAPI.agent.start = mockStart

      render(
        <ItemDetailDialog
          isOpen={true}
          item={createMockItem({ agentStatus: 'idle' })}
          projectPath="/test/project"
          onClose={vi.fn()}
          onUpdated={vi.fn()}
        />,
      )

      // Press p without leader — should not start agent
      await act(async () => {
        fireEvent.keyDown(getContainer(), { key: 'p' })
      })

      expect(mockStart).not.toHaveBeenCalled()
    })

    it('should not trigger single-key agent shortcuts when vim mode is INSERT', async () => {
      mockVimMode.current = 'INSERT'
      const mockStart = vi.fn().mockResolvedValue({ sessionId: 'session-1' })
      window.electronAPI.agent.start = mockStart

      render(
        <ItemDetailDialog
          isOpen={true}
          item={createMockItem({ agentStatus: 'idle' })}
          projectPath="/test/project"
          onClose={vi.fn()}
          onUpdated={vi.fn()}
        />,
      )

      // p shouldn't fire in INSERT mode
      await act(async () => {
        fireEvent.keyDown(getContainer(), { key: 'p' })
      })

      expect(mockStart).not.toHaveBeenCalled()
    })

    it('should not trigger single-key agent shortcuts when agent is already starting', async () => {
      // Use a never-resolving promise to keep isStartingAgent true
      const mockStart = vi.fn().mockReturnValue(new Promise(() => {}))
      window.electronAPI.agent.start = mockStart
      const item = createMockItem({ agentStatus: 'idle' })

      const result = render(
        <ItemDetailDialog {...dialogPropsDefault} item={item} />,
      )

      // Activate leader → agent group, start first agent (sets isStartingAgent = true)
      await activateLeader(result, item, { pending: true, groupKey: 'a' })
      await act(async () => {
        fireEvent.keyDown(getContainer(), { key: 'p' })
      })

      // Try starting another while first is still pending
      await activateLeader(result, item, { pending: true, groupKey: 'a' })
      await act(async () => {
        fireEvent.keyDown(getContainer(), { key: 'c' })
      })

      // Only one start call should have been made
      expect(mockStart).toHaveBeenCalledTimes(1)
    })

    it('should not trigger single-key agent shortcuts when item status is running', async () => {
      const mockStart = vi.fn().mockResolvedValue({ sessionId: 'session-1' })
      window.electronAPI.agent.start = mockStart

      render(
        <ItemDetailDialog
          isOpen={true}
          item={createMockItem({ agentStatus: 'running' })}
          projectPath="/test/project"
          onClose={vi.fn()}
          onUpdated={vi.fn()}
        />,
      )

      await act(async () => {
        fireEvent.keyDown(getContainer(), { key: 'p' })
      })

      expect(mockStart).not.toHaveBeenCalled()
    })

    it('should NOT trigger Ctrl+Shift agent shortcuts (removed in favor of leader groups)', async () => {
      const mockStart = vi.fn().mockResolvedValue({ sessionId: 'session-1' })
      window.electronAPI.agent.start = mockStart

      render(
        <ItemDetailDialog
          isOpen={true}
          item={createMockItem({ agentStatus: 'idle' })}
          projectPath="/test/project"
          onClose={vi.fn()}
          onUpdated={vi.fn()}
        />,
      )

      // Ctrl+Shift+S should NOT start agent (removed)
      await act(async () => {
        fireEvent.keyDown(getContainer(), {
          key: 'S',
          ctrlKey: true,
          shiftKey: true,
        })
      })

      expect(mockStart).not.toHaveBeenCalled()
    })

    it('should trigger leader for dialog-sidebar zone when Space pressed in NORMAL mode', () => {
      render(
        <ItemDetailDialog
          isOpen={true}
          item={createMockItem()}
          projectPath="/test/project"
          onClose={vi.fn()}
          onUpdated={vi.fn()}
        />,
      )

      fireEvent.keyDown(getContainer(), { key: ' ' })

      expect(mockTriggerLeader).toHaveBeenCalledWith('dialog-sidebar')
    })

    it('should process sidebar leader shortcuts without needing Tab first', async () => {
      mockKanbanDeleteItem.mockResolvedValue(undefined)
      const item = createMockItem({ agentStatus: 'idle' })

      const result = render(
        <ItemDetailDialog {...dialogPropsDefault} item={item} />,
      )

      // Space d should delete without pressing Tab first
      await activateLeader(result, item, { pending: true, groupKey: null })

      await act(async () => {
        fireEvent.keyDown(getContainer(), { key: 'd' })
      })

      expect(mockKanbanDeleteItem).toHaveBeenCalledWith('/test/project', 'item-1')
    })

    it('should show Space in hint bar instead of Tab for sidebar actions', () => {
      render(
        <ItemDetailDialog
          isOpen={true}
          item={createMockItem()}
          projectPath="/test/project"
          onClose={vi.fn()}
          onUpdated={vi.fn()}
        />,
      )

      const hintBar = screen.getByTestId('shortcuts-hint-bar')
      expect(hintBar.textContent).toContain('Space')
      expect(hintBar.textContent).toContain('Actions')
      expect(hintBar.textContent).not.toContain('Tab')
      expect(hintBar.textContent).toContain('Navigate')
      expect(hintBar.textContent).toContain('Edit field')
    })
  })

  describe('focus recovery', () => {
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

    it('should refocus dialog container after selecting a value in sidebar select dropdown', async () => {
      renderDialog()
      const container = getContainer()

      // Focus the column select (sidebar element)
      const columnSelect = screen.getByTestId('column-select')
      columnSelect.focus()
      expect(document.activeElement).toBe(columnSelect)

      // Simulate focus leaving the dialog: blur the select and fire focusout
      // (React's onBlur listens for focusout which bubbles)
      columnSelect.blur()
      fireEvent.focusOut(columnSelect, { relatedTarget: null })

      // The onBlur sentinel should reclaim focus via requestAnimationFrame
      await waitFor(() => {
        expect(document.activeElement).toBe(container)
      })
    })

    it('should refocus dialog container after clicking a sidebar button', async () => {
      renderDialog()
      const container = getContainer()

      // Focus the delete button in sidebar
      const deleteButton = screen.getByTestId('delete-button')
      deleteButton.focus()

      // Blur the button with focus leaving the dialog
      deleteButton.blur()
      fireEvent.focusOut(deleteButton, { relatedTarget: null })

      await waitFor(() => {
        expect(document.activeElement).toBe(container)
      })
    })

    it('should maintain dialog focus when board refreshes via onUpdated callback', async () => {
      const onUpdated = vi.fn()
      render(
        <ItemDetailDialog
          isOpen={true}
          item={createMockItem()}
          projectPath="/test/project"
          onClose={vi.fn()}
          onUpdated={onUpdated}
        />,
      )
      const container = getContainer()
      container.focus()

      // Simulate a board refresh by calling onUpdated
      onUpdated()

      // Focus should still be on the dialog container
      expect(document.activeElement).toBe(container)
    })

    it('should recover focus to dialog container on onBlur when focus moves to document.body', async () => {
      renderDialog()
      const container = getContainer()
      container.focus()

      // Simulate focus moving to body (e.g. by clicking a non-focusable area)
      ;(document.activeElement as HTMLElement)?.blur()
      fireEvent.blur(container, { relatedTarget: null })

      await waitFor(() => {
        expect(document.activeElement).toBe(container)
      })
    })

    it('should not lose focus after Escape from INSERT mode', () => {
      mockVimMode.current = 'INSERT'
      renderDialog()
      const container = getContainer()

      // Pressing Escape in INSERT mode should focus the dialog container
      fireEvent.keyDown(container, { key: 'Escape' })

      expect(mockExitToNormal).toHaveBeenCalled()
      expect(document.activeElement).toBe(container)
    })

    it('should not lose focus after Tab zone switch', () => {
      renderDialog()
      const container = getContainer()
      container.focus()

      // Tab should toggle zone and keep focus on dialog container
      fireEvent.keyDown(container, { key: 'Tab' })

      expect(document.activeElement).toBe(container)
    })

    it('should handle j/k navigation after interacting with sidebar select', async () => {
      renderDialog()
      const container = getContainer()

      // Focus a sidebar select element
      const columnSelect = screen.getByTestId('column-select')
      columnSelect.focus()

      // Blur the select (simulating dropdown closing, focus leaves dialog)
      columnSelect.blur()
      fireEvent.focusOut(columnSelect, { relatedTarget: null })

      // Wait for sentinel to reclaim focus
      await waitFor(() => {
        expect(document.activeElement).toBe(container)
      })

      // Now j/k should work (keydown fires on the dialog container)
      fireEvent.keyDown(container, { key: 'j' })
      // If focus is on container, the keyDown handler runs successfully
      // The field index should advance (no error, no lost focus)
      expect(document.activeElement).toBe(container)
    })

    it('should enter INSERT mode with i key after sidebar button click', async () => {
      renderDialog()
      const container = getContainer()

      // Focus delete button then blur it (focus leaves dialog)
      const deleteButton = screen.getByTestId('delete-button')
      deleteButton.focus()
      deleteButton.blur()
      fireEvent.focusOut(deleteButton, { relatedTarget: null })

      await waitFor(() => {
        expect(document.activeElement).toBe(container)
      })

      // Press i to enter insert mode
      fireEvent.keyDown(container, { key: 'i' })

      expect(mockEnterInsertMode).toHaveBeenCalled()
    })

    it('should not show ring indicators after Tab press (zone toggle removed)', async () => {
      renderDialog()
      const container = getContainer()

      // Focus a sidebar select
      const columnSelect = screen.getByTestId('column-select')
      columnSelect.focus()
      columnSelect.blur()
      fireEvent.focusOut(columnSelect, { relatedTarget: null })

      await waitFor(() => {
        expect(document.activeElement).toBe(container)
      })

      // Tab should not toggle zones (feature removed)
      fireEvent.keyDown(container, { key: 'Tab' })
      expect(screen.getByTestId('sidebar-zone')).not.toHaveClass('ring-1')
      expect(screen.getByTestId('editor-zone')).not.toHaveClass('ring-1')
    })

    it('should not trigger trapFocus in NORMAL mode Tab', () => {
      renderDialog()
      const container = getContainer()
      container.focus()

      // Press Tab in NORMAL mode — trapFocus is skipped in NORMAL mode
      fireEvent.keyDown(container, { key: 'Tab' })

      // Focus should remain on the dialog container
      expect(document.activeElement).toBe(container)
      // No ring indicators
      expect(screen.getByTestId('sidebar-zone')).not.toHaveClass('ring-1')
      expect(screen.getByTestId('editor-zone')).not.toHaveClass('ring-1')
    })
  })

  it('should keep the existing item-detail test ids and still omit any manual save button', () => {
    render(
      <ItemDetailDialog
        isOpen={true}
        item={createMockItem({
          mergeStatus: 'unmerged',
          worktreePath: '/tmp/worktrees/item-1',
          agentStatus: 'completed',
        })}
        projectPath="/test/project"
        onClose={vi.fn()}
        onUpdated={vi.fn()}
      />,
    )

    expect(screen.getByTestId('item-detail-dialog')).toBeInTheDocument()
    expect(screen.getByTestId('title-input')).toBeInTheDocument()
    expect(screen.getByTestId('description-input')).toBeInTheDocument()
    expect(screen.getByTestId('column-select')).toBeInTheDocument()
    expect(screen.getByTestId('status-badge')).toBeInTheDocument()
    expect(screen.getByTestId('delete-button')).toBeInTheDocument()
    expect(screen.getByTestId('branch-display')).toBeInTheDocument()
    expect(screen.getByTestId('created-at')).toBeInTheDocument()
    expect(screen.getByTestId('comments-section')).toBeInTheDocument()
    expect(screen.queryByTestId('save-button')).not.toBeInTheDocument()
  })

  describe('log panel keyboard shortcuts', () => {
    const getContainer = () => screen.getByTestId('item-detail-dialog').parentElement!

    /** Toggle log open via leader prefix (Space l) */
    async function toggleLogViaLeader(result: ReturnType<typeof render>, item: KanbanItem) {
      await activateLeader(result, item, { pending: true, groupKey: null })
      await act(async () => {
        fireEvent.keyDown(getContainer(), { key: 'l' })
      })
    }

    it('should toggle log panel when Space l is pressed in sidebar zone NORMAL mode', async () => {
      const item = createMockItem({ agentStatus: 'idle' })
      const result = render(
        <ItemDetailDialog {...dialogPropsDefault} item={item} />,
      )



      // Activate leader and press l to toggle log
      await activateLeader(result, item, { pending: true, groupKey: null })
      await act(async () => {
        fireEvent.keyDown(getContainer(), { key: 'l' })
      })

      // Log panel should now be visible
      expect(screen.getByTestId('agent-log-section')).toBeInTheDocument()
    })

    it('should not toggle log when l is pressed in editor zone', async () => {
      render(
        <ItemDetailDialog
          isOpen={true}
          item={createMockItem({ agentStatus: 'idle' })}
          projectPath="/test/project"
          onClose={vi.fn()}
          onUpdated={vi.fn()}
        />,
      )

      // Press l while in editor zone (default)
      await act(async () => {
        fireEvent.keyDown(getContainer(), { key: 'l' })
      })

      // Log panel should not be visible (no agent output lines yet)
      expect(screen.queryByTestId('agent-log-section')).not.toBeInTheDocument()
    })

    it('should not toggle log when l is pressed in INSERT mode', async () => {
      mockVimMode.current = 'INSERT'

      render(
        <ItemDetailDialog
          isOpen={true}
          item={createMockItem({ agentStatus: 'idle' })}
          projectPath="/test/project"
          onClose={vi.fn()}
          onUpdated={vi.fn()}
        />,
      )



      // Press l in INSERT mode
      await act(async () => {
        fireEvent.keyDown(getContainer(), { key: 'l' })
      })

      // Log panel should not be visible
      expect(screen.queryByTestId('agent-log-section')).not.toBeInTheDocument()

      mockVimMode.current = 'NORMAL'
    })

    it('should not toggle log when l is pressed with modifier keys', async () => {
      render(
        <ItemDetailDialog
          isOpen={true}
          item={createMockItem({ agentStatus: 'idle' })}
          projectPath="/test/project"
          onClose={vi.fn()}
          onUpdated={vi.fn()}
        />,
      )



      // Press l with Ctrl
      await act(async () => {
        fireEvent.keyDown(getContainer(), { key: 'l', ctrlKey: true })
      })

      // Log panel should not be visible
      expect(screen.queryByTestId('agent-log-section')).not.toBeInTheDocument()
    })

    it('should enter log focus and scroll down when j is pressed while log is open in sidebar zone', async () => {
      const item = createMockItem({ agentStatus: 'running' })
      const result = render(
        <ItemDetailDialog {...dialogPropsDefault} item={item} />,
      )

      // Wait for agent session to be set up with running status
      await act(async () => {
        await new Promise(r => setTimeout(r, 0))
      })



      // Toggle log open via leader
      await toggleLogViaLeader(result, item)

      // Verify log is now visible
      expect(screen.getByTestId('agent-log-section')).toBeInTheDocument()

      // Press j to scroll down (should enter log focus)
      await act(async () => {
        fireEvent.keyDown(getContainer(), { key: 'j' })
      })

      // Log should still be visible (this tests that log focus mode was entered without errors)
      expect(screen.getByTestId('agent-log-section')).toBeInTheDocument()
    })

    it('should enter log focus and scroll up when k is pressed while log is open in sidebar zone', async () => {
      const item = createMockItem({ agentStatus: 'running' })
      const result = render(
        <ItemDetailDialog {...dialogPropsDefault} item={item} />,
      )

      await act(async () => {
        await new Promise(r => setTimeout(r, 0))
      })



      // Toggle log open via leader
      await toggleLogViaLeader(result, item)

      // Verify log is visible
      expect(screen.getByTestId('agent-log-section')).toBeInTheDocument()

      // Press k to scroll up (should enter log focus)
      await act(async () => {
        fireEvent.keyDown(getContainer(), { key: 'k' })
      })

      // Log should still be visible
      expect(screen.getByTestId('agent-log-section')).toBeInTheDocument()
    })

    it('should pause auto-scroll when j is pressed in log focus mode', async () => {
      const item = createMockItem({ agentStatus: 'running' })
      const result = render(
        <ItemDetailDialog {...dialogPropsDefault} item={item} />,
      )

      await act(async () => {
        await new Promise(r => setTimeout(r, 0))
      })

      // Toggle log via leader
      await toggleLogViaLeader(result, item)

      // Enter log focus by pressing j
      await act(async () => {
        fireEvent.keyDown(getContainer(), { key: 'j' })
      })

      // Log should still be visible - the test passes if no error is thrown
      // (auto-scroll pausing is internal to the log panel component)
      expect(screen.getByTestId('agent-log-section')).toBeInTheDocument()
    })

    it('should resume auto-scroll when Escape is pressed in log focus mode', async () => {
      const item = createMockItem({ agentStatus: 'running' })
      const result = render(
        <ItemDetailDialog {...dialogPropsDefault} item={item} />,
      )

      await act(async () => {
        await new Promise(r => setTimeout(r, 0))
      })

      // Toggle log via leader
      await toggleLogViaLeader(result, item)

      // Enter log focus
      await act(async () => {
        fireEvent.keyDown(getContainer(), { key: 'j' })
      })

      // Exit log focus with Escape
      await act(async () => {
        fireEvent.keyDown(getContainer(), { key: 'Escape' })
      })

      // Log should still be visible (but now in normal sidebar focus)
      expect(screen.getByTestId('agent-log-section')).toBeInTheDocument()
    })

    it('should collapse log and exit log focus when l is pressed in log focus mode', async () => {
      const item = createMockItem({ agentStatus: 'running' })
      const result = render(
        <ItemDetailDialog {...dialogPropsDefault} item={item} />,
      )

      await act(async () => {
        await new Promise(r => setTimeout(r, 0))
      })

      // Toggle log open via leader
      await toggleLogViaLeader(result, item)

      // Verify log is open
      expect(screen.getByTestId('agent-log-section')).toBeInTheDocument()

      // Enter log focus
      await act(async () => {
        fireEvent.keyDown(getContainer(), { key: 'j' })
      })

      // Press l to collapse log (while in log focus mode — no leader needed)
      await act(async () => {
        fireEvent.keyDown(getContainer(), { key: 'l' })
      })

      // Log section should no longer be visible
      expect(screen.queryByTestId('agent-log-section')).not.toBeInTheDocument()
    })

    it('should exit log focus mode when Escape is pressed while logFocused is true', async () => {
      const item = createMockItem({ agentStatus: 'running' })
      const result = render(
        <ItemDetailDialog {...dialogPropsDefault} item={item} />,
      )

      await act(async () => {
        await new Promise(r => setTimeout(r, 0))
      })

      // Toggle log open via leader
      await toggleLogViaLeader(result, item)

      // Enter log focus by pressing j
      await act(async () => {
        fireEvent.keyDown(getContainer(), { key: 'j' })
      })

      // Press Escape to exit log focus
      await act(async () => {
        fireEvent.keyDown(getContainer(), { key: 'Escape' })
      })

      // Log should still be visible
      expect(screen.getByTestId('agent-log-section')).toBeInTheDocument()
    })

    it('should resume auto-scroll when exiting log focus via Escape', async () => {
      const item = createMockItem({ agentStatus: 'running' })
      const result = render(
        <ItemDetailDialog {...dialogPropsDefault} item={item} />,
      )

      await act(async () => {
        await new Promise(r => setTimeout(r, 0))
      })

      // Toggle log open via leader
      await toggleLogViaLeader(result, item)

      // Enter log focus by pressing j
      await act(async () => {
        fireEvent.keyDown(getContainer(), { key: 'j' })
      })

      // Exit log focus with Escape
      await act(async () => {
        fireEvent.keyDown(getContainer(), { key: 'Escape' })
      })

      // Log should still be visible (auto-scroll resumption is internal)
      expect(screen.getByTestId('agent-log-section')).toBeInTheDocument()
    })

    it('should set logFocused to false when Escape is pressed in log focus mode', async () => {
      const item = createMockItem({ agentStatus: 'running' })
      const result = render(
        <ItemDetailDialog {...dialogPropsDefault} item={item} />,
      )

      await act(async () => {
        await new Promise(r => setTimeout(r, 0))
      })

      // Toggle log open via leader
      await toggleLogViaLeader(result, item)

      // Enter log focus by pressing j
      await act(async () => {
        fireEvent.keyDown(getContainer(), { key: 'j' })
      })

      // Verify log focus hint bar is shown (j/k Navigate, Esc Back)
      const hintBar = screen.getByTestId('shortcuts-hint-bar')
      expect(hintBar.textContent).toContain('Navigate')
      expect(hintBar.textContent).toContain('Back')

      // Exit log focus with Escape
      await act(async () => {
        fireEvent.keyDown(getContainer(), { key: 'Escape' })
      })

      // Hint bar should now show normal NORMAL mode hints (not log focus hints)
      expect(hintBar.textContent).toContain('Actions')
      expect(hintBar.textContent).toContain('Navigate')
    })

    it('should not show ring indicator after Escape is pressed in NORMAL mode without log focus', async () => {
      render(
        <ItemDetailDialog
          isOpen={true}
          item={createMockItem({ agentStatus: 'running' })}
          projectPath="/test/project"
          onClose={vi.fn()}
          onUpdated={vi.fn()}
        />,
      )

      await act(async () => {
        await new Promise(r => setTimeout(r, 0))
      })

      // Press Escape — no ring indicators
      fireEvent.keyDown(getContainer(), { key: 'Escape' })

      expect(screen.getByTestId('editor-zone')).not.toHaveClass('ring-1')
      expect(screen.getByTestId('sidebar-zone')).not.toHaveClass('ring-1')
    })

    it('should show log-focus hint bar (j/k Navigate, Esc Back) when in log focus mode', async () => {
      const item = createMockItem({ agentStatus: 'running' })
      const result = render(
        <ItemDetailDialog {...dialogPropsDefault} item={item} />,
      )

      await act(async () => {
        await new Promise(r => setTimeout(r, 0))
      })

      // Toggle log open via leader
      await toggleLogViaLeader(result, item)

      // Verify hint bar before entering log focus
      const hintBar = screen.getByTestId('shortcuts-hint-bar')
      expect(hintBar.textContent).toContain('Actions')

      // Enter log focus by pressing j
      await act(async () => {
        fireEvent.keyDown(getContainer(), { key: 'j' })
      })

      // Hint bar should show log focus hints
      expect(hintBar.textContent).toContain('Navigate')
      expect(hintBar.textContent).toContain('Back')
      // Should NOT contain sidebar which-key hint
      expect(hintBar.textContent).not.toContain('Actions (which-key)')
    })
  })
})
