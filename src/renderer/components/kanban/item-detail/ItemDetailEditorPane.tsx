import React, { forwardRef } from 'react'
import type { KanbanComment, AgentStatus } from '@shared/types/kanban'
import type { VimMode } from '@renderer/hooks/useVimMode'
import { CommentsList, type CommentsListHandle } from '../CommentsList'

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
  vimMode?: VimMode
  focusedFieldIndex?: number
  onFieldFocus?: (index: number) => void
  focusedCommentId?: string | null
  selectedCommentIds?: Set<string>
  commentSearchRef?: React.Ref<CommentsListHandle>
  agentStatus?: AgentStatus
  answerText?: string
  isAnswering?: boolean
  onSetAnswerText?: (text: string) => void
  onAnswerQuestion?: () => void
}

export const ItemDetailEditorPane = forwardRef<React.ComponentRef<'div'>, ItemDetailEditorPaneProps>(function ItemDetailEditorPane({
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
  vimMode,
  focusedFieldIndex,
  onFieldFocus,
  focusedCommentId,
  selectedCommentIds,
  commentSearchRef,
  agentStatus,
  answerText,
  isAnswering,
  onSetAnswerText,
  onAnswerQuestion,
}, ref) {
  const isNormal = vimMode === 'NORMAL'

  return (
    <div className="flex-1 overflow-y-auto p-6" ref={ref}>
      <div>
        <div
          data-field-index="0"
          className={`mb-5 ${isNormal && focusedFieldIndex === 0 ? 'ring-2 ring-[var(--color-accent-primary)] rounded-md' : ''}`}
        >
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
            onFocus={() => onFieldFocus?.(0)}
            className="w-full px-3 py-2.5 bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-md text-[var(--color-text-primary)] text-sm focus:outline-none focus:border-[var(--color-accent-primary)] focus:ring-1 focus:ring-[var(--color-accent-primary)]"
          />
        </div>

        <div
          data-field-index="1"
          className={`mb-5 ${isNormal && focusedFieldIndex === 1 ? 'ring-2 ring-[var(--color-accent-primary)] rounded-md' : ''}`}
        >
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
            onFocus={() => onFieldFocus?.(1)}
            rows={10}
            className="w-full px-3 py-2.5 bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-md text-[var(--color-text-primary)] text-sm focus:outline-none focus:border-[var(--color-accent-primary)] focus:ring-1 focus:ring-[var(--color-accent-primary)] resize-y"
          />
        </div>

        <CommentsList
          ref={commentSearchRef}
          comments={comments}
          onSelectOption={onSelectCommentOption}
          focusedCommentId={focusedCommentId}
          selectedCommentIds={selectedCommentIds}
          agentStatus={agentStatus}
          answerText={answerText}
          isAnswering={isAnswering}
          onSetAnswerText={onSetAnswerText}
          onAnswerQuestion={onAnswerQuestion}
        />

        <div
          data-field-index="2"
          className={`mt-4 ${isNormal && focusedFieldIndex === 2 ? 'ring-2 ring-[var(--color-accent-primary)] rounded-md' : ''}`}
        >
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
            onFocus={() => onFieldFocus?.(2)}
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
})
