/**
 * @vitest-environment jsdom
 */
import React from 'react'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { KanbanCard } from '@renderer/components/kanban/KanbanCard'
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

beforeEach(() => {
  Object.defineProperty(window, 'electronAPI', {
    value: {
      app: { openExternal: vi.fn() },
    },
    writable: true,
  })
})

describe('KanbanCard - conflict fix button', () => {
  it('should show fix conflict button when mergeStatus is conflict and onFixConflicts is provided', () => {
    const onFixConflicts = vi.fn()
    render(
      <KanbanCard
        item={createMockItem({ mergeStatus: 'conflict' })}
        onClick={vi.fn()}
        onFixConflicts={onFixConflicts}
      />,
    )

    expect(screen.getByTestId('fix-conflicts-card-btn')).toBeInTheDocument()
  })

  it('should not show fix conflict button when mergeStatus is not conflict', () => {
    const onFixConflicts = vi.fn()
    render(
      <KanbanCard
        item={createMockItem({ mergeStatus: 'unmerged' })}
        onClick={vi.fn()}
        onFixConflicts={onFixConflicts}
      />,
    )

    expect(screen.queryByTestId('fix-conflicts-card-btn')).not.toBeInTheDocument()
  })
})
