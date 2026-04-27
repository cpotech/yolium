/**
 * @vitest-environment jsdom
 *
 * Unit tests for ItemDetailHeader — the unified header that replaces
 * the old title bar + info bar + merge bar.
 */
import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ItemDetailHeader } from '@renderer/components/kanban/item-detail/ItemDetailHeader'
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
    comments: [],
    createdAt: '2024-01-15T10:00:00.000Z',
    updatedAt: '2024-01-15T12:00:00.000Z',
    ...overrides,
  }
}

const baseProps = {
  showKbdHints: true,
  verified: false,
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
  onSetVerified: vi.fn(),
  onClose: vi.fn(),
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

describe('ItemDetailHeader - shell', () => {
  it('renders item-detail-header with horizontal flex layout', () => {
    render(<ItemDetailHeader {...baseProps} item={createMockItem()} />)
    const header = screen.getByTestId('item-detail-header')
    expect(header).toBeInTheDocument()
    expect(header.className).toMatch(/\bflex\b/)
  })

  it('renders the item title', () => {
    render(<ItemDetailHeader {...baseProps} item={createMockItem({ title: 'My Cool Task' })} />)
    expect(screen.getByText('My Cool Task')).toBeInTheDocument()
  })

  it("falls back to 'Untitled Item' when title is empty", () => {
    render(<ItemDetailHeader {...baseProps} item={createMockItem({ title: '' })} />)
    expect(screen.getByText('Untitled Item')).toBeInTheDocument()
  })

  it('renders close button always', () => {
    render(<ItemDetailHeader {...baseProps} item={createMockItem()} />)
    expect(screen.getByTestId('close-button')).toBeInTheDocument()
  })

  it('invokes onClose when close button is clicked', () => {
    const onClose = vi.fn()
    render(<ItemDetailHeader {...baseProps} onClose={onClose} item={createMockItem()} />)
    fireEvent.click(screen.getByTestId('close-button'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('ItemDetailHeader - verified', () => {
  it('renders verified-checkbox reflecting verified prop', () => {
    render(<ItemDetailHeader {...baseProps} verified={false} item={createMockItem()} />)
    expect((screen.getByTestId('verified-checkbox') as HTMLInputElement).checked).toBe(false)
  })

  it('renders V kbd hint when showKbdHints is true', () => {
    render(<ItemDetailHeader {...baseProps} showKbdHints={true} item={createMockItem()} />)
    const header = screen.getByTestId('item-detail-header')
    expect(header.textContent).toContain('V')
  })

  it('omits the kbd hint when showKbdHints is false', () => {
    render(<ItemDetailHeader {...baseProps} showKbdHints={false} item={createMockItem()} />)
    const checkbox = screen.getByTestId('verified-checkbox')
    const label = checkbox.closest('label')
    expect(label?.querySelector('kbd')).toBeNull()
  })

  it('invokes onSetVerified when verified checkbox is toggled', () => {
    const onSetVerified = vi.fn()
    render(
      <ItemDetailHeader
        {...baseProps}
        verified={false}
        onSetVerified={onSetVerified}
        item={createMockItem()}
      />,
    )
    fireEvent.click(screen.getByTestId('verified-checkbox'))
    expect(onSetVerified).toHaveBeenCalledWith(true)
  })
})

describe('ItemDetailHeader - branch', () => {
  it('renders branch-display showing item.branch', () => {
    render(<ItemDetailHeader {...baseProps} item={createMockItem({ branch: 'feature/foo' })} />)
    expect(screen.getByTestId('branch-display')).toHaveTextContent('feature/foo')
  })

  it('does not render branch-display when item.branch is undefined', () => {
    render(<ItemDetailHeader {...baseProps} item={createMockItem({ branch: undefined })} />)
    expect(screen.queryByTestId('branch-display')).not.toBeInTheDocument()
  })
})

describe('ItemDetailHeader - worktree', () => {
  it('does not render worktree-path-display in the header (moved to StatusBar)', () => {
    render(
      <ItemDetailHeader
        {...baseProps}
        item={createMockItem({ worktreePath: '/tmp/wt/foo' })}
      />,
    )
    expect(screen.queryByTestId('worktree-path-display')).not.toBeInTheDocument()
  })
})

describe('ItemDetailHeader - merge actions (no mergeStatus)', () => {
  it('does not render merge-status pills or merge action buttons when mergeStatus is undefined', () => {
    render(<ItemDetailHeader {...baseProps} item={createMockItem({ mergeStatus: undefined })} />)
    expect(screen.queryByTestId('merge-status-merged')).not.toBeInTheDocument()
    expect(screen.queryByTestId('merge-status-conflict')).not.toBeInTheDocument()
    expect(screen.queryByTestId('merge-status-unmerged')).not.toBeInTheDocument()
    expect(screen.queryByTestId('compare-changes-button')).not.toBeInTheDocument()
  })

  it('does not render merge action buttons when item.branch is undefined', () => {
    render(
      <ItemDetailHeader
        {...baseProps}
        item={createMockItem({ branch: undefined, mergeStatus: 'unmerged' })}
      />,
    )
    expect(screen.queryByTestId('compare-changes-button')).not.toBeInTheDocument()
  })
})

describe('ItemDetailHeader - merged state', () => {
  const merged = createMockItem({ mergeStatus: 'merged' })

  it('renders Merged status pill', () => {
    render(<ItemDetailHeader {...baseProps} item={merged} />)
    expect(screen.getByTestId('merge-status-merged')).toBeInTheDocument()
  })

  it('always renders Compare Changes button when mergeStatus is set', () => {
    render(<ItemDetailHeader {...baseProps} item={merged} />)
    expect(screen.getByTestId('compare-changes-button')).toBeInTheDocument()
  })

  it('renders View PR / Approve PR / Merge PR when prUrl is set', () => {
    render(<ItemDetailHeader {...baseProps} item={merged} prUrl="https://example.com/pr/1" />)
    expect(screen.getByTestId('pr-link')).toBeInTheDocument()
    expect(screen.getByTestId('approve-pr-button')).toBeInTheDocument()
    expect(screen.getByTestId('merge-pr-button')).toBeInTheDocument()
  })

  it('hides PR action buttons when prUrl is null', () => {
    render(<ItemDetailHeader {...baseProps} item={merged} prUrl={null} />)
    expect(screen.queryByTestId('pr-link')).not.toBeInTheDocument()
    expect(screen.queryByTestId('approve-pr-button')).not.toBeInTheDocument()
    expect(screen.queryByTestId('merge-pr-button')).not.toBeInTheDocument()
  })

  it('invokes onCompareChanges when Compare Changes button is clicked', () => {
    const onCompareChanges = vi.fn()
    render(<ItemDetailHeader {...baseProps} item={merged} onCompareChanges={onCompareChanges} />)
    fireEvent.click(screen.getByTestId('compare-changes-button'))
    expect(onCompareChanges).toHaveBeenCalledTimes(1)
  })
})

describe('ItemDetailHeader - conflict state', () => {
  const conflict = createMockItem({ mergeStatus: 'conflict' })

  it('renders conflict status pill', () => {
    render(<ItemDetailHeader {...baseProps} item={conflict} />)
    expect(screen.getByTestId('merge-status-conflict')).toBeInTheDocument()
  })

  it('renders Fix Conflicts and Pull Latest buttons in conflict state', () => {
    render(<ItemDetailHeader {...baseProps} item={conflict} />)
    expect(screen.getByTestId('fix-conflicts-button')).toBeInTheDocument()
    expect(screen.getByTestId('conflict-rebase-button')).toBeInTheDocument()
  })

  it('renders the conflicting files list when conflictCheck has files', () => {
    render(
      <ItemDetailHeader
        {...baseProps}
        item={conflict}
        conflictCheck={{ clean: false, conflictingFiles: ['src/a.ts', 'src/b.ts'] }}
      />,
    )
    expect(screen.getByText('src/a.ts')).toBeInTheDocument()
    expect(screen.getByText('src/b.ts')).toBeInTheDocument()
  })

  it('invokes onFixConflicts when Fix Conflicts button is clicked', () => {
    const onFixConflicts = vi.fn()
    render(
      <ItemDetailHeader
        {...baseProps}
        item={conflict}
        onFixConflicts={onFixConflicts}
      />,
    )
    fireEvent.click(screen.getByTestId('fix-conflicts-button'))
    expect(onFixConflicts).toHaveBeenCalledTimes(1)
  })
})

describe('ItemDetailHeader - unmerged state', () => {
  const unmerged = createMockItem({ mergeStatus: 'unmerged' })

  it('renders Unmerged status pill and unmerged action buttons', () => {
    render(<ItemDetailHeader {...baseProps} item={unmerged} />)
    expect(screen.getByTestId('merge-status-unmerged')).toBeInTheDocument()
    expect(screen.getByTestId('check-conflicts-button')).toBeInTheDocument()
    expect(screen.getByTestId('merge-locally-button')).toBeInTheDocument()
    expect(screen.getByTestId('merge-button')).toBeInTheDocument()
    expect(screen.getByTestId('pull-latest-button')).toBeInTheDocument()
  })

  it('disables Merge Locally / Squash & Merge when agent not completed and column not done/verify', () => {
    const item = createMockItem({
      mergeStatus: 'unmerged',
      agentStatus: 'idle',
      column: 'backlog',
    })
    render(<ItemDetailHeader {...baseProps} item={item} />)
    expect(screen.getByTestId('merge-locally-button')).toBeDisabled()
    expect(screen.getByTestId('merge-button')).toBeDisabled()
  })

  it('enables Merge Locally / Squash & Merge when agent completed', () => {
    const item = createMockItem({
      mergeStatus: 'unmerged',
      agentStatus: 'completed',
      column: 'verify',
    })
    render(<ItemDetailHeader {...baseProps} item={item} />)
    expect(screen.getByTestId('merge-locally-button')).not.toBeDisabled()
    expect(screen.getByTestId('merge-button')).not.toBeDisabled()
  })
})
