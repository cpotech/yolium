/**
 * @vitest-environment jsdom
 */
import React, { useState } from 'react'
import { fireEvent, render, screen, waitFor, act } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useItemDetailPrWorkflow } from '@renderer/components/kanban/item-detail/useItemDetailPrWorkflow'
import { ConfirmDialog } from '@renderer/components/shared/ConfirmDialog'
import type { KanbanItem } from '@shared/types/kanban'

// Mock VimModeContext (needed by ConfirmDialog)
vi.mock('@renderer/context/VimModeContext', () => ({
  useSuspendVimNavigation: vi.fn(),
}))

const mockWorktreeDiffStats = vi.fn()
const mockMergeAndPushPR = vi.fn()
const mockCheckMergeConflicts = vi.fn()
const mockRebaseOntoDefault = vi.fn()
const mockApprovePr = vi.fn()
const mockMergePr = vi.fn()
const mockUpdateItem = vi.fn()
const mockAddComment = vi.fn()

function createMockItem(overrides: Partial<KanbanItem> = {}): KanbanItem {
  return {
    id: 'item-1',
    title: 'Test Item',
    description: 'Test description',
    column: 'verify',
    branch: 'feature/test-item',
    worktreePath: '/tmp/worktrees/item-1',
    agentProvider: 'claude',
    order: 0,
    agentStatus: 'completed',
    mergeStatus: 'unmerged',
    comments: [],
    createdAt: '2024-01-15T10:00:00.000Z',
    updatedAt: '2024-01-15T12:00:00.000Z',
    ...overrides,
  }
}

function PrWorkflowHarness({
  item = createMockItem(),
}: {
  item?: KanbanItem
}) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const workflow = useItemDetailPrWorkflow({
    item,
    projectPath: '/test/project',
    onUpdated: vi.fn(),
    setErrorMessage,
  })

  return (
    <div>
      <div data-testid="error-message">{errorMessage ?? ''}</div>
      <div data-testid="pr-url">{workflow.prUrl ?? ''}</div>
      <div data-testid="conflict-files">{workflow.conflictCheck?.conflictingFiles.join('|') ?? ''}</div>
      <div data-testid="rebase-success">{String(workflow.rebaseResult?.success ?? false)}</div>
      <button data-testid="check-conflicts" onClick={() => void workflow.checkConflicts()}>
        Check
      </button>
      <button data-testid="rebase" onClick={() => void workflow.rebaseOntoDefault()}>
        Rebase
      </button>
      <button data-testid="merge" onClick={() => void workflow.mergeAndPushPr()}>
        Merge
      </button>
      <button data-testid="approve-pr" onClick={() => void workflow.approvePr()}>
        Approve
      </button>
      <button data-testid="merge-pr" onClick={() => void workflow.mergePr()}>
        Merge PR
      </button>
      <ConfirmDialog {...workflow.confirmDialogProps} />
    </div>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockWorktreeDiffStats.mockResolvedValue({ filesChanged: 1, insertions: 2, deletions: 1 })
  mockMergeAndPushPR.mockResolvedValue({ success: true, prBranch: 'feature/pr-branch', prUrl: 'https://example.test/pr/1' })
  mockCheckMergeConflicts.mockResolvedValue({ clean: true, conflictingFiles: [] })
  mockRebaseOntoDefault.mockResolvedValue({ success: true })
  mockApprovePr.mockResolvedValue({ success: true })
  mockMergePr.mockResolvedValue({ success: true })
  mockUpdateItem.mockResolvedValue(undefined)
  mockAddComment.mockResolvedValue(undefined)

  Object.defineProperty(window, 'electronAPI', {
    value: {
      git: {
        worktreeDiffStats: mockWorktreeDiffStats,
        mergeAndPushPR: mockMergeAndPushPR,
        checkMergeConflicts: mockCheckMergeConflicts,
        rebaseOntoDefault: mockRebaseOntoDefault,
        approvePR: mockApprovePr,
        mergePR: mockMergePr,
      },
      kanban: {
        updateItem: mockUpdateItem,
        addComment: mockAddComment,
      },
    },
    writable: true,
  })
})

describe('useItemDetailPrWorkflow', () => {
  it('should persist mergeStatus "merged", the returned prBranch, and prUrl after mergeAndPushPR succeeds', async () => {
    render(<PrWorkflowHarness />)

    await act(async () => {
      fireEvent.click(screen.getByTestId('merge'))
    })

    // ConfirmDialog should now be visible — click confirm
    await act(async () => {
      fireEvent.click(screen.getByTestId('confirm-dialog-confirm'))
    })

    await waitFor(() => {
      expect(mockUpdateItem).toHaveBeenCalledWith('/test/project', 'item-1', {
        mergeStatus: 'merged',
        branch: 'feature/pr-branch',
        worktreePath: undefined,
        prUrl: 'https://example.test/pr/1',
      })
    })
    expect(screen.getByTestId('pr-url')).toHaveTextContent('https://example.test/pr/1')
  })

  it('should persist mergeStatus "merged" and surface an error when branch push succeeds but PR creation fails', async () => {
    mockMergeAndPushPR.mockResolvedValueOnce({
      success: true,
      error: 'PR creation failed',
      prBranch: 'feature/pushed-branch',
    })

    render(<PrWorkflowHarness />)

    await act(async () => {
      fireEvent.click(screen.getByTestId('merge'))
    })

    // ConfirmDialog should now be visible — click confirm
    await act(async () => {
      fireEvent.click(screen.getByTestId('confirm-dialog-confirm'))
    })

    await waitFor(() => {
      expect(mockUpdateItem).toHaveBeenCalledWith('/test/project', 'item-1', {
        mergeStatus: 'merged',
        branch: 'feature/pushed-branch',
        worktreePath: undefined,
      })
    })
    expect(screen.getByTestId('error-message')).toHaveTextContent('PR creation failed')
  })

  it('should persist mergeStatus "conflict" and expose conflicting files when mergeAndPushPR reports a conflict', async () => {
    mockMergeAndPushPR.mockResolvedValueOnce({
      success: false,
      conflict: true,
      conflictingFiles: ['src/a.ts', 'src/b.ts'],
    })

    render(<PrWorkflowHarness />)

    await act(async () => {
      fireEvent.click(screen.getByTestId('merge'))
    })

    // ConfirmDialog should now be visible — click confirm
    await act(async () => {
      fireEvent.click(screen.getByTestId('confirm-dialog-confirm'))
    })

    await waitFor(() => {
      expect(mockUpdateItem).toHaveBeenCalledWith('/test/project', 'item-1', {
        mergeStatus: 'conflict',
      })
    })
    expect(screen.getByTestId('conflict-files')).toHaveTextContent('src/a.ts|src/b.ts')
  })

  it('should clear conflictCheck after rebaseOntoDefault succeeds', async () => {
    mockCheckMergeConflicts.mockResolvedValueOnce({
      clean: false,
      conflictingFiles: ['src/conflict.ts'],
    })

    render(<PrWorkflowHarness />)

    fireEvent.click(screen.getByTestId('check-conflicts'))
    expect(await screen.findByTestId('conflict-files')).toHaveTextContent('src/conflict.ts')

    fireEvent.click(screen.getByTestId('rebase'))

    await waitFor(() => {
      expect(screen.getByTestId('conflict-files')).toHaveTextContent('')
    })
    expect(screen.getByTestId('rebase-success')).toHaveTextContent('true')
  })

  it('should surface a synthetic "(check failed)" conflicting file entry when checkMergeConflicts throws', async () => {
    mockCheckMergeConflicts.mockRejectedValueOnce(new Error('boom'))

    render(<PrWorkflowHarness />)

    fireEvent.click(screen.getByTestId('check-conflicts'))

    await waitFor(() => {
      expect(screen.getByTestId('conflict-files')).toHaveTextContent('(check failed)')
    })
  })

  it('should move the item to the done column after mergePR succeeds', async () => {
    render(<PrWorkflowHarness item={createMockItem({ mergeStatus: 'merged', prUrl: 'https://example.test/pr/1' })} />)

    await act(async () => {
      fireEvent.click(screen.getByTestId('merge-pr'))
    })

    // ConfirmDialog should now be visible — click confirm
    await act(async () => {
      fireEvent.click(screen.getByTestId('confirm-dialog-confirm'))
    })

    await waitFor(() => {
      expect(mockUpdateItem).toHaveBeenCalledWith('/test/project', 'item-1', {
        column: 'done',
      })
    })
  })
})
