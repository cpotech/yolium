import React, { useState } from 'react'
import { GitBranch, Loader2, AlertCircle, CheckCircle, XCircle, MessageSquare, RotateCcw, Play } from 'lucide-react'
import type { KanbanItem, AgentStatus } from '@shared/types/kanban'

interface KanbanCardProps {
  item: KanbanItem
  onClick: (item: KanbanItem) => void
  onDragStart?: (item: KanbanItem) => void
  onRetryAgent?: (itemId: string) => void
  onResumeAgent?: (itemId: string) => void
  onRunAgainAgent?: (itemId: string) => void
}

const agentProviderLabels: Record<KanbanItem['agentProvider'], string> = {
  claude: 'Claude',
  codex: 'Codex',
  opencode: 'OpenCode',
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
        colorClass: 'text-yellow-400',
      }
    case 'waiting':
      return {
        icon: <AlertCircle size={12} />,
        text: 'Needs input',
        colorClass: 'text-orange-400',
      }
    case 'interrupted':
      return {
        icon: <AlertCircle size={12} />,
        text: 'Interrupted',
        colorClass: 'text-orange-400',
      }
    case 'completed':
      return {
        icon: <CheckCircle size={12} />,
        text: 'Completed',
        colorClass: 'text-green-400',
      }
    case 'failed':
      return {
        icon: <XCircle size={12} />,
        text: 'Failed',
        colorClass: 'text-red-400',
      }
    default:
      return null
  }
}

export function KanbanCard({ item, onClick, onDragStart, onRetryAgent, onResumeAgent, onRunAgainAgent }: KanbanCardProps): React.ReactElement {
  const statusConfig = getStatusConfig(item.agentStatus)
  const [isDragging, setIsDragging] = useState(false)
  const isRunning = item.agentStatus === 'running'

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onClick(item)
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

  // Determine which action button to show based on status
  const getActionButton = () => {
    switch (item.agentStatus) {
      case 'failed':
        return onRetryAgent ? (
          <button
            data-testid="retry-agent-card-btn"
            onClick={handleRetryClick}
            title="Retry agent"
            className="p-1 rounded hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-colors"
          >
            <RotateCcw size={14} />
          </button>
        ) : null
      case 'completed':
        return onRunAgainAgent ? (
          <button
            data-testid="run-again-card-btn"
            onClick={handleRunAgainClick}
            title="Run again"
            className="p-1 rounded hover:bg-green-500/20 text-green-400 hover:text-green-300 transition-colors"
          >
            <RotateCcw size={14} />
          </button>
        ) : null
      case 'interrupted':
        return onResumeAgent ? (
          <button
            data-testid="resume-agent-card-btn"
            onClick={handleResumeClick}
            title="Resume agent"
            className="p-1 rounded hover:bg-orange-500/20 text-orange-400 hover:text-orange-300 transition-colors"
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
      role="button"
      tabIndex={0}
      aria-label={`${item.title} - ${item.agentStatus}`}
      draggable
      onClick={() => onClick(item)}
      onKeyDown={handleKeyDown}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', item.id)
        e.dataTransfer.effectAllowed = 'move'
        setIsDragging(true)
        onDragStart?.(item)
      }}
      onDragEnd={() => setIsDragging(false)}
      className={`bg-[var(--color-bg-primary)] rounded-md p-3 cursor-pointer transition-all hover:border-[var(--color-accent-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-primary)] focus:border-[var(--color-accent-primary)] ${
        isRunning ? 'border border-yellow-500/50 shadow-[0_0_8px_rgba(234,179,8,0.15)]' : 'border border-[var(--color-border-primary)]'
      } ${isDragging ? 'opacity-50' : ''}`}
    >
      {/* Header: Title and Agent Badge */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="font-bold text-[13px] text-white leading-tight line-clamp-2">{item.title}</h3>
        <span
          data-testid="agent-type-badge"
          className="flex-shrink-0 px-1.5 py-0.5 text-[10px] font-medium rounded bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]"
        >
          {item.activeAgentName ? formatAgentRoleLabel(item.activeAgentName) : agentProviderLabels[item.agentProvider]}
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
        title={item.description}
        className="text-[12px] text-[var(--color-text-secondary)] line-clamp-2 mb-2"
      >
        {item.description}
      </p>

      {/* Footer: Status indicator, action button, and comment count */}
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
