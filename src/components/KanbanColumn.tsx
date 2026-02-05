import React, { useState } from 'react'
import { KanbanCard } from './KanbanCard'
import type { KanbanItem, KanbanColumn as ColumnId } from '../types/kanban'

interface KanbanColumnProps {
  columnId: ColumnId
  title: string
  items: KanbanItem[]
  onCardClick: (item: KanbanItem) => void
  onCardDrop?: (itemId: string, targetColumn: ColumnId) => void
}

const columnBorderColors: Record<ColumnId, string> = {
  backlog: 'border-t-gray-500',
  ready: 'border-t-blue-500',
  'in-progress': 'border-t-yellow-500',
  done: 'border-t-green-500',
}

export function KanbanColumn({
  columnId,
  title,
  items,
  onCardClick,
  onCardDrop,
}: KanbanColumnProps): React.ReactElement {
  const borderColor = columnBorderColors[columnId]
  const [isDragOver, setIsDragOver] = useState(false)

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
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`w-72 min-w-72 flex flex-col bg-[var(--color-bg-secondary)] rounded-md border-t-4 ${borderColor} transition-all ${
        isDragOver ? 'ring-2 ring-[var(--color-accent-primary)] bg-[var(--color-bg-tertiary)]' : ''
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-border-primary)]">
        <h2 className="text-sm font-semibold text-white">{title}</h2>
        <div className="flex items-center gap-1.5">
          {runningCount > 0 && (
            <span
              data-testid="running-count"
              className="px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-yellow-500/20 text-yellow-400"
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
      <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[100px]">
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
          items.map((item) => (
            <KanbanCard key={item.id} item={item} onClick={onCardClick} />
          ))
        )}
      </div>
    </div>
  )
}
