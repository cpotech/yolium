/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useItemDetailPrWorkflow } from '@renderer/components/kanban/item-detail/useItemDetailPrWorkflow'
import type { KanbanItem } from '@shared/types/kanban'

// Mock VimModeContext (used by useConfirmDialog)
vi.mock('@renderer/context/VimModeContext', () => ({
  useSuspendVimNavigation: vi.fn(),
}))

const mockElectronAPI = {
  git: {
    worktreeDiffStats: vi.fn(),
    mergeBranch: vi.fn(),
    cleanupWorktree: vi.fn(),
    checkMergeConflicts: vi.fn(),
    rebaseOntoDefault: vi.fn(),
    mergeAndPushPR: vi.fn(),
    approvePR: vi.fn(),
    mergePR: vi.fn(),
  },
  kanban: {
    updateItem: vi.fn(),
    addComment: vi.fn(),
  },
  dialog: {
    confirm: vi.fn(),
  },
  app: {
    openExternal: vi.fn(),
  },
}

Object.defineProperty(window, 'electronAPI', {
  value: mockElectronAPI,
  writable: true,
})

function makeItem(overrides: Partial<KanbanItem> = {}): KanbanItem {
  return {
    id: 'item-1',
    title: 'Test Item',
    description: '',
    column: 'done',
    branch: 'feature-branch',
    worktreePath: '/tmp/worktree',
    mergeStatus: 'unmerged',
    agentStatus: 'completed',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  } as KanbanItem
}

/** Helper to invoke mergeLocally and confirm (or cancel) the dialog */
async function invokeMergeLocally(
  result: { current: ReturnType<typeof useItemDetailPrWorkflow> },
  action: 'confirm' | 'cancel' = 'confirm',
) {
  let mergePromise: Promise<void>
  await act(async () => {
    mergePromise = result.current.mergeLocally()
  })
  // Wait for the confirm dialog to open
  await vi.waitFor(() => {
    expect(result.current.confirmDialogProps.isOpen).toBe(true)
  })
  // Confirm or cancel
  await act(async () => {
    if (action === 'confirm') {
      result.current.confirmDialogProps.onConfirm()
    } else {
      result.current.confirmDialogProps.onCancel()
    }
  })
  await act(async () => {
    await mergePromise!
  })
}

describe('mergeLocally', () => {
  const onUpdated = vi.fn()
  const setErrorMessage = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockElectronAPI.git.worktreeDiffStats.mockResolvedValue({
      filesChanged: 3,
      insertions: 42,
      deletions: 10,
    })
    mockElectronAPI.git.mergeBranch.mockResolvedValue({ success: true })
    mockElectronAPI.git.cleanupWorktree.mockResolvedValue(undefined)
    mockElectronAPI.kanban.updateItem.mockResolvedValue(undefined)
    mockElectronAPI.kanban.addComment.mockResolvedValue(undefined)
  })

  function renderMergeHook(item?: KanbanItem) {
    return renderHook(() =>
      useItemDetailPrWorkflow({
        item: item ?? makeItem(),
        projectPath: '/my/project',
        onUpdated,
        setErrorMessage,
      }),
    )
  }

  it('should call git.mergeBranch with projectPath and branch', async () => {
    const { result } = renderMergeHook()
    await invokeMergeLocally(result)
    expect(mockElectronAPI.git.mergeBranch).toHaveBeenCalledWith('/my/project', 'feature-branch')
  })

  it('should update mergeStatus to merged and clear worktreePath on success', async () => {
    const { result } = renderMergeHook()
    await invokeMergeLocally(result)
    expect(mockElectronAPI.kanban.updateItem).toHaveBeenCalledWith(
      '/my/project',
      'item-1',
      expect.objectContaining({
        mergeStatus: 'merged',
        worktreePath: undefined,
      }),
    )
  })

  it('should call cleanupWorktree after successful merge', async () => {
    const { result } = renderMergeHook()
    await invokeMergeLocally(result)
    expect(mockElectronAPI.git.cleanupWorktree).toHaveBeenCalledWith(
      '/my/project',
      '/tmp/worktree',
      'feature-branch',
    )
  })

  it('should set mergeStatus to conflict on conflict', async () => {
    mockElectronAPI.git.mergeBranch.mockResolvedValue({ success: false, conflict: true })
    const { result } = renderMergeHook()
    await invokeMergeLocally(result)
    expect(mockElectronAPI.kanban.updateItem).toHaveBeenCalledWith(
      '/my/project',
      'item-1',
      expect.objectContaining({ mergeStatus: 'conflict' }),
    )
    expect(mockElectronAPI.git.cleanupWorktree).not.toHaveBeenCalled()
  })

  it('should show confirmation dialog with diff stats', async () => {
    const { result } = renderMergeHook()

    await act(async () => {
      result.current.mergeLocally()
    })
    await vi.waitFor(() => {
      expect(result.current.confirmDialogProps.isOpen).toBe(true)
    })
    expect(result.current.confirmDialogProps.message).toContain('feature-branch')
    expect(result.current.confirmDialogProps.message).toContain('3 files changed')
    // Cancel to clean up
    await act(async () => {
      result.current.confirmDialogProps.onCancel()
    })
  })

  it('should not call mergeAndPushPR', async () => {
    const { result } = renderMergeHook()
    await invokeMergeLocally(result)
    expect(mockElectronAPI.git.mergeAndPushPR).not.toHaveBeenCalled()
  })

  it('should set error message on throw', async () => {
    mockElectronAPI.git.mergeBranch.mockRejectedValue(new Error('Network error'))
    const { result } = renderMergeHook()
    await invokeMergeLocally(result)
    expect(setErrorMessage).toHaveBeenCalledWith(expect.stringContaining('Network error'))
  })
})
