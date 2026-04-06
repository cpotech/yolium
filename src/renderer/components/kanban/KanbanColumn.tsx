import React, { useState, useCallback } from 'react'
import { KanbanCard } from './KanbanCard'
import type { KanbanItem, KanbanColumn as ColumnId } from '@shared/types/kanban'
import { useVimModeContext } from '@renderer/context/VimModeContext'
import { useVimListNavigation } from '@renderer/hooks/useVimListNavigation'

interface KanbanColumnProps {
  columnId: ColumnId
  title: string
  items: KanbanItem[]
  selectedIds?: Set<string>
  selectedItemId?: string
  openItemIds?: Set<string>
  focusedCardIndex?: number
  onCardClick: (item: KanbanItem, event: React.MouseEvent | React.KeyboardEvent) => void
  onCardDrop?: (itemId: string, targetColumn: ColumnId) => void
  onRetryAgent?: (itemId: string) => void
  onResumeAgent?: (itemId: string) => void
  onRunAgainAgent?: (itemId: string) => void
  onFixConflicts?: (itemId: string) => void
  onFocusedCardChange?: (index: number) => void
}

const columnBorderColors: Record<ColumnId, string> = {
  backlog: 'border-t-[var(--color-status-stopped)]',
  ready: 'border-t-[var(--color-status-info)]',
  'in-progress': 'border-t-[var(--color-status-warning)]',
  verify: 'border-t-[var(--color-special-worktree)]',
  done: 'border-t-[var(--color-status-success)]',
}

export function KanbanColumn({
  columnId,
  title,
  items,
  selectedIds,
  selectedItemId,
  openItemIds,
  focusedCardIndex,
  onCardClick,
  onCardDrop,
  onRetryAgent,
  onResumeAgent,
  onRunAgainAgent,
  onFixConflicts,
  onFocusedCardChange,
}: KanbanColumnProps): React.ReactElement {
  const borderColor = columnBorderColors[columnId]
  const [isDragOver, setIsDragOver] = useState(false)
  const vim = useVimModeContext()
  const isVimActive = vim.mode === 'NORMAL' && vim.activeZone === 'content'

  const { handleNavKeys } = useVimListNavigation({
    itemCount: items.length,
    enabled: isVimActive && focusedCardIndex !== undefined,
    onIndexChange: (idx) => onFocusedCardChange?.(idx),
    currentIndex: focusedCardIndex ?? 0,
  })

  const handleVimKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!isVimActive || items.length === 0 || focusedCardIndex === undefined) return

    if (handleNavKeys(e)) {
      e.preventDefault()
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      const idx = Math.min(focusedCardIndex, items.length - 1)
      onCardClick(items[idx], e as unknown as React.KeyboardEvent)
    }
  }, [isVimActive, items, focusedCardIndex, onCardClick, handleNavKeys])

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setIsDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    // Only trigger if leaving the column itself, not a child
    if (e.currentTarget.contains(e.relatedTarget as Node)) return
    setIsDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const itemId = e.dataTransfer.getData('text/plain')
    if (itemId && onCardDrop) {
      onCardDrop(itemId, columnId)
    }
  }

  // Count running items for status display
  const runningCount = items.filter(i => i.agentStatus === 'running').length

  return (
    <div
      data-testid={`kanban-column-${columnId}`}
      aria-label={`${title} column, ${items.length} items`}
      tabIndex={isVimActive && focusedCardIndex !== undefined ? 0 : undefined}
      onKeyDown={handleVimKeyDown}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`flex-1 min-w-[250px] flex flex-col bg-[var(--color-bg-secondary)] rounded-md border-t-4 ${borderColor} transition-all ${
        isDragOver ? 'ring-2 ring-[var(--color-accent-primary)] bg-[var(--color-bg-tertiary)]' : ''
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-border-primary)]">
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">{title}</h2>
        <div className="flex items-center gap-1.5">
          {runningCount > 0 && (
            <span
              data-testid="running-count"
              className="px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-[var(--color-status-warning)]/20 text-[var(--color-status-warning)]"
            >
              {runningCount} running
            </span>
          )}
          <span
            data-testid="item-count"
            className="flex-shrink-0 px-2 py-0.5 text-xs font-medium rounded-full bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]"
          >
            {items.length}
          </span>
        </div>
      </div>

      {/* Cards area */}
      <div className="flex-1 overflow-y-auto yolium-scrollbar p-2 space-y-2 min-h-[100px]">
        {items.length === 0 ? (
          <div
            data-testid="column-empty-state"
            className={`text-center py-6 rounded-md border-2 border-dashed transition-colors ${
              isDragOver
                ? 'border-[var(--color-accent-primary)] text-[var(--color-accent-primary)]'
                : 'border-transparent text-[var(--color-text-tertiary)]'
            }`}
          >
            <p className="text-sm">{isDragOver ? 'Drop here' : 'No items'}</p>
          </div>
        ) : (
          items.map((item, itemIndex) => (
            <KanbanCard
              key={item.id}
              item={item}
              isSelected={selectedIds?.has(item.id)}
              isActiveItem={item.id === selectedItemId}
              isOpenInTab={openItemIds?.has(item.id) && item.id !== selectedItemId}
              isFocused={isVimActive && focusedCardIndex === itemIndex}
              onClick={onCardClick}
              onRetryAgent={onRetryAgent}
              onResumeAgent={onResumeAgent}
              onRunAgainAgent={onRunAgainAgent}
              onFixConflicts={onFixConflicts}
            />
          ))
        )}
      </div>
    </div>
  )
}
