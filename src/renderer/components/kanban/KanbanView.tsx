import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { FolderOpen, RefreshCw, Plus, Loader2, X, AlertTriangle, Search, GitBranch, Trash2, CheckSquare, Keyboard } from 'lucide-react'
import { KanbanColumn } from './KanbanColumn'
import { NewItemDialog } from './NewItemDialog'
import { ItemDetailDialog } from './ItemDetailDialog'
import type { KanbanBoard, KanbanItem, KanbanColumn as ColumnId } from '@shared/types/kanban'
import { prepareConflictResolution } from './item-detail/useItemDetailPrWorkflow'
import { useVimModeContext } from '@renderer/context/VimModeContext'
import { useConfirmDialog } from '@renderer/hooks/useConfirmDialog'
import { ConfirmDialog } from '@renderer/components/shared/ConfirmDialog'
import type { WhisperRecordingState, WhisperModelSize } from '@shared/types/whisper'
import type { ClaudeUsageState } from '@shared/types/agent'

interface KanbanViewProps {
  projectPath: string | null
  onSwitchProject?: (newPath: string) => void
  onDeleteProject?: (projectPath: string) => void
  // StatusBar props
  onShowShortcuts?: () => void
  onOpenSettings?: () => void
  onOpenProjectSettings?: () => void
  whisperRecordingState?: WhisperRecordingState
  whisperSelectedModel?: WhisperModelSize
  onToggleRecording?: () => void
  onOpenModelDialog?: () => void
  claudeUsage?: ClaudeUsageState
}

const columns: { id: ColumnId; title: string }[] = [
  { id: 'backlog', title: 'Backlog' },
  { id: 'ready', title: 'Ready' },
  { id: 'in-progress', title: 'In Progress' },
  { id: 'verify', title: 'Verify' },
  { id: 'done', title: 'Done' },
]

function resolveAgentName(item: KanbanItem): string {
  return item.activeAgentName || item.lastAgentName || item.agentType || 'code-agent'
}

export function KanbanView({
  projectPath,
  onSwitchProject,
  onDeleteProject,
  // StatusBar props
  onShowShortcuts,
  onOpenSettings,
  onOpenProjectSettings,
  whisperRecordingState,
  whisperSelectedModel,
  onToggleRecording,
  onOpenModelDialog,
  claudeUsage,
}: KanbanViewProps): React.ReactElement {
  const [board, setBoard] = useState<KanbanBoard | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [newItemDialogOpen, setNewItemDialogOpen] = useState(false)
  const [selectedItem, setSelectedItem] = useState<KanbanItem | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [gitWarning, setGitWarning] = useState<{
    isRepo: boolean
    nestedRepos: Array<{ name: string; path: string }>
  } | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const lastClickedIdRef = useRef<string | null>(null)
  const viewRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const { confirm: confirmAction, dialogProps: confirmDialogProps } = useConfirmDialog()
  const vim = useVimModeContext()
  const isVisualMode = vim.mode === 'VISUAL'
  const isVimContentActive = (vim.mode === 'NORMAL' || isVisualMode) && vim.activeZone === 'content'
  const [focusedColumnIndex, setFocusedColumnIndex] = useState(0)
  const [focusedCardIndex, setFocusedCardIndex] = useState(0)
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false)
  const gPendingRef = useRef(false)
  const visualAnchorIndexRef = useRef(-1)
  // Ref to track dialog open state without stale closures
  const dialogOpenRef = useRef(false)
  // Ref to track when user is interacting with any input (prevents focus theft)
  const isUserInputActiveRef = useRef(false)
  // Recover stale "running" items once per project path after restart/crash.
  const recoveredProjectsRef = useRef<Set<string>>(new Set())

  const loadBoard = useCallback(async () => {
    if (!projectPath) return

    setIsLoading(true)
    try {
      const result = await window.electronAPI.kanban.getBoard(projectPath)
      setBoard(result)
      setErrorMessage(null)
      // Sync selectedItem with refreshed board data so the detail dialog shows live state
      if (result) {
        setSelectedItem(prev => {
          if (!prev) return prev
          const updated = result.items.find(i => i.id === prev.id)
          return updated || null
        })
      }
    } catch (error) {
      console.error('Failed to load kanban board:', error)
      setErrorMessage('Failed to load board. Check your project path and try refreshing.')
    } finally {
      setIsLoading(false)
    }
  }, [projectPath])

  // Load board on mount and when projectPath changes.
  // On first load for a project, recover stale running items from previous app sessions.
  useEffect(() => {
    if (projectPath) {
      let cancelled = false
      const initializeBoard = async () => {
        if (!recoveredProjectsRef.current.has(projectPath)) {
          try {
            await window.electronAPI.agent.recover(projectPath)
            recoveredProjectsRef.current.add(projectPath)
          } catch (error) {
            console.error('Failed to recover stale agent state:', error)
          }
        }

        if (!cancelled) {
          loadBoard()
        }
      }

      initializeBoard()
      return () => {
        cancelled = true
      }
    } else {
      setBoard(null)
    }
  }, [projectPath, loadBoard])

  // Update dialogOpenRef whenever dialog state changes
  useEffect(() => {
    dialogOpenRef.current = newItemDialogOpen || selectedItem !== null
  }, [newItemDialogOpen, selectedItem])

  // Subscribe to board updates from IPC (item added, deleted, state changed).
  // Always refresh on IPC events — the detail dialog syncs selectedItem via
  // loadBoard() without resetting form fields (prevItemIdRef guard).
  useEffect(() => {
    const cleanup = window.electronAPI.kanban.onBoardUpdated((updatedPath) => {
      // Normalize both paths for comparison (Windows backslash vs forward slash)
      const normalize = (p: string) => p.replace(/\\/g, '/')
      if (projectPath && normalize(updatedPath) === normalize(projectPath)) {
        loadBoard()
      }
    })

    return cleanup
  }, [projectPath, loadBoard])

  // Auto-focus view after board loads so keyboard shortcuts work immediately
  useEffect(() => {
    if (board && !isLoading && viewRef.current) {
      // Don't steal focus from open dialogs
      if (dialogOpenRef.current) return
      // Don't steal focus from active input elements
      const active = document.activeElement
      const tag = active?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      viewRef.current.focus()
    }
  }, [board, isLoading])

  // Focus container when content zone becomes active
  useEffect(() => {
    if (isVimContentActive && viewRef.current) {
      const active = document.activeElement
      const tag = active?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      viewRef.current.focus()
    }
  }, [isVimContentActive])

  // Auto-refresh every 15 seconds
  useEffect(() => {
    if (!projectPath) return

    const intervalId = setInterval(() => {
      // Skip refresh if a dialog is open or user is typing in an input
      if (!dialogOpenRef.current && !isUserInputActiveRef.current) {
        loadBoard()
      }
    }, 15000)

    return () => clearInterval(intervalId)
  }, [projectPath, loadBoard])

  // Check if project path is a git repo; detect nested repos if not
  useEffect(() => {
    if (!projectPath) {
      setGitWarning(null)
      return
    }
    let cancelled = false
    window.electronAPI.git.detectNestedRepos(projectPath).then(result => {
      if (!cancelled) {
        setGitWarning(result.isRepo ? null : result)
      }
    }).catch(() => {
      if (!cancelled) setGitWarning(null)
    })
    return () => { cancelled = true }
  }, [projectPath])

  const handleInitGit = useCallback(async () => {
    if (!projectPath) return
    await window.electronAPI.git.init(projectPath)
    // Re-check after init
    const result = await window.electronAPI.git.detectNestedRepos(projectPath)
    setGitWarning(result.isRepo ? null : result)
  }, [projectPath])

  const handleRefresh = useCallback(() => {
    loadBoard()
  }, [loadBoard])

  const handleNewItemClick = useCallback(() => {
    setNewItemDialogOpen(true)
  }, [])

  const handleNewItemClose = useCallback(() => {
    setNewItemDialogOpen(false)
    // Refresh board when dialog closes to catch missed updates
    loadBoard()
  }, [loadBoard])

  const handleNewItemCreated = useCallback(async (item: { id: string; agentType?: string; agentProvider: string; description: string }) => {
    setNewItemDialogOpen(false)
    loadBoard()
    if (item.agentType) {
      await window.electronAPI.agent.start({
        agentName: item.agentType,
        projectPath: projectPath!,
        itemId: item.id,
        goal: item.description,
        agentProvider: item.agentProvider,
      })
      loadBoard()
    }
  }, [loadBoard, projectPath])

  // Compute a flat ordered list of all visible items (used for shift-click range selection)
  const allVisibleItems = useMemo(() => {
    if (!board) return [] as KanbanItem[]
    const query = searchQuery.toLowerCase().trim()
    return columns.flatMap(col =>
      board.items
        .filter(item => item.column === col.id)
        .filter(item => {
          if (!query) return true
          return item.title.toLowerCase().includes(query) || item.description.toLowerCase().includes(query)
        })
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    )
  }, [board, searchQuery])

  const handleCardClick = useCallback((item: KanbanItem, event: React.MouseEvent | React.KeyboardEvent) => {
    const isMetaKey = event.metaKey || event.ctrlKey
    const isShiftKey = event.shiftKey

    if (isMetaKey) {
      // Toggle selection of this item
      setSelectedIds(prev => {
        const next = new Set(prev)
        if (next.has(item.id)) {
          next.delete(item.id)
        } else {
          next.add(item.id)
        }
        return next
      })
      lastClickedIdRef.current = item.id
      return
    }

    if (isShiftKey && lastClickedIdRef.current) {
      // Range select between last clicked and current
      const lastIndex = allVisibleItems.findIndex(i => i.id === lastClickedIdRef.current)
      const currentIndex = allVisibleItems.findIndex(i => i.id === item.id)
      if (lastIndex !== -1 && currentIndex !== -1) {
        const start = Math.min(lastIndex, currentIndex)
        const end = Math.max(lastIndex, currentIndex)
        setSelectedIds(prev => {
          const next = new Set(prev)
          for (let i = start; i <= end; i++) {
            next.add(allVisibleItems[i].id)
          }
          return next
        })
        return
      }
    }

    // Plain click: if items are selected, clear selection; otherwise open detail
    if (selectedIds.size > 0) {
      setSelectedIds(new Set())
      lastClickedIdRef.current = null
    } else {
      setSelectedItem(item)
    }
  }, [selectedIds, allVisibleItems])

  const handleDetailClose = useCallback(() => {
    setSelectedItem(null)
    // Refresh board when dialog closes to catch missed updates
    loadBoard()
  }, [loadBoard])

  const handleDetailUpdated = useCallback(() => {
    loadBoard()
  }, [loadBoard])

  const handleBulkDelete = useCallback(async () => {
    if (!projectPath || selectedIds.size === 0) return

    try {
      await window.electronAPI.kanban.deleteItems(projectPath, Array.from(selectedIds))
      setSelectedIds(new Set())
      lastClickedIdRef.current = null
      loadBoard()
    } catch (error) {
      console.error('Failed to delete items:', error)
      setErrorMessage('Failed to delete items. Please try again.')
    }
  }, [projectPath, selectedIds, loadBoard])

  const handleClearSelection = useCallback(() => {
    setSelectedIds(new Set())
    lastClickedIdRef.current = null
  }, [])

  const getColumnItems = useCallback((columnId: ColumnId): KanbanItem[] => {
    if (!board) return []
    const query = searchQuery.toLowerCase().trim()
    return board.items
      .filter((item) => item.column === columnId)
      .filter((item) => {
        if (!query) return true
        return item.title.toLowerCase().includes(query) || item.description.toLowerCase().includes(query)
      })
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  }, [board, searchQuery])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Only handle when no dialog is open and no input is focused
    const target = e.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return
    if (newItemDialogOpen || selectedItem) return

    // Vim spatial navigation (h/l for columns) in NORMAL mode
    if (isVimContentActive && board) {
      const currentColumnItems = getColumnItems(columns[focusedColumnIndex].id)

      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault()
        if (currentColumnItems.length > 0) {
          const newIndex = (focusedCardIndex + 1) % currentColumnItems.length
          setFocusedCardIndex(newIndex)
          if (isVisualMode) {
            const newCard = currentColumnItems[newIndex]
            const newGlobalIdx = allVisibleItems.findIndex(i => i.id === newCard.id)
            const anchor = visualAnchorIndexRef.current
            const start = Math.min(anchor, newGlobalIdx)
            const end = Math.max(anchor, newGlobalIdx)
            setSelectedIds(new Set(allVisibleItems.slice(start, end + 1).map(i => i.id)))
          }
        }
        gPendingRef.current = false
        return
      }
      if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault()
        if (currentColumnItems.length > 0) {
          const newIndex = (focusedCardIndex - 1 + currentColumnItems.length) % currentColumnItems.length
          setFocusedCardIndex(newIndex)
          if (isVisualMode) {
            const newCard = currentColumnItems[newIndex]
            const newGlobalIdx = allVisibleItems.findIndex(i => i.id === newCard.id)
            const anchor = visualAnchorIndexRef.current
            const start = Math.min(anchor, newGlobalIdx)
            const end = Math.max(anchor, newGlobalIdx)
            setSelectedIds(new Set(allVisibleItems.slice(start, end + 1).map(i => i.id)))
          }
        }
        gPendingRef.current = false
        return
      }
      if (e.key === 'g') {
        if (gPendingRef.current) {
          e.preventDefault()
          if (currentColumnItems.length > 0) {
            setFocusedCardIndex(0)
          }
          gPendingRef.current = false
          return
        } else {
          gPendingRef.current = true
          return
        }
      }
      if (e.key === 'G') {
        e.preventDefault()
        if (currentColumnItems.length > 0) {
          setFocusedCardIndex(currentColumnItems.length - 1)
        }
        gPendingRef.current = false
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        const idx = Math.min(focusedCardIndex, currentColumnItems.length - 1)
        if (currentColumnItems[idx]) {
          handleCardClick(currentColumnItems[idx], e)
        }
        gPendingRef.current = false
        return
      }

      if (e.key === 'v' && !isVisualMode) {
        e.preventDefault()
        const clampedIdx = Math.min(focusedCardIndex, Math.max(currentColumnItems.length - 1, 0))
        const focusedCard = currentColumnItems[clampedIdx]
        if (focusedCard) {
          const globalIdx = allVisibleItems.findIndex(i => i.id === focusedCard.id)
          visualAnchorIndexRef.current = globalIdx
          setSelectedIds(new Set([focusedCard.id]))
        }
        return
      }

      if (e.key === 'h' || e.key === 'ArrowLeft') {
        e.preventDefault()
        setFocusedColumnIndex(prev => {
          for (let i = prev - 1; i >= 0; i--) {
            if (getColumnItems(columns[i].id).length > 0) {
              setFocusedCardIndex(0)
              return i
            }
          }
          return prev
        })
        return
      }
      if (e.key === 'l' || e.key === 'ArrowRight') {
        e.preventDefault()
        setFocusedColumnIndex(prev => {
          for (let i = prev + 1; i < columns.length; i++) {
            if (getColumnItems(columns[i].id).length > 0) {
              setFocusedCardIndex(0)
              return i
            }
          }
          return prev
        })
        return
      }
    }

    if (e.key === 'n' || e.key === 'N') {
      e.preventDefault()
      setNewItemDialogOpen(true)
    }
    if (e.key === 'r' || e.key === 'R') {
      e.preventDefault()
      loadBoard()
    }
    if (e.key === '/') {
      e.preventDefault()
      searchInputRef.current?.focus()
      vim.enterInsertMode()
    }
    if (e.key === '?') {
      e.preventDefault()
      setShowShortcutsHelp(prev => !prev)
    }
    if (e.key === 'x' && isVimContentActive) {
      // Delete focused card (single card via vim focus) with confirmation
      e.preventDefault()
      if (board) {
        const colId = columns[focusedColumnIndex].id
        const query = searchQuery.toLowerCase().trim()
        const colItems = board.items
          .filter(item => item.column === colId)
          .filter(item => !query || item.title.toLowerCase().includes(query) || item.description.toLowerCase().includes(query))
          .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        const card = colItems[Math.min(focusedCardIndex, Math.max(colItems.length - 1, 0))]
        if (card && projectPath) {
          void confirmAction({
            title: 'Delete Item',
            message: `Delete "${card.title}"? This cannot be undone.`,
            confirmLabel: 'Delete',
          }).then(confirmed => {
            if (confirmed) {
              void window.electronAPI.kanban.deleteItems(projectPath, [card.id]).then(() => loadBoard())
            }
          })
        }
      }
      return
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selectedIds.size > 0) {
        e.preventDefault()
        handleBulkDelete()
      }
    }
    if (e.key === 'a' && (e.metaKey || e.ctrlKey)) {
      if (allVisibleItems.length > 0) {
        e.preventDefault()
        setSelectedIds(new Set(allVisibleItems.map(i => i.id)))
      }
    }
    if (e.key === 'Escape') {
      if (selectedIds.size > 0) {
        e.preventDefault()
        visualAnchorIndexRef.current = -1
        handleClearSelection()
      } else if (searchQuery) {
        e.preventDefault()
        setSearchQuery('')
        viewRef.current?.focus()
      }
    }
  }, [newItemDialogOpen, selectedItem, loadBoard, showShortcutsHelp, searchQuery, selectedIds, handleBulkDelete, handleClearSelection, allVisibleItems, isVimContentActive, isVisualMode, board, vim, columns, focusedColumnIndex, focusedCardIndex, getColumnItems, handleCardClick, projectPath])

  const handleCardDrop = useCallback(async (itemId: string, targetColumn: ColumnId) => {
    if (!projectPath || !board) return

    // Optimistic update: move card immediately in local state
    const previousItems = board.items
    setBoard(prev => {
      if (!prev) return prev
      return {
        ...prev,
        items: prev.items.map(item =>
          item.id === itemId ? { ...item, column: targetColumn } : item
        ),
      }
    })

    try {
      await window.electronAPI.kanban.updateItem(projectPath, itemId, { column: targetColumn })
      loadBoard()
    } catch (error) {
      console.error('Failed to move item:', error)
      setErrorMessage('Failed to move item. Please try again.')
      // Rollback: restore previous state
      setBoard(prev => prev ? { ...prev, items: previousItems } : prev)
    }
  }, [projectPath, board, loadBoard])

  const handleDeleteProject = useCallback(async () => {
    if (!projectPath || !onDeleteProject || isDeleting) return

    const confirmed = await confirmAction({
      title: 'Delete Project',
      message: 'Delete this project? This will stop all running agents, remove worktrees, and delete the kanban board. This cannot be undone.',
      confirmLabel: 'Delete',
    })
    if (!confirmed) return

    setIsDeleting(true)
    try {
      await onDeleteProject(projectPath)
    } finally {
      setIsDeleting(false)
    }
  }, [projectPath, onDeleteProject, isDeleting])

  const handleRetryAgent = useCallback(async (itemId: string) => {
    if (!projectPath || !board) return

    const item = board.items.find(i => i.id === itemId)
    if (!item) return

    // Start agent with best available agent preference from previous runs.
    await window.electronAPI.agent.start({
      agentName: resolveAgentName(item),
      projectPath,
      itemId: item.id,
      goal: item.description,
      agentProvider: item.agentProvider,
    })
    loadBoard()
  }, [projectPath, board, loadBoard])

  const handleResumeAgent = useCallback(async (itemId: string) => {
    if (!projectPath || !board) return

    const item = board.items.find(i => i.id === itemId)
    if (!item) return

    // Resume agent with best available agent preference from previous runs.
    await window.electronAPI.agent.resume({
      agentName: resolveAgentName(item),
      projectPath,
      itemId: item.id,
      goal: item.description,
      agentProvider: item.agentProvider,
    })
    loadBoard()
  }, [projectPath, board, loadBoard])

  const handleRunAgainAgent = useCallback(async (itemId: string) => {
    if (!projectPath || !board) return

    const item = board.items.find(i => i.id === itemId)
    if (!item) return

    // Start agent again with best available agent preference from previous runs.
    await window.electronAPI.agent.start({
      agentName: resolveAgentName(item),
      projectPath,
      itemId: item.id,
      goal: item.description,
      agentProvider: item.agentProvider,
    })
    loadBoard()
  }, [projectPath, board, loadBoard])

  const handleFixConflicts = useCallback(async (itemId: string) => {
    if (!projectPath || !board) return

    const item = board.items.find(i => i.id === itemId)
    if (!item || !item.branch) return

    try {
      await prepareConflictResolution(projectPath, item.id, item.branch)

      await window.electronAPI.agent.start({
        agentName: 'code-agent',
        projectPath,
        itemId: item.id,
        goal: item.description,
        agentProvider: item.agentProvider,
      })
      loadBoard()
    } catch (error) {
      console.error('Failed to fix conflicts:', error)
      setErrorMessage('Failed to start conflict resolution. Please try again.')
    }
  }, [projectPath, board, loadBoard])

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

  // Full-page loading state while board data has not been loaded yet.
  // This covers both active fetches and pre-fetch recovery steps.
  if (!board && !errorMessage) {
    return (
      <div
        data-testid="kanban-loading"
        className="flex-1 flex items-center justify-center bg-[var(--color-bg-primary)]"
      >
        <Loader2 size={32} className="animate-spin text-[var(--color-accent-primary)]" />
      </div>
    )
  }

  // Compute board summary stats
  const totalItems = board?.items.length ?? 0
  const runningCount = board?.items.filter(i => i.agentStatus === 'running').length ?? 0

  return (
    <div ref={viewRef} data-testid="kanban-view" data-vim-zone="content" tabIndex={0} onKeyDown={handleKeyDown} className={`flex-1 min-h-0 flex flex-col bg-[var(--color-bg-primary)] outline-none ${isVimContentActive ? 'ring-1 ring-[var(--color-accent-primary)]' : ''}`}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border-primary)]">
        <div className="flex items-center gap-3 text-sm text-[var(--color-text-secondary)]">
          <div className="flex items-center gap-2">
            <FolderOpen size={16} />
            <span data-testid="project-path-display" className="font-medium">
              {projectPath.split(/[/\\]/).filter(Boolean).pop() || projectPath}
            </span>
          </div>
          {totalItems > 0 && (
            <span data-testid="board-summary" className="text-xs text-[var(--color-text-tertiary)]">
              {totalItems} item{totalItems !== 1 ? 's' : ''}
              {runningCount > 0 && ` · ${runningCount} running`}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
            <input
              ref={searchInputRef}
              data-testid="search-input"
              data-vim-key="/"
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onFocus={() => { isUserInputActiveRef.current = true }}
              onBlur={() => { isUserInputActiveRef.current = false }}
              placeholder="Search... (/)"
              className="w-40 pl-8 pr-3 py-1.5 text-sm bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-md text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:outline-none focus:border-[var(--color-accent-primary)] focus:ring-1 focus:ring-[var(--color-accent-primary)] focus:w-56 transition-all"
              onKeyDown={e => {
                if (e.key === 'Escape') {
                  e.stopPropagation()
                  setSearchQuery('')
                  viewRef.current?.focus()
                }
              }}
            />
            {searchQuery && (
              <button
                onClick={() => { setSearchQuery(''); viewRef.current?.focus() }}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]"
              >
                <X size={12} />
              </button>
            )}
          </div>
          {onDeleteProject && (
            <button
              data-testid="delete-project-button"
              onClick={handleDeleteProject}
              disabled={isDeleting}
              className="flex items-center gap-1.5 px-2 py-1.5 text-sm text-[var(--color-text-secondary)] hover:text-red-400 hover:bg-[var(--color-bg-tertiary)] rounded-md transition-colors disabled:opacity-50"
            >
              <Trash2 size={14} />
            </button>
          )}
          <button
            data-testid="refresh-button"
            data-vim-key="r"
            onClick={handleRefresh}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)] rounded-md transition-colors"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
            Refresh
            <kbd data-testid="shortcut-badge-r" className="px-1 py-0.5 text-[10px] bg-[var(--color-bg-tertiary)] rounded border border-[var(--color-border-primary)] font-mono">R</kbd>
          </button>
          <button
            data-testid="new-item-button"
            data-vim-key="n"
            onClick={handleNewItemClick}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-[var(--color-accent-primary)] text-white hover:bg-[var(--color-accent-hover)] rounded-md transition-colors"
          >
            <Plus size={14} />
            New Item
            <kbd data-testid="shortcut-badge-n" className="px-1 py-0.5 text-[10px] bg-white/10 rounded border border-white/20 font-mono text-white/70">N</kbd>
          </button>
        </div>
      </div>

      {/* Multi-select action bar */}
      {selectedIds.size > 0 && (
        <div
          data-testid="bulk-action-bar"
          className="flex items-center justify-between px-4 py-2 bg-[var(--color-accent-primary)]/10 border-b border-[var(--color-accent-primary)]/30"
        >
          <div className="flex items-center gap-2 text-sm text-[var(--color-accent-primary)]">
            <CheckSquare size={14} />
            <span data-testid="selection-count">{selectedIds.size} item{selectedIds.size !== 1 ? 's' : ''} selected</span>
            {isVisualMode && (
              <span data-testid="visual-mode-indicator" className="px-2 py-0.5 text-xs font-mono font-bold bg-[var(--color-accent-primary)]/20 rounded">
                -- VISUAL --
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              data-testid="bulk-delete-button"
              onClick={handleBulkDelete}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-600/10 rounded-md transition-colors"
            >
              <Trash2 size={14} />
              Delete
              <kbd className="px-1 py-0.5 text-[10px] bg-red-600/20 rounded border border-red-600/30 font-mono">Del</kbd>
            </button>
            <button
              data-testid="clear-selection-button"
              onClick={handleClearSelection}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)] rounded-md transition-colors"
            >
              <X size={14} />
              Clear
              <kbd className="px-1 py-0.5 text-[10px] bg-[var(--color-bg-tertiary)] rounded border border-[var(--color-border-primary)] font-mono">Esc</kbd>
            </button>
          </div>
        </div>
      )}

      {/* Error banner */}
      {errorMessage && (
        <div
          data-testid="kanban-error"
          className="flex items-center justify-between px-4 py-2 bg-red-900/30 border-b border-red-700/50 text-red-300 text-sm"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle size={14} />
            <span>{errorMessage}</span>
          </div>
          <button
            data-testid="dismiss-error"
            onClick={() => setErrorMessage(null)}
            className="p-1 hover:text-[var(--color-text-primary)] transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Git warning banner */}
      {gitWarning && !gitWarning.isRepo && (
        <div
          data-testid="git-warning-banner"
          className="flex items-center justify-between px-4 py-2 bg-amber-900/30 border-b border-amber-700/50 text-amber-300 text-sm"
        >
          <div className="flex items-center gap-2">
            <GitBranch size={14} />
            <span>This folder is not a git repository. Agents will run without branch isolation.</span>
          </div>
          <div className="flex items-center gap-2">
            {gitWarning.nestedRepos.length === 1 && onSwitchProject && (
              <button
                data-testid="switch-nested-repo"
                onClick={() => onSwitchProject(gitWarning.nestedRepos[0].path)}
                className="px-2.5 py-1 text-xs font-medium bg-amber-700/50 hover:bg-amber-700/80 text-amber-100 rounded transition-colors"
              >
                Use {gitWarning.nestedRepos[0].name}/ instead
              </button>
            )}
            {gitWarning.nestedRepos.length > 1 && onSwitchProject && (
              <select
                data-testid="switch-nested-repo-select"
                onChange={(e) => { if (e.target.value) onSwitchProject(e.target.value) }}
                defaultValue=""
                className="px-2 py-1 text-xs bg-amber-700/50 hover:bg-amber-700/80 text-amber-100 rounded border-none cursor-pointer"
              >
                <option value="" disabled>Switch to nested repo...</option>
                {gitWarning.nestedRepos.map(repo => (
                  <option key={repo.path} value={repo.path}>{repo.name}/</option>
                ))}
              </select>
            )}
            {gitWarning.nestedRepos.length === 0 && (
              <button
                data-testid="init-git-button"
                onClick={handleInitGit}
                className="px-2.5 py-1 text-xs font-medium bg-amber-700/50 hover:bg-amber-700/80 text-amber-100 rounded transition-colors"
              >
                Initialize Git
              </button>
            )}
          </div>
        </div>
      )}

      {/* Shortcuts help overlay */}
      {showShortcutsHelp && (
        <div
          data-testid="shortcuts-help"
          className="px-4 py-3 bg-[var(--color-bg-secondary)] border-b border-[var(--color-border-primary)] text-sm"
        >
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-medium text-[var(--color-text-primary)] flex items-center gap-2">
              <Keyboard size={14} />
              Keyboard Shortcuts
            </h3>
            <button onClick={() => setShowShortcutsHelp(false)} className="p-1 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">
              <X size={14} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[var(--color-text-secondary)]">
            <div><kbd className="px-1.5 py-0.5 text-xs bg-[var(--color-bg-tertiary)] rounded border border-[var(--color-border-primary)]">N</kbd> New item</div>
            <div><kbd className="px-1.5 py-0.5 text-xs bg-[var(--color-bg-tertiary)] rounded border border-[var(--color-border-primary)]">R</kbd> Refresh board</div>
            <div><kbd className="px-1.5 py-0.5 text-xs bg-[var(--color-bg-tertiary)] rounded border border-[var(--color-border-primary)]">/</kbd> Search items</div>
            <div><kbd className="px-1.5 py-0.5 text-xs bg-[var(--color-bg-tertiary)] rounded border border-[var(--color-border-primary)]">?</kbd> Toggle shortcuts</div>
            <div><kbd className="px-1.5 py-0.5 text-xs bg-[var(--color-bg-tertiary)] rounded border border-[var(--color-border-primary)]">Ctrl+Click</kbd> Multi-select</div>
            <div><kbd className="px-1.5 py-0.5 text-xs bg-[var(--color-bg-tertiary)] rounded border border-[var(--color-border-primary)]">Shift+Click</kbd> Range select</div>
            <div><kbd className="px-1.5 py-0.5 text-xs bg-[var(--color-bg-tertiary)] rounded border border-[var(--color-border-primary)]">Ctrl+A</kbd> Select all</div>
            <div><kbd className="px-1.5 py-0.5 text-xs bg-[var(--color-bg-tertiary)] rounded border border-[var(--color-border-primary)]">Delete</kbd> Delete selected</div>
            <div><kbd className="px-1.5 py-0.5 text-xs bg-[var(--color-bg-tertiary)] rounded border border-[var(--color-border-primary)]">Esc</kbd> Clear selection / close</div>
            <div><kbd className="px-1.5 py-0.5 text-xs bg-[var(--color-bg-tertiary)] rounded border border-[var(--color-border-primary)]">h</kbd>/<kbd className="px-1.5 py-0.5 text-xs bg-[var(--color-bg-tertiary)] rounded border border-[var(--color-border-primary)]">l</kbd> Navigate columns</div>
            <div><kbd className="px-1.5 py-0.5 text-xs bg-[var(--color-bg-tertiary)] rounded border border-[var(--color-border-primary)]">j</kbd>/<kbd className="px-1.5 py-0.5 text-xs bg-[var(--color-bg-tertiary)] rounded border border-[var(--color-border-primary)]">k</kbd> Navigate cards</div>
            <div><kbd className="px-1.5 py-0.5 text-xs bg-[var(--color-bg-tertiary)] rounded border border-[var(--color-border-primary)]">gg</kbd>/<kbd className="px-1.5 py-0.5 text-xs bg-[var(--color-bg-tertiary)] rounded border border-[var(--color-border-primary)]">G</kbd> First/Last card</div>
            <div><kbd className="px-1.5 py-0.5 text-xs bg-[var(--color-bg-tertiary)] rounded border border-[var(--color-border-primary)]">Enter</kbd> Open focused card</div>
            <div><kbd className="px-1.5 py-0.5 text-xs bg-[var(--color-bg-tertiary)] rounded border border-[var(--color-border-primary)]">V</kbd> Visual select</div>
          </div>
        </div>
      )}
      {/* Empty board welcome message */}
      {board && totalItems === 0 && (
        <div
          data-testid="empty-board-message"
          className="mx-4 mt-4 p-6 text-center bg-[var(--color-bg-secondary)] rounded-lg border border-dashed border-[var(--color-border-primary)]"
        >
          <Plus size={32} className="mx-auto mb-3 text-[var(--color-text-tertiary)]" />
          <p className="text-[var(--color-text-secondary)] mb-1">No items yet</p>
          <p className="text-sm text-[var(--color-text-tertiary)]">
            Press <kbd className="px-1.5 py-0.5 text-xs bg-[var(--color-bg-tertiary)] rounded border border-[var(--color-border-primary)]">N</kbd> or click <strong>New Item</strong> to create your first task
          </p>
        </div>
      )}

      {/* Columns container */}
      <div
        data-testid="kanban-columns-container"
        className="flex-1 overflow-x-auto min-h-0 p-4"
      >
        <div className="flex gap-4 h-full">
          {columns.map((col, colIndex) => {
            const colItems = getColumnItems(col.id)
            const isActiveCol = isVimContentActive && colIndex === focusedColumnIndex
            const clampedCardIndex = Math.min(focusedCardIndex, Math.max(colItems.length - 1, 0))
            return (
              <KanbanColumn
                key={col.id}
                columnId={col.id}
                title={col.title}
                items={colItems}
                selectedIds={selectedIds}
                focusedCardIndex={isActiveCol ? clampedCardIndex : undefined}
                onCardClick={handleCardClick}
                onCardDrop={handleCardDrop}
                onRetryAgent={handleRetryAgent}
                onResumeAgent={handleResumeAgent}
                onRunAgainAgent={handleRunAgainAgent}
                onFixConflicts={handleFixConflicts}
                onFocusedCardChange={isActiveCol ? setFocusedCardIndex : undefined}
              />
            )
          })}
        </div>
      </div>

      {/* New Item Dialog */}
      <NewItemDialog
        isOpen={newItemDialogOpen}
        projectPath={projectPath}
        onClose={handleNewItemClose}
        onCreated={handleNewItemCreated}
      />

       {/* Confirm Dialog */}
       <ConfirmDialog {...confirmDialogProps} />

       {/* Item Detail Dialog */}
       <ItemDetailDialog
         isOpen={selectedItem !== null}
         item={selectedItem}
         projectPath={projectPath}
         onClose={handleDetailClose}
         onUpdated={handleDetailUpdated}
         // StatusBar props
         onShowShortcuts={onShowShortcuts}
         onOpenSettings={onOpenSettings}
         onOpenProjectSettings={onOpenProjectSettings}
         whisperRecordingState={whisperRecordingState}
         whisperSelectedModel={whisperSelectedModel}
         onToggleRecording={onToggleRecording}
         onOpenModelDialog={onOpenModelDialog}
         claudeUsage={claudeUsage}
       />
    </div>
  )
}
