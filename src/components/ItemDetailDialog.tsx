/**
 * @module src/components/ItemDetailDialog
 * Dialog for viewing and editing kanban item details with agent controls.
 */

import React, { useState, useCallback, useEffect, useRef } from 'react'
import { X, GitBranch, Clock } from 'lucide-react'
import type { KanbanItem, KanbanColumn } from '../types/kanban'
import { trapFocus } from '../lib/focus-trap'
import { useAgentSession } from '../hooks/useAgentSession'
import { CommentsList } from './CommentsList'
import { AgentLogPanel } from './AgentLogPanel'
import { AgentStatusBanner } from './AgentStatusBanner'
import { AgentControls } from './AgentControls'

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
        agentSession.sessionIdRef.current = result.sessionId
        agentSession.setCurrentSessionId(result.sessionId)
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
        agentSession.sessionIdRef.current = result.sessionId
        agentSession.setCurrentSessionId(result.sessionId)
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onKeyDown={handleKeyDown}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose() }}
    >
      <div
        ref={dialogRef}
        data-testid="item-detail-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`Item details: ${item.title}`}
        className="bg-[var(--color-bg-secondary)] rounded-lg shadow-xl border border-[var(--color-border-primary)] w-full max-w-3xl mx-4 max-h-[90vh] overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--color-border-primary)]">
          <h2 className="text-lg font-semibold text-white">Item Details</h2>
          <button
            data-testid="close-button"
            onClick={handleClose}
            className="p-1 text-[var(--color-text-secondary)] hover:text-white hover:bg-[var(--color-bg-tertiary)] rounded transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Error banner */}
        {errorMessage && (
          <div className="flex items-center justify-between px-4 py-2 bg-red-900/30 border-b border-red-700/50 text-red-300 text-sm">
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
        <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
          {/* Left pane - Title, Description, Comments */}
          <div className="flex-1 p-4 overflow-y-auto md:border-r border-[var(--color-border-primary)]">
            {/* Title */}
            <div className="mb-4">
              <label
                htmlFor="detail-title"
                className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1"
              >
                Title
              </label>
              <input
                id="detail-title"
                data-testid="title-input"
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="w-full px-3 py-2 bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-md text-white text-sm focus:outline-none focus:border-[var(--color-accent-primary)] focus:ring-1 focus:ring-[var(--color-accent-primary)]"
              />
            </div>

            {/* Description */}
            <div className="mb-4">
              <label
                htmlFor="detail-description"
                className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1"
              >
                Description
              </label>
              <textarea
                id="detail-description"
                data-testid="description-input"
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={6}
                className="w-full px-3 py-2 bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-md text-white text-sm focus:outline-none focus:border-[var(--color-accent-primary)] focus:ring-1 focus:ring-[var(--color-accent-primary)] resize-none"
              />
            </div>

            {/* Comments */}
            <CommentsList comments={item.comments} />

            {/* Live Agent Status Banner */}
            <AgentStatusBanner
              status={agentSession.liveStatus}
              detail={agentSession.currentDetail}
              message={agentSession.liveStatusMessage}
            />

            {/* Agent Output Log */}
            {agentSession.showAgentLog && (
              <AgentLogPanel
                outputLines={agentSession.agentOutputLines}
                onClear={agentSession.clearAgentOutput}
                onClose={() => agentSession.setShowAgentLog(false)}
              />
            )}
          </div>

          {/* Right pane - Status, Agent Type, Column, Branch, Timestamps, Actions */}
          <div className="w-full md:w-64 p-4 overflow-y-auto bg-[var(--color-bg-tertiary)] border-t md:border-t-0 border-[var(--color-border-primary)]">
            {/* Agent Controls */}
            <AgentControls
              item={item}
              isStartingAgent={isStartingAgent}
              isAnswering={isAnswering}
              answerText={answerText}
              currentSessionId={agentSession.currentSessionId}
              currentDetail={agentSession.currentDetail}
              showAgentLog={agentSession.showAgentLog}
              agentOutputLines={agentSession.agentOutputLines}
              answerInputRef={answerInputRef}
              onStartAgent={handleStartAgent}
              onResumeAgent={handleResumeAgent}
              onStopAgent={handleStopAgent}
              onAnswerQuestion={handleAnswerQuestion}
              onSetAnswerText={setAnswerText}
              onShowLog={() => agentSession.setShowAgentLog(true)}
              onUpdated={onUpdated}
            />

            {/* Agent Type */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
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
            <div className="mb-4">
              <label
                htmlFor="detail-model"
                className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1"
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
            <div className="mb-4">
              <label
                htmlFor="detail-column"
                className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1"
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
            <div className="mb-4">
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
                Branch
              </label>
              <div
                data-testid="branch-display"
                className="flex items-center gap-1 text-sm text-[var(--color-text-primary)]"
              >
                <GitBranch size={14} className="text-[var(--color-text-secondary)]" />
                <span>{item.branch || 'N/A'}</span>
              </div>
            </div>

            {/* Timestamps */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
                Created
              </label>
              <div
                data-testid="created-at"
                className="flex items-center gap-1 text-xs text-[var(--color-text-tertiary)]"
              >
                <Clock size={12} />
                <span>{formatTimestamp(item.createdAt)}</span>
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
                Updated
              </label>
              <div
                data-testid="updated-at"
                className="flex items-center gap-1 text-xs text-[var(--color-text-tertiary)]"
              >
                <Clock size={12} />
                <span>{formatTimestamp(item.updatedAt)}</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2">
              {hasUnsavedChanges && (
                <div
                  data-testid="unsaved-indicator"
                  className="text-center text-xs text-yellow-400 font-medium"
                >
                  Unsaved changes
                </div>
              )}
              <button
                data-testid="save-button"
                onClick={handleSave}
                disabled={isSaving}
                title="Ctrl+Enter"
                className={`w-full px-4 py-2 text-sm text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${
                  hasUnsavedChanges
                    ? 'bg-yellow-600 hover:bg-yellow-700 animate-pulse'
                    : 'bg-[var(--color-accent-primary)] hover:bg-[var(--color-accent-hover)]'
                }`}
              >
                {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
              <p className="text-center text-[10px] text-[var(--color-text-tertiary)]">Ctrl+Enter to save &middot; Ctrl+Del to delete &middot; Esc to close</p>
              <button
                data-testid="delete-button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="w-full px-4 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isDeleting ? 'Deleting...' : 'Delete Item'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
