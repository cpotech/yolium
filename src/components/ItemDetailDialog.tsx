import React, { useState, useCallback, useEffect, useRef } from 'react'
import { X, GitBranch, Clock, Play, MessageSquare, RotateCcw, Terminal, Trash2, Code, Loader2, CheckCircle, AlertTriangle, XCircle } from 'lucide-react'
import type { KanbanItem, KanbanColumn, AgentStatus, CommentSource } from '../types/kanban'
import { trapFocus } from '../lib/focus-trap'

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
  const [model, setModel] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isStartingAgent, setIsStartingAgent] = useState(false)
  const [answerText, setAnswerText] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isAnswering, setIsAnswering] = useState(false)
  const [agentOutputLines, setAgentOutputLines] = useState<string[]>([])
  const [showAgentLog, setShowAgentLog] = useState(false)
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const [currentStep, setCurrentStep] = useState<string | null>(null)
  const [currentDetail, setCurrentDetail] = useState<string | null>(null)
  // Real-time agent status from IPC events (more responsive than polling board state)
  const [liveStatus, setLiveStatus] = useState<'starting' | 'running' | 'completed' | 'failed' | null>(null)
  const [liveStatusMessage, setLiveStatusMessage] = useState<string | null>(null)
  const logEndRef = useRef<HTMLDivElement>(null)
  const logContainerRef = useRef<HTMLDivElement>(null)
  const answerInputRef = useRef<HTMLTextAreaElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  // Reset agent output state when switching to a different item
  // Use item.id (not the object ref) so refreshes of the same item don't clear output
  useEffect(() => {
    setAgentOutputLines([])
    setShowAgentLog(false)
    setCurrentSessionId(null)
    sessionIdRef.current = null
    setCurrentStep(null)
    setCurrentDetail(null)
    setLiveStatus(null)
    setLiveStatusMessage(null)
  }, [item?.id])

  // Reconnect to active agent session when dialog reopens for a running item
  useEffect(() => {
    if (!item || item.agentStatus !== 'running') return

    const reconnect = async () => {
      const result = await window.electronAPI.agentGetActiveSession(projectPath, item.id)
      if (result?.sessionId) {
        sessionIdRef.current = result.sessionId
        setCurrentSessionId(result.sessionId)
        setLiveStatus('running')
        setShowAgentLog(true)
      }
    }
    reconnect()
  }, [item?.id, item?.agentStatus, projectPath])

  // Track the baseline values to detect unsaved changes
  const [baseTitle, setBaseTitle] = useState('')
  const [baseDescription, setBaseDescription] = useState('')
  const [baseColumn, setBaseColumn] = useState<KanbanColumn>('backlog')
  const [baseModel, setBaseModel] = useState('')

  const hasUnsavedChanges = title !== baseTitle || description !== baseDescription || column !== baseColumn || model !== baseModel

  // Sync editable fields when item data changes (including refreshes)
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

  // Subscribe to agent output events (uses ref to capture output before state update)
  useEffect(() => {
    if (!item) return

    const cleanup = window.electronAPI.onAgentOutput((sessionId, data) => {
      // Use ref for immediate session tracking (avoids race with setState)
      if (sessionId === sessionIdRef.current) {
        const lines = data.split('\n').filter(Boolean)
        if (lines.length > 0) {
          setAgentOutputLines(prev => [...prev, ...lines])
          setShowAgentLog(true)
        }
      }
    })

    return cleanup
  }, [item?.id])

  // Subscribe to agent progress events (uses ref for immediate tracking)
  useEffect(() => {
    if (!item) return

    const cleanup = window.electronAPI.onAgentProgress((sessionId, progress) => {
      if (sessionId === sessionIdRef.current) {
        setLiveStatus('running')
        setCurrentStep(progress.step)
        setCurrentDetail(
          progress.attempt
            ? `${progress.detail} (attempt ${progress.attempt}/${progress.maxAttempts || '?'})`
            : progress.detail
        )
      }
    })

    return cleanup
  }, [item?.id])

  // Subscribe to agent completion events
  useEffect(() => {
    if (!item) return

    const cleanup = window.electronAPI.onAgentComplete((sessionId, summary) => {
      if (sessionId === sessionIdRef.current) {
        setLiveStatus('completed')
        setLiveStatusMessage(summary)
        onUpdated()
      }
    })

    return cleanup
  }, [item?.id, onUpdated])

  // Subscribe to agent error events
  useEffect(() => {
    if (!item) return

    const cleanup = window.electronAPI.onAgentError((sessionId, message) => {
      if (sessionId === sessionIdRef.current) {
        setLiveStatus('failed')
        setLiveStatusMessage(message)
        onUpdated()
      }
    })

    return cleanup
  }, [item?.id, onUpdated])

  // Subscribe to agent exit events
  useEffect(() => {
    if (!item) return

    const cleanup = window.electronAPI.onAgentExit((sessionId, exitCode) => {
      if (sessionId === sessionIdRef.current) {
        // Only update if not already set by complete/error events
        setLiveStatus(prev => prev === 'running' || prev === 'starting'
          ? (exitCode === 0 ? 'completed' : 'failed')
          : prev
        )
        onUpdated()
      }
    })

    return cleanup
  }, [item?.id, onUpdated])

  // Auto-focus answer textarea when agent enters waiting state
  useEffect(() => {
    if (item?.agentStatus === 'waiting' && item.agentQuestion && answerInputRef.current) {
      answerInputRef.current.focus()
    }
  }, [item?.agentStatus, item?.agentQuestion])

  // Auto-scroll agent log to bottom
  useEffect(() => {
    if (logEndRef.current && showAgentLog) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [agentOutputLines, showAgentLog])

  // Clear output when starting a new agent run
  const clearAgentOutput = useCallback(() => {
    setAgentOutputLines([])
  }, [])

  const handleSave = useCallback(async () => {
    if (!item || isSaving) return

    setIsSaving(true)
    try {
      const trimmedTitle = title.trim()
      const trimmedDescription = description.trim()
      await window.electronAPI.kanbanUpdateItem(projectPath, item.id, {
        title: trimmedTitle,
        description: trimmedDescription,
        column,
        model: model || undefined,
      })
      // Update baseline so unsaved indicator clears
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
      setErrorMessage('Failed to delete item. Please try again.')
    } finally {
      setIsDeleting(false)
    }
  }, [item, isDeleting, projectPath, onUpdated, onClose])

  const getDefaultAgentName = useCallback((currentItem: KanbanItem): string => {
    return currentItem.branch ? 'code-agent' : 'plan-agent'
  }, [])

  const handleStartAgent = useCallback(async (agentName: string) => {
    if (!item || isStartingAgent) return

    setIsStartingAgent(true)
    clearAgentOutput()
    setCurrentStep(null)
    setCurrentDetail(null)
    setLiveStatus('starting')
    setLiveStatusMessage(null)
    setShowAgentLog(true)
    try {
      const result = await window.electronAPI.agentStart({
        agentName,
        projectPath,
        itemId: item.id,
        goal: item.description,
      })

      if (result.error) {
        console.error('Failed to start agent:', result.error)
        setAgentOutputLines(prev => [...prev, `[Error] ${result.error}`])
        setLiveStatus('failed')
        setLiveStatusMessage(result.error)
      } else if (result.sessionId) {
        // Set ref immediately so output events are captured before state renders
        sessionIdRef.current = result.sessionId
        setCurrentSessionId(result.sessionId)
        setLiveStatus('running')
      }
      onUpdated()
    } catch (error) {
      console.error('Failed to start agent:', error)
      setAgentOutputLines(prev => [...prev, `[Error] ${error}`])
      setLiveStatus('failed')
      setLiveStatusMessage(String(error))
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
    setCurrentStep(null)
    setCurrentDetail(null)
    setLiveStatus('starting')
    setLiveStatusMessage(null)
    setShowAgentLog(true)
    try {
      const result = await window.electronAPI.agentResume({
        agentName,
        projectPath,
        itemId: item.id,
        goal: item.description,
      })

      if (result.error) {
        console.error('Failed to resume agent:', result.error)
        setAgentOutputLines(prev => [...prev, `[Error] ${result.error}`])
        setLiveStatus('failed')
        setLiveStatusMessage(result.error)
      } else if (result.sessionId) {
        // Set ref immediately so output events are captured before state renders
        sessionIdRef.current = result.sessionId
        setCurrentSessionId(result.sessionId)
        setLiveStatus('running')
      }
      onUpdated()
    } catch (error) {
      console.error('Failed to resume agent:', error)
      setAgentOutputLines(prev => [...prev, `[Error] ${error}`])
      setLiveStatus('failed')
      setLiveStatusMessage(String(error))
    } finally {
      setIsStartingAgent(false)
    }
  }, [item, isStartingAgent, projectPath, onUpdated])

  const handleClose = useCallback(async () => {
    if (hasUnsavedChanges) {
      const confirmed = await window.electronAPI.showConfirmOkCancel(
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

        {/* Content - Two pane layout (stacks on small screens) */}
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

            {/* Live Agent Status Banner */}
            {liveStatus && (
              <div
                data-testid="agent-status-banner"
                className={`mt-4 p-3 rounded-md text-sm ${
                  liveStatus === 'completed' ? 'bg-green-900/30 border border-green-700/50 text-green-300' :
                  liveStatus === 'failed' ? 'bg-red-900/30 border border-red-700/50 text-red-300' :
                  'bg-blue-900/30 border border-blue-700/50 text-blue-300'
                }`}
              >
                {liveStatus === 'starting' && (
                  <span className="flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin" />
                    Starting agent container...
                  </span>
                )}
                {liveStatus === 'running' && (
                  <span className="flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin" />
                    {currentDetail || 'Agent is running...'}
                  </span>
                )}
                {liveStatus === 'completed' && (
                  <span className="flex items-center gap-2">
                    <CheckCircle size={14} />
                    {liveStatusMessage || 'Agent completed successfully'}
                  </span>
                )}
                {liveStatus === 'failed' && (
                  <span className="flex items-center gap-2">
                    <XCircle size={14} />
                    {liveStatusMessage ? `Failed: ${liveStatusMessage}` : 'Agent failed'}
                  </span>
                )}
              </div>
            )}

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
                <div
                  ref={logContainerRef}
                  data-testid="agent-log-content"
                  aria-live="polite"
                  aria-label="Agent output log"
                  className="bg-[var(--color-bg-primary)] rounded-md p-3 border border-[var(--color-border-primary)] text-xs text-[var(--color-text-primary)] font-mono overflow-y-auto max-h-96"
                >
                  {agentOutputLines.length === 0 ? (
                    <span className="text-[var(--color-text-tertiary)]">Waiting for agent output...</span>
                  ) : (
                    agentOutputLines.map((line, idx) => (
                      <div key={idx} className="whitespace-pre-wrap break-words leading-5">
                        {line}
                      </div>
                    ))
                  )}
                  <div ref={logEndRef} />
                </div>
              </div>
            )}
          </div>

          {/* Right pane - Status, Agent Type, Column, Branch, Timestamps, Actions */}
          <div className="w-full md:w-64 p-4 overflow-y-auto bg-[var(--color-bg-tertiary)] border-t md:border-t-0 border-[var(--color-border-primary)]">
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

            {/* Agent Controls */}
            <div className="mb-4 p-3 bg-[var(--color-bg-primary)] rounded-md border border-[var(--color-border-primary)] min-h-[100px]">
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                Agent Controls
              </label>

              {/* Idle - Show agent buttons */}
              {item.agentStatus === 'idle' && (
                <div className="space-y-2">
                  {item.branch ? (
                    <>
                      <button
                        data-testid="run-code-agent-button"
                        onClick={() => handleStartAgent('code-agent')}
                        disabled={isStartingAgent}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        <Code size={14} />
                        {isStartingAgent ? 'Starting...' : 'Run Code Agent'}
                      </button>
                      <button
                        data-testid="run-plan-agent-button"
                        onClick={() => handleStartAgent('plan-agent')}
                        disabled={isStartingAgent}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] rounded-md border border-[var(--color-border-primary)] hover:border-[var(--color-accent-primary)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        <Play size={14} />
                        {isStartingAgent ? 'Starting...' : 'Run Plan Agent'}
                      </button>
                    </>
                  ) : (
                    <button
                      data-testid="run-plan-agent-button"
                      onClick={() => handleStartAgent('plan-agent')}
                      disabled={isStartingAgent}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <Play size={14} />
                      {isStartingAgent ? 'Starting...' : 'Run Plan Agent'}
                    </button>
                  )}
                </div>
              )}

              {/* Running - Show indicator with progress and stop button */}
              {item.agentStatus === 'running' && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-yellow-400">
                    <div className="w-3 h-3 bg-yellow-400 rounded-full animate-pulse" />
                    Agent is running...
                  </div>
                  {currentDetail && (
                    <p
                      data-testid="agent-progress-detail"
                      className="text-xs text-[var(--color-text-secondary)] pl-5"
                    >
                      {currentDetail}
                    </p>
                  )}
                  {currentSessionId && (
                    <button
                      data-testid="stop-agent-button"
                      onClick={async () => {
                        if (currentSessionId) {
                          await window.electronAPI.agentStop(currentSessionId)
                          onUpdated()
                        }
                      }}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
                    >
                      <XCircle size={14} />
                      Stop Agent
                    </button>
                  )}
                  {!showAgentLog && agentOutputLines.length > 0 && (
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
                    ref={answerInputRef}
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
                      onClick={() => handleResumeAgent(getDefaultAgentName(item))}
                      disabled={isStartingAgent}
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
                  onClick={() => handleResumeAgent(getDefaultAgentName(item))}
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
                    onClick={() => handleStartAgent(getDefaultAgentName(item))}
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
                    // Only agents can move items to in-progress
                    // Allow displaying if already in that column
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
