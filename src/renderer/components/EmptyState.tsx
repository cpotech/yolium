import React from 'react';
import { FolderPlus, Terminal, Folder, ArrowRight, Sun, Moon, LayoutGrid, Bot, GitBranch } from 'lucide-react';
import { useTheme } from '@renderer/theme';
import type { SidebarProject } from '@renderer/stores/sidebar-store';
import { getFolderName } from '@renderer/lib/path-utils';

interface EmptyStateProps {
  onNewTab: () => void;
  onOpenProject?: () => void;
  projects?: SidebarProject[];
  onProjectClick?: (path: string) => void;
}

const FEATURES = [
  {
    icon: LayoutGrid,
    title: 'Organize with kanban',
    description: 'Plan work visually on a board. Add items, set priorities, and track progress.',
  },
  {
    icon: Bot,
    title: 'Assign AI agents',
    description: 'Claude Code, OpenCode, or Codex pick up work items and execute autonomously.',
  },
  {
    icon: GitBranch,
    title: 'Parallel & isolated',
    description: 'Each agent runs in its own Docker container on a separate git branch.',
  },
] as const;

export function EmptyState({ onNewTab, onOpenProject, projects, onProjectClick }: EmptyStateProps): React.ReactElement {
  const { theme, toggleTheme } = useTheme();
  const hasProjects = projects && projects.length > 0;

  return (
    <div data-testid="empty-state" className="relative flex flex-col items-center justify-center h-full overflow-y-auto bg-[var(--color-bg-primary)] text-[var(--color-text-muted)] px-4 py-8">
      {/* Theme toggle - top right */}
      <button
        data-testid="theme-toggle"
        onClick={toggleTheme}
        className="absolute top-4 right-4 p-2 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] transition-colors"
      >
        {theme === 'dark' ? (
          <Sun size={20} className="lucide-sun" />
        ) : (
          <Moon size={20} className="lucide-moon" />
        )}
      </button>

      {/* Metatron's Cube hero — compact */}
      <div className="mb-4 relative select-none">
        <div className="relative flex flex-col items-center">
          {/* Ambient glow behind logo */}
          <div
            className="absolute -inset-6 opacity-25"
            style={{
              background: 'radial-gradient(circle at 50% 30%, #00aaff 0%, transparent 60%)',
            }}
          />

          {/* Metatron's Cube logo */}
          <svg
            width="100"
            height="100"
            viewBox="0 0 200 200"
            className="relative"
            style={{ filter: 'drop-shadow(0 0 6px rgba(0,136,255,0.4))' }}
          >
            <defs>
              <linearGradient id="metatronLine" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#0066aa" stopOpacity="0.3" />
                <stop offset="50%" stopColor="#00aaff" stopOpacity="0.6" />
                <stop offset="100%" stopColor="#0066aa" stopOpacity="0.3" />
              </linearGradient>
              <radialGradient id="metatronCore" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#ff2200" />
                <stop offset="60%" stopColor="#cc0000" />
                <stop offset="100%" stopColor="#660000" />
              </radialGradient>
              <filter id="nodeGlow">
                <feGaussianBlur stdDeviation="2" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Outer energy ring */}
            <circle cx="100" cy="100" r="85" fill="none" stroke="#0044aa" strokeWidth="0.5" opacity="0.3">
              <animate attributeName="r" values="83;87;83" dur="4s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.3;0.15;0.3" dur="4s" repeatCount="indefinite" />
            </circle>

            {/* Connecting lines — sacred geometry mesh */}
            <g stroke="url(#metatronLine)" strokeWidth="0.5" fill="none" opacity="0.7">
              {/* Center to inner ring */}
              <line x1="100" y1="100" x2="100" y2="60" />
              <line x1="100" y1="100" x2="134.6" y2="80" />
              <line x1="100" y1="100" x2="134.6" y2="120" />
              <line x1="100" y1="100" x2="100" y2="140" />
              <line x1="100" y1="100" x2="65.4" y2="120" />
              <line x1="100" y1="100" x2="65.4" y2="80" />
              {/* Center to outer ring */}
              <line x1="100" y1="100" x2="100" y2="30" />
              <line x1="100" y1="100" x2="160.6" y2="65" />
              <line x1="100" y1="100" x2="160.6" y2="135" />
              <line x1="100" y1="100" x2="100" y2="170" />
              <line x1="100" y1="100" x2="39.4" y2="135" />
              <line x1="100" y1="100" x2="39.4" y2="65" />
              {/* Inner hexagon */}
              <line x1="100" y1="60" x2="134.6" y2="80" />
              <line x1="134.6" y1="80" x2="134.6" y2="120" />
              <line x1="134.6" y1="120" x2="100" y2="140" />
              <line x1="100" y1="140" x2="65.4" y2="120" />
              <line x1="65.4" y1="120" x2="65.4" y2="80" />
              <line x1="65.4" y1="80" x2="100" y2="60" />
              {/* Outer hexagon */}
              <line x1="100" y1="30" x2="160.6" y2="65" />
              <line x1="160.6" y1="65" x2="160.6" y2="135" />
              <line x1="160.6" y1="135" x2="100" y2="170" />
              <line x1="100" y1="170" x2="39.4" y2="135" />
              <line x1="39.4" y1="135" x2="39.4" y2="65" />
              <line x1="39.4" y1="65" x2="100" y2="30" />
              {/* Inner-to-outer connections */}
              <line x1="100" y1="60" x2="100" y2="30" />
              <line x1="100" y1="60" x2="160.6" y2="65" />
              <line x1="100" y1="60" x2="39.4" y2="65" />
              <line x1="134.6" y1="80" x2="160.6" y2="65" />
              <line x1="134.6" y1="80" x2="160.6" y2="135" />
              <line x1="134.6" y1="80" x2="100" y2="30" />
              <line x1="134.6" y1="120" x2="160.6" y2="135" />
              <line x1="134.6" y1="120" x2="100" y2="170" />
              <line x1="100" y1="140" x2="100" y2="170" />
              <line x1="100" y1="140" x2="39.4" y2="135" />
              <line x1="65.4" y1="120" x2="39.4" y2="135" />
              <line x1="65.4" y1="120" x2="100" y2="170" />
              <line x1="65.4" y1="80" x2="39.4" y2="65" />
              <line x1="65.4" y1="80" x2="100" y2="30" />
              {/* Cross-through lines (Star of David) */}
              <line x1="100" y1="30" x2="100" y2="170" />
              <line x1="39.4" y1="65" x2="160.6" y2="135" />
              <line x1="160.6" y1="65" x2="39.4" y2="135" />
              {/* Additional cross connections */}
              <line x1="65.4" y1="80" x2="160.6" y2="65" />
              <line x1="134.6" y1="80" x2="39.4" y2="65" />
              <line x1="134.6" y1="120" x2="39.4" y2="135" />
              <line x1="65.4" y1="120" x2="39.4" y2="65" />
            </g>

            {/* Outer ring circles */}
            <g opacity="0.5">
              <circle cx="100" cy="30" r="18" fill="none" stroke="#0088cc" strokeWidth="0.5" />
              <circle cx="160.6" cy="65" r="18" fill="none" stroke="#0088cc" strokeWidth="0.5" />
              <circle cx="160.6" cy="135" r="18" fill="none" stroke="#0088cc" strokeWidth="0.5" />
              <circle cx="100" cy="170" r="18" fill="none" stroke="#0088cc" strokeWidth="0.5" />
              <circle cx="39.4" cy="135" r="18" fill="none" stroke="#0088cc" strokeWidth="0.5" />
              <circle cx="39.4" cy="65" r="18" fill="none" stroke="#0088cc" strokeWidth="0.5" />
            </g>

            {/* Inner ring circles */}
            <g opacity="0.4">
              <circle cx="100" cy="60" r="12" fill="none" stroke="#00aadd" strokeWidth="0.5" />
              <circle cx="134.6" cy="80" r="12" fill="none" stroke="#00aadd" strokeWidth="0.5" />
              <circle cx="134.6" cy="120" r="12" fill="none" stroke="#00aadd" strokeWidth="0.5" />
              <circle cx="100" cy="140" r="12" fill="none" stroke="#00aadd" strokeWidth="0.5" />
              <circle cx="65.4" cy="120" r="12" fill="none" stroke="#00aadd" strokeWidth="0.5" />
              <circle cx="65.4" cy="80" r="12" fill="none" stroke="#00aadd" strokeWidth="0.5" />
            </g>

            {/* Outer node dots — sequential pulse */}
            <g filter="url(#nodeGlow)">
              <circle cx="100" cy="30" r="3" fill="#0088cc" opacity="0.8">
                <animate attributeName="opacity" values="0.5;1;0.5" dur="2s" begin="0s" repeatCount="indefinite" />
              </circle>
              <circle cx="160.6" cy="65" r="3" fill="#0088cc" opacity="0.8">
                <animate attributeName="opacity" values="0.5;1;0.5" dur="2s" begin="0.33s" repeatCount="indefinite" />
              </circle>
              <circle cx="160.6" cy="135" r="3" fill="#0088cc" opacity="0.8">
                <animate attributeName="opacity" values="0.5;1;0.5" dur="2s" begin="0.66s" repeatCount="indefinite" />
              </circle>
              <circle cx="100" cy="170" r="3" fill="#0088cc" opacity="0.8">
                <animate attributeName="opacity" values="0.5;1;0.5" dur="2s" begin="1s" repeatCount="indefinite" />
              </circle>
              <circle cx="39.4" cy="135" r="3" fill="#0088cc" opacity="0.8">
                <animate attributeName="opacity" values="0.5;1;0.5" dur="2s" begin="1.33s" repeatCount="indefinite" />
              </circle>
              <circle cx="39.4" cy="65" r="3" fill="#0088cc" opacity="0.8">
                <animate attributeName="opacity" values="0.5;1;0.5" dur="2s" begin="1.66s" repeatCount="indefinite" />
              </circle>
            </g>

            {/* Inner node dots — staggered pulse */}
            <g filter="url(#nodeGlow)">
              <circle cx="100" cy="60" r="2" fill="#00aadd" opacity="0.7">
                <animate attributeName="opacity" values="0.4;0.9;0.4" dur="2.5s" begin="0.2s" repeatCount="indefinite" />
              </circle>
              <circle cx="134.6" cy="80" r="2" fill="#00aadd" opacity="0.7">
                <animate attributeName="opacity" values="0.4;0.9;0.4" dur="2.5s" begin="0.6s" repeatCount="indefinite" />
              </circle>
              <circle cx="134.6" cy="120" r="2" fill="#00aadd" opacity="0.7">
                <animate attributeName="opacity" values="0.4;0.9;0.4" dur="2.5s" begin="1s" repeatCount="indefinite" />
              </circle>
              <circle cx="100" cy="140" r="2" fill="#00aadd" opacity="0.7">
                <animate attributeName="opacity" values="0.4;0.9;0.4" dur="2.5s" begin="1.4s" repeatCount="indefinite" />
              </circle>
              <circle cx="65.4" cy="120" r="2" fill="#00aadd" opacity="0.7">
                <animate attributeName="opacity" values="0.4;0.9;0.4" dur="2.5s" begin="1.8s" repeatCount="indefinite" />
              </circle>
              <circle cx="65.4" cy="80" r="2" fill="#00aadd" opacity="0.7">
                <animate attributeName="opacity" values="0.4;0.9;0.4" dur="2.5s" begin="2.2s" repeatCount="indefinite" />
              </circle>
            </g>

            {/* Center core — red eye */}
            <circle cx="100" cy="100" r="8" fill="url(#metatronCore)" opacity="0.9">
              <animate attributeName="r" values="7;9;7" dur="3s" repeatCount="indefinite" />
            </circle>
            <circle cx="100" cy="100" r="3" fill="#fff" opacity="0.85">
              <animate attributeName="opacity" values="0.85;0.5;0.85" dur="2s" repeatCount="indefinite" />
            </circle>
            {/* Core pulse ring */}
            <circle cx="100" cy="100" r="14" fill="none" stroke="#ff0000" strokeWidth="0.5" opacity="0.3">
              <animate attributeName="r" values="12;16;12" dur="3s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.3;0.1;0.3" dur="3s" repeatCount="indefinite" />
            </circle>
          </svg>

          {/* Main text */}
          <div className="relative mt-3">
            {/* Shadow layer */}
            <div
              className="absolute inset-0 text-4xl sm:text-5xl font-bold tracking-[0.2em]"
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
              className="relative text-4xl sm:text-5xl font-bold tracking-[0.2em]"
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
          <div className="mt-2 flex items-center gap-2">
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

      <p className="text-sm text-[var(--color-text-secondary)] mb-6 text-center max-w-sm">
        Orchestrate AI coding agents in parallel &mdash; each in its own container with an isolated branch.
      </p>

      {/* CTA buttons */}
      <div className="flex items-center gap-3 mb-8">
        {onOpenProject && (
          <button
            onClick={onOpenProject}
            className="flex flex-col items-center gap-1 px-5 py-2.5 bg-[var(--color-accent-primary)] hover:bg-[var(--color-accent-hover)] text-white font-medium rounded-lg transition-colors"
          >
            <span className="flex items-center gap-2">
              <FolderPlus size={18} />
              Open Project
            </span>
            <kbd className="text-[10px] opacity-70 font-mono">Ctrl+Shift+N</kbd>
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

      {/* Recent projects or feature cards */}
      <div className="max-w-xl w-full">
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
          <div data-testid="getting-started">
            <h2 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-4 text-center">
              How it works
            </h2>
            <div className="grid grid-cols-3 gap-3">
              {FEATURES.map((feature) => {
                const Icon = feature.icon;
                return (
                  <div
                    key={feature.title}
                    className="flex flex-col items-center text-center px-3 py-4 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border-primary)]"
                  >
                    <div className="w-9 h-9 rounded-lg bg-[var(--color-accent-primary)]/10 flex items-center justify-center mb-3">
                      <Icon size={18} className="text-[var(--color-accent-primary)]" />
                    </div>
                    <h3 className="text-xs font-semibold text-[var(--color-text-primary)] mb-1">
                      {feature.title}
                    </h3>
                    <p className="text-[11px] leading-relaxed text-[var(--color-text-muted)]">
                      {feature.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
