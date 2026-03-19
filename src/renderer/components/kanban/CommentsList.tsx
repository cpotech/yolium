/**
 * @module src/components/CommentsList
 * Comments list component for displaying kanban item comments.
 */

import React, { useState, useCallback, useMemo } from 'react'
import Markdown from 'react-markdown'
import type { KanbanComment, CommentSource } from '@shared/types/kanban'
import { MockPreviewModal } from './MockPreviewModal'

/** Only allow data:image/svg+xml URIs for security — no external image loading. */
function isSvgDataUri(src: string | undefined): boolean {
  return typeof src === 'string' && src.startsWith('data:image/svg+xml')
}

/** Detect yolium-mock:// protocol links. */
function isMockLink(href: string | undefined): boolean {
  return typeof href === 'string' && href.startsWith('yolium-mock://')
}

/** Extract the file path from a yolium-mock:// URI. */
function getMockFilePath(href: string): string {
  return href.replace('yolium-mock://', '')
}

/** Detect yolium-report:// protocol links. */
function isReportLink(href: string | undefined): boolean {
  return typeof href === 'string' && href.startsWith('yolium-report://')
}

/** Extract the file path from a yolium-report:// URI. */
function getReportFilePath(href: string): string {
  return href.replace('yolium-report://', '')
}

/**
 * Custom URL transform that allows yolium-mock:// and data:image/svg+xml URIs
 * while keeping default sanitization for everything else.
 */
function urlTransform(url: string): string | null {
  if (url.startsWith('yolium-mock://')) return url
  if (url.startsWith('yolium-report://')) return url
  if (url.startsWith('data:image/svg+xml')) return url
  // Default behavior: allow http, https, mailto
  if (/^https?:\/\//i.test(url)) return url
  if (/^mailto:/i.test(url)) return url
  if (url.startsWith('#') || url.startsWith('/')) return url
  return ''
}

interface CopyButtonProps {
  text: string
  title: string
  testId: string
  size?: number
  className?: string
}

function CopyButton({ text, title, testId, size = 12, className = '' }: CopyButtonProps): React.ReactElement {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    if (!text || !navigator.clipboard?.writeText) return
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [text])

  return (
    <button
      data-testid={testId}
      onClick={handleCopy}
      title={title}
      className={`inline-flex items-center justify-center w-5 h-5 rounded hover:bg-[var(--color-bg-secondary)] transition-colors ${className}`}
    >
      {copied ? (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  )
}

function extractTextContent(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') {
    return ''
  }

  if (typeof node === 'string' || typeof node === 'number') {
    return String(node)
  }

  if (Array.isArray(node)) {
    return node.map(extractTextContent).join('')
  }

  if (React.isValidElement(node)) {
    return extractTextContent((node.props as { children?: React.ReactNode }).children)
  }

  return ''
}

function extractLanguage(node: React.ReactNode): string | null {
  if (node === null || node === undefined || typeof node === 'boolean') {
    return null
  }

  if (Array.isArray(node)) {
    for (const child of node) {
      const language = extractLanguage(child)
      if (language) return language
    }
    return null
  }

  if (!React.isValidElement(node)) {
    return null
  }

  const { className, children } = node.props as { className?: string; children?: React.ReactNode }
  const languageMatch = className?.match(/language-([a-z0-9_-]+)/i)
  if (languageMatch?.[1]) {
    return languageMatch[1].toLowerCase()
  }

  return extractLanguage(children)
}

function CopyableCodeBlock({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLPreElement>): React.ReactElement {
  const codeText = extractTextContent(children)
  const language = extractLanguage(children)

  return (
    <div className="relative group my-1">
      {language && (
        <span
          data-testid="code-language-label"
          className="absolute top-2 left-2 z-10 text-[10px] uppercase tracking-wide text-[var(--color-text-tertiary)] bg-[var(--color-bg-primary)] px-1 py-0.5 rounded"
        >
          {language}
        </span>
      )}
      <CopyButton
        text={codeText}
        title="Copy code"
        testId="copy-code-block-button"
        className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
      />
      <pre
        className={`text-sm text-[var(--color-text-primary)] font-mono bg-[var(--color-bg-secondary)] rounded border border-[var(--color-border-primary)] ${className || ''}`}
        {...props}
      >
        {children}
      </pre>
    </div>
  )
}

/**
 * Non-navigable link that displays the URL as a copyable and openable path.
 * Prevents Electron from navigating away from the app when links are clicked.
 */
function CopyableLink({ href, children }: { href?: string; children?: React.ReactNode }): React.ReactElement {
  const displayUrl = href || ''

  const handleOpen = useCallback(() => {
    if (!displayUrl) return
    window.electronAPI.app.openExternal(displayUrl)
  }, [displayUrl])

  // If link text is different from the URL, show both; otherwise just show the URL
  const linkText = typeof children === 'string' ? children : undefined
  const showLabel = linkText && linkText !== displayUrl

  return (
    <span
      data-testid="copyable-link"
      className="inline-flex items-center gap-1 text-[var(--color-accent-primary)]"
    >
      {showLabel && <span>{children} — </span>}
      <code className="text-xs bg-[var(--color-bg-secondary)] px-1 py-0.5 rounded select-all">{displayUrl}</code>
      <CopyButton
        text={displayUrl}
        title="Copy URL"
        testId="copy-link-button"
      />
      <button
        data-testid="open-link-button"
        onClick={handleOpen}
        title="Open in browser"
        className="inline-flex items-center justify-center w-5 h-5 rounded hover:bg-[var(--color-bg-secondary)] transition-colors"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
          <polyline points="15 3 21 3 21 9" />
          <line x1="10" y1="14" x2="21" y2="3" />
        </svg>
      </button>
    </span>
  )
}

function createMarkdownComponents(onOpenMock: (filePath: string) => void) {
  return {
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
        return <code className={`block text-xs font-mono overflow-x-auto p-2 pt-7 ${className || ''}`} {...props}>{children}</code>
      }
      return <code className="bg-[var(--color-bg-secondary)] px-1 py-0.5 rounded text-xs font-mono" {...props}>{children}</code>
    },
    pre: ({ children, ...props }: React.HTMLAttributes<HTMLPreElement>) => <CopyableCodeBlock {...props}>{children}</CopyableCodeBlock>,
    strong: ({ children, ...props }: React.HTMLAttributes<HTMLElement>) => <strong className="font-semibold" {...props}>{children}</strong>,
    a: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => {
      if (isMockLink(href)) {
        return (
          <button
            data-testid="mock-preview-button"
            onClick={() => onOpenMock(getMockFilePath(href!))}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-[var(--color-bg-secondary)] text-[var(--color-accent-primary)] rounded border border-[var(--color-border-primary)] hover:border-[var(--color-accent-primary)] transition-colors cursor-pointer"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
            {children}
          </button>
        )
      }
      if (isReportLink(href)) {
        return (
          <button
            data-testid="report-preview-button"
            onClick={() => window.electronAPI.report.openFile(getReportFilePath(href!))}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-[var(--color-bg-secondary)] text-[var(--color-accent-primary)] rounded border border-[var(--color-border-primary)] hover:border-[var(--color-accent-primary)] transition-colors cursor-pointer"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
            {children}
          </button>
        )
      }
      return <CopyableLink href={href}>{children}</CopyableLink>
    },
    img: ({ src, alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => {
      if (!isSvgDataUri(src)) {
        return <span data-testid="blocked-image" className="text-xs text-[var(--color-text-tertiary)] italic">[image blocked]</span>
      }
      return (
        <img
          data-testid="svg-image"
          src={src}
          alt={alt || 'SVG wireframe'}
          className="max-w-full rounded border border-[var(--color-border-primary)] my-2"
          {...props}
        />
      )
    },
    table: ({ children, ...props }: React.TableHTMLAttributes<HTMLTableElement>) => <table className="text-xs border-collapse my-2 w-full" {...props}>{children}</table>,
    th: ({ children, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) => <th className="border border-[var(--color-border-primary)] px-2 py-1 text-left font-semibold bg-[var(--color-bg-secondary)]" {...props}>{children}</th>,
    td: ({ children, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) => <td className="border border-[var(--color-border-primary)] px-2 py-1" {...props}>{children}</td>,
    blockquote: ({ children, ...props }: React.BlockquoteHTMLAttributes<HTMLQuoteElement>) => <blockquote className="border-l-2 border-[var(--color-border-secondary)] pl-3 my-1 text-[var(--color-text-secondary)]" {...props}>{children}</blockquote>,
    hr: (props: React.HTMLAttributes<HTMLHRElement>) => <hr className="border-[var(--color-border-primary)] my-2" {...props} />,
  }
}

const commentBadgeColors: Record<CommentSource, string> = {
  user: 'bg-[var(--color-status-success)]',
  agent: 'bg-[var(--color-status-info)]',
  system: 'bg-[var(--color-status-stopped)]',
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
  focusedCommentId?: string | null
  selectedCommentIds?: Set<string>
}

/**
 * Display a list of comments with source badges and timestamps.
 * @param props - Component props
 */
export function CommentsList({ comments, onSelectOption, focusedCommentId, selectedCommentIds }: CommentsListProps): React.ReactElement {
  const [mockFilePath, setMockFilePath] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const markdownComponents = createMarkdownComponents(setMockFilePath)

  const filteredComments = useMemo(() => {
    if (!searchQuery) return comments
    const query = searchQuery.toLowerCase()
    return comments.filter(c => c.text.toLowerCase().includes(query))
  }, [comments, searchQuery])

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
          <div className="relative">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)]">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              data-testid="comment-search-input"
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search comments..."
              className="w-full pl-8 pr-16 py-1.5 text-sm bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-md text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:outline-none focus:border-[var(--color-accent-primary)] focus:ring-1 focus:ring-[var(--color-accent-primary)] transition-all"
              onKeyDown={e => {
                if (e.key === 'Escape') {
                  e.stopPropagation()
                  setSearchQuery('')
                }
              }}
            />
            {searchQuery && (
              <>
                <span
                  data-testid="comment-search-count"
                  className="absolute right-8 top-1/2 -translate-y-1/2 text-[10px] text-[var(--color-text-tertiary)] whitespace-nowrap"
                >
                  {filteredComments.length} of {comments.length}
                </span>
                <button
                  data-testid="comment-search-clear"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </>
            )}
          </div>
          {filteredComments.length === 0 && searchQuery ? (
            <p className="text-sm text-[var(--color-text-tertiary)] italic">No matching comments</p>
          ) : null}
          {filteredComments.map(comment => (
            <div
              key={comment.id}
              data-comment-id={comment.id}
              className={`bg-[var(--color-bg-primary)] rounded-md p-3 border border-[var(--color-border-primary)]${focusedCommentId === comment.id ? ' ring-2 ring-[var(--color-accent-primary)]' : ''}${selectedCommentIds?.has(comment.id) ? ' bg-[var(--color-accent-primary)]/10' : ''}`}
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-2">
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
                <CopyButton
                  text={comment.text}
                  title="Copy comment"
                  testId={`copy-comment-${comment.id}`}
                  className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]"
                />
              </div>
              {(() => {
                const prettyJson = getPrettyJson(comment.text)

                if (prettyJson) {
                  return (
                    <div className="relative group my-1">
                      <span className="absolute top-2 left-2 z-10 text-[10px] uppercase tracking-wide text-[var(--color-text-tertiary)] bg-[var(--color-bg-primary)] px-1 py-0.5 rounded">
                        JSON
                      </span>
                      <CopyButton
                        text={prettyJson}
                        title="Copy JSON"
                        testId={`copy-json-${comment.id}`}
                        className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                      />
                      <pre
                        data-testid={`comment-json-${comment.id}`}
                        className="text-sm text-[var(--color-text-primary)] font-mono whitespace-pre-wrap bg-[var(--color-bg-secondary)] p-2 pt-7 rounded border border-[var(--color-border-primary)]"
                      >
                        {prettyJson}
                      </pre>
                    </div>
                  )
                }

                return (
                  <div className="text-sm text-[var(--color-text-primary)]">
                    <Markdown components={markdownComponents} urlTransform={urlTransform}>{comment.text}</Markdown>
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
      <MockPreviewModal
        filePath={mockFilePath}
        isOpen={mockFilePath !== null}
        onClose={() => setMockFilePath(null)}
      />
    </div>
  )
}
