import React from 'react';
import { Folder, X, Plus } from 'lucide-react';
import type { SidebarProject } from '@renderer/stores/sidebar-store';

interface ProjectListProps {
  projects: SidebarProject[];
  collapsed: boolean;
  onProjectClick: (path: string) => void;
  onProjectRemove: (path: string) => void;
  onAddProject: () => void;
}

export function ProjectList({
  projects,
  collapsed,
  onProjectClick,
  onProjectRemove,
  onAddProject,
}: ProjectListProps): React.ReactElement {
  // Extract folder name from path (handle both / and \ separators)
  const getFolderName = (path: string): string => {
    return path.split(/[/\\]/).filter(Boolean).pop() || path;
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
          className="p-1 rounded text-[var(--color-text-secondary)] hover:text-white hover:bg-[var(--color-bg-tertiary)] transition-colors"
          title="Add Project"
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
          projects.map((project) => (
            <div
              key={project.path}
              data-testid={`project-item-${project.path}`}
              className="group flex items-center gap-2 px-3 py-1.5 cursor-pointer text-[var(--color-text-secondary)] hover:text-white hover:bg-[var(--color-bg-tertiary)] transition-colors"
              onClick={() => onProjectClick(project.path)}
              title={project.path}
            >
              <Folder size={14} className="shrink-0 text-[var(--color-text-muted)]" />
              {!collapsed && (
                <>
                  <span className="flex-1 truncate text-sm">
                    {getFolderName(project.path)}
                  </span>
                  <button
                    data-testid={`remove-project-${project.path}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onProjectRemove(project.path);
                    }}
                    className="p-0.5 rounded opacity-0 group-hover:opacity-100 text-[var(--color-text-muted)] hover:text-white hover:bg-[var(--color-bg-tertiary)] transition-all"
                    title="Remove project"
                  >
                    <X size={12} />
                  </button>
                </>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
