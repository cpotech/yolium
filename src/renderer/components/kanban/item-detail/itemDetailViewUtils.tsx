import React, { useState } from 'react'
import { ClipboardCheck, Copy } from 'lucide-react'
import type { KanbanColumn, KanbanItem } from '@shared/types/kanban'

export const columnOptions: { id: KanbanColumn; label: string }[] = [
  { id: 'backlog', label: 'Backlog' },
  { id: 'ready', label: 'Ready' },
  { id: 'in-progress', label: 'In Progress' },
  { id: 'verify', label: 'Verify' },
  { id: 'done', label: 'Done' },
]

export const agentProviderLabels: Record<KanbanItem['agentProvider'], string> = {
  claude: 'Claude',
  codex: 'Codex',
  opencode: 'OpenCode',
}

export function formatTimestamp(isoString: string): string {
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

export function CopyPathButton({ path }: { path: string }): React.ReactElement {
  const [copied, setCopied] = useState(false)

  const handleCopy = (event: React.MouseEvent) => {
    event.stopPropagation()
    navigator.clipboard.writeText(path).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <button
      onClick={handleCopy}
      className="flex-shrink-0 p-0.5 rounded text-[var(--color-text-disabled)] hover:text-[var(--color-text-secondary)] transition-colors"
    >
      {copied ? <ClipboardCheck size={12} /> : <Copy size={12} />}
    </button>
  )
}
