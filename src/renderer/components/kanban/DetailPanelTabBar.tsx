import React from 'react'
import { X } from 'lucide-react'
import type { KanbanItem } from '@shared/types/kanban'

interface DetailPanelTabBarProps {
  items: KanbanItem[]
  activeItemId: string | null
  onTabClick: (itemId: string) => void
  onTabClose: (itemId: string) => void
}

export function DetailPanelTabBar({ items, activeItemId, onTabClick, onTabClose }: DetailPanelTabBarProps): React.ReactElement | null {
  if (items.length === 0) return null

  return (
    <div
      data-testid="detail-panel-tab-bar"
      className="flex items-center gap-0 border-b border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] overflow-x-auto shrink-0"
    >
      {items.map(item => {
        const isActive = item.id === activeItemId
        return (
          <div
            key={item.id}
            data-testid="detail-tab"
            data-active={isActive ? 'true' : 'false'}
            onClick={() => onTabClick(item.id)}
            onMouseDown={(e) => {
              // Middle-click to close
              if (e.button === 1) {
                e.preventDefault()
                onTabClose(item.id)
              }
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs cursor-pointer border-r border-[var(--color-border-primary)] max-w-[180px] min-w-[80px] group transition-colors ${
              isActive
                ? 'bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] border-b-2 border-b-[var(--color-accent-primary)]'
                : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] border-b-2 border-b-transparent'
            }`}
          >
            <span className="truncate flex-1">{item.title}</span>
            <button
              data-testid="detail-tab-close"
              onClick={(e) => {
                e.stopPropagation()
                onTabClose(item.id)
              }}
              className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-[var(--color-bg-tertiary)] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] transition-all shrink-0"
            >
              <X size={12} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
