/**
 * @vitest-environment jsdom
 */
import React from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useItemDetailAgentLifecycle } from '@renderer/components/kanban/item-detail/useItemDetailAgentLifecycle'
import type { KanbanItem } from '@shared/types/kanban'

const mockFlushDraft = vi.fn()
const mockPrepareForRun = vi.fn()
const mockAssociateSession = vi.fn()
const mockAppendOutputLine = vi.fn()
const mockSetRunStatus = vi.fn()
const mockSetErrorMessage = vi.fn()
const mockOnUpdated = vi.fn()

function createMockItem(overrides: Partial<KanbanItem> = {}): KanbanItem {
  return {
    id: 'item-1',
    title: 'Test Item',
    description: 'Solve the problem',
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

function ResetHarness({ item }: { item: KanbanItem }) {
  const lifecycle = useItemDetailAgentLifecycle({
    item,
    projectPath: '/test/project',
    onUpdated: mockOnUpdated,
    setErrorMessage: mockSetErrorMessage,
    draft: {
      agentProvider: 'claude',
      hasUnsavedChanges: false,
      flushDraft: mockFlushDraft,
    },
    agentSession: {
      currentSessionId: null,
      currentDetail: null,
      prepareForRun: mockPrepareForRun,
      associateSession: mockAssociateSession,
      appendOutputLine: mockAppendOutputLine,
      setRunStatus: mockSetRunStatus,
    },
  })

  return (
    <div>
      <textarea
        data-testid="answer-input"
        value={lifecycle.answerText}
        onChange={e => lifecycle.setAnswerText(e.target.value)}
      />
      <textarea
        data-testid="comment-input"
        value={lifecycle.commentText}
        onChange={e => lifecycle.setCommentText(e.target.value)}
      />
      <div data-testid="answer-value">{lifecycle.answerText}</div>
      <div data-testid="comment-value">{lifecycle.commentText}</div>
    </div>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockFlushDraft.mockResolvedValue(true)

  Object.defineProperty(window, 'electronAPI', {
    value: {
      agent: {
        start: vi.fn().mockResolvedValue({ sessionId: 'session-1' }),
        resume: vi.fn().mockResolvedValue({ sessionId: 'session-2' }),
        answer: vi.fn().mockResolvedValue(undefined),
        stop: vi.fn().mockResolvedValue(undefined),
      },
      kanban: {
        addComment: vi.fn().mockResolvedValue(undefined),
      },
    },
    writable: true,
  })
})

describe('useItemDetailAgentLifecycle reset on item change', () => {
  it('should reset answerText when item.id changes', async () => {
    const itemA = createMockItem({ id: 'item-a' })
    const itemB = createMockItem({ id: 'item-b' })

    const { rerender } = render(<ResetHarness item={itemA} />)

    // Type into the answer input
    fireEvent.change(screen.getByTestId('answer-input'), {
      target: { value: 'My answer for item A' },
    })
    expect(screen.getByTestId('answer-value').textContent).toBe('My answer for item A')

    // Switch to a different item
    await act(async () => {
      rerender(<ResetHarness item={itemB} />)
    })

    // Answer text should be reset
    expect(screen.getByTestId('answer-value').textContent).toBe('')
  })

  it('should reset commentText when item.id changes', async () => {
    const itemA = createMockItem({ id: 'item-a' })
    const itemB = createMockItem({ id: 'item-b' })

    const { rerender } = render(<ResetHarness item={itemA} />)

    // Type into the comment input
    fireEvent.change(screen.getByTestId('comment-input'), {
      target: { value: 'Comment for item A' },
    })
    expect(screen.getByTestId('comment-value').textContent).toBe('Comment for item A')

    // Switch to a different item
    await act(async () => {
      rerender(<ResetHarness item={itemB} />)
    })

    // Comment text should be reset
    expect(screen.getByTestId('comment-value').textContent).toBe('')
  })

  it('should not reset text when same item re-renders with updated fields', async () => {
    const itemA = createMockItem({ id: 'item-a', title: 'Original' })
    const itemAUpdated = createMockItem({ id: 'item-a', title: 'Updated' })

    const { rerender } = render(<ResetHarness item={itemA} />)

    // Type into both inputs
    fireEvent.change(screen.getByTestId('answer-input'), {
      target: { value: 'My answer' },
    })
    fireEvent.change(screen.getByTestId('comment-input'), {
      target: { value: 'My comment' },
    })

    // Re-render with same item ID but different data
    await act(async () => {
      rerender(<ResetHarness item={itemAUpdated} />)
    })

    // Text should NOT be reset because item.id is the same
    expect(screen.getByTestId('answer-value').textContent).toBe('My answer')
    expect(screen.getByTestId('comment-value').textContent).toBe('My comment')
  })
})
