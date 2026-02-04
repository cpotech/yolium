import React from 'react'
import { GitBranch, Loader2, AlertCircle, CheckCircle, XCircle } from 'lucide-react'
import type { KanbanItem, AgentStatus } from '../types/kanban'

interface KanbanCardProps {
  item: KanbanItem
  onClick: (item: KanbanItem) => void
}

const agentTypeLabels: Record<KanbanItem['agentType'], string> = {
  claude: 'Claude',
  codex: 'Codex',
  opencode: 'OpenCode',
  shell: 'Shell',
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

export function KanbanCard({ item, onClick }: KanbanCardProps): React.ReactElement {
  const statusConfig = getStatusConfig(item.agentStatus)

  return (
    <div
      data-testid="kanban-card"
      onClick={() => onClick(item)}
      className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-md p-3 cursor-pointer transition-all hover:border-[var(--color-accent-primary)]"
    >
      {/* Header: Title and Agent Badge */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="font-bold text-[13px] text-white leading-tight">{item.title}</h3>
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
      <p className="text-[12px] text-[var(--color-text-secondary)] line-clamp-2 mb-2">
        {item.description}
      </p>

      {/* Status indicator */}
      {statusConfig && (
        <div
          data-testid="status-indicator"
          className={`flex items-center gap-1 text-[11px] ${statusConfig.colorClass}`}
        >
          {statusConfig.icon}
          <span>{statusConfig.text}</span>
        </div>
      )}
    </div>
  )
}
