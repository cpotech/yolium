import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ProjectList } from './ProjectList';
import type { WaitingItem } from './ProjectList';
import type { SidebarProject } from '@renderer/stores/sidebar-store';

interface SidebarProps {
  projects: SidebarProject[];
  collapsed: boolean;
  waitingItems: WaitingItem[];
  onToggleCollapse: () => void;
  onProjectClick: (path: string) => void;
  onProjectRemove: (path: string) => void;
  onAddProject: () => void;
  onAnswerAndResume: (projectPath: string, itemId: string, answer: string, agentName: string) => void;
}

export function Sidebar({
  projects,
  collapsed,
  waitingItems,
  onToggleCollapse,
  onProjectClick,
  onProjectRemove,
  onAddProject,
  onAnswerAndResume,
}: SidebarProps): React.ReactElement {
  return (
    <div
      data-testid="sidebar"
      className={`flex flex-col bg-[var(--color-bg-secondary)] border-r border-[var(--color-border-primary)] transition-all ${
        collapsed ? 'w-10' : 'w-48'
      }`}
    >
      {/* Project list */}
      <div className="flex-1 min-h-0">
        <ProjectList
          projects={projects}
          collapsed={collapsed}
          waitingItems={waitingItems}
          onProjectClick={onProjectClick}
          onProjectRemove={onProjectRemove}
          onAddProject={onAddProject}
          onAnswerAndResume={onAnswerAndResume}
        />
      </div>

      {/* Collapse toggle */}
      <button
        data-testid="collapse-toggle"
        onClick={onToggleCollapse}
        className="flex items-center justify-center p-2 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] border-t border-[var(--color-border-primary)]"
      >
        {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>
    </div>
  );
}
