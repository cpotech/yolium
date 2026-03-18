import React from 'react';
import { X, Folder, LayoutGrid } from 'lucide-react';
import type { Tab as TabType, ContainerState } from '@shared/types/tabs';

// Status indicator dot for container state
function StatusDot({ state }: { state: ContainerState }): React.ReactElement {
  const colors: Record<ContainerState, string> = {
    starting: 'bg-[var(--color-status-warning)] animate-pulse',
    running: 'bg-[var(--color-status-success)]',
    stopped: 'bg-[var(--color-status-stopped)]',
    crashed: 'bg-[var(--color-status-error)]',
  };

  return (
    <span
      className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-[var(--color-bg-secondary)] ${colors[state]}`}
    />
  );
}

interface TabProps {
  tab: TabType;
  isActive: boolean;
  isVimFocused?: boolean;
  onClick: () => void;
  onClose: (e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

export function Tab({ tab, isActive, isVimFocused, onClick, onClose, onContextMenu }: TabProps): React.ReactElement {
  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();  // Don't trigger tab click
    onClose(e);
  };

  const isKanban = tab.type === 'kanban';

  return (
    <div
      role="tab"
      aria-selected={isActive}
      data-testid={`tab-${tab.id}`}
      data-active={isActive}
      data-tab-type={tab.type}
      data-vim-focused={isVimFocused ? 'true' : undefined}
      data-vim-key="Enter"
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={`
        group flex items-center gap-2 px-3 py-1.5 min-w-[120px] max-w-[200px]
        cursor-pointer select-none shrink-0
        border-r border-[var(--color-border-primary)]
        ${isActive
          ? 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)]'
          : 'bg-[var(--color-bg-secondary)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-secondary)]'
        }
        ${isVimFocused ? 'ring-2 ring-[var(--color-accent-primary)]' : ''}
      `}
    >
      {/* Icon - different for terminal vs kanban */}
      <div className="relative shrink-0">
        {isKanban ? (
          <LayoutGrid size={14} className="text-[var(--color-accent-primary)]" />
        ) : (
          <>
            <Folder size={14} className="text-[var(--color-text-muted)]" />
            {tab.containerState && <StatusDot state={tab.containerState} />}
          </>
        )}
      </div>

      {/* Label - truncate with ellipsis */}
      <span className="flex-1 truncate text-sm">
        {tab.label}
      </span>

      {/* Close button */}
      <button
        data-testid={`tab-close-${tab.id}`}
        onClick={handleClose}
        className={`
          p-0.5 rounded
          opacity-0 group-hover:opacity-100
          hover:bg-[var(--color-bg-hover)]
          ${isActive ? 'opacity-100' : ''}
        `}
        aria-label={`Close ${tab.label}`}
      >
        <X size={14} />
      </button>
    </div>
  );
}
