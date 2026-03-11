import React from 'react';
import { Square, Loader2, Keyboard, GitBranch, TreeDeciduous, Sun, Moon, Settings, FileJson } from 'lucide-react';
import type { ContainerState } from '@shared/types/tabs';
import type { WhisperRecordingState, WhisperModelSize } from '@shared/types/whisper';
import type { ClaudeUsageState } from '@shared/types/agent';
import { useTheme } from '@renderer/theme';
import { SpeechToTextButton } from './SpeechToTextButton';

interface StatusBarProps {
  folderPath?: string;
  contextLabel?: string;
  containerState?: ContainerState;
  onStop?: () => void;
  onShowShortcuts: () => void;
  onOpenSettings: () => void;
  onOpenProjectSettings?: () => void;
  gitBranch?: string;
  worktreeName?: string;
  // Speech-to-text props
  whisperRecordingState?: WhisperRecordingState;
  whisperSelectedModel?: WhisperModelSize;
  onToggleRecording?: () => void;
  onOpenModelDialog?: () => void;
  // Claude OAuth usage state (auth status + usage data)
  claudeUsage?: ClaudeUsageState;
}

function formatResetTime(resetsAt: string): string {
  if (!resetsAt) return '';
  try {
    const resetDate = new Date(resetsAt);
    const now = new Date();
    const diffMs = resetDate.getTime() - now.getTime();
    const diffMins = Math.ceil(diffMs / (60 * 1000));
    const diffHours = Math.floor(diffMins / 60);
    const remainingMins = diffMins % 60;

    if (diffMs <= 0) return 'Resets soon';
    if (diffHours > 0) return `Resets in ${diffHours}h ${remainingMins}m`;
    return `Resets in ${diffMins}m`;
  } catch {
    return '';
  }
}

function getUsageBarColor(utilization: number): string {
  if (utilization > 95) return 'var(--color-status-error)';
  if (utilization > 80) return 'var(--color-status-warning)';
  return 'var(--color-accent-primary)';
}

function UsageBar({
  label,
  utilization,
  resetsAt,
}: {
  label: string;
  utilization: number;
  resetsAt: string;
}): React.ReactElement {
  const color = getUsageBarColor(utilization);
  const percentage = Math.round(utilization);
  const resetText = formatResetTime(resetsAt);

  return (
    <span className="flex items-center gap-1" title={resetText || undefined}>
      <span style={{ color: 'var(--color-accent-primary)' }}>{label}</span>
      <span
        className="inline-block w-12 h-1.5 bg-[var(--color-bg-tertiary)] rounded-sm overflow-hidden"
        title={resetText || undefined}
      >
        <span
          className="block h-full rounded-sm"
          style={{
            width: `${percentage}%`,
            backgroundColor: color,
          }}
        />
      </span>
      <span className="text-[var(--color-text-muted)]">{percentage}%</span>
    </span>
  );
}

export function StatusBar({
  folderPath,
  contextLabel,
  containerState,
  onStop,
  onShowShortcuts,
  onOpenSettings,
  onOpenProjectSettings,
  gitBranch,
  worktreeName,
  whisperRecordingState = 'idle',
  whisperSelectedModel = 'small',
  onToggleRecording,
  onOpenModelDialog,
  claudeUsage,
}: StatusBarProps): React.ReactElement {
  const stateDisplay: Record<ContainerState, { text: string; className: string }> = {
    starting: { text: 'Starting...', className: 'text-[var(--color-status-warning)]' },
    running: { text: 'Running', className: 'text-[var(--color-status-success)]' },
    stopped: { text: 'Stopped', className: 'text-[var(--color-status-stopped)]' },
    crashed: { text: 'Crashed', className: 'text-[var(--color-status-error)]' },
  };

  const containerInfo = containerState ? stateDisplay[containerState] : null;
  const { theme, toggleTheme } = useTheme();
  const primaryLabel = folderPath || contextLabel;
  const hasBranchMetadata = Boolean(worktreeName || gitBranch);
  const hasContextMetadata = Boolean(primaryLabel || hasBranchMetadata || containerInfo);
  return (
    <div data-testid="status-bar" className="flex items-center justify-between h-7 px-3 bg-[var(--color-bg-secondary)] border-t border-[var(--color-border-primary)] text-xs shrink-0">
      {/* Left: context label/path + git branch + state */}
      <div className="flex items-center gap-2 text-[var(--color-text-secondary)] truncate overflow-hidden min-w-0">
        {folderPath && (
          <span data-testid="status-path" className="truncate max-w-[300px]">
            {folderPath}
          </span>
        )}
        {!folderPath && contextLabel && (
          <span data-testid="status-label" className="truncate max-w-[300px]">
            {contextLabel}
          </span>
        )}
        {hasBranchMetadata && (
          <>
            {primaryLabel && <span className="text-[var(--color-text-muted)]">|</span>}
            <span data-testid="status-branch" className="flex items-center gap-2 min-w-0">
              {worktreeName && (
                <span className="flex items-center gap-1 text-[var(--color-special-worktree)]">
                  <TreeDeciduous size={12} />
                  <span className="truncate max-w-[250px]" title={worktreeName}>{worktreeName}</span>
                </span>
              )}
              {gitBranch && gitBranch !== worktreeName && (
                <span className="flex items-center gap-1 text-[var(--color-special-branch)]">
                  <GitBranch size={12} />
                  <span className="truncate max-w-[250px]" title={gitBranch}>{gitBranch}</span>
                </span>
              )}
            </span>
          </>
        )}
        {containerInfo && (
          <>
            {(primaryLabel || hasBranchMetadata) && <span className="text-[var(--color-text-muted)]">|</span>}
            <span data-testid="status-container-state" className={containerInfo.className}>
              {containerState === 'starting' && (
                <Loader2 size={12} className="inline mr-1 animate-spin" />
              )}
              {containerInfo.text}
            </span>
          </>
        )}
        {claudeUsage && (
          <>
            {hasContextMetadata && <span className="text-[var(--color-text-muted)]">|</span>}
            {!claudeUsage.hasOAuth ? (
              <span
                role="button"
                className="flex items-center gap-1 cursor-pointer text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
                onClick={onOpenSettings}
              >
                <span className="text-[var(--color-text-secondary)]">Claude</span>
                <span>&middot;</span>
                <span>log in</span>
              </span>
            ) : claudeUsage.usage ? (
              <>
                <span className="text-[var(--color-text-secondary)]">Claude</span>
                <UsageBar
                  label="5h"
                  utilization={claudeUsage.usage.fiveHour.utilization}
                  resetsAt={claudeUsage.usage.fiveHour.resetsAt}
                />
                <span className="text-[var(--color-text-muted)]">|</span>
                <UsageBar
                  label="7d"
                  utilization={claudeUsage.usage.sevenDay.utilization}
                  resetsAt={claudeUsage.usage.sevenDay.resetsAt}
                />
              </>
            ) : (
              <span className="text-[var(--color-text-secondary)]">Claude</span>
            )}
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

        {/* Project settings button */}
        {onOpenProjectSettings && (
          <button
            data-testid="project-settings-button"
            onClick={onOpenProjectSettings}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] transition-colors"
            title="Project settings"
          >
            <FileJson size={12} />
          </button>
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
