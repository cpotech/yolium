import React from 'react';
import { Square, Loader2, Keyboard, Box, RefreshCw, GitGraph, GitBranch, TreeDeciduous } from 'lucide-react';
import type { ContainerState } from '../types/tabs';

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
    starting: { text: 'Starting...', className: 'text-yellow-400' },
    running: { text: 'Running', className: 'text-green-400' },
    stopped: { text: 'Stopped', className: 'text-gray-400' },
    crashed: { text: 'Crashed', className: 'text-red-400' },
  };

  const { text, className } = stateDisplay[containerState];

  return (
    <div data-testid="status-bar" className="flex items-center justify-between h-7 px-3 bg-gray-800 border-t border-gray-700 text-xs shrink-0">
      {/* Left: folder path + git branch + state */}
      <div className="flex items-center gap-2 text-gray-300 truncate">
        <span data-testid="status-path" className="truncate max-w-[300px]" title={folderPath}>
          {folderPath}
        </span>
        {(worktreeName || gitBranch) && (
          <>
            <span className="text-gray-500">|</span>
            {worktreeName && (
              <span className="flex items-center gap-1 text-purple-400" title={`Worktree: ${worktreeName}`}>
                <TreeDeciduous size={12} />
                <span className="truncate max-w-[150px]">{worktreeName}</span>
              </span>
            )}
            {gitBranch && gitBranch !== worktreeName && (
              <span className="flex items-center gap-1 text-blue-400" title={`Branch: ${gitBranch}`}>
                <GitBranch size={12} />
                <span className="truncate max-w-[150px]">{gitBranch}</span>
              </span>
            )}
          </>
        )}
        <span className="text-gray-500">|</span>
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
            className="flex items-center gap-1 px-2 py-0.5 rounded text-gray-300 hover:text-white hover:bg-gray-700 transition-colors"
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
            className="flex items-center gap-1 px-2 py-0.5 rounded text-gray-300 hover:text-white hover:bg-gray-700 transition-colors"
            title="Close and restart"
          >
            <span>Close</span>
          </button>
        )}

        {/* Separator */}
        <span className="text-gray-600">|</span>

        {/* Docker image info and rebuild button (only shown when image exists) */}
        {imageName && (
          <>
            <span className="flex items-center gap-1 text-gray-500">
              <Box size={12} />
              <span>{imageName}</span>
            </span>

            {/* Rebuild button */}
            {onRebuild && (
              <button
                onClick={onRebuild}
                disabled={isRebuilding}
                className="flex items-center gap-1 px-2 py-0.5 rounded text-gray-400 hover:text-white hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
        <span className="text-gray-600">|</span>

        {/* Git settings button */}
        <button
          data-testid="settings-button"
          onClick={onOpenSettings}
          className="flex items-center gap-1 px-2 py-0.5 rounded text-gray-500 hover:text-gray-300 hover:bg-gray-700 transition-colors"
          title="Git Settings"
        >
          <GitGraph size={12} />
        </button>

        {/* Keyboard shortcuts hint */}
        <button
          data-testid="shortcuts-button"
          onClick={onShowShortcuts}
          className="flex items-center gap-1 px-2 py-0.5 rounded text-gray-500 hover:text-gray-300 hover:bg-gray-700 transition-colors"
          title="Keyboard shortcuts (Ctrl+?)"
        >
          <Keyboard size={12} />
          <span>Ctrl+?</span>
        </button>
      </div>
    </div>
  );
}
