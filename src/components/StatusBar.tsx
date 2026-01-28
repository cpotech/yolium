import React from 'react';
import { Square, Loader2, Keyboard, Box, RefreshCw, GitGraph, GitBranch, TreeDeciduous, Sun, Moon } from 'lucide-react';
import type { ContainerState } from '../types/tabs';
import { useTheme } from '../theme';

interface StatusBarProps {
  folderPath: string;
  containerState: ContainerState;
  onStop: () => void;
  onShowShortcuts: () => void;
  onOpenSettings: () => void;
  imageName?: string;
  onRebuild?: () => void;
  isRebuilding?: boolean;
  gitBranch?: string;
  worktreeName?: string;
}

export function StatusBar({
  folderPath,
  containerState,
  onStop,
  onShowShortcuts,
  onOpenSettings,
  imageName = 'yolium:latest',
  onRebuild,
  isRebuilding = false,
  gitBranch,
  worktreeName,
}: StatusBarProps): React.ReactElement {
  const stateDisplay: Record<ContainerState, { text: string; className: string }> = {
    starting: { text: 'Starting...', className: 'text-[var(--color-status-warning)]' },
    running: { text: 'Running', className: 'text-[var(--color-status-success)]' },
    stopped: { text: 'Stopped', className: 'text-[var(--color-status-stopped)]' },
    crashed: { text: 'Crashed', className: 'text-[var(--color-status-error)]' },
  };

  const { text, className } = stateDisplay[containerState];
  const { theme, toggleTheme } = useTheme();

  return (
    <div data-testid="status-bar" className="flex items-center justify-between h-7 px-3 bg-[var(--color-bg-secondary)] border-t border-[var(--color-border-primary)] text-xs shrink-0">
      {/* Left: folder path + git branch + state */}
      <div className="flex items-center gap-2 text-[var(--color-text-secondary)] truncate">
        <span data-testid="status-path" className="truncate max-w-[300px]" title={folderPath}>
          {folderPath}
        </span>
        {(worktreeName || gitBranch) && (
          <>
            <span className="text-[var(--color-text-muted)]">|</span>
            {worktreeName && (
              <span className="flex items-center gap-1 text-[var(--color-special-worktree)]" title={`Worktree: ${worktreeName}`}>
                <TreeDeciduous size={12} />
                <span className="truncate max-w-[150px]">{worktreeName}</span>
              </span>
            )}
            {gitBranch && gitBranch !== worktreeName && (
              <span className="flex items-center gap-1 text-[var(--color-special-branch)]" title={`Branch: ${gitBranch}`}>
                <GitBranch size={12} />
                <span className="truncate max-w-[150px]">{gitBranch}</span>
              </span>
            )}
          </>
        )}
        <span className="text-[var(--color-text-muted)]">|</span>
        <span data-testid="status-container-state" className={className}>
          {containerState === 'starting' && (
            <Loader2 size={12} className="inline mr-1 animate-spin" />
          )}
          {text}
        </span>
      </div>

      {/* Right: action buttons and shortcuts hint */}
      <div className="flex items-center gap-2">
        {/* Stop button (only when running or starting) */}
        {(containerState === 'running' || containerState === 'starting') && (
          <button
            data-testid="stop-button"
            onClick={onStop}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[var(--color-text-secondary)] hover:text-white hover:bg-[var(--color-bg-tertiary)] transition-colors"
            title="Stop yolium"
          >
            <Square size={10} className="fill-current" />
            <span>Stop</span>
          </button>
        )}

        {/* Crashed state: show Close option */}
        {containerState === 'crashed' && (
          <button
            onClick={onStop}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[var(--color-text-secondary)] hover:text-white hover:bg-[var(--color-bg-tertiary)] transition-colors"
            title="Close and restart"
          >
            <span>Close</span>
          </button>
        )}

        {/* Separator */}
        <span className="text-[var(--color-text-disabled)]">|</span>

        {/* Docker image info and rebuild button (only shown when image exists) */}
        {imageName && (
          <>
            <span className="flex items-center gap-1 text-[var(--color-text-muted)]">
              <Box size={12} />
              <span>{imageName}</span>
            </span>

            {/* Rebuild button */}
            {onRebuild && (
              <button
                onClick={onRebuild}
                disabled={isRebuilding}
                className="flex items-center gap-1 px-2 py-0.5 rounded text-[var(--color-text-secondary)] hover:text-white hover:bg-[var(--color-bg-tertiary)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Delete Docker image (stops all terminals)"
              >
                {isRebuilding ? (
                  <Loader2 size={10} className="animate-spin" />
                ) : (
                  <RefreshCw size={10} />
                )}
                <span>Delete</span>
              </button>
            )}
          </>
        )}

        {/* Separator */}
        <span className="text-[var(--color-text-disabled)]">|</span>

        {/* Git settings button */}
        <button
          data-testid="settings-button"
          onClick={onOpenSettings}
          className="flex items-center gap-1 px-2 py-0.5 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] transition-colors"
          title="Git Settings"
        >
          <GitGraph size={12} />
        </button>

        {/* Theme toggle */}
        <button
          data-testid="theme-toggle"
          onClick={toggleTheme}
          className="flex items-center gap-1 px-2 py-0.5 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] transition-colors"
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
        >
          {theme === 'dark' ? (
            <Sun size={12} className="lucide-sun" />
          ) : (
            <Moon size={12} className="lucide-moon" />
          )}
        </button>

        {/* Keyboard shortcuts hint */}
        <button
          data-testid="shortcuts-button"
          onClick={onShowShortcuts}
          className="flex items-center gap-1 px-2 py-0.5 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] transition-colors"
          title="Keyboard shortcuts (Ctrl+?)"
        >
          <Keyboard size={12} />
          <span>Ctrl+?</span>
        </button>
      </div>
    </div>
  );
}
