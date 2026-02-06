/**
 * @module src/components/CommentsList
 * Comments list component for displaying kanban item comments.
 */

import React from 'react'
import type { KanbanComment, CommentSource } from '@shared/types/kanban'

const commentBadgeColors: Record<CommentSource, string> = {
  user: 'bg-green-600',
  agent: 'bg-blue-600',
  system: 'bg-gray-600',
}

/**
 * Format a timestamp as a relative time string.
 * @param isoString - ISO 8601 timestamp string
 * @returns Human-readable relative time
 */
function formatTimestamp(isoString: string): string {
  const date = new Date(isoString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHours = Math.floor(diffMin / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffSec < 60) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

interface CommentsListProps {
  comments: KanbanComment[]
}

/**
 * Display a list of comments with source badges and timestamps.
 * @param props - Component props
 */
export function CommentsList({ comments }: CommentsListProps): React.ReactElement {
  return (
    <div data-testid="comments-section">
      <h3 className="text-sm font-medium text-[var(--color-text-secondary)] mb-2">
        Comments
      </h3>
      {comments.length === 0 ? (
        <p
          data-testid="no-comments"
          className="text-sm text-[var(--color-text-tertiary)] italic"
        >
          No comments yet
        </p>
      ) : (
        <div className="space-y-3">
          {comments.map(comment => (
            <div
              key={comment.id}
              className="bg-[var(--color-bg-primary)] rounded-md p-3 border border-[var(--color-border-primary)]"
            >
              <div className="flex items-center gap-2 mb-1">
                <span
                  data-testid={`comment-badge-${comment.id}`}
                  className={`px-1.5 py-0.5 text-[10px] font-medium rounded text-white ${commentBadgeColors[comment.source]}`}
                >
                  {comment.source}
                </span>
                <span className="text-[11px] text-[var(--color-text-tertiary)]">
                  {formatTimestamp(comment.timestamp)}
                </span>
              </div>
              <p className="text-sm text-[var(--color-text-primary)]">{comment.text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
