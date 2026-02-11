import React from 'react';
import { Square, Loader2, Keyboard, GitBranch, TreeDeciduous, Sun, Moon, Settings } from 'lucide-react';
import type { ContainerState } from '@shared/types/tabs';
import type { WhisperRecordingState, WhisperModelSize } from '@shared/types/whisper';
import { useTheme } from '@renderer/theme';
import { SpeechToTextButton } from './SpeechToTextButton';

interface StatusBarProps {
  folderPath: string;
  containerState?: ContainerState;
  onStop?: () => void;
  onShowShortcuts: () => void;
  onOpenSettings: () => void;
  gitBranch?: string;
  worktreeName?: string;
  // Speech-to-text props
  whisperRecordingState?: WhisperRecordingState;
  whisperSelectedModel?: WhisperModelSize;
  onToggleRecording?: () => void;
  onOpenModelDialog?: () => void;
}

export function StatusBar({
  folderPath,
  containerState,
  onStop,
  onShowShortcuts,
  onOpenSettings,
  gitBranch,
  worktreeName,
  whisperRecordingState = 'idle',
  whisperSelectedModel = 'small',
  onToggleRecording,
  onOpenModelDialog,
}: StatusBarProps): React.ReactElement {
  const stateDisplay: Record<ContainerState, { text: string; className: string }> = {
    starting: { text: 'Starting...', className: 'text-[var(--color-status-warning)]' },
    running: { text: 'Running', className: 'text-[var(--color-status-success)]' },
    stopped: { text: 'Stopped', className: 'text-[var(--color-status-stopped)]' },
    crashed: { text: 'Crashed', className: 'text-[var(--color-status-error)]' },
  };

  const containerInfo = containerState ? stateDisplay[containerState] : null;
  const { theme, toggleTheme } = useTheme();
  return (
    <div data-testid="status-bar" className="flex items-center justify-between h-7 px-3 bg-[var(--color-bg-secondary)] border-t border-[var(--color-border-primary)] text-xs shrink-0">
      {/* Left: folder path + git branch + state */}
      <div className="flex items-center gap-2 text-[var(--color-text-secondary)] truncate overflow-hidden min-w-0">
        <span data-testid="status-path" className="truncate max-w-[300px]">
          {folderPath}
        </span>
        {(worktreeName || gitBranch) && (
          <>
            <span className="text-[var(--color-text-muted)]">|</span>
            {worktreeName && (
              <span className="flex items-center gap-1 text-[var(--color-special-worktree)]">
                <TreeDeciduous size={12} />
                <span className="truncate max-w-[150px]">{worktreeName}</span>
              </span>
            )}
            {gitBranch && gitBranch !== worktreeName && (
              <span className="flex items-center gap-1 text-[var(--color-special-branch)]">
                <GitBranch size={12} />
                <span className="truncate max-w-[150px]">{gitBranch}</span>
              </span>
            )}
          </>
        )}
        {containerInfo && (
          <>
            <span className="text-[var(--color-text-muted)]">|</span>
            <span data-testid="status-container-state" className={containerInfo.className}>
              {containerState === 'starting' && (
                <Loader2 size={12} className="inline mr-1 animate-spin" />
              )}
              {containerInfo.text}
            </span>
          </>
        )}
      </div>

      {/* Right: action buttons and shortcuts hint */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {/* Stop button (only when running or starting) */}
        {onStop && (containerState === 'running' || containerState === 'starting') && (
          <button
            data-testid="stop-button"
            onClick={onStop}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)] transition-colors"
          >
            <Square size={10} className="fill-current" />
            <span className="hidden sm:inline">Stop</span>
          </button>
        )}

        {/* Crashed state: show Close option */}
        {onStop && containerState === 'crashed' && (
          <button
            onClick={onStop}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)] transition-colors"
          >
            <span className="hidden sm:inline">Close</span>
          </button>
        )}

        {/* Separator */}
        <span className="text-[var(--color-text-disabled)]">|</span>

        {/* Speech-to-text button */}
        {onToggleRecording && onOpenModelDialog && (
          <>
            <SpeechToTextButton
              recordingState={whisperRecordingState}
              selectedModel={whisperSelectedModel}
              onToggleRecording={onToggleRecording}
              onOpenModelDialog={onOpenModelDialog}
            />
            <span className="text-[var(--color-text-disabled)]">|</span>
          </>
        )}

        {/* Settings button */}
        <button
          data-testid="settings-button"
          onClick={onOpenSettings}
          className="flex items-center gap-1 px-2 py-0.5 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] transition-colors"
        >
          <Settings size={12} />
        </button>

        {/* Theme toggle */}
        <button
          data-testid="theme-toggle"
          onClick={toggleTheme}
          className="flex items-center gap-1 px-2 py-0.5 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] transition-colors"
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
        >
          <Keyboard size={12} />
          <span className="hidden sm:inline">Ctrl+?</span>
        </button>
      </div>
    </div>
  );
}
