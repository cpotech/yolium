import React from 'react'
import { FolderOpen, GitBranch, ShieldCheck } from 'lucide-react'
import type { KanbanItem } from '@shared/types/kanban'
import { CopyPathButton } from './itemDetailViewUtils'

interface ItemDetailInfoBarProps {
  showKbdHints: boolean
  item: KanbanItem
  verified: boolean
  onSetVerified: (value: boolean) => void
}

export function ItemDetailInfoBar({
  showKbdHints,
  item,
  verified,
  onSetVerified,
}: ItemDetailInfoBarProps): React.ReactElement {
  return (
    <div
      data-testid="info-bar"
      className="flex items-center gap-3 px-4 py-2 border-b border-[var(--color-border-primary)] bg-[var(--color-bg-tertiary)] overflow-x-auto"
    >
      {/* Verified */}
      <label className="flex items-center gap-1.5 cursor-pointer whitespace-nowrap">
        <input
          id="detail-verified"
          data-testid="verified-checkbox"
          type="checkbox"
          checked={verified}
          onChange={event => onSetVerified(event.target.checked)}
          className="rounded border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] text-[var(--color-status-success)] focus:ring-[var(--color-status-success)]"
        />
        <span
          className={`flex items-center gap-1 text-xs ${verified ? 'text-[var(--color-status-success)]' : 'text-[var(--color-text-secondary)]'}`}
        >
          <ShieldCheck size={14} />
          {verified ? 'Verified' : 'Not verified'}
        </span>
        {showKbdHints && (
          <kbd className="px-1 py-0.5 text-[10px] bg-[var(--color-bg-primary)] rounded border border-[var(--color-border-primary)] font-mono ml-1">
            V
          </kbd>
        )}
      </label>

      {/* Branch */}
      <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-primary)] whitespace-nowrap min-w-0">
        <GitBranch size={14} className="text-[var(--color-text-secondary)] flex-shrink-0" />
        <span data-testid="branch-display" className="truncate">
          {item.branch || 'N/A'}
        </span>
      </div>

      {/* Worktree */}
      {item.worktreePath && (
        <div className="flex items-center gap-1 text-xs text-[var(--color-text-tertiary)] min-w-0">
          <FolderOpen size={14} className="flex-shrink-0" />
          <span
            data-testid="worktree-path-display"
            className="font-mono truncate"
            title={item.worktreePath}
          >
            {item.worktreePath}
          </span>
          <CopyPathButton path={item.worktreePath} />
        </div>
      )}
    </div>
  )
}
