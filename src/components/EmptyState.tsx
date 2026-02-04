import React from 'react';
import { Plus, FolderPlus, ShieldCheck, Layers, Terminal, Puzzle, Globe, Plug, Lock, Code, HardDrive, GitBranch, Sun, Moon } from 'lucide-react';
import { useTheme } from '../theme';

interface EmptyStateProps {
  onNewTab: () => void;
  onCreateProject?: () => void;
}

const features = [
  {
    icon: Layers,
    title: 'Parallel Environments',
    description: 'Run multiple agents without conflicts',
  },
  {
    icon: ShieldCheck,
    title: 'Sandbox Safety',
    description: 'Agents only access container, not host (except persistent cache)',
  },
  {
    icon: Terminal,
    title: 'Direct Intervention',
    description: 'Drop into any terminal to see state and take control',
  },
  {
    icon: Puzzle,
    title: 'Universal Compatibility',
    description: 'Claude Code, OpenCode, or Shell - your choice',
  },
  {
    icon: Globe,
    title: 'Web Access',
    description: 'Browse any website via HTTPS',
  },
  {
    icon: Lock,
    title: 'Network Firewall',
    description: 'Only HTTPS & SSH traffic allowed outbound',
  },
  {
    icon: Plug,
    title: 'MCP Compatible',
    description: 'MCP config auto-detected',
  },
  {
    icon: Code,
    title: 'Multi-Language Ready',
    description: 'Python, Node.js, and Java pre-installed',
  },
  {
    icon: HardDrive,
    title: 'Package Cache Shared',
    description: 'npm, pip, Maven caches persist across sessions',
  },
  {
    icon: GitBranch,
    title: 'Git Ready',
    description: 'SSH keys mounted for Git operations',
  },
];

export function EmptyState({ onNewTab, onCreateProject }: EmptyStateProps): React.ReactElement {
  const { theme, toggleTheme } = useTheme();

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

      {/* Hero section - Cyberdyne/Skynet corporate logo */}
      <div className="mb-8 relative select-none">
        {/* Hexagonal frame - Cyberdyne style */}
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

          {/* Red core - Skynet eye */}
          <div
            className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full z-10"
            style={{
              background: 'radial-gradient(circle, #ff0000 0%, #aa0000 100%)',
              boxShadow: '0 0 8px #ff0000, 0 0 16px #ff0000, 0 0 32px #ff3300',
            }}
          />

          {/* Main text */}
          <div className="relative mt-12">
            {/* Horizontal line loading effect - like T-800 vision */}
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

            {/* Main text - cold blue steel */}
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

          {/* Underline with data stream effect */}
          <div className="mt-3 flex items-center gap-2">
            <div className="h-px w-12 bg-gradient-to-r from-transparent to-cyan-500" />
            <div
              className="text-[9px] tracking-[0.3em] uppercase"
              style={{
                fontFamily: 'monospace',
                color: '#0088cc',
              }}
            >
              AI AGENTIC SYSTEMS
            </div>
            <div className="h-px w-12 bg-gradient-to-l from-transparent to-cyan-500" />
          </div>

          {/* Model number */}
          <div
            className="mt-1 text-[8px] tracking-[0.2em] opacity-50"
            style={{
              fontFamily: 'monospace',
              color: '#446688',
            }}
          >
            MODEL YOLO • AGENTIC ORCHESTRATION GOVERNANCE
          </div>
        </div>
      </div>
      <h1 className="text-2xl font-semibold text-[var(--color-text-primary)] mb-1 flex items-center justify-center gap-4">
        {/* Parallel AI Cores in containment cells */}
        <div className="relative">
          {/* Ambient glow */}
          <div
            className="absolute inset-0 blur-lg opacity-50"
            style={{
              background: 'radial-gradient(circle, rgba(0,170,255,0.5) 0%, transparent 70%)',
              transform: 'scale(2)',
            }}
          />

          <svg
            viewBox="0 0 56 32"
            className="relative w-14 h-8"
            style={{
              filter: 'drop-shadow(0 0 4px rgba(0,170,255,0.6))',
            }}
          >
            <defs>
              {/* Chrome cell gradient */}
              <linearGradient id="cellMetal" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#607080" />
                <stop offset="50%" stopColor="#203040" />
                <stop offset="100%" stopColor="#101820" />
              </linearGradient>

              {/* AI core glow */}
              <radialGradient id="coreGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#ff3300" />
                <stop offset="70%" stopColor="#cc0000" />
                <stop offset="100%" stopColor="#440000" />
              </radialGradient>
            </defs>

            {/* Three containment cells */}
            {[0, 1, 2].map((i) => (
              <g key={i} transform={`translate(${i * 18 + 2}, 2)`}>
                {/* Cell frame */}
                <rect
                  x="0" y="0" width="16" height="28" rx="2"
                  fill="url(#cellMetal)"
                  stroke="#4080a0"
                  strokeWidth="0.5"
                />

                {/* Inner containment border */}
                <rect
                  x="2" y="2" width="12" height="24" rx="1"
                  fill="none"
                  stroke="#0af"
                  strokeWidth="0.3"
                  opacity="0.6"
                />

                {/* AI Core - the "eye" */}
                <circle cx="8" cy="10" r="4" fill="url(#coreGlow)">
                  <animate
                    attributeName="opacity"
                    values="1;0.5;1"
                    dur={`${1.5 + i * 0.3}s`}
                    repeatCount="indefinite"
                  />
                </circle>
                <circle cx="8" cy="10" r="1.5" fill="#fff" opacity="0.9" />

                {/* Status bars */}
                <rect x="4" y="18" width="8" height="1.5" rx="0.5" fill="#0a3040" />
                <rect x="4" y="18" width={6 - i} height="1.5" rx="0.5" fill="#0af" opacity="0.8">
                  <animate
                    attributeName="width"
                    values={`${4 + i};${7 - i};${4 + i}`}
                    dur={`${2 + i * 0.5}s`}
                    repeatCount="indefinite"
                  />
                </rect>

                <rect x="4" y="21" width="8" height="1.5" rx="0.5" fill="#0a3040" />
                <rect x="4" y="21" width={5} height="1.5" rx="0.5" fill="#0f0" opacity="0.6">
                  <animate
                    attributeName="opacity"
                    values="0.6;1;0.6"
                    dur={`${1 + i * 0.2}s`}
                    repeatCount="indefinite"
                  />
                </rect>

                {/* Cell number */}
                <text
                  x="8" y="27"
                  textAnchor="middle"
                  fontSize="3"
                  fill="#4080a0"
                  fontFamily="monospace"
                >
                  {`0${i + 1}`}
                </text>
              </g>
            ))}
          </svg>
        </div>

        <span>Run AI agents in parallel—each safely containerized.</span>
      </h1>
      <p className="text-sm text-[var(--color-text-muted)] mb-8 text-center">
        Claude Code, OpenCode, and Shell in isolated Docker containers
      </p>

      {/* Feature cards - grid layout */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-8 max-w-3xl w-full">
        {features.map(({ icon: Icon, title, description }) => (
          <div
            key={title}
            className="bg-[var(--color-bg-secondary)] rounded-lg p-3 border border-[var(--color-border-primary)]"
          >
            <div className="flex items-center gap-2 mb-1.5">
              <Icon size={18} className="text-[var(--color-accent-primary)] flex-shrink-0" />
              <div className="text-[var(--color-text-primary)] font-medium text-sm">{title}</div>
            </div>
            <div className="text-[var(--color-text-muted)] text-xs leading-relaxed">{description}</div>
          </div>
        ))}
      </div>

      {/* CTA buttons */}
      <div className="flex items-center gap-3">
        <button
          onClick={onNewTab}
          className="flex items-center gap-2 px-5 py-2.5 bg-[var(--color-accent-primary)] hover:bg-[var(--color-accent-hover)] text-white font-medium rounded-lg transition-colors"
        >
          <Plus size={18} />
          New Yolium
        </button>
        {onCreateProject && (
          <button
            onClick={onCreateProject}
            className="flex items-center gap-2 px-5 py-2.5 bg-[var(--color-bg-secondary)] hover:bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] font-medium rounded-lg border border-[var(--color-border-primary)] transition-colors"
          >
            <FolderPlus size={18} />
            Create Project
          </button>
        )}
      </div>

      {/* Hint */}
      <p className="mt-4 text-xs text-[var(--color-text-disabled)]">
        Press <kbd className="px-1.5 py-0.5 bg-[var(--color-bg-secondary)] rounded text-[var(--color-text-muted)] font-mono">Ctrl+Shift+T</kbd> to create a new tab
      </p>
    </div>
  );
}
