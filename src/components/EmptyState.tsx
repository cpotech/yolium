import React from 'react';
import { Plus, ShieldCheck, Layers, Terminal, Puzzle, Globe, Plug, Ship, Lock, Code, HardDrive, GitBranch } from 'lucide-react';

interface EmptyStateProps {
  onNewTab: () => void;
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

export function EmptyState({ onNewTab }: EmptyStateProps): React.ReactElement {
  return (
    <div data-testid="empty-state" className="flex flex-col items-center justify-center h-full bg-gray-900 text-gray-400 px-4 py-8">
      {/* Hero section */}
      <Ship size={96} className="mb-4 text-gray-500" />
      <h1 className="text-2xl font-semibold text-white mb-1">
        Run AI Agents in Parallel Locally
      </h1>
      <p className="text-sm text-gray-400 mb-8 text-center">
        Claude Code, OpenCode, and Shell in isolated Docker containers
      </p>

      {/* Feature cards - grid layout */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-8 max-w-3xl w-full">
        {features.map(({ icon: Icon, title, description }) => (
          <div
            key={title}
            className="bg-gray-800 rounded-lg p-3 border border-gray-700"
          >
            <div className="flex items-center gap-2 mb-1.5">
              <Icon size={18} className="text-blue-400 flex-shrink-0" />
              <div className="text-white font-medium text-sm">{title}</div>
            </div>
            <div className="text-gray-400 text-xs leading-relaxed">{description}</div>
          </div>
        ))}
      </div>

      {/* CTA button */}
      <button
        onClick={onNewTab}
        className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg transition-colors"
      >
        <Plus size={18} />
        New Yolium
      </button>

      {/* Hint */}
      <p className="mt-4 text-xs text-gray-500">
        Press <kbd className="px-1.5 py-0.5 bg-gray-800 rounded text-gray-400 font-mono">Ctrl+Shift+T</kbd> to create a new tab
      </p>
    </div>
  );
}
