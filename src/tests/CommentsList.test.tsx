/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CommentsList } from '@renderer/components/kanban/CommentsList'
import type { KanbanComment } from '@shared/types/kanban'

describe('CommentsList', () => {
  it('should render comments', () => {
    const comments: KanbanComment[] = [
      { id: 'c1', source: 'user', text: 'Hello', timestamp: new Date().toISOString() },
      { id: 'c2', source: 'agent', text: 'Hi there', timestamp: new Date().toISOString() },
    ]

    render(<CommentsList comments={comments} />)

    expect(screen.getByText('Hello')).toBeInTheDocument()
    expect(screen.getByText('Hi there')).toBeInTheDocument()
  })

  it('should show empty state when no comments', () => {
    render(<CommentsList comments={[]} />)

    expect(screen.getByTestId('no-comments')).toBeInTheDocument()
  })

  it('should render option buttons on comments with options', () => {
    const comments: KanbanComment[] = [
      {
        id: 'c1',
        source: 'agent',
        text: 'Which approach?',
        timestamp: new Date().toISOString(),
        options: ['Option A', 'Option B', 'Option C'],
      },
    ]

    render(<CommentsList comments={comments} />)

    expect(screen.getByText('Option A')).toBeInTheDocument()
    expect(screen.getByText('Option B')).toBeInTheDocument()
    expect(screen.getByText('Option C')).toBeInTheDocument()
  })

  it('should call onSelectOption when option button clicked', () => {
    const onSelectOption = vi.fn()
    const comments: KanbanComment[] = [
      {
        id: 'c1',
        source: 'agent',
        text: 'Which approach?',
        timestamp: new Date().toISOString(),
        options: ['Option A', 'Option B'],
      },
    ]

    render(<CommentsList comments={comments} onSelectOption={onSelectOption} />)

    fireEvent.click(screen.getByTestId('comment-option-c1-0'))
    expect(onSelectOption).toHaveBeenCalledWith('Option A')

    fireEvent.click(screen.getByTestId('comment-option-c1-1'))
    expect(onSelectOption).toHaveBeenCalledWith('Option B')
  })

  it('should not render option buttons when options is empty', () => {
    const comments: KanbanComment[] = [
      {
        id: 'c1',
        source: 'agent',
        text: 'Just a comment',
        timestamp: new Date().toISOString(),
        options: [],
      },
    ]

    render(<CommentsList comments={comments} />)

    expect(screen.queryByTestId('comment-option-c1-0')).not.toBeInTheDocument()
  })

  it('should not render option buttons when options is undefined', () => {
    const comments: KanbanComment[] = [
      {
        id: 'c1',
        source: 'agent',
        text: 'Just a comment',
        timestamp: new Date().toISOString(),
      },
    ]

    render(<CommentsList comments={comments} />)

    expect(screen.queryByTestId('comment-option-c1-0')).not.toBeInTheDocument()
  })
})
