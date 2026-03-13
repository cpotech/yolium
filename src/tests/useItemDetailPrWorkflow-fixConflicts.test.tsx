/**
 * @vitest-environment jsdom
 */
import React, { useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useItemDetailPrWorkflow } from '@renderer/components/kanban/item-detail/useItemDetailPrWorkflow'
import type { KanbanItem } from '@shared/types/kanban'

const mockCheckMergeConflicts = vi.fn()
const mockUpdateItem = vi.fn()
const mockAddComment = vi.fn()
const mockConfirmOkCancel = vi.fn()
const mockWorktreeDiffStats = vi.fn()
const mockMergeAndPushPR = vi.fn()
const mockRebaseOntoDefault = vi.fn()
const mockApprovePr = vi.fn()
const mockMergePr = vi.fn()

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
    mergeStatus: 'conflict',
    comments: [],
    createdAt: '2024-01-15T10:00:00.000Z',
    updatedAt: '2024-01-15T12:00:00.000Z',
    ...overrides,
  }
}

const mockOnUpdated = vi.fn()

function FixConflictsHarness({ item = createMockItem() }: { item?: KanbanItem }) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const workflow = useItemDetailPrWorkflow({
    item,
    projectPath: '/test/project',
    onUpdated: mockOnUpdated,
    setErrorMessage,
  })

  return (
    <div>
      <div data-testid="error-message">{errorMessage ?? ''}</div>
      <div data-testid="is-fixing">{String(workflow.isFixingConflicts)}</div>
      <div data-testid="conflict-files">
        {workflow.conflictCheck?.conflictingFiles.join('|') ?? ''}
      </div>
      <button data-testid="fix-conflicts" onClick={() => void workflow.fixConflicts()}>
        Fix
      </button>
      <button data-testid="check-conflicts" onClick={() => void workflow.checkConflicts()}>
        Check
      </button>
    </div>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockCheckMergeConflicts.mockResolvedValue({ clean: false, conflictingFiles: ['src/a.ts', 'src/b.ts'] })
  mockUpdateItem.mockResolvedValue(undefined)
  mockAddComment.mockResolvedValue(undefined)
  mockConfirmOkCancel.mockResolvedValue(true)
  mockWorktreeDiffStats.mockResolvedValue({ filesChanged: 1, insertions: 2, deletions: 1 })
  mockMergeAndPushPR.mockResolvedValue({ success: true })
  mockRebaseOntoDefault.mockResolvedValue({ success: true })
  mockApprovePr.mockResolvedValue({ success: true })
  mockMergePr.mockResolvedValue({ success: true })

  Object.defineProperty(window, 'electronAPI', {
    value: {
      dialog: { confirmOkCancel: mockConfirmOkCancel },
      git: {
        checkMergeConflicts: mockCheckMergeConflicts,
        worktreeDiffStats: mockWorktreeDiffStats,
        mergeAndPushPR: mockMergeAndPushPR,
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

describe('useItemDetailPrWorkflow - fixConflicts', () => {
  it('should add a system comment with conflicting files when fixConflicts is called', async () => {
    render(<FixConflictsHarness />)

    fireEvent.click(screen.getByTestId('fix-conflicts'))

    await waitFor(() => {
      expect(mockAddComment).toHaveBeenCalledWith(
        '/test/project',
        'item-1',
        'system',
        expect.stringContaining('src/a.ts'),
      )
    })
    expect(mockAddComment).toHaveBeenCalledWith(
      '/test/project',
      'item-1',
      'system',
      expect.stringContaining('src/b.ts'),
    )
  })

  it('should reset mergeStatus to unmerged when fixConflicts is called', async () => {
    render(<FixConflictsHarness />)

    fireEvent.click(screen.getByTestId('fix-conflicts'))

    await waitFor(() => {
      expect(mockUpdateItem).toHaveBeenCalledWith('/test/project', 'item-1', {
        mergeStatus: 'unmerged',
      })
    })
  })

  it('should call onUpdated after resetting mergeStatus', async () => {
    render(<FixConflictsHarness />)

    fireEvent.click(screen.getByTestId('fix-conflicts'))

    await waitFor(() => {
      expect(mockOnUpdated).toHaveBeenCalled()
    })
  })

  it('should return conflicting files from the last conflict check', async () => {
    render(<FixConflictsHarness />)

    fireEvent.click(screen.getByTestId('fix-conflicts'))

    await waitFor(() => {
      expect(screen.getByTestId('conflict-files')).toHaveTextContent('src/a.ts|src/b.ts')
    })
  })
})
