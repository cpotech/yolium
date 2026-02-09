import React, { useState } from 'react';
import { Folder, X, Plus, MessageSquare, Play } from 'lucide-react';
import type { SidebarProject } from '@renderer/stores/sidebar-store';

export interface WaitingItem {
  projectPath: string;
  itemId: string;
  itemTitle: string;
  question: string;
  options?: string[];
  agentName?: string;
}

interface ProjectListProps {
  projects: SidebarProject[];
  collapsed: boolean;
  waitingItems: WaitingItem[];
  onProjectClick: (path: string) => void;
  onProjectRemove: (path: string) => void;
  onAddProject: () => void;
  onAnswerAndResume: (projectPath: string, itemId: string, answer: string, agentName: string) => void;
}

export function ProjectList({
  projects,
  collapsed,
  waitingItems,
  onProjectClick,
  onProjectRemove,
  onAddProject,
  onAnswerAndResume,
}: ProjectListProps): React.ReactElement {
  const [resumingItemId, setResumingItemId] = useState<string | null>(null);

  // Extract folder name from path (handle both / and \ separators)
  const getFolderName = (path: string): string => {
    return path.split(/[/\\]/).filter(Boolean).pop() || path;
  };

  const handleOptionClick = async (item: WaitingItem, option: string) => {
    setResumingItemId(item.itemId);
    try {
      await onAnswerAndResume(item.projectPath, item.itemId, option, item.agentName || 'code-agent');
    } finally {
      setResumingItemId(null);
    }
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
          projects.map((project) => {
            const projectWaiting = waitingItems.filter(w => w.projectPath === project.path);
            return (
              <div key={project.path}>
                <div
                  data-testid={`project-item-${project.path}`}
                  className="group flex items-center gap-2 px-3 py-1.5 cursor-pointer text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)] transition-colors"
                  onClick={() => onProjectClick(project.path)}
                  title={project.path}
                >
                  <Folder size={14} className="shrink-0 text-[var(--color-text-muted)]" />
                  {!collapsed && (
                    <>
                      <span className="flex-1 truncate text-sm">
                        {getFolderName(project.path)}
                      </span>
                      {projectWaiting.length > 0 && (
                        <span className="flex-shrink-0 w-4 h-4 flex items-center justify-center text-[10px] font-bold rounded-full bg-orange-500 text-white">
                          {projectWaiting.length}
                        </span>
                      )}
                      <button
                        data-testid={`remove-project-${project.path}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onProjectRemove(project.path);
                        }}
                        className="p-0.5 rounded opacity-0 group-hover:opacity-100 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)] transition-all"
                        title="Remove project"
                      >
                        <X size={12} />
                      </button>
                    </>
                  )}
                </div>
                {/* Waiting items for this project */}
                {!collapsed && projectWaiting.map((item) => (
                  <div
                    key={item.itemId}
                    data-testid={`waiting-item-${item.itemId}`}
                    className="px-3 py-2 ml-4 mr-2 mb-1 bg-[var(--color-bg-primary)] rounded border border-orange-500/30"
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <MessageSquare size={11} className="text-orange-400 flex-shrink-0" />
                      <span className="text-[11px] font-medium text-orange-400 truncate">{item.itemTitle}</span>
                    </div>
                    <p className="text-[11px] text-[var(--color-text-secondary)] mb-1.5 line-clamp-2">{item.question}</p>
                    {item.options && item.options.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {item.options.map((option, idx) => (
                          <button
                            key={idx}
                            data-testid={`sidebar-option-${item.itemId}-${idx}`}
                            disabled={resumingItemId === item.itemId}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOptionClick(item, option);
                            }}
                            className="px-1.5 py-0.5 text-[10px] bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] rounded border border-[var(--color-border-primary)] hover:border-orange-400 hover:text-orange-300 disabled:opacity-50 transition-colors"
                          >
                            {option}
                          </button>
                        ))}
                      </div>
                    )}
                    {resumingItemId === item.itemId && (
                      <div className="flex items-center gap-1 mt-1.5 text-[10px] text-orange-400">
                        <Play size={10} />
                        <span>Resuming...</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
