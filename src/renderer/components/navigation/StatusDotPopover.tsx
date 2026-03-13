import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MessageSquare, Play } from 'lucide-react'
import type { KanbanColumn } from '@shared/types/kanban'
import type { SidebarWorkItem } from './ProjectList'

interface StatusDotPopoverProps {
  item: SidebarWorkItem
  onAnswer: (item: SidebarWorkItem, answer: string) => Promise<void> | void
}

const columnDotColors: Record<KanbanColumn, string> = {
  'backlog': 'bg-[var(--color-status-stopped)]',
  'ready': 'bg-[var(--color-status-info)]',
  'in-progress': 'bg-[var(--color-status-warning)]',
  'verify': 'bg-[var(--color-special-worktree)]',
  'done': 'bg-[var(--color-status-success)]',
}

function getDotClasses(item: SidebarWorkItem): string {
  if (item.agentStatus === 'failed') {
    return 'bg-[var(--color-status-error)]'
  }
  const colorClass = item.column ? columnDotColors[item.column] : 'bg-[var(--color-status-stopped)]'
  if (item.agentStatus === 'running') {
    return `${colorClass} animate-pulse`
  }
  return colorClass
}

export function StatusDotPopover({
  item,
  onAnswer,
}: StatusDotPopoverProps): React.ReactElement {
  const [isOpen, setIsOpen] = useState(false)
  const [isResuming, setIsResuming] = useState(false)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const popoverRef = useRef<HTMLDivElement | null>(null)

  const isWaiting = item.agentStatus === 'waiting' && Boolean(item.question)

  useEffect(() => {
    if (!isOpen || !buttonRef.current) {
      return
    }

    const rect = buttonRef.current.getBoundingClientRect()
    setPosition({
      top: rect.top + window.scrollY - 8,
      left: rect.right + window.scrollX + 8,
    })
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null
      if (!target) {
        return
      }

      if (buttonRef.current?.contains(target) || popoverRef.current?.contains(target)) {
        return
      }

      setIsOpen(false)
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen])

  const handleDotClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (!isWaiting) {
      return
    }

    event.stopPropagation()
    setIsOpen((current) => !current)
  }

  const handleAnswerClick = async (event: React.MouseEvent<HTMLButtonElement>, answer: string) => {
    event.stopPropagation()
    setIsResuming(true)
    try {
      await onAnswer(item, answer)
      setIsOpen(false)
    } finally {
      setIsResuming(false)
    }
  }

  const popover = isOpen && position && isWaiting ? createPortal(
    <div
      ref={popoverRef}
      data-testid={`status-popover-${item.itemId}`}
      className="fixed z-50 w-60 rounded-lg border border-[var(--color-status-warning)]/40 bg-[var(--color-bg-secondary)] p-3 shadow-2xl"
      style={{ top: position.top, left: position.left }}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-[var(--color-status-warning)]">
        <MessageSquare size={12} />
        <span data-testid={`status-popover-title-${item.itemId}`} className="truncate">{item.itemTitle}</span>
      </div>
      <p data-testid={`status-popover-question-${item.itemId}`} className="mb-3 text-xs leading-5 text-[var(--color-text-primary)]">{item.question}</p>
      {item.options && item.options.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {item.options.map((option, index) => (
            <button
              key={`${item.itemId}-${option}-${index}`}
              type="button"
              data-testid={`status-popover-option-${item.itemId}-${index}`}
              disabled={isResuming}
              onClick={(event) => {
                void handleAnswerClick(event, option)
              }}
              className="rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-2 py-1 text-[11px] text-[var(--color-text-primary)] transition-colors hover:border-[var(--color-status-warning)] hover:text-[var(--color-status-warning)] disabled:cursor-wait disabled:opacity-60"
            >
              {option}
            </button>
          ))}
        </div>
      )}
      {isResuming && (
        <div className="mt-2 flex items-center gap-1 text-[11px] text-[var(--color-status-warning)]">
          <Play size={10} />
          <span>Resuming...</span>
        </div>
      )}
    </div>,
    document.body,
  ) : null

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        data-testid={`status-dot-${item.itemId}`}
        data-status={item.agentStatus}
        title={item.itemTitle}
        aria-label={`${item.itemTitle} status`}
        aria-haspopup={isWaiting ? 'dialog' : undefined}
        aria-expanded={isWaiting ? isOpen : undefined}
        onClick={handleDotClick}
        className={`h-[7px] w-[7px] rounded-full ${getDotClasses(item)} ${
          isWaiting ? 'cursor-pointer' : 'cursor-default'
        }`}
      />
      {popover}
    </>
  )
}
