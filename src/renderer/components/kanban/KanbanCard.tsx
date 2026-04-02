import React, { useState } from 'react'
import { GitBranch, GitMerge, Loader2, AlertCircle, AlertTriangle, CheckCircle, XCircle, MessageSquare, RotateCcw, Play, ExternalLink, ShieldCheck, Wrench } from 'lucide-react'
import type { KanbanItem, AgentStatus, MergeStatus } from '@shared/types/kanban'

interface KanbanCardProps {
  item: KanbanItem
  isSelected?: boolean
  isFocused?: boolean
  onClick: (item: KanbanItem, event: React.MouseEvent | React.KeyboardEvent) => void
  onDragStart?: (item: KanbanItem) => void
  onRetryAgent?: (itemId: string) => void
  onResumeAgent?: (itemId: string) => void
  onRunAgainAgent?: (itemId: string) => void
  onFixConflicts?: (itemId: string) => void
}

const agentProviderLabels: Record<KanbanItem['agentProvider'], string> = {
  claude: 'Claude',
  codex: 'Codex',
  opencode: 'OpenCode',
  openrouter: 'OpenRouter',
  xai: 'xAI',
}

/**
 * Extract display label from agent definition name.
 * e.g., 'code-agent' → 'Code', 'plan-agent' → 'Plan'
 */
function formatAgentRoleLabel(agentName: string): string {
  return agentName
    .replace(/-agent$/, '')
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

interface StatusConfig {
  icon: React.ReactNode
  text: string
  colorClass: string
}

function getStatusConfig(status: AgentStatus): StatusConfig | null {
  switch (status) {
    case 'idle':
      return null
    case 'running':
      return {
        icon: <Loader2 size={12} className="animate-spin" />,
        text: 'Agent working...',
        colorClass: 'text-[var(--color-status-warning)]',
      }
    case 'waiting':
      return {
        icon: <AlertCircle size={12} />,
        text: 'Needs input',
        colorClass: 'text-[var(--color-status-warning)]',
      }
    case 'interrupted':
      return {
        icon: <AlertCircle size={12} />,
        text: 'Interrupted',
        colorClass: 'text-[var(--color-status-warning)]',
      }
    case 'completed':
      return {
        icon: <CheckCircle size={12} />,
        text: 'Completed',
        colorClass: 'text-[var(--color-status-success)]',
      }
    case 'failed':
      return {
        icon: <XCircle size={12} />,
        text: 'Failed',
        colorClass: 'text-[var(--color-status-error)]',
      }
    default:
      return null
  }
}

interface MergeStatusConfig {
  icon: React.ReactNode
  text: string
  colorClass: string
}

function getMergeStatusConfig(status: MergeStatus): MergeStatusConfig {
  switch (status) {
    case 'unmerged':
      return {
        icon: <GitBranch size={12} />,
        text: 'Unmerged',
        colorClass: 'text-[var(--color-status-info)]',
      }
    case 'merged':
      return {
        icon: <GitMerge size={12} />,
        text: 'Merged',
        colorClass: 'text-[var(--color-status-success)]',
      }
    case 'conflict':
      return {
        icon: <AlertTriangle size={12} />,
        text: 'Conflict',
        colorClass: 'text-[var(--color-status-error)]',
      }
  }
}

export function KanbanCard({ item, isSelected, isFocused, onClick, onDragStart, onRetryAgent, onResumeAgent, onRunAgainAgent, onFixConflicts }: KanbanCardProps): React.ReactElement {
  const statusConfig = getStatusConfig(item.agentStatus)
  const mergeStatusConfig = item.mergeStatus ? getMergeStatusConfig(item.mergeStatus) : null
  const [isDragging, setIsDragging] = useState(false)
  const isRunning = item.agentStatus === 'running'

  const handlePrLinkClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (item.prUrl) {
      window.electronAPI.app.openExternal(item.prUrl)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onClick(item, e)
    }
  }

  const handleRetryClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onRetryAgent?.(item.id)
  }

  const handleResumeClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onResumeAgent?.(item.id)
  }

  const handleRunAgainClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onRunAgainAgent?.(item.id)
  }

  const handleFixConflictsClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onFixConflicts?.(item.id)
  }

  // Determine which action button to show based on status
  const getActionButton = () => {
    switch (item.agentStatus) {
      case 'failed':
        return onRetryAgent ? (
          <button
            data-testid="retry-agent-card-btn"
            onClick={handleRetryClick}
            className="p-1 rounded hover:bg-[var(--color-status-error)]/20 text-[var(--color-status-error)] transition-colors"
          >
            <RotateCcw size={14} />
          </button>
        ) : null
      case 'completed':
        return onRunAgainAgent ? (
          <button
            data-testid="run-again-card-btn"
            onClick={handleRunAgainClick}
            className="p-1 rounded hover:bg-[var(--color-status-success)]/20 text-[var(--color-status-success)] transition-colors"
          >
            <RotateCcw size={14} />
          </button>
        ) : null
      case 'interrupted':
        return onResumeAgent ? (
          <button
            data-testid="resume-agent-card-btn"
            onClick={handleResumeClick}
            className="p-1 rounded hover:bg-[var(--color-status-warning)]/20 text-[var(--color-status-warning)] transition-colors"
          >
            <Play size={14} />
          </button>
        ) : null
      default:
        return null
    }
  }

  return (
    <div
      data-testid="kanban-card"
      data-vim-focused={isFocused ? 'true' : undefined}
      data-vim-key="Enter"
      role="button"
      tabIndex={0}
      aria-label={`${item.title} - ${item.agentStatus}`}
      aria-selected={isSelected}
      draggable
      onClick={(e) => onClick(item, e)}
      onKeyDown={handleKeyDown}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', item.id)
        e.dataTransfer.effectAllowed = 'move'
        setIsDragging(true)
        onDragStart?.(item)
      }}
      onDragEnd={() => setIsDragging(false)}
      className={`bg-[var(--color-bg-primary)] rounded-md p-3 cursor-pointer transition-all hover:border-[var(--color-accent-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-primary)] focus:border-[var(--color-accent-primary)] ${
        isFocused ? 'ring-2 ring-[var(--color-accent-primary)] border-[var(--color-accent-primary)]' :
        isSelected ? 'border-2 border-[var(--color-accent-primary)] ring-1 ring-[var(--color-accent-primary)]/30' :
        isRunning ? 'border border-[var(--color-status-warning)]/50 shadow-[0_0_8px_var(--color-status-warning)]/15' : 'border border-[var(--color-border-primary)]'
      } ${isDragging ? 'opacity-50' : ''}`}
    >
      {/* Header: Title and Agent Badge */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="font-bold text-[13px] text-[var(--color-text-primary)] leading-tight line-clamp-2">{item.title}</h3>
        <span
          data-testid="agent-type-badge"
          className={`flex-shrink-0 px-1.5 py-0.5 text-[10px] font-medium rounded bg-[var(--color-bg-tertiary)] ${
            !item.activeAgentName && !item.agentType
              ? 'text-[var(--color-text-tertiary)] opacity-60'
              : 'text-[var(--color-text-secondary)]'
          }`}
        >
          {item.activeAgentName
            ? formatAgentRoleLabel(item.activeAgentName)
            : item.agentType
              ? formatAgentRoleLabel(item.agentType)
              : 'No agent'}
        </span>
      </div>

      {/* Branch info */}
      {item.branch && (
        <div
          data-testid="branch-info"
          className="flex items-center gap-1 text-[11px] text-[var(--color-text-secondary)] mb-2"
        >
          <GitBranch size={12} />
          <span className="truncate">{item.branch}</span>
        </div>
      )}

      {/* Description */}
      <p
        className="text-[12px] text-[var(--color-text-secondary)] line-clamp-2 mb-2"
      >
        {item.description}
      </p>

      {item.lastAgentName ? (
        <p
          data-testid="last-run-agent"
          className="text-[11px] text-[var(--color-text-tertiary)] mb-2"
        >
          Last run: <span data-testid="agent-provider-info">{agentProviderLabels[item.agentProvider]}</span> / {formatAgentRoleLabel(item.lastAgentName)}
        </p>
      ) : (
        <p
          data-testid="agent-provider-info"
          className="text-[11px] text-[var(--color-text-tertiary)] mb-2"
        >
          Provider: {agentProviderLabels[item.agentProvider]}
        </p>
      )}

      {/* Footer: Status indicator, action button, merge status, and comment count */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {statusConfig ? (
            <div
              data-testid="status-indicator"
              className={`flex items-center gap-1 text-[11px] ${statusConfig.colorClass}`}
            >
              {statusConfig.icon}
              <span>{statusConfig.text}</span>
            </div>
          ) : <div />}
          {getActionButton()}
          {mergeStatusConfig && (
            <div
              data-testid="merge-status-indicator"
              className={`flex items-center gap-1 text-[11px] ${mergeStatusConfig.colorClass}`}
            >
              {mergeStatusConfig.icon}
              <span>{mergeStatusConfig.text}</span>
              {item.mergeStatus === 'merged' && item.prUrl && (
                <button
                  data-testid="pr-link-btn"
                  onClick={handlePrLinkClick}
                  className="p-0.5 rounded hover:bg-[var(--color-status-success)]/20 transition-colors"
                >
                  <ExternalLink size={11} />
                </button>
              )}
              {item.mergeStatus === 'conflict' && onFixConflicts && (
                <button
                  data-testid="fix-conflicts-card-btn"
                  onClick={handleFixConflictsClick}
                  className="p-0.5 rounded hover:bg-[var(--color-status-error)]/20 transition-colors"
                >
                  <Wrench size={11} />
                </button>
              )}
            </div>
          )}
          {item.verified && (
            <div
              data-testid="verified-indicator"
              className="flex items-center gap-1 text-[11px] text-[var(--color-status-success)]"
            >
              <ShieldCheck size={12} />
              <span>Verified</span>
            </div>
          )}
        </div>
        {item.comments.length > 0 && (
          <div
            data-testid="comment-count"
            className="flex items-center gap-1 text-[11px] text-[var(--color-text-tertiary)]"
          >
            <MessageSquare size={11} />
            <span>{item.comments.length}</span>
          </div>
        )}
      </div>
    </div>
  )
}
