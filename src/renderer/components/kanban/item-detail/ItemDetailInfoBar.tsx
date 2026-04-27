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
      className="flex items-center gap-4 px-6 py-1.5 border-b border-[var(--color-border-primary)] bg-[var(--color-bg-tertiary)] overflow-x-auto text-xs"
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
          className={`flex items-center gap-1 ${verified ? 'text-[var(--color-status-success)]' : 'text-[var(--color-text-secondary)]'}`}
        >
          <ShieldCheck size={13} />
          {verified ? 'Verified' : 'Not verified'}
        </span>
        {showKbdHints && (
          <kbd className="px-1 py-0.5 text-[10px] bg-[var(--color-bg-primary)] rounded border border-[var(--color-border-primary)] font-mono ml-0.5 text-[var(--color-text-muted)]">
            V
          </kbd>
        )}
      </label>

      {/* Branch */}
      <div className="flex items-center gap-1.5 text-[var(--color-text-secondary)] whitespace-nowrap min-w-0">
        <GitBranch size={13} className="flex-shrink-0 opacity-70" />
        <span data-testid="branch-display" className="truncate font-mono">
          {item.branch || 'N/A'}
        </span>
      </div>

      {/* Worktree */}
      {item.worktreePath && (
        <div className="flex items-center gap-1 text-[var(--color-text-tertiary)] min-w-0">
          <FolderOpen size={13} className="flex-shrink-0 opacity-70" />
          <span
            data-testid="worktree-path-display"
            className="font-mono truncate opacity-80"
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
