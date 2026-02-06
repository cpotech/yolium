/**
 * @module src/components/ItemDetailDialog
 * Dialog for viewing and editing kanban item details with agent controls.
 */

import React, { useState, useCallback, useEffect, useRef } from 'react'
import { X, GitBranch, Clock, FolderOpen, GitMerge, Check, AlertTriangle, Save, Trash2 } from 'lucide-react'
import type { KanbanItem, KanbanColumn } from '@shared/types/kanban'
import { trapFocus } from '@shared/lib/focus-trap'
import { useAgentSession } from '@renderer/hooks/useAgentSession'
import { CommentsList } from './CommentsList'
import { AgentLogPanel } from '../agent/AgentLogPanel'
import { AgentStatusBanner } from '../agent/AgentStatusBanner'
import { AgentControls } from '../agent/AgentControls'

interface ItemDetailDialogProps {
  isOpen: boolean
  item: KanbanItem | null
  projectPath: string
  onClose: () => void
  onUpdated: () => void
}

const columnOptions: { id: KanbanColumn; label: string }[] = [
  { id: 'backlog', label: 'Backlog' },
  { id: 'ready', label: 'Ready' },
  { id: 'in-progress', label: 'In Progress' },
  { id: 'done', label: 'Done' },
]

const agentTypeLabels: Record<KanbanItem['agentType'], string> = {
  claude: 'Claude',
  codex: 'Codex',
  opencode: 'OpenCode',
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

/**
 * Dialog for viewing and editing kanban item details.
 * @param props - Component props
 */
export function ItemDetailDialog({
  isOpen,
  item,
  projectPath,
  onClose,
  onUpdated,
}: ItemDetailDialogProps): React.ReactElement | null {
  // Form state
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [column, setColumn] = useState<KanbanColumn>('backlog')
  const [model, setModel] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isStartingAgent, setIsStartingAgent] = useState(false)
  const [answerText, setAnswerText] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isAnswering, setIsAnswering] = useState(false)
  const [isMerging, setIsMerging] = useState(false)

  // Refs
  const answerInputRef = useRef<HTMLTextAreaElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  // Agent session hook
  const agentSession = useAgentSession({
    itemId: item?.id,
    itemAgentStatus: item?.agentStatus,
    projectPath,
    onUpdated,
  })

  // Track baseline values to detect unsaved changes
  const [baseTitle, setBaseTitle] = useState('')
  const [baseDescription, setBaseDescription] = useState('')
  const [baseColumn, setBaseColumn] = useState<KanbanColumn>('backlog')
  const [baseModel, setBaseModel] = useState('')

  const hasUnsavedChanges = title !== baseTitle || description !== baseDescription || column !== baseColumn || model !== baseModel

  // Sync editable fields when item data changes
  useEffect(() => {
    if (item) {
      setTitle(item.title)
      setDescription(item.description)
      setColumn(item.column)
      setModel(item.model || '')
      setBaseTitle(item.title)
      setBaseDescription(item.description)
      setBaseColumn(item.column)
      setBaseModel(item.model || '')
    }
  }, [item])

  // Auto-focus answer textarea when agent enters waiting state
  useEffect(() => {
    if (item?.agentStatus === 'waiting' && item.agentQuestion && answerInputRef.current) {
      answerInputRef.current.focus()
    }
  }, [item?.agentStatus, item?.agentQuestion])

  const handleSave = useCallback(async () => {
    if (!item || isSaving) return

    setIsSaving(true)
    try {
      const trimmedTitle = title.trim()
      const trimmedDescription = description.trim()
      await window.electronAPI.kanban.updateItem(projectPath, item.id, {
        title: trimmedTitle,
        description: trimmedDescription,
        column,
        model: model || undefined,
      })
      setBaseTitle(trimmedTitle)
      setBaseDescription(trimmedDescription)
      setBaseColumn(column)
      setBaseModel(model)
      setErrorMessage(null)
      onUpdated()
    } catch (error) {
      console.error('Failed to update item:', error)
      setErrorMessage('Failed to save changes. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }, [item, isSaving, projectPath, title, description, column, model, onUpdated])

  const handleDelete = useCallback(async () => {
    if (!item || isDeleting) return

    const confirmed = await window.electronAPI.dialog.confirmOkCancel(
      'Delete Item',
      `Are you sure you want to delete "${item.title}"? This action cannot be undone.`
    )

    if (!confirmed) return

    setIsDeleting(true)
    try {
      await window.electronAPI.kanban.deleteItem(projectPath, item.id)
      onUpdated()
      onClose()
    } catch (error) {
      console.error('Failed to delete item:', error)
      setErrorMessage('Failed to delete item. Please try again.')
    } finally {
      setIsDeleting(false)
    }
  }, [item, isDeleting, projectPath, onUpdated, onClose])

  const handleStartAgent = useCallback(async (agentName: string) => {
    if (!item || isStartingAgent) return

    setIsStartingAgent(true)
    agentSession.clearAgentOutput()
    agentSession.setCurrentStep(null)
    agentSession.setCurrentDetail(null)
    agentSession.setLiveStatus('starting')
    agentSession.setLiveStatusMessage(null)
    agentSession.setShowAgentLog(true)
    try {
      const result = await window.electronAPI.agent.start({
        agentName,
        projectPath,
        itemId: item.id,
        goal: item.description,
      })

      if (result.error) {
        console.error('Failed to start agent:', result.error)
        agentSession.setAgentOutputLines(prev => [...prev, `[Error] ${result.error}`])
        agentSession.setLiveStatus('failed')
        agentSession.setLiveStatusMessage(result.error)
      } else if (result.sessionId) {
        agentSession.associateSession(result.sessionId)
        agentSession.setLiveStatus('running')
      }
      onUpdated()
    } catch (error) {
      console.error('Failed to start agent:', error)
      agentSession.setAgentOutputLines(prev => [...prev, `[Error] ${error}`])
      agentSession.setLiveStatus('failed')
      agentSession.setLiveStatusMessage(String(error))
    } finally {
      setIsStartingAgent(false)
    }
  }, [item, isStartingAgent, projectPath, onUpdated, agentSession])

  const handleAnswerQuestion = useCallback(async () => {
    if (!item || isAnswering || !answerText.trim()) return

    setIsAnswering(true)
    try {
      await window.electronAPI.agent.answer(projectPath, item.id, answerText.trim())
      setAnswerText('')
      setErrorMessage(null)
      onUpdated()
    } catch (error) {
      console.error('Failed to answer question:', error)
      setErrorMessage('Failed to submit answer. Please try again.')
    } finally {
      setIsAnswering(false)
    }
  }, [item, isAnswering, answerText, projectPath, onUpdated])

  const handleResumeAgent = useCallback(async (agentName: string) => {
    if (!item || isStartingAgent) return

    setIsStartingAgent(true)
    agentSession.setCurrentStep(null)
    agentSession.setCurrentDetail(null)
    agentSession.setLiveStatus('starting')
    agentSession.setLiveStatusMessage(null)
    agentSession.setShowAgentLog(true)
    try {
      const result = await window.electronAPI.agent.resume({
        agentName,
        projectPath,
        itemId: item.id,
        goal: item.description,
      })

      if (result.error) {
        console.error('Failed to resume agent:', result.error)
        agentSession.setAgentOutputLines(prev => [...prev, `[Error] ${result.error}`])
        agentSession.setLiveStatus('failed')
        agentSession.setLiveStatusMessage(result.error)
      } else if (result.sessionId) {
        agentSession.associateSession(result.sessionId)
        agentSession.setLiveStatus('running')
      }
      onUpdated()
    } catch (error) {
      console.error('Failed to resume agent:', error)
      agentSession.setAgentOutputLines(prev => [...prev, `[Error] ${error}`])
      agentSession.setLiveStatus('failed')
      agentSession.setLiveStatusMessage(String(error))
    } finally {
      setIsStartingAgent(false)
    }
  }, [item, isStartingAgent, projectPath, onUpdated, agentSession])

  const handleStopAgent = useCallback(async () => {
    if (agentSession.currentSessionId) {
      await window.electronAPI.agent.stop(agentSession.currentSessionId)
      onUpdated()
    }
  }, [agentSession.currentSessionId, onUpdated])

  const handleMerge = useCallback(async () => {
    if (!item || !item.branch || !item.worktreePath || isMerging) return

    setIsMerging(true)
    try {
      // Get diff stats for confirmation
      const stats = await window.electronAPI.git.worktreeDiffStats(projectPath, item.branch)
      const statsMsg = stats.filesChanged > 0
        ? `${stats.filesChanged} file${stats.filesChanged !== 1 ? 's' : ''} changed, +${stats.insertions} -${stats.deletions}`
        : 'No changes detected'

      const confirmed = await window.electronAPI.dialog.confirmOkCancel(
        'Merge to Main',
        `Merge branch "${item.branch}"?\n\n${statsMsg}`
      )
      if (!confirmed) {
        setIsMerging(false)
        return
      }

      // Perform the merge
      const result = await window.electronAPI.git.mergeBranch(projectPath, item.branch)

      if (result.success) {
        // Clean up worktree and branch
        await window.electronAPI.git.cleanupWorktree(projectPath, item.worktreePath, item.branch)
        // Update item: mark as merged, clear worktree path
        await window.electronAPI.kanban.updateItem(projectPath, item.id, {
          mergeStatus: 'merged',
          worktreePath: undefined,
        })
        onUpdated()
      } else if (result.conflict) {
        await window.electronAPI.kanban.updateItem(projectPath, item.id, {
          mergeStatus: 'conflict',
        })
        setErrorMessage('Merge conflict detected. Please resolve manually.')
        onUpdated()
      } else {
        setErrorMessage(result.error || 'Merge failed')
      }
    } catch (error) {
      console.error('Failed to merge:', error)
      setErrorMessage('Failed to merge branch. Please try again.')
    } finally {
      setIsMerging(false)
    }
  }, [item, isMerging, projectPath, onUpdated])

  const handleClose = useCallback(async () => {
    if (hasUnsavedChanges) {
      const confirmed = await window.electronAPI.dialog.confirmOkCancel(
        'Unsaved Changes',
        'You have unsaved changes. Discard them?'
      )
      if (!confirmed) return
    }
    onClose()
  }, [hasUnsavedChanges, onClose])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        handleClose()
      }
      if (e.key === 'Enter' && e.ctrlKey && !isSaving) {
        e.preventDefault()
        handleSave()
      }
      if (e.key === 'Delete' && e.ctrlKey && !isDeleting) {
        e.preventDefault()
        handleDelete()
      }
      if (dialogRef.current) {
        trapFocus(e, dialogRef.current)
      }
    },
    [handleClose, isSaving, handleSave, isDeleting, handleDelete]
  )

  if (!isOpen || !item) return null

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-[var(--color-bg-secondary)]"
      onKeyDown={handleKeyDown}
    >
      <div
        ref={dialogRef}
        data-testid="item-detail-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`Item details: ${item.title}`}
        className="flex flex-col h-full"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-[var(--color-border-primary)] bg-[var(--color-bg-tertiary)]">
          <h2 className="text-base font-semibold text-white truncate min-w-0">{item.title || 'Untitled Item'}</h2>
          <button
            data-testid="close-button"
            onClick={handleClose}
            className="p-1.5 text-[var(--color-text-secondary)] hover:text-white hover:bg-[var(--color-bg-primary)] rounded transition-colors flex-shrink-0"
            title="Esc to close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Error banner */}
        {errorMessage && (
          <div className="flex items-center justify-between px-6 py-2 bg-red-900/30 border-b border-red-700/50 text-red-300 text-sm">
            <span>{errorMessage}</span>
            <button
              onClick={() => setErrorMessage(null)}
              className="p-1 hover:text-white transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Content - Two pane layout */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left pane - Title, Description, Comments, Agent Output */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-3xl">
              {/* Title */}
              <div className="mb-5">
                <label
                  htmlFor="detail-title"
                  className="block text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)] mb-1.5"
                >
                  Title
                </label>
                <input
                  id="detail-title"
                  data-testid="title-input"
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  autoFocus
                  className="w-full px-3 py-2.5 bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-md text-white text-sm focus:outline-none focus:border-[var(--color-accent-primary)] focus:ring-1 focus:ring-[var(--color-accent-primary)]"
                />
              </div>

              {/* Description */}
              <div className="mb-5">
                <label
                  htmlFor="detail-description"
                  className="block text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)] mb-1.5"
                >
                  Description
                </label>
                <textarea
                  id="detail-description"
                  data-testid="description-input"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  rows={10}
                  className="w-full px-3 py-2.5 bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-md text-white text-sm focus:outline-none focus:border-[var(--color-accent-primary)] focus:ring-1 focus:ring-[var(--color-accent-primary)] resize-y"
                />
              </div>

              {/* Live Agent Status Banner */}
              <AgentStatusBanner
                status={agentSession.liveStatus}
                detail={agentSession.currentDetail}
                message={agentSession.liveStatusMessage}
              />

              {/* Comments */}
              <CommentsList comments={item.comments} />
            </div>
          </div>

          {/* Right pane - Sidebar */}
          <div className="w-72 overflow-y-auto border-l border-[var(--color-border-primary)] bg-[var(--color-bg-tertiary)]">
            {/* Agent Controls */}
            <div className="p-4 border-b border-[var(--color-border-primary)]">
              <AgentControls
                item={item}
                isStartingAgent={isStartingAgent}
                isAnswering={isAnswering}
                answerText={answerText}
                currentSessionId={agentSession.currentSessionId}
                currentDetail={agentSession.currentDetail}
                answerInputRef={answerInputRef}
                onStartAgent={handleStartAgent}
                onResumeAgent={handleResumeAgent}
                onStopAgent={handleStopAgent}
                onAnswerQuestion={handleAnswerQuestion}
                onSetAnswerText={setAnswerText}
                onUpdated={onUpdated}
              />
            </div>

            {/* Properties */}
            <div className="p-4 space-y-4">
              {/* Agent Type */}
              <div>
                <label className="block text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)] mb-1">
                  Agent Type
                </label>
                <span
                  data-testid="agent-type-display"
                  className="text-sm text-[var(--color-text-primary)]"
                >
                  {agentTypeLabels[item.agentType]}
                </span>
              </div>

              {/* Model */}
              <div>
                <label
                  htmlFor="detail-model"
                  className="block text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)] mb-1"
                >
                  Model
                </label>
                <select
                  id="detail-model"
                  data-testid="model-select"
                  value={model}
                  onChange={e => setModel(e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-md text-white text-sm focus:outline-none focus:border-[var(--color-accent-primary)] focus:ring-1 focus:ring-[var(--color-accent-primary)]"
                >
                  <option value="">Agent default</option>
                  <option value="opus">Opus (most capable)</option>
                  <option value="sonnet">Sonnet (balanced)</option>
                  <option value="haiku">Haiku (fastest)</option>
                </select>
              </div>

              {/* Column Selector */}
              <div>
                <label
                  htmlFor="detail-column"
                  className="block text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)] mb-1"
                >
                  Column
                </label>
                <select
                  id="detail-column"
                  data-testid="column-select"
                  value={column}
                  onChange={e => setColumn(e.target.value as KanbanColumn)}
                  className="w-full px-3 py-2 bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-md text-white text-sm focus:outline-none focus:border-[var(--color-accent-primary)] focus:ring-1 focus:ring-[var(--color-accent-primary)]"
                >
                  {columnOptions
                    .filter(option => {
                      if (option.id === 'in-progress') {
                        return column === 'in-progress'
                      }
                      return true
                    })
                    .map(option => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                </select>
                {column === 'in-progress' && (
                  <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
                    Items are moved to In Progress by agents
                  </p>
                )}
              </div>

              {/* Branch */}
              <div>
                <label className="block text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)] mb-1">
                  Branch
                </label>
                <div
                  data-testid="branch-display"
                  className="flex items-center gap-1.5 text-sm text-[var(--color-text-primary)]"
                >
                  <GitBranch size={14} className="text-[var(--color-text-secondary)] flex-shrink-0" />
                  <span className="truncate">{item.branch || 'N/A'}</span>
                </div>
              </div>

              {/* Worktree Path */}
              {item.worktreePath && (
                <div>
                  <label className="block text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)] mb-1">
                    Worktree
                  </label>
                  <div
                    data-testid="worktree-path-display"
                    className="flex items-center gap-1 text-xs text-[var(--color-text-tertiary)]"
                    title={item.worktreePath}
                  >
                    <FolderOpen size={12} className="flex-shrink-0" />
                    <span className="font-mono truncate">{item.worktreePath}</span>
                  </div>
                </div>
              )}

              {/* Merge Status & Actions */}
              {item.mergeStatus && item.branch && (
                <div>
                  <label className="block text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)] mb-1">
                    Merge Status
                  </label>
                  {item.mergeStatus === 'merged' && (
                    <div
                      data-testid="merge-status-merged"
                      className="flex items-center gap-1 text-sm text-green-400"
                    >
                      <Check size={14} />
                      <span>Merged</span>
                    </div>
                  )}
                  {item.mergeStatus === 'conflict' && (
                    <div data-testid="merge-status-conflict">
                      <div className="flex items-center gap-1 text-sm text-red-400 mb-2">
                        <AlertTriangle size={14} />
                        <span>Merge Conflict</span>
                      </div>
                      <button
                        data-testid="retry-merge-button"
                        onClick={handleMerge}
                        disabled={isMerging}
                        className="w-full px-3 py-1.5 text-xs bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {isMerging ? 'Merging...' : 'Retry Merge'}
                      </button>
                    </div>
                  )}
                  {item.mergeStatus === 'unmerged' && (
                    <div data-testid="merge-status-unmerged">
                      <button
                        data-testid="merge-button"
                        onClick={handleMerge}
                        disabled={isMerging || (item.agentStatus !== 'completed' && item.column !== 'done')}
                        className="w-full px-3 py-1.5 text-xs flex items-center justify-center gap-1 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        <GitMerge size={12} />
                        {isMerging ? 'Merging...' : 'Merge to Main'}
                      </button>
                      {item.agentStatus !== 'completed' && item.column !== 'done' && (
                        <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
                          Available when agent completes or item is in Done
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="p-4 border-t border-[var(--color-border-primary)]">
              {hasUnsavedChanges && (
                <div
                  data-testid="unsaved-indicator"
                  className="text-center text-xs text-yellow-400 font-medium mb-2"
                >
                  Unsaved changes
                </div>
              )}
              <div className="space-y-2">
                <button
                  data-testid="save-button"
                  onClick={handleSave}
                  disabled={isSaving}
                  title="Ctrl+Enter"
                  className={`w-full flex items-center justify-center gap-1.5 px-3 py-2 text-sm text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${
                    hasUnsavedChanges
                      ? 'bg-yellow-600 hover:bg-yellow-700'
                      : 'bg-[var(--color-accent-primary)] hover:bg-[var(--color-accent-hover)]'
                  }`}
                >
                  <Save size={14} />
                  {isSaving ? 'Saving...' : 'Save'}
                  <span className="text-xs opacity-60 ml-1">(Ctrl+Enter)</span>
                </button>
                <button
                  data-testid="delete-button"
                  onClick={handleDelete}
                  disabled={isDeleting}
                  title="Ctrl+Delete"
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-sm text-red-400 rounded-md hover:bg-red-600/10 border border-red-600/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Trash2 size={14} />
                  {isDeleting ? 'Deleting...' : 'Delete'}
                  <span className="text-xs opacity-60 ml-1">(Ctrl+Del)</span>
                </button>
              </div>
            </div>

            {/* Timestamps - pinned to bottom of sidebar */}
            <div className="mt-auto p-4 border-t border-[var(--color-border-primary)]">
              <div className="flex items-center justify-between text-xs text-[var(--color-text-tertiary)]">
                <div className="flex items-center gap-1" data-testid="created-at" title="Created">
                  <Clock size={11} />
                  <span>Created {formatTimestamp(item.createdAt)}</span>
                </div>
                <div className="flex items-center gap-1" data-testid="updated-at" title="Updated">
                  <Clock size={11} />
                  <span>Updated {formatTimestamp(item.updatedAt)}</span>
                </div>
              </div>
              <p className="text-center text-[10px] text-[var(--color-text-tertiary)] mt-2">
                Esc to close
              </p>
            </div>
          </div>
        </div>

        {/* Agent Log - bottom panel */}
        {(agentSession.showAgentLog || agentSession.agentOutputLines.length > 0) && (
          <div className="border-t border-[var(--color-border-primary)] bg-[var(--color-bg-tertiary)]">
            <AgentLogPanel
              outputLines={agentSession.agentOutputLines}
              onClear={agentSession.clearAgentOutput}
            />
          </div>
        )}
      </div>
    </div>
  )
}
