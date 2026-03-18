import React, { useState, useCallback } from 'react';
import { Folder, X, Plus } from 'lucide-react';
import type { SidebarProject } from '@renderer/stores/sidebar-store';
import type { AgentStatus, KanbanColumn } from '@shared/types/kanban';
import { StatusDotPopover } from './StatusDotPopover';
import { getFolderName } from '@renderer/lib/path-utils';
import { useVimModeContext } from '@renderer/context/VimModeContext';

export interface SidebarWorkItem {
  projectPath: string;
  itemId: string;
  itemTitle: string;
  question?: string;
  options?: string[];
  agentName?: string;
  agentStatus: AgentStatus;
  column?: KanbanColumn;
  agentType?: string;
}

interface ProjectListProps {
  projects: SidebarProject[];
  collapsed: boolean;
  sidebarItems: SidebarWorkItem[];
  onProjectClick: (path: string) => void;
  onProjectRemove: (path: string) => void;
  onAddProject: () => void;
  onAnswerAndResume: (projectPath: string, itemId: string, answer: string, agentName: string) => Promise<void> | void;
  onOpenSchedule?: () => void;
}

export function ProjectList({
  projects,
  collapsed,
  sidebarItems,
  onProjectClick,
  onProjectRemove,
  onAddProject,
  onAnswerAndResume,
  onOpenSchedule,
}: ProjectListProps): React.ReactElement {
  const vim = useVimModeContext();
  const isZoneActive = vim.activeZone === 'sidebar' && vim.mode === 'NORMAL';
  const [focusedIndex, setFocusedIndex] = useState(0);

  const handleAnswer = async (item: SidebarWorkItem, option: string) => {
    await onAnswerAndResume(item.projectPath, item.itemId, option, item.agentName || 'code-agent');
  };

  const handleVimKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!isZoneActive || projects.length === 0) return;

    if (e.key === 'j' || e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex(prev => (prev + 1) % projects.length);
    } else if (e.key === 'k' || e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex(prev => (prev - 1 + projects.length) % projects.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const idx = Math.min(focusedIndex, projects.length - 1);
      onProjectClick(projects[idx].path);
    } else if (e.key === 'x') {
      e.preventDefault();
      const idx = Math.min(focusedIndex, projects.length - 1);
      onProjectRemove(projects[idx].path);
    } else if (e.key === '+' || e.key === 'a') {
      e.preventDefault();
      onAddProject();
    } else if (e.key === 'h') {
      e.preventDefault();
      onOpenSchedule?.();
    }
  }, [isZoneActive, projects, focusedIndex, onProjectClick, onProjectRemove, onAddProject, onOpenSchedule]);

  return (
    <div className="flex flex-col h-full" onKeyDown={handleVimKeyDown} tabIndex={isZoneActive ? 0 : undefined}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-border-primary)]">
        {!collapsed && (
          <span className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
            Projects
          </span>
        )}
        <button
          data-testid="add-project-button"
          data-vim-key="a"
          onClick={onAddProject}
          className="flex items-center gap-0.5 p-1 rounded text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)] transition-colors"
        >
          <Plus size={16} />
          <kbd className="px-1 py-0.5 text-[10px] bg-[var(--color-bg-tertiary)] rounded border border-[var(--color-border-primary)] font-mono">A</kbd>
        </button>
      </div>

      {/* Project list */}
      <div className="flex-1 overflow-y-auto py-1">
        {projects.length === 0 ? (
          !collapsed && (
            <div className="px-3 py-4 text-xs text-[var(--color-text-muted)] text-center">
              No projects yet.
              <br />
              Click + to add one.
            </div>
          )
        ) : (
          projects.map((project, projectIndex) => {
            const projectItems = sidebarItems.filter(w => w.projectPath === project.path && w.column !== 'done');
            // Sort items: running -> waiting -> failed
            const sortedItems = [...projectItems].sort((a, b) => {
              const order: Partial<Record<AgentStatus, number>> = { running: 0, waiting: 1, failed: 2 };
              return (order[a.agentStatus] ?? 3) - (order[b.agentStatus] ?? 3);
            });
            const isFocused = isZoneActive && projectIndex === focusedIndex;
            return (
              <div key={project.path}>
                <div
                  data-testid={`project-item-${project.path}`}
                  data-vim-focused={isFocused ? 'true' : undefined}
                  data-vim-key="Enter"
                  className={`group flex items-center gap-2 px-3 py-1.5 cursor-pointer text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)] transition-colors ${
                    isFocused ? 'ring-1 ring-[var(--color-accent-primary)] bg-[var(--color-bg-tertiary)]' : ''
                  }`}
                  onClick={() => onProjectClick(project.path)}
                >
                  <Folder size={14} className="shrink-0 text-[var(--color-text-muted)]" />
                  {!collapsed && (
                    <>
                      <span className="flex-1 truncate text-sm">
                        {getFolderName(project.path)}
                      </span>
                      {sortedItems.length > 0 && (
                        <div className="status-dots flex shrink-0 items-center gap-1">
                          {sortedItems.map((item) => (
                            <StatusDotPopover
                              key={item.itemId}
                              item={item}
                              onAnswer={handleAnswer}
                            />
                          ))}
                        </div>
                      )}
                      <button
                        data-testid={`remove-project-${project.path}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onProjectRemove(project.path);
                        }}
                        className="p-0.5 rounded opacity-0 group-hover:opacity-100 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)] transition-all"
                      >
                        <X size={12} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
