/**
 * @module src/components/CommentsList
 * Comments list component for displaying kanban item comments.
 */

import React from 'react'
import Markdown from 'react-markdown'
import type { KanbanComment, CommentSource } from '@shared/types/kanban'

const markdownComponents = {
  h1: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => <h1 className="text-base font-bold mt-3 mb-1" {...props}>{children}</h1>,
  h2: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => <h2 className="text-sm font-bold mt-3 mb-1" {...props}>{children}</h2>,
  h3: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => <h3 className="text-sm font-semibold mt-2 mb-1" {...props}>{children}</h3>,
  p: ({ children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => <p className="my-1" {...props}>{children}</p>,
  ul: ({ children, ...props }: React.HTMLAttributes<HTMLUListElement>) => <ul className="list-disc pl-4 my-1 space-y-0.5" {...props}>{children}</ul>,
  ol: ({ children, ...props }: React.HTMLAttributes<HTMLOListElement>) => <ol className="list-decimal pl-4 my-1 space-y-0.5" {...props}>{children}</ol>,
  li: ({ children, ...props }: React.HTMLAttributes<HTMLLIElement>) => <li className="text-sm" {...props}>{children}</li>,
  code: ({ children, className, ...props }: React.HTMLAttributes<HTMLElement>) => {
    const isBlock = className?.includes('language-')
    if (isBlock) {
      return <code className={`block bg-[var(--color-bg-secondary)] p-2 rounded text-xs font-mono overflow-x-auto ${className || ''}`} {...props}>{children}</code>
    }
    return <code className="bg-[var(--color-bg-secondary)] px-1 py-0.5 rounded text-xs font-mono" {...props}>{children}</code>
  },
  pre: ({ children, ...props }: React.HTMLAttributes<HTMLPreElement>) => <pre className="my-1" {...props}>{children}</pre>,
  strong: ({ children, ...props }: React.HTMLAttributes<HTMLElement>) => <strong className="font-semibold" {...props}>{children}</strong>,
  a: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a className="text-[var(--color-accent-primary)] hover:underline" {...props}>{children}</a>,
  table: ({ children, ...props }: React.TableHTMLAttributes<HTMLTableElement>) => <table className="text-xs border-collapse my-2 w-full" {...props}>{children}</table>,
  th: ({ children, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) => <th className="border border-[var(--color-border-primary)] px-2 py-1 text-left font-semibold bg-[var(--color-bg-secondary)]" {...props}>{children}</th>,
  td: ({ children, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) => <td className="border border-[var(--color-border-primary)] px-2 py-1" {...props}>{children}</td>,
  blockquote: ({ children, ...props }: React.BlockquoteHTMLAttributes<HTMLQuoteElement>) => <blockquote className="border-l-2 border-[var(--color-border-secondary)] pl-3 my-1 text-[var(--color-text-secondary)]" {...props}>{children}</blockquote>,
  hr: (props: React.HTMLAttributes<HTMLHRElement>) => <hr className="border-[var(--color-border-primary)] my-2" {...props} />,
}

const commentBadgeColors: Record<CommentSource, string> = {
  user: 'bg-green-600',
  agent: 'bg-blue-600',
  system: 'bg-gray-600',
}

function getPrettyJson(text: string): string | null {
  const trimmed = text.trim()
  const startsWithObject = trimmed.startsWith('{') && trimmed.endsWith('}')
  const startsWithArray = trimmed.startsWith('[') && trimmed.endsWith(']')

  if (!startsWithObject && !startsWithArray) {
    return null
  }

  try {
    const parsed = JSON.parse(trimmed)

    if (parsed === null || typeof parsed !== 'object') {
      return null
    }

    return JSON.stringify(parsed, null, 2)
  } catch {
    return null
  }
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
  onSelectOption?: (option: string) => void
}

/**
 * Display a list of comments with source badges and timestamps.
 * @param props - Component props
 */
export function CommentsList({ comments, onSelectOption }: CommentsListProps): React.ReactElement {
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
              {(() => {
                const prettyJson = getPrettyJson(comment.text)

                if (prettyJson) {
                  return (
                    <pre
                      data-testid={`comment-json-${comment.id}`}
                      className="text-sm text-[var(--color-text-primary)] font-mono whitespace-pre-wrap bg-[var(--color-bg-secondary)] p-2 rounded border border-[var(--color-border-primary)]"
                    >
                      {prettyJson}
                    </pre>
                  )
                }

                return (
                  <div className="text-sm text-[var(--color-text-primary)]">
                    <Markdown components={markdownComponents}>{comment.text}</Markdown>
                  </div>
                )
              })()}
              {comment.options && comment.options.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {comment.options.map((option, idx) => (
                    <button
                      key={idx}
                      data-testid={`comment-option-${comment.id}-${idx}`}
                      onClick={() => onSelectOption?.(option)}
                      className="px-2 py-1 text-xs bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] rounded border border-[var(--color-border-primary)] hover:border-[var(--color-accent-primary)] transition-colors"
                    >
                      {option}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
