import React from 'react';
import { Plus, FolderPlus, Terminal, Folder, ArrowRight, Sun, Moon } from 'lucide-react';
import { useTheme } from '@renderer/theme';
import type { SidebarProject } from '@renderer/stores/sidebar-store';

interface EmptyStateProps {
  onNewTab: () => void;
  onCreateProject?: () => void;
  projects?: SidebarProject[];
  onProjectClick?: (path: string) => void;
}

/** Extract folder name from a full path (handles / and \ separators). */
function getFolderName(path: string): string {
  return path.split(/[/\\]/).filter(Boolean).pop() || path;
}

export function EmptyState({ onNewTab, onCreateProject, projects, onProjectClick }: EmptyStateProps): React.ReactElement {
  const { theme, toggleTheme } = useTheme();
  const hasProjects = projects && projects.length > 0;

  return (
    <div data-testid="empty-state" className="relative flex flex-col items-center justify-center h-full overflow-y-auto bg-[var(--color-bg-primary)] text-[var(--color-text-muted)] px-4 py-8">
      {/* Theme toggle - top right */}
      <button
        data-testid="theme-toggle"
        onClick={toggleTheme}
        className="absolute top-4 right-4 p-2 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] transition-colors"
        title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
      >
        {theme === 'dark' ? (
          <Sun size={20} className="lucide-sun" />
        ) : (
          <Moon size={20} className="lucide-moon" />
        )}
      </button>

      {/* Compact hero section */}
      <div className="mb-6 relative select-none">
        <div className="relative flex flex-col items-center">
          {/* Outer hexagon glow */}
          <div
            className="absolute -inset-8 opacity-30"
            style={{
              background: 'radial-gradient(circle at 50% 50%, #00aaff 0%, transparent 60%)',
            }}
          />

          {/* Hexagon border */}
          <svg
            className="absolute -top-6 left-1/2 -translate-x-1/2 w-24 h-24 opacity-60"
            viewBox="0 0 100 100"
          >
            <polygon
              points="50,2 95,25 95,75 50,98 5,75 5,25"
              fill="none"
              stroke="url(#hexGradient)"
              strokeWidth="1"
            />
            <defs>
              <linearGradient id="hexGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#ffffff" />
                <stop offset="50%" stopColor="#0088ff" />
                <stop offset="100%" stopColor="#003366" />
              </linearGradient>
            </defs>
          </svg>

          {/* Red core */}
          <div
            className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full z-10"
            style={{
              background: 'radial-gradient(circle, #ff0000 0%, #aa0000 100%)',
              boxShadow: '0 0 8px #ff0000, 0 0 16px #ff0000, 0 0 32px #ff3300',
            }}
          />

          {/* Main text */}
          <div className="relative mt-12">
            <div
              className="absolute inset-0 overflow-hidden opacity-20 pointer-events-none"
              style={{
                background: 'repeating-linear-gradient(0deg, transparent 0px, transparent 3px, rgba(0,170,255,0.5) 3px, rgba(0,170,255,0.5) 4px)',
              }}
            />

            {/* Shadow layer */}
            <div
              className="absolute inset-0 text-5xl sm:text-6xl font-bold tracking-[0.2em]"
              style={{
                fontFamily: 'system-ui, -apple-system, sans-serif',
                color: '#001020',
                transform: 'translate(2px, 2px)',
              }}
            >
              YOLIUM
            </div>

            {/* Main text */}
            <div
              className="relative text-5xl sm:text-6xl font-bold tracking-[0.2em]"
              style={{
                fontFamily: 'system-ui, -apple-system, sans-serif',
                background: `linear-gradient(180deg,
                  #ffffff 0%,
                  #d0e0f0 10%,
                  #80a0c0 30%,
                  #204060 50%,
                  #80a0c0 70%,
                  #d0e0f0 90%,
                  #ffffff 100%
                )`,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                filter: 'drop-shadow(0 0 4px rgba(0,136,255,0.6))',
              }}
            >
              YOLIUM
            </div>
          </div>

          {/* Underline */}
          <div className="mt-3 flex items-center gap-2">
            <div className="h-px w-12 bg-gradient-to-r from-transparent to-cyan-500" />
            <div
              className="text-[9px] tracking-[0.3em] uppercase"
              style={{ fontFamily: 'monospace', color: '#0088cc' }}
            >
              AI AGENTIC SYSTEMS
            </div>
            <div className="h-px w-12 bg-gradient-to-l from-transparent to-cyan-500" />
          </div>
        </div>
      </div>

      <p className="text-sm text-[var(--color-text-muted)] mb-8 text-center">
        Run AI agents in parallel &mdash; each safely containerized.
      </p>

      {/* CTA buttons */}
      <div className="flex items-center gap-3 mb-8">
        {onCreateProject && (
          <button
            onClick={onCreateProject}
            className="flex flex-col items-center gap-1 px-5 py-2.5 bg-[var(--color-accent-primary)] hover:bg-[var(--color-accent-hover)] text-white font-medium rounded-lg transition-colors"
          >
            <span className="flex items-center gap-2">
              <FolderPlus size={18} />
              Create Project
            </span>
            <kbd className="text-[10px] opacity-70 font-mono">Ctrl+Shift+P</kbd>
          </button>
        )}
        <button
          onClick={onNewTab}
          className="flex flex-col items-center gap-1 px-5 py-2.5 bg-[var(--color-bg-secondary)] hover:bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] font-medium rounded-lg border border-[var(--color-border-primary)] transition-colors"
        >
          <span className="flex items-center gap-2">
            <Terminal size={18} />
            New Terminal
          </span>
          <kbd className="text-[10px] text-[var(--color-text-muted)] font-mono">Ctrl+Shift+T</kbd>
        </button>
      </div>

      {/* Recent projects or getting started */}
      <div className="max-w-lg w-full">
        {hasProjects ? (
          <>
            <h2 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-3">
              Recent Projects
            </h2>
            <div className="flex flex-col gap-1.5">
              {projects.map((project) => (
                <button
                  key={project.path}
                  data-testid={`recent-project-${project.path}`}
                  onClick={() => onProjectClick?.(project.path)}
                  className="group flex items-center gap-3 px-3 py-2.5 bg-[var(--color-bg-secondary)] hover:bg-[var(--color-bg-tertiary)] rounded-lg border border-[var(--color-border-primary)] hover:border-[var(--color-accent-primary)] transition-colors text-left"
                >
                  <Folder size={16} className="text-[var(--color-accent-primary)] flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-[var(--color-text-primary)] truncate">
                      {getFolderName(project.path)}
                    </div>
                    <div className="text-xs text-[var(--color-text-muted)] truncate">
                      {project.path}
                    </div>
                  </div>
                  <ArrowRight size={14} className="text-[var(--color-text-muted)] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="text-center">
            <h2 className="text-sm font-medium text-[var(--color-text-secondary)] mb-2">
              Get started
            </h2>
            <div className="flex flex-col gap-2 text-xs text-[var(--color-text-muted)]">
              <div className="flex items-start gap-2">
                <span className="mt-0.5 flex-shrink-0 w-4 h-4 rounded-full bg-[var(--color-accent-primary)]/20 text-[var(--color-accent-primary)] flex items-center justify-center text-[10px] font-bold">1</span>
                <span><strong className="text-[var(--color-text-secondary)]">Create a project</strong> to set up a kanban board for managing work items</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="mt-0.5 flex-shrink-0 w-4 h-4 rounded-full bg-[var(--color-accent-primary)]/20 text-[var(--color-accent-primary)] flex items-center justify-center text-[10px] font-bold">2</span>
                <span><strong className="text-[var(--color-text-secondary)]">Add work items</strong> and assign AI agents (Claude Code, OpenCode, or Shell)</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="mt-0.5 flex-shrink-0 w-4 h-4 rounded-full bg-[var(--color-accent-primary)]/20 text-[var(--color-accent-primary)] flex items-center justify-center text-[10px] font-bold">3</span>
                <span><strong className="text-[var(--color-text-secondary)]">Agents work in parallel</strong> &mdash; each in its own Docker container with an isolated git branch</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
