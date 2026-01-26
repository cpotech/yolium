import React from 'react';
import { X, Folder } from 'lucide-react';
import type { Tab as TabType, ContainerState } from '../types/tabs';

// Status indicator dot for container state
function StatusDot({ state }: { state: ContainerState }): React.ReactElement {
  const colors: Record<ContainerState, string> = {
    starting: 'bg-yellow-400 animate-pulse',
    running: 'bg-green-400',
    stopped: 'bg-gray-400',
    crashed: 'bg-red-400',
  };

  return (
    <span
      className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-gray-800 ${colors[state]}`}
      title={state.charAt(0).toUpperCase() + state.slice(1)}
    />
  );
}

interface TabProps {
  tab: TabType;
  isActive: boolean;
  onClick: () => void;
  onClose: (e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

export function Tab({ tab, isActive, onClick, onClose, onContextMenu }: TabProps): React.ReactElement {
  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();  // Don't trigger tab click
    onClose(e);
  };

  return (
    <div
      role="tab"
      aria-selected={isActive}
      data-testid={`tab-${tab.id}`}
      data-active={isActive}
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={`
        group flex items-center gap-2 px-3 py-1.5 min-w-[120px] max-w-[200px]
        cursor-pointer select-none shrink-0
        border-r border-gray-700
        ${isActive
          ? 'bg-gray-700 text-white'
          : 'bg-gray-800 text-gray-400 hover:bg-gray-750 hover:text-gray-200'
        }
      `}
    >
      {/* Icon - Folder with status indicator overlay */}
      <div className="relative shrink-0">
        <Folder size={14} className="text-gray-500" />
        <StatusDot state={tab.containerState} />
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
          hover:bg-gray-600
          ${isActive ? 'opacity-100' : ''}
        `}
        aria-label={`Close ${tab.label}`}
      >
        <X size={14} />
      </button>
    </div>
  );
}
