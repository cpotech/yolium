import React, { useState, useEffect, useCallback } from 'react'
import { FolderOpen, RefreshCw, Plus, Loader2 } from 'lucide-react'
import { KanbanColumn } from './KanbanColumn'
import { NewItemDialog } from './NewItemDialog'
import { ItemDetailDialog } from './ItemDetailDialog'
import type { KanbanBoard, KanbanItem, KanbanColumn as ColumnId } from '../types/kanban'

interface KanbanViewProps {
  projectPath: string | null
}

const columns: { id: ColumnId; title: string }[] = [
  { id: 'backlog', title: 'Backlog' },
  { id: 'ready', title: 'Ready' },
  { id: 'in-progress', title: 'In Progress' },
  { id: 'done', title: 'Done' },
]

export function KanbanView({ projectPath }: KanbanViewProps): React.ReactElement {
  const [board, setBoard] = useState<KanbanBoard | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [newItemDialogOpen, setNewItemDialogOpen] = useState(false)
  const [selectedItem, setSelectedItem] = useState<KanbanItem | null>(null)

  const loadBoard = useCallback(async () => {
    if (!projectPath) return

    setIsLoading(true)
    try {
      const result = await window.electronAPI.kanbanGetBoard(projectPath)
      setBoard(result)
    } catch (error) {
      console.error('Failed to load kanban board:', error)
    } finally {
      setIsLoading(false)
    }
  }, [projectPath])

  // Load board on mount and when projectPath changes
  useEffect(() => {
    if (projectPath) {
      loadBoard()
    } else {
      setBoard(null)
    }
  }, [projectPath, loadBoard])

  // Subscribe to board updates
  useEffect(() => {
    const cleanup = window.electronAPI.onKanbanBoardUpdated((updatedPath) => {
      if (updatedPath === projectPath) {
        loadBoard()
      }
    })

    return cleanup
  }, [projectPath, loadBoard])

  const handleRefresh = useCallback(() => {
    loadBoard()
  }, [loadBoard])

  const handleNewItemClick = useCallback(() => {
    setNewItemDialogOpen(true)
  }, [])

  const handleNewItemClose = useCallback(() => {
    setNewItemDialogOpen(false)
  }, [])

  const handleNewItemCreated = useCallback(() => {
    setNewItemDialogOpen(false)
    loadBoard()
  }, [loadBoard])

  const handleCardClick = useCallback((item: KanbanItem) => {
    setSelectedItem(item)
  }, [])

  const handleDetailClose = useCallback(() => {
    setSelectedItem(null)
  }, [])

  const handleDetailUpdated = useCallback(() => {
    setSelectedItem(null)
    loadBoard()
  }, [loadBoard])

  // Empty state when no project selected
  if (!projectPath) {
    return (
      <div
        data-testid="kanban-empty-state"
        className="flex-1 flex items-center justify-center bg-[var(--color-bg-primary)]"
      >
        <div className="text-center">
          <FolderOpen size={48} className="mx-auto mb-4 text-[var(--color-text-tertiary)]" />
          <p className="text-[var(--color-text-secondary)]">
            Select a project from the sidebar to view the Kanban board
          </p>
        </div>
      </div>
    )
  }

  // Loading state
  if (isLoading && !board) {
    return (
      <div
        data-testid="kanban-loading"
        className="flex-1 flex items-center justify-center bg-[var(--color-bg-primary)]"
      >
        <Loader2 size={32} className="animate-spin text-[var(--color-accent-primary)]" />
      </div>
    )
  }

  // Get items for each column
  const getColumnItems = (columnId: ColumnId): KanbanItem[] => {
    if (!board) return []
    return board.items
      .filter((item) => item.column === columnId)
      .sort((a, b) => a.order - b.order)
  }

  return (
    <div className="flex-1 flex flex-col bg-[var(--color-bg-primary)]">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border-primary)]">
        <div className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
          <FolderOpen size={16} />
          <span data-testid="project-path-display" className="font-medium">
            {projectPath}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            data-testid="refresh-button"
            onClick={handleRefresh}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-[var(--color-text-secondary)] hover:text-white hover:bg-[var(--color-bg-tertiary)] rounded-md transition-colors"
          >
            <RefreshCw size={14} />
            Refresh
          </button>
          <button
            data-testid="new-item-button"
            onClick={handleNewItemClick}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-[var(--color-accent-primary)] text-white hover:bg-[var(--color-accent-hover)] rounded-md transition-colors"
          >
            <Plus size={14} />
            New Item
          </button>
        </div>
      </div>

      {/* Columns container */}
      <div
        data-testid="kanban-columns-container"
        className="flex-1 overflow-x-auto p-4"
      >
        <div className="flex gap-4 h-full">
          {columns.map((col) => (
            <KanbanColumn
              key={col.id}
              columnId={col.id}
              title={col.title}
              items={getColumnItems(col.id)}
              onCardClick={handleCardClick}
            />
          ))}
        </div>
      </div>

      {/* New Item Dialog */}
      <NewItemDialog
        isOpen={newItemDialogOpen}
        projectPath={projectPath}
        onClose={handleNewItemClose}
        onCreated={handleNewItemCreated}
      />

      {/* Item Detail Dialog */}
      <ItemDetailDialog
        isOpen={selectedItem !== null}
        item={selectedItem}
        projectPath={projectPath}
        onClose={handleDetailClose}
        onUpdated={handleDetailUpdated}
      />
    </div>
  )
}
