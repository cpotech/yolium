import React from 'react';
import { Folder, X, Plus } from 'lucide-react';
import type { SidebarProject } from '@renderer/stores/sidebar-store';
import type { AgentStatus, KanbanColumn } from '@shared/types/kanban';
import { StatusDotPopover } from './StatusDotPopover';

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
}

export function ProjectList({
  projects,
  collapsed,
  sidebarItems,
  onProjectClick,
  onProjectRemove,
  onAddProject,
  onAnswerAndResume,
}: ProjectListProps): React.ReactElement {
  // Extract folder name from path (handle both / and \ separators)
  const getFolderName = (path: string): string => {
    return path.split(/[/\\]/).filter(Boolean).pop() || path;
  };

  const handleAnswer = async (item: SidebarWorkItem, option: string) => {
    await onAnswerAndResume(item.projectPath, item.itemId, option, item.agentName || 'code-agent');
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-border-primary)]">
        {!collapsed && (
          <span className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
            Projects
          </span>
        )}
        <button
          data-testid="add-project-button"
          onClick={onAddProject}
          className="p-1 rounded text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)] transition-colors"
        >
          <Plus size={16} />
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
          projects.map((project) => {
            const projectItems = sidebarItems.filter(w => w.projectPath === project.path && w.column !== 'done');
            // Sort items: running -> waiting -> failed
            const sortedItems = [...projectItems].sort((a, b) => {
              const order: Partial<Record<AgentStatus, number>> = { running: 0, waiting: 1, failed: 2 };
              return (order[a.agentStatus] ?? 3) - (order[b.agentStatus] ?? 3);
            });
            return (
              <div key={project.path}>
                <div
                  data-testid={`project-item-${project.path}`}
                  className="group flex items-center gap-2 px-3 py-1.5 cursor-pointer text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)] transition-colors"
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
