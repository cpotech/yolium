import React, { useState } from 'react'
import { GitBranch, Loader2, AlertCircle, CheckCircle, XCircle, MessageSquare } from 'lucide-react'
import type { KanbanItem, AgentStatus } from '../types/kanban'

interface KanbanCardProps {
  item: KanbanItem
  onClick: (item: KanbanItem) => void
  onDragStart?: (item: KanbanItem) => void
}

const agentTypeLabels: Record<KanbanItem['agentType'], string> = {
  claude: 'Claude',
  codex: 'Codex',
  opencode: 'OpenCode',
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

export function KanbanCard({ item, onClick, onDragStart }: KanbanCardProps): React.ReactElement {
  const statusConfig = getStatusConfig(item.agentStatus)
  const [isDragging, setIsDragging] = useState(false)
  const isRunning = item.agentStatus === 'running'

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onClick(item)
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
          {agentTypeLabels[item.agentType]}
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

      {/* Footer: Status indicator and comment count */}
      <div className="flex items-center justify-between">
        {statusConfig ? (
          <div
            data-testid="status-indicator"
            className={`flex items-center gap-1 text-[11px] ${statusConfig.colorClass}`}
          >
            {statusConfig.icon}
            <span>{statusConfig.text}</span>
          </div>
        ) : <div />}
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
