/**
 * @vitest-environment jsdom
 *
 * Unit tests for ItemDetailMergeBar covering merged + unmerged states
 * and the bar shell (data-testid, return-null guard, layout).
 */
import React from 'react'
import { render, screen } from '@testing-library/react'
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
    mergeStatus: 'unmerged',
    comments: [],
    createdAt: '2024-01-15T10:00:00.000Z',
    updatedAt: '2024-01-15T12:00:00.000Z',
    ...overrides,
  }
}

const baseProps = {
  showKbdHints: false,
  prUrl: null,
  conflictCheck: null,
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

describe('ItemDetailMergeBar - guard', () => {
  it('should return null when mergeStatus is undefined', () => {
    const { container } = render(
      <ItemDetailMergeBar {...baseProps} item={createMockItem({ mergeStatus: undefined })} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('should return null when branch is undefined', () => {
    const { container } = render(
      <ItemDetailMergeBar {...baseProps} item={createMockItem({ branch: undefined })} />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})

describe('ItemDetailMergeBar - shell', () => {
  it('should render merge-bar testid with horizontal flex layout when mergeStatus is set', () => {
    render(<ItemDetailMergeBar {...baseProps} item={createMockItem()} />)
    const bar = screen.getByTestId('merge-bar')
    expect(bar).toBeInTheDocument()
    expect(bar.className).toMatch(/\bflex\b/)
  })

  it('should render Compare Changes whenever mergeStatus is set', () => {
    render(<ItemDetailMergeBar {...baseProps} item={createMockItem()} />)
    expect(screen.getByTestId('compare-changes-button')).toBeInTheDocument()
  })
})

describe('ItemDetailMergeBar - merged state', () => {
  const merged = createMockItem({ mergeStatus: 'merged' })

  it('should render Merged badge when mergeStatus is merged', () => {
    render(<ItemDetailMergeBar {...baseProps} item={merged} />)
    expect(screen.getByTestId('merge-status-merged')).toBeInTheDocument()
  })

  it('should render View PR / Approve PR / Merge PR buttons when prUrl is set', () => {
    render(<ItemDetailMergeBar {...baseProps} item={merged} prUrl="https://example.com/pr/1" />)
    expect(screen.getByTestId('pr-link')).toBeInTheDocument()
    expect(screen.getByTestId('approve-pr-button')).toBeInTheDocument()
    expect(screen.getByTestId('merge-pr-button')).toBeInTheDocument()
  })

  it('should hide PR action buttons when prUrl is null', () => {
    render(<ItemDetailMergeBar {...baseProps} item={merged} prUrl={null} />)
    expect(screen.queryByTestId('pr-link')).not.toBeInTheDocument()
    expect(screen.queryByTestId('approve-pr-button')).not.toBeInTheDocument()
    expect(screen.queryByTestId('merge-pr-button')).not.toBeInTheDocument()
  })
})

describe('ItemDetailMergeBar - unmerged state', () => {
  it('should render Unmerged controls when mergeStatus is unmerged', () => {
    render(<ItemDetailMergeBar {...baseProps} item={createMockItem({ mergeStatus: 'unmerged' })} />)
    expect(screen.getByTestId('merge-status-unmerged')).toBeInTheDocument()
    expect(screen.getByTestId('check-conflicts-button')).toBeInTheDocument()
    expect(screen.getByTestId('merge-locally-button')).toBeInTheDocument()
    expect(screen.getByTestId('merge-button')).toBeInTheDocument()
    expect(screen.getByTestId('pull-latest-button')).toBeInTheDocument()
  })

  it('should disable Merge Locally / Squash & Merge when agent not completed and column not done/verify', () => {
    const item = createMockItem({
      mergeStatus: 'unmerged',
      agentStatus: 'idle',
      column: 'backlog',
    })
    render(<ItemDetailMergeBar {...baseProps} item={item} />)
    expect(screen.getByTestId('merge-locally-button')).toBeDisabled()
    expect(screen.getByTestId('merge-button')).toBeDisabled()
  })

  it('should enable Merge Locally / Squash & Merge when agent completed', () => {
    const item = createMockItem({
      mergeStatus: 'unmerged',
      agentStatus: 'completed',
      column: 'verify',
    })
    render(<ItemDetailMergeBar {...baseProps} item={item} />)
    expect(screen.getByTestId('merge-locally-button')).not.toBeDisabled()
    expect(screen.getByTestId('merge-button')).not.toBeDisabled()
  })

  it('should preserve existing data-testids on action buttons', () => {
    render(<ItemDetailMergeBar {...baseProps} item={createMockItem({ mergeStatus: 'unmerged' })} />)
    // Each known testid should be present in unmerged state
    for (const id of [
      'compare-changes-button',
      'check-conflicts-button',
      'merge-locally-button',
      'merge-button',
      'pull-latest-button',
    ]) {
      expect(screen.getByTestId(id)).toBeInTheDocument()
    }
  })
})
