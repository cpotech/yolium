import React from 'react'
import { KanbanCard } from './KanbanCard'
import type { KanbanItem, KanbanColumn as ColumnId } from '../types/kanban'

interface KanbanColumnProps {
  columnId: ColumnId
  title: string
  items: KanbanItem[]
  onCardClick: (item: KanbanItem) => void
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
}: KanbanColumnProps): React.ReactElement {
  const borderColor = columnBorderColors[columnId]

  return (
    <div
      data-testid={`kanban-column-${columnId}`}
      className={`w-72 min-w-72 flex flex-col bg-[var(--color-bg-secondary)] rounded-md border-t-4 ${borderColor}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-border-primary)]">
        <h2 className="text-sm font-semibold text-white">{title}</h2>
        <span
          data-testid="item-count"
          className="px-2 py-0.5 text-xs font-medium rounded-full bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]"
        >
          {items.length}
        </span>
      </div>

      {/* Cards area */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {items.length === 0 ? (
          <p className="text-center text-sm text-[var(--color-text-secondary)] py-4">
            No items
          </p>
        ) : (
          items.map((item) => (
            <KanbanCard key={item.id} item={item} onClick={onCardClick} />
          ))
        )}
      </div>
    </div>
  )
}
