import React from 'react';
import { ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import { ProjectList } from './ProjectList';
import type { SidebarWorkItem } from './ProjectList';
import type { SidebarProject } from '@renderer/stores/sidebar-store';
import { useVimModeContext } from '@renderer/context/VimModeContext';

interface SidebarProps {
  projects: SidebarProject[];
  collapsed: boolean;
  sidebarItems: SidebarWorkItem[];
  onToggleCollapse: () => void;
  onProjectClick: (path: string) => void;
  onProjectRemove: (path: string) => void;
  onOpenProject: () => void;
  onAnswerAndResume: (projectPath: string, itemId: string, answer: string, agentName: string) => void;
  onOpenSchedule?: () => void;
}

export function Sidebar({
  projects,
  collapsed,
  sidebarItems,
  onToggleCollapse,
  onProjectClick,
  onProjectRemove,
  onOpenProject,
  onAnswerAndResume,
  onOpenSchedule,
}: SidebarProps): React.ReactElement {
  const vim = useVimModeContext();
  const isZoneActive = vim.activeZone === 'sidebar' && vim.mode === 'NORMAL';

  return (
    <div
      data-testid="sidebar"
      data-vim-zone="sidebar"
      className={`flex flex-col bg-[var(--color-bg-secondary)] border-r border-[var(--color-border-primary)] transition-all ${
        collapsed ? 'w-10' : 'w-48'
      } ${isZoneActive ? 'ring-1 ring-[var(--color-accent-primary)]' : ''}`}
    >
      {/* Project list */}
      <div className="flex-1 min-h-0">
        <ProjectList
          projects={projects}
          collapsed={collapsed}
          sidebarItems={sidebarItems}
          onProjectClick={onProjectClick}
          onProjectRemove={onProjectRemove}
          onOpenProject={onOpenProject}
          onAnswerAndResume={onAnswerAndResume}
          onOpenSchedule={onOpenSchedule}
        />
      </div>

      {/* Scheduled agents button */}
      {onOpenSchedule && (
        <button
          data-testid="sidebar-schedule"
          onClick={onOpenSchedule}
          className={`flex items-center gap-2 px-2 py-2 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)] border-t border-[var(--color-border-primary)] transition-colors ${
            collapsed ? 'justify-center' : ''
          }`}
          title="Scheduled Agents"
        >
          <Clock size={16} />
          {!collapsed && <span className="text-xs truncate">Scheduled</span>}
          <kbd className="px-1 py-0.5 text-[10px] bg-[var(--color-bg-tertiary)] rounded border border-[var(--color-border-primary)] font-mono">H</kbd>
        </button>
      )}

      {/* Collapse toggle */}
      <button
        data-testid="collapse-toggle"
        onClick={onToggleCollapse}
        className="flex items-center justify-center gap-1 p-2 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] border-t border-[var(--color-border-primary)]"
        title="Toggle sidebar (E)"
      >
        {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        <kbd data-testid="sidebar-shortcut-hint" className="text-[10px] font-mono text-[var(--color-text-muted)]">E</kbd>
      </button>
    </div>
  );
}
