/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ItemDetailEditorPane } from '@renderer/components/kanban/item-detail/ItemDetailEditorPane'

describe('ItemDetailEditorPane', () => {
  const defaultProps = {
    title: 'Test Title',
    description: 'Test Description',
    comments: [],
    commentText: '',
    isAddingComment: false,
    onTitleChange: vi.fn(),
    onDescriptionChange: vi.fn(),
    onCommentTextChange: vi.fn(),
    onAddComment: vi.fn(),
    onSelectCommentOption: vi.fn(),
  }

  it('should have spellCheck enabled on title input', () => {
    render(<ItemDetailEditorPane {...defaultProps} />)

    const titleInput = screen.getByTestId('title-input')
    expect(titleInput.getAttribute('spellcheck')).not.toBe('false')
  })

  it('should have spellCheck enabled on description textarea', () => {
    render(<ItemDetailEditorPane {...defaultProps} />)

    const descriptionInput = screen.getByTestId('description-input')
    expect(descriptionInput.getAttribute('spellcheck')).not.toBe('false')
  })

  it('should have spellCheck enabled on comment textarea', () => {
    render(<ItemDetailEditorPane {...defaultProps} />)

    const commentInput = screen.getByTestId('comment-input')
    expect(commentInput.getAttribute('spellcheck')).not.toBe('false')
  })
})
