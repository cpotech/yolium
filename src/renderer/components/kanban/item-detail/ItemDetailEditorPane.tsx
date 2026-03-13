import React from 'react'
import type { KanbanComment } from '@shared/types/kanban'
import { CommentsList } from '../CommentsList'

interface ItemDetailEditorPaneProps {
  title: string
  description: string
  comments: KanbanComment[]
  commentText: string
  isAddingComment: boolean
  onTitleChange: (value: string) => void
  onDescriptionChange: (value: string) => void
  onCommentTextChange: (value: string) => void
  onAddComment: () => void
  onSelectCommentOption: (value: string) => void
}

export function ItemDetailEditorPane({
  title,
  description,
  comments,
  commentText,
  isAddingComment,
  onTitleChange,
  onDescriptionChange,
  onCommentTextChange,
  onAddComment,
  onSelectCommentOption,
}: ItemDetailEditorPaneProps): React.ReactElement {
  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div>
        <div className="mb-5">
          <label
            htmlFor="detail-title"
            className="block text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)] mb-1.5"
          >
            Title <span className="text-red-400">*</span>
          </label>
          <input
            id="detail-title"
            data-testid="title-input"
            type="text"
            value={title}
            onChange={event => onTitleChange(event.target.value)}
            autoFocus
            className="w-full px-3 py-2.5 bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-md text-[var(--color-text-primary)] text-sm focus:outline-none focus:border-[var(--color-accent-primary)] focus:ring-1 focus:ring-[var(--color-accent-primary)]"
          />
        </div>

        <div className="mb-5">
          <label
            htmlFor="detail-description"
            className="block text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)] mb-1.5"
          >
            Description
          </label>
          <textarea
            id="detail-description"
            data-testid="description-input"
            value={description}
            onChange={event => onDescriptionChange(event.target.value)}
            rows={10}
            className="w-full px-3 py-2.5 bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-md text-[var(--color-text-primary)] text-sm focus:outline-none focus:border-[var(--color-accent-primary)] focus:ring-1 focus:ring-[var(--color-accent-primary)] resize-y"
          />
        </div>

        <CommentsList comments={comments} onSelectOption={onSelectCommentOption} />

        <div className="mt-4">
          <label
            htmlFor="comment-input"
            className="block text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)] mb-1.5"
          >
            Add Comment
          </label>
          <textarea
            id="comment-input"
            data-testid="comment-input"
            value={commentText}
            onChange={event => onCommentTextChange(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                event.preventDefault()
                onAddComment()
              }
            }}
            rows={3}
            placeholder="Write a comment..."
            className="w-full px-3 py-2.5 bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-md text-[var(--color-text-primary)] text-sm placeholder-[var(--color-text-tertiary)] focus:outline-none focus:border-[var(--color-accent-primary)] focus:ring-1 focus:ring-[var(--color-accent-primary)] resize-y"
          />
          <div className="flex justify-end mt-2">
            <button
              data-testid="comment-submit"
              onClick={onAddComment}
              disabled={isAddingComment || !commentText.trim()}
              className="px-3 py-1.5 text-xs bg-[var(--color-accent-primary)] text-white rounded hover:bg-[var(--color-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isAddingComment ? 'Posting...' : 'Post Comment'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
