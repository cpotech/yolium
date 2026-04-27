/**
 * @vitest-environment jsdom
 *
 * Unit tests for ItemDetailInfoBar covering shell, verified toggle,
 * branch display, worktree display, and kbd-hint rendering.
 */
import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ItemDetailInfoBar } from '@renderer/components/kanban/item-detail/ItemDetailInfoBar'
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
  onSetVerified: vi.fn(),
}

describe('ItemDetailInfoBar - shell', () => {
  it('should render info-bar testid with horizontal flex layout', () => {
    render(<ItemDetailInfoBar {...baseProps} item={createMockItem()} />)
    const bar = screen.getByTestId('info-bar')
    expect(bar).toBeInTheDocument()
    expect(bar.className).toMatch(/\bflex\b/)
  })
})

describe('ItemDetailInfoBar - verified', () => {
  it('should render verified-checkbox reflecting the verified prop and call onSetVerified when toggled', () => {
    const onSetVerified = vi.fn()
    render(
      <ItemDetailInfoBar
        {...baseProps}
        verified={false}
        onSetVerified={onSetVerified}
        item={createMockItem()}
      />,
    )
    const checkbox = screen.getByTestId('verified-checkbox') as HTMLInputElement
    expect(checkbox.checked).toBe(false)
    fireEvent.click(checkbox)
    expect(onSetVerified).toHaveBeenCalledWith(true)
  })
})

describe('ItemDetailInfoBar - branch', () => {
  it('should render branch-display showing the item.branch value', () => {
    render(<ItemDetailInfoBar {...baseProps} item={createMockItem({ branch: 'feature/foo' })} />)
    expect(screen.getByTestId('branch-display')).toHaveTextContent('feature/foo')
  })

  it("should render branch-display showing 'N/A' when item.branch is undefined", () => {
    render(<ItemDetailInfoBar {...baseProps} item={createMockItem({ branch: undefined })} />)
    expect(screen.getByTestId('branch-display')).toHaveTextContent('N/A')
  })
})

describe('ItemDetailInfoBar - worktree', () => {
  it('should render worktree-path-display only when item.worktreePath is set', () => {
    const { rerender } = render(
      <ItemDetailInfoBar {...baseProps} item={createMockItem({ worktreePath: '/tmp/wt/foo' })} />,
    )
    expect(screen.getByTestId('worktree-path-display')).toHaveTextContent('/tmp/wt/foo')

    rerender(<ItemDetailInfoBar {...baseProps} item={createMockItem({ worktreePath: undefined })} />)
    expect(screen.queryByTestId('worktree-path-display')).not.toBeInTheDocument()
  })
})

describe('ItemDetailInfoBar - kbd hints', () => {
  it('should render the Verified kbd hint when showKbdHints is true and omit it when false', () => {
    const { rerender } = render(
      <ItemDetailInfoBar {...baseProps} showKbdHints={true} item={createMockItem()} />,
    )
    const bar = screen.getByTestId('info-bar')
    expect(bar.querySelector('kbd')).not.toBeNull()
    expect(bar.textContent).toContain('V')

    rerender(<ItemDetailInfoBar {...baseProps} showKbdHints={false} item={createMockItem()} />)
    const barAfter = screen.getByTestId('info-bar')
    expect(barAfter.querySelector('kbd')).toBeNull()
  })
})
