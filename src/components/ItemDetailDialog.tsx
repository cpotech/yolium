import React, { useState, useCallback, useEffect, useRef } from 'react'
import { X, GitBranch, Clock, Play, MessageSquare, RotateCcw, Terminal, Trash2 } from 'lucide-react'
import type { KanbanItem, KanbanColumn, AgentStatus, CommentSource } from '../types/kanban'

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
  shell: 'Shell',
}

const statusColors: Record<AgentStatus, string> = {
  idle: 'bg-gray-500',
  running: 'bg-yellow-500',
  waiting: 'bg-orange-500',
  interrupted: 'bg-orange-500',
  completed: 'bg-green-500',
  failed: 'bg-red-500',
}

const commentBadgeColors: Record<CommentSource, string> = {
  user: 'bg-green-600',
  agent: 'bg-blue-600',
  system: 'bg-gray-600',
}

function formatTimestamp(isoString: string): string {
  const date = new Date(isoString)
  return date.toLocaleString()
}

export function ItemDetailDialog({
  isOpen,
  item,
  projectPath,
  onClose,
  onUpdated,
}: ItemDetailDialogProps): React.ReactElement | null {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [column, setColumn] = useState<KanbanColumn>('backlog')
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isStartingAgent, setIsStartingAgent] = useState(false)
  const [answerText, setAnswerText] = useState('')
  const [isAnswering, setIsAnswering] = useState(false)
  const [agentOutput, setAgentOutput] = useState<string>('')
  const [showAgentLog, setShowAgentLog] = useState(false)
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const logRef = useRef<HTMLPreElement>(null)

  // Sync local state when item changes
  useEffect(() => {
    if (item) {
      setTitle(item.title)
      setDescription(item.description)
      setColumn(item.column)
    }
  }, [item])

  // Subscribe to agent output events
  useEffect(() => {
    if (!item || !currentSessionId) return

    const cleanup = window.electronAPI.onAgentOutput((sessionId, data) => {
      // Only capture output for this item's session
      if (sessionId === currentSessionId) {
        setAgentOutput(prev => prev + data)
        setShowAgentLog(true)
      }
    })

    return cleanup
  }, [item?.id, currentSessionId])

  // Auto-scroll agent log to bottom
  useEffect(() => {
    if (logRef.current && showAgentLog) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [agentOutput, showAgentLog])

  // Clear output when starting a new agent run
  const clearAgentOutput = useCallback(() => {
    setAgentOutput('')
  }, [])

  const handleSave = useCallback(async () => {
    if (!item || isSaving) return

    setIsSaving(true)
    try {
      await window.electronAPI.kanbanUpdateItem(projectPath, item.id, {
        title: title.trim(),
        description: description.trim(),
        column,
      })
      onUpdated()
    } catch (error) {
      console.error('Failed to update item:', error)
    } finally {
      setIsSaving(false)
    }
  }, [item, isSaving, projectPath, title, description, column, onUpdated])

  const handleDelete = useCallback(async () => {
    if (!item || isDeleting) return

    const confirmed = await window.electronAPI.showConfirmOkCancel(
      'Delete Item',
      `Are you sure you want to delete "${item.title}"? This action cannot be undone.`
    )

    if (!confirmed) return

    setIsDeleting(true)
    try {
      await window.electronAPI.kanbanDeleteItem(projectPath, item.id)
      onUpdated()
      onClose()
    } catch (error) {
      console.error('Failed to delete item:', error)
    } finally {
      setIsDeleting(false)
    }
  }, [item, isDeleting, projectPath, onUpdated, onClose])

  const handleStartPlanAgent = useCallback(async () => {
    if (!item || isStartingAgent) return

    setIsStartingAgent(true)
    clearAgentOutput()
    setShowAgentLog(true)
    try {
      const result = await window.electronAPI.agentStart({
        agentName: 'plan-agent',
        projectPath,
        itemId: item.id,
        goal: item.description,
      })

      if (result.error) {
        console.error('Failed to start agent:', result.error)
        setAgentOutput(prev => prev + `\n[Error] ${result.error}\n`)
      } else if (result.sessionId) {
        setCurrentSessionId(result.sessionId)
      }
      onUpdated()
    } catch (error) {
      console.error('Failed to start agent:', error)
      setAgentOutput(prev => prev + `\n[Error] ${error}\n`)
    } finally {
      setIsStartingAgent(false)
    }
  }, [item, isStartingAgent, projectPath, onUpdated, clearAgentOutput])

  const handleAnswerQuestion = useCallback(async () => {
    if (!item || isAnswering || !answerText.trim()) return

    setIsAnswering(true)
    try {
      await window.electronAPI.agentAnswer(projectPath, item.id, answerText.trim())
      setAnswerText('')
      onUpdated()
    } catch (error) {
      console.error('Failed to answer question:', error)
    } finally {
      setIsAnswering(false)
    }
  }, [item, isAnswering, answerText, projectPath, onUpdated])

  const handleResumeAgent = useCallback(async () => {
    if (!item || isStartingAgent) return

    setIsStartingAgent(true)
    setShowAgentLog(true)
    try {
      const result = await window.electronAPI.agentResume({
        agentName: 'plan-agent',
        projectPath,
        itemId: item.id,
        goal: item.description,
      })

      if (result.error) {
        console.error('Failed to resume agent:', result.error)
        setAgentOutput(prev => prev + `\n[Error] ${result.error}\n`)
      } else if (result.sessionId) {
        setCurrentSessionId(result.sessionId)
      }
      onUpdated()
    } catch (error) {
      console.error('Failed to resume agent:', error)
      setAgentOutput(prev => prev + `\n[Error] ${error}\n`)
    } finally {
      setIsStartingAgent(false)
    }
  }, [item, isStartingAgent, projectPath, onUpdated])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    },
    [onClose]
  )

  if (!isOpen || !item) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onKeyDown={handleKeyDown}
    >
      <div
        data-testid="item-detail-dialog"
        className="bg-[var(--color-bg-secondary)] rounded-lg shadow-xl border border-[var(--color-border-primary)] w-full max-w-4xl mx-4 max-h-[90vh] overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--color-border-primary)]">
          <h2 className="text-lg font-semibold text-white">Item Details</h2>
          <button
            data-testid="close-button"
            onClick={onClose}
            className="p-1 text-[var(--color-text-secondary)] hover:text-white hover:bg-[var(--color-bg-tertiary)] rounded transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content - Two pane layout */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left pane - Title, Description, Comments */}
          <div className="flex-1 p-4 overflow-y-auto border-r border-[var(--color-border-primary)]">
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
            <div data-testid="comments-section">
              <h3 className="text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                Comments
              </h3>
              {item.comments.length === 0 ? (
                <p
                  data-testid="no-comments"
                  className="text-sm text-[var(--color-text-tertiary)] italic"
                >
                  No comments yet
                </p>
              ) : (
                <div className="space-y-3">
                  {item.comments.map(comment => (
                    <div
                      key={comment.id}
                      className="bg-[var(--color-bg-primary)] rounded-md p-3 border border-[var(--color-border-primary)]"
                    >
                      <div className="flex items-center gap-2 mb-1">
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
                      <p className="text-sm text-[var(--color-text-primary)]">{comment.text}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Agent Output Log */}
            {showAgentLog && (
              <div data-testid="agent-log-section" className="mt-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium text-[var(--color-text-secondary)] flex items-center gap-2">
                    <Terminal size={14} />
                    Agent Output
                  </h3>
                  <div className="flex items-center gap-1">
                    <button
                      data-testid="clear-log-button"
                      onClick={clearAgentOutput}
                      className="p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors"
                      title="Clear log"
                    >
                      <Trash2 size={12} />
                    </button>
                    <button
                      data-testid="close-log-button"
                      onClick={() => setShowAgentLog(false)}
                      className="p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors"
                      title="Hide log"
                    >
                      <X size={12} />
                    </button>
                  </div>
                </div>
                <pre
                  ref={logRef}
                  data-testid="agent-log-content"
                  className="bg-[var(--color-bg-primary)] rounded-md p-3 border border-[var(--color-border-primary)] text-xs text-[var(--color-text-primary)] font-mono whitespace-pre-wrap break-words overflow-y-auto max-h-64"
                >
                  {agentOutput || 'Waiting for agent output...'}
                </pre>
              </div>
            )}
          </div>

          {/* Right pane - Status, Agent Type, Column, Branch, Timestamps, Actions */}
          <div className="w-64 p-4 overflow-y-auto bg-[var(--color-bg-tertiary)]">
            {/* Status */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
                Status
              </label>
              <span
                data-testid="status-badge"
                className={`inline-block px-2 py-1 text-xs font-medium rounded text-white ${statusColors[item.agentStatus]}`}
              >
                {item.agentStatus}
              </span>
            </div>

            {/* Plan Agent Controls */}
            <div className="mb-4 p-3 bg-[var(--color-bg-primary)] rounded-md border border-[var(--color-border-primary)]">
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                Plan Agent
              </label>

              {/* Idle - Show Run button */}
              {item.agentStatus === 'idle' && (
                <button
                  data-testid="run-plan-agent-button"
                  onClick={handleStartPlanAgent}
                  disabled={isStartingAgent}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Play size={14} />
                  {isStartingAgent ? 'Starting...' : 'Run Plan Agent'}
                </button>
              )}

              {/* Running - Show indicator */}
              {item.agentStatus === 'running' && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-yellow-400">
                    <div className="w-3 h-3 bg-yellow-400 rounded-full animate-pulse" />
                    Agent is running...
                  </div>
                  {!showAgentLog && agentOutput && (
                    <button
                      data-testid="show-log-button"
                      onClick={() => setShowAgentLog(true)}
                      className="w-full flex items-center justify-center gap-2 px-2 py-1.5 text-xs bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] rounded border border-[var(--color-border-primary)] hover:border-[var(--color-accent-primary)] transition-colors"
                    >
                      <Terminal size={12} />
                      Show Log
                    </button>
                  )}
                </div>
              )}

              {/* Waiting - Show question and answer input */}
              {item.agentStatus === 'waiting' && item.agentQuestion && (
                <div className="space-y-2">
                  <div className="flex items-start gap-2 text-sm text-orange-400">
                    <MessageSquare size={14} className="mt-0.5 flex-shrink-0" />
                    <span>{item.agentQuestion}</span>
                  </div>
                  {item.agentQuestionOptions && item.agentQuestionOptions.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {item.agentQuestionOptions.map((option, idx) => (
                        <button
                          key={idx}
                          onClick={() => setAnswerText(option)}
                          className="px-2 py-1 text-xs bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] rounded border border-[var(--color-border-primary)] hover:border-[var(--color-accent-primary)] transition-colors"
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  )}
                  <textarea
                    data-testid="answer-input"
                    value={answerText}
                    onChange={e => setAnswerText(e.target.value)}
                    placeholder="Type your answer..."
                    rows={2}
                    className="w-full px-2 py-1.5 bg-[var(--color-bg-secondary)] border border-[var(--color-border-primary)] rounded text-sm text-white placeholder-[var(--color-text-tertiary)] focus:outline-none focus:border-[var(--color-accent-primary)]"
                  />
                  <div className="flex gap-2">
                    <button
                      data-testid="submit-answer-button"
                      onClick={handleAnswerQuestion}
                      disabled={isAnswering || !answerText.trim()}
                      className="flex-1 px-2 py-1.5 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {isAnswering ? 'Sending...' : 'Submit Answer'}
                    </button>
                    <button
                      data-testid="resume-agent-button"
                      onClick={handleResumeAgent}
                      disabled={isStartingAgent || !answerText.trim()}
                      className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <RotateCcw size={12} />
                      {isStartingAgent ? 'Resuming...' : 'Resume'}
                    </button>
                  </div>
                </div>
              )}

              {/* Interrupted - Show resume button */}
              {item.agentStatus === 'interrupted' && (
                <button
                  data-testid="resume-interrupted-button"
                  onClick={handleResumeAgent}
                  disabled={isStartingAgent}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <RotateCcw size={14} />
                  {isStartingAgent ? 'Resuming...' : 'Resume Agent'}
                </button>
              )}

              {/* Completed */}
              {item.agentStatus === 'completed' && (
                <div className="text-sm text-green-400">
                  Agent completed successfully
                </div>
              )}

              {/* Failed */}
              {item.agentStatus === 'failed' && (
                <div className="space-y-2">
                  <div className="text-sm text-red-400">Agent failed</div>
                  <button
                    data-testid="retry-agent-button"
                    onClick={handleStartPlanAgent}
                    disabled={isStartingAgent}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <RotateCcw size={14} />
                    {isStartingAgent ? 'Retrying...' : 'Retry'}
                  </button>
                </div>
              )}
            </div>

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
                {columnOptions.map(option => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
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
              <button
                data-testid="save-button"
                onClick={handleSave}
                disabled={isSaving}
                className="w-full px-4 py-2 text-sm bg-[var(--color-accent-primary)] text-white rounded-md hover:bg-[var(--color-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
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
