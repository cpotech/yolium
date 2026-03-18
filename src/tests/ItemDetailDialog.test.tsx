/**
 * @vitest-environment jsdom
 */
import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
    const agentShortcuts: Array<{ key: string; agentName: string }> = [
      { key: 'p', agentName: 'plan-agent' },
      { key: 'c', agentName: 'code-agent' },
      { key: 'v', agentName: 'verify-agent' },
      { key: 's', agentName: 'scout-agent' },
      { key: 'd', agentName: 'design-agent' },
      { key: 'm', agentName: 'marketing-agent' },
    ]

    for (const { key, agentName } of agentShortcuts) {
      it(`should start ${agentName} when Ctrl+Shift+${key.toUpperCase()} is pressed in the item detail dialog`, async () => {
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

        expect(mockStart).toHaveBeenCalledWith(
          expect.objectContaining({ agentName }),
        )
      })
    }

    it('should not start an agent when Ctrl+Shift+P is pressed while an agent is running', async () => {
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
          key: 'P',
          ctrlKey: true,
          shiftKey: true,
        })
      })

      expect(mockStart).not.toHaveBeenCalled()
    })

    it('should not start an agent when Ctrl+Shift+P is pressed while focus is in a textarea', async () => {
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
          key: 'P',
          ctrlKey: true,
          shiftKey: true,
        })
      })

      expect(mockStart).not.toHaveBeenCalled()
    })
  })

  describe('sidebar focus zone', () => {
    const getContainer = () => screen.getByTestId('item-detail-dialog').parentElement!

    it('should initialize with focusZone set to editor', () => {
      render(
        <ItemDetailDialog
          isOpen={true}
          item={createMockItem()}
          projectPath="/test/project"
          onClose={vi.fn()}
          onUpdated={vi.fn()}
        />,
      )

      expect(screen.getByTestId('editor-zone')).toHaveClass('ring-1')
      expect(screen.getByTestId('sidebar-zone')).not.toHaveClass('ring-1')
    })

    it('should switch focusZone to sidebar when Tab is pressed in NORMAL mode', () => {
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

      expect(screen.getByTestId('sidebar-zone')).toHaveClass('ring-1')
      expect(screen.getByTestId('editor-zone')).not.toHaveClass('ring-1')
    })

    it('should switch focusZone back to editor when Tab is pressed again in NORMAL mode', () => {
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
      fireEvent.keyDown(getContainer(), { key: 'Tab' })

      expect(screen.getByTestId('editor-zone')).toHaveClass('ring-1')
      expect(screen.getByTestId('sidebar-zone')).not.toHaveClass('ring-1')
    })

    it('should show sidebar ring indicator when focusZone is sidebar', () => {
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

      const sidebar = screen.getByTestId('sidebar-zone')
      expect(sidebar).toHaveClass('ring-1')
      expect(sidebar).toHaveClass('ring-[var(--color-accent-primary)]')
    })

    it('should show editor ring indicator when focusZone is editor', () => {
      render(
        <ItemDetailDialog
          isOpen={true}
          item={createMockItem()}
          projectPath="/test/project"
          onClose={vi.fn()}
          onUpdated={vi.fn()}
        />,
      )

      const editor = screen.getByTestId('editor-zone')
      expect(editor).toHaveClass('ring-1')
      expect(editor).toHaveClass('ring-[var(--color-accent-primary)]')
    })

    it('should trigger plan-agent start when p is pressed in sidebar zone NORMAL mode with idle item', async () => {
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

      fireEvent.keyDown(getContainer(), { key: 'Tab' })

      await act(async () => {
        fireEvent.keyDown(getContainer(), { key: 'p' })
      })

      expect(mockStart).toHaveBeenCalledWith(
        expect.objectContaining({ agentName: 'plan-agent' }),
      )
    })

    it('should trigger code-agent start when c is pressed in sidebar zone NORMAL mode with idle item', async () => {
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

      fireEvent.keyDown(getContainer(), { key: 'Tab' })

      await act(async () => {
        fireEvent.keyDown(getContainer(), { key: 'c' })
      })

      expect(mockStart).toHaveBeenCalledWith(
        expect.objectContaining({ agentName: 'code-agent' }),
      )
    })

    it('should trigger verify-agent start when v is pressed in sidebar zone NORMAL mode with idle item', async () => {
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

      fireEvent.keyDown(getContainer(), { key: 'Tab' })

      await act(async () => {
        fireEvent.keyDown(getContainer(), { key: 'v' })
      })

      expect(mockStart).toHaveBeenCalledWith(
        expect.objectContaining({ agentName: 'verify-agent' }),
      )
    })

    it('should trigger scout-agent start when s is pressed in sidebar zone NORMAL mode', async () => {
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

      fireEvent.keyDown(getContainer(), { key: 'Tab' })

      await act(async () => {
        fireEvent.keyDown(getContainer(), { key: 's' })
      })

      expect(mockStart).toHaveBeenCalledWith(
        expect.objectContaining({ agentName: 'scout-agent' }),
      )
    })

    it('should trigger design-agent start when pressing Shift+D in sidebar zone NORMAL mode', async () => {
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

      fireEvent.keyDown(getContainer(), { key: 'Tab' })

      await act(async () => {
        fireEvent.keyDown(getContainer(), { key: 'D', shiftKey: true })
      })

      expect(mockStart).toHaveBeenCalledWith(
        expect.objectContaining({ agentName: 'design-agent' }),
      )
    })

    it('should trigger marketing-agent start when m is pressed in sidebar zone NORMAL mode', async () => {
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

      fireEvent.keyDown(getContainer(), { key: 'Tab' })

      await act(async () => {
        fireEvent.keyDown(getContainer(), { key: 'm' })
      })

      expect(mockStart).toHaveBeenCalledWith(
        expect.objectContaining({ agentName: 'marketing-agent' }),
      )
    })

    it('should trigger stop agent when x is pressed in sidebar zone with running agent', async () => {
      const mockStop = vi.fn()
      window.electronAPI.agent.stop = mockStop
      mockGetActiveSession.mockResolvedValue({
        sessionId: 'session-1',
        cumulativeUsage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
      })

      render(
        <ItemDetailDialog
          isOpen={true}
          item={createMockItem({ agentStatus: 'running' })}
          projectPath="/test/project"
          onClose={vi.fn()}
          onUpdated={vi.fn()}
        />,
      )

      // Wait for async reconnect to set currentSessionId
      await act(async () => {
        await new Promise(r => setTimeout(r, 0))
      })

      fireEvent.keyDown(getContainer(), { key: 'Tab' })

      await act(async () => {
        fireEvent.keyDown(getContainer(), { key: 'x' })
      })

      expect(mockStop).toHaveBeenCalledWith('session-1')
    })

    it('should trigger delete when d is pressed in sidebar zone NORMAL mode', async () => {
      mockKanbanDeleteItem.mockResolvedValue(undefined)

      render(
        <ItemDetailDialog
          isOpen={true}
          item={createMockItem({ agentStatus: 'idle' })}
          projectPath="/test/project"
          onClose={vi.fn()}
          onUpdated={vi.fn()}
        />,
      )

      fireEvent.keyDown(getContainer(), { key: 'Tab' })

      await act(async () => {
        fireEvent.keyDown(getContainer(), { key: 'd' })
      })

      expect(mockKanbanDeleteItem).toHaveBeenCalledWith('/test/project', 'item-1')
    })

    it('should not trigger single-key agent shortcuts when focusZone is editor', async () => {
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

      // Do NOT press Tab — stay in editor zone
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

      // Tab won't switch zone in INSERT mode, but even if it did, p shouldn't fire
      await act(async () => {
        fireEvent.keyDown(getContainer(), { key: 'Tab' })
        fireEvent.keyDown(getContainer(), { key: 'p' })
      })

      expect(mockStart).not.toHaveBeenCalled()
    })

    it('should not trigger single-key agent shortcuts when agent is already starting', async () => {
      // Use a never-resolving promise to keep isStartingAgent true
      const mockStart = vi.fn().mockReturnValue(new Promise(() => {}))
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

      fireEvent.keyDown(getContainer(), { key: 'Tab' })

      // Start first agent (sets isStartingAgent = true)
      await act(async () => {
        fireEvent.keyDown(getContainer(), { key: 'p' })
      })

      // Try starting another while first is still pending
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

      fireEvent.keyDown(getContainer(), { key: 'Tab' })

      await act(async () => {
        fireEvent.keyDown(getContainer(), { key: 'p' })
      })

      expect(mockStart).not.toHaveBeenCalled()
    })

    it('should still handle Ctrl+Shift agent shortcuts regardless of focusZone', async () => {
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

      // Switch to sidebar zone
      fireEvent.keyDown(getContainer(), { key: 'Tab' })

      // Ctrl+Shift+P should still work in sidebar zone
      await act(async () => {
        fireEvent.keyDown(getContainer(), {
          key: 'P',
          ctrlKey: true,
          shiftKey: true,
        })
      })

      expect(mockStart).toHaveBeenCalledWith(
        expect.objectContaining({ agentName: 'plan-agent' }),
      )
    })

    it('should switch focusZone to editor when Escape is pressed in sidebar zone', () => {
      const onClose = vi.fn()

      render(
        <ItemDetailDialog
          isOpen={true}
          item={createMockItem()}
          projectPath="/test/project"
          onClose={onClose}
          onUpdated={vi.fn()}
        />,
      )

      // Switch to sidebar
      fireEvent.keyDown(getContainer(), { key: 'Tab' })
      expect(screen.getByTestId('sidebar-zone')).toHaveClass('ring-1')

      // Escape should return to editor zone, NOT close dialog
      fireEvent.keyDown(getContainer(), { key: 'Escape' })

      expect(screen.getByTestId('editor-zone')).toHaveClass('ring-1')
      expect(onClose).not.toHaveBeenCalled()
    })

    it('should reset focusZone to editor when dialog re-opens', () => {
      const { rerender } = render(
        <ItemDetailDialog
          isOpen={true}
          item={createMockItem()}
          projectPath="/test/project"
          onClose={vi.fn()}
          onUpdated={vi.fn()}
        />,
      )

      // Switch to sidebar
      fireEvent.keyDown(getContainer(), { key: 'Tab' })
      expect(screen.getByTestId('sidebar-zone')).toHaveClass('ring-1')

      // Close dialog
      rerender(
        <ItemDetailDialog
          isOpen={false}
          item={createMockItem()}
          projectPath="/test/project"
          onClose={vi.fn()}
          onUpdated={vi.fn()}
        />,
      )

      // Reopen dialog
      rerender(
        <ItemDetailDialog
          isOpen={true}
          item={createMockItem()}
          projectPath="/test/project"
          onClose={vi.fn()}
          onUpdated={vi.fn()}
        />,
      )

      expect(screen.getByTestId('editor-zone')).toHaveClass('ring-1')
      expect(screen.getByTestId('sidebar-zone')).not.toHaveClass('ring-1')
    })

    it('should update hint bar to show sidebar shortcuts when focusZone is sidebar', () => {
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

      const hintBar = screen.getByTestId('shortcuts-hint-bar')
      expect(hintBar.textContent).toContain('Editor')
      expect(hintBar.textContent).toContain('Plan')
      expect(hintBar.textContent).toContain('Code')
      expect(hintBar.textContent).toContain('Verify')
      expect(hintBar.textContent).toContain('Stop')
      expect(hintBar.textContent).toContain('Delete')
    })

    it('should update hint bar to show editor shortcuts when focusZone is editor', () => {
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
      expect(hintBar.textContent).toContain('Navigate')
      expect(hintBar.textContent).toContain('Sidebar')
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

    it('should allow Tab to toggle zones even after focus was on a select element', async () => {
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

      // Tab should toggle zones
      fireEvent.keyDown(container, { key: 'Tab' })
      expect(screen.getByTestId('sidebar-zone')).toHaveClass('ring-1')

      fireEvent.keyDown(container, { key: 'Tab' })
      expect(screen.getByTestId('editor-zone')).toHaveClass('ring-1')
    })

    it('should block trapFocus from overriding vim Tab zone switch', () => {
      renderDialog()
      const container = getContainer()
      container.focus()

      // Press Tab in NORMAL mode — should toggle focus zone, not trigger trapFocus
      fireEvent.keyDown(container, { key: 'Tab' })

      // Focus should remain on the dialog container (not moved to a focusable child by trapFocus)
      expect(document.activeElement).toBe(container)
      // And zone should have toggled to sidebar
      expect(screen.getByTestId('sidebar-zone')).toHaveClass('ring-1')
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
})
