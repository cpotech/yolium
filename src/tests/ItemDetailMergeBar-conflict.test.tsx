/**
 * @vitest-environment jsdom
 */
import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ItemDetailMergeBar } from '@renderer/components/kanban/item-detail/ItemDetailMergeBar'
import type { KanbanItem } from '@shared/types/kanban'

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

const defaultProps = {
  item: createMockItem(),
  prUrl: null,
  conflictCheck: { clean: false, conflictingFiles: ['src/a.ts', 'src/b.ts'] },
  rebaseResult: null,
  isMerging: false,
  isMergingLocally: false,
  isCheckingConflicts: false,
  isRebasing: false,
  isApprovingPr: false,
  isMergingPr: false,
  isFixingConflicts: false,
  onCompareChanges: vi.fn(),
  onOpenPr: vi.fn(),
  onApprovePr: vi.fn(),
  onMergePr: vi.fn(),
  onCheckConflicts: vi.fn(),
  onRebase: vi.fn(),
  onMergeLocally: vi.fn(),
  onMerge: vi.fn(),
  onFixConflicts: vi.fn(),
}

describe('ItemDetailMergeBar - conflict state', () => {
  it('should render Fix Conflicts button when mergeStatus is conflict', () => {
    render(<ItemDetailMergeBar {...defaultProps} showKbdHints={false} />)

    expect(screen.getByTestId('fix-conflicts-button')).toBeInTheDocument()
    expect(screen.getByTestId('fix-conflicts-button')).toHaveTextContent(/Fix Conflicts/i)
  })

  it('should render Pull Latest (Rebase) button when mergeStatus is conflict', () => {
    render(<ItemDetailMergeBar {...defaultProps} showKbdHints={false} />)

    expect(screen.getByTestId('conflict-rebase-button')).toBeInTheDocument()
    expect(screen.getByTestId('conflict-rebase-button')).toHaveTextContent(/Pull Latest \(Rebase\)/i)
  })

  it('should render conflicting files list when conflictCheck has files', () => {
    render(<ItemDetailMergeBar {...defaultProps} showKbdHints={false} />)

    expect(screen.getByText('src/a.ts')).toBeInTheDocument()
    expect(screen.getByText('src/b.ts')).toBeInTheDocument()
  })

  it('should call onFixConflicts when Fix Conflicts button is clicked', () => {
    const onFixConflicts = vi.fn()
    render(<ItemDetailMergeBar {...defaultProps} showKbdHints={false} onFixConflicts={onFixConflicts} />)

    fireEvent.click(screen.getByTestId('fix-conflicts-button'))

    expect(onFixConflicts).toHaveBeenCalledTimes(1)
  })

  it('should call onRebase when Pull Latest button is clicked in conflict state', () => {
    const onRebase = vi.fn()
    render(<ItemDetailMergeBar {...defaultProps} showKbdHints={false} onRebase={onRebase} />)

    fireEvent.click(screen.getByTestId('conflict-rebase-button'))

    expect(onRebase).toHaveBeenCalledTimes(1)
  })

  it('should disable Fix Conflicts button when isFixingConflicts is true', () => {
    render(<ItemDetailMergeBar {...defaultProps} showKbdHints={false} isFixingConflicts={true} />)

    expect(screen.getByTestId('fix-conflicts-button')).toBeDisabled()
  })

  it('should show fixing state text when isFixingConflicts is true', () => {
    render(<ItemDetailMergeBar {...defaultProps} showKbdHints={false} isFixingConflicts={true} />)

    expect(screen.getByTestId('fix-conflicts-button')).toHaveTextContent(/Fixing/i)
  })

  it('should still render Retry Squash Merge & PR button in conflict state', () => {
    render(<ItemDetailMergeBar {...defaultProps} showKbdHints={false} />)

    expect(screen.getByTestId('retry-merge-button')).toBeInTheDocument()
    expect(screen.getByTestId('retry-merge-button')).toHaveTextContent(/Retry Squash Merge & Push PR/i)
  })
})
