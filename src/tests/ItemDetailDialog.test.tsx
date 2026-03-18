/**
 * @vitest-environment jsdom
 */
import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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

  it('should flush a pending draft save when the dialog closes via Escape', async () => {
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
        key: 'Escape',
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
