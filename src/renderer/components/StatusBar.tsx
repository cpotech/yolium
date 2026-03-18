import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Square, Loader2, Keyboard, GitBranch, TreeDeciduous, Sun, Moon, Settings, FileJson } from 'lucide-react';
import type { ContainerState } from '@shared/types/tabs';
import type { WhisperRecordingState, WhisperModelSize } from '@shared/types/whisper';
import type { ClaudeUsageState } from '@shared/types/agent';
import { useTheme } from '@renderer/theme';
import { SpeechToTextButton } from './SpeechToTextButton';
import { useVimModeContext } from '@renderer/context/VimModeContext';

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

function renderClaudeUsage(
  claudeUsage: ClaudeUsageState,
  onOpenSettings: () => void,
): React.ReactNode {
  switch (claudeUsage.status) {
    case 'no-oauth':
      return (
        <span
          role="button"
          aria-label="Claude log in"
          className="flex items-center gap-1 cursor-pointer text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
          onClick={onOpenSettings}
        >
          <span className="text-[var(--color-text-secondary)]">Claude</span>
          <span>&middot;</span>
          <span>log in</span>
        </span>
      );
    case 'ready':
      return (
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
      );
    case 'unavailable':
      return (
        <span
          role="button"
          aria-label="Claude unavailable"
          className="flex items-center gap-1 cursor-pointer text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
          onClick={onOpenSettings}
          title="Usage unavailable. Open Settings."
        >
          <span className="text-[var(--color-text-secondary)]">Claude</span>
          <span>&middot;</span>
          <span>unavailable</span>
        </span>
      );
    case 'loading':
      return (
        <span
          role="status"
          aria-label="Claude loading"
          className="flex items-center gap-1 text-[var(--color-text-muted)]"
          title="Loading Claude usage..."
        >
          <span className="text-[var(--color-text-secondary)]">Claude</span>
          <Loader2 size={10} className="animate-spin" />
        </span>
      );
  }
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
  const vim = useVimModeContext();
  const isZoneActive = vim.activeZone === 'status-bar' && vim.mode === 'NORMAL';
  const [focusedButtonIndex, setFocusedButtonIndex] = useState(0);
  const buttonsRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Focus container when zone becomes active
  useEffect(() => {
    if (isZoneActive && containerRef.current) {
      const active = document.activeElement;
      const tag = active?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      containerRef.current.focus();
    }
  }, [isZoneActive]);

  const getButtons = useCallback((): HTMLButtonElement[] => {
    if (!buttonsRef.current) return [];
    return Array.from(buttonsRef.current.querySelectorAll('button'));
  }, []);

  const handleVimKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!isZoneActive) return;

    const buttons = getButtons();
    if (buttons.length === 0) return;

    if (e.key === 'l' || e.key === 'ArrowRight') {
      e.preventDefault();
      setFocusedButtonIndex(prev => Math.min(prev + 1, buttons.length - 1));
    } else if (e.key === 'h' || e.key === 'ArrowLeft') {
      e.preventDefault();
      setFocusedButtonIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const idx = Math.min(focusedButtonIndex, buttons.length - 1);
      buttons[idx]?.click();
    } else if (e.key === ',') {
      e.preventDefault();
      onOpenSettings();
    } else if (e.key === 'p') {
      e.preventDefault();
      onOpenProjectSettings?.();
    } else if (e.key === 'q') {
      e.preventDefault();
      onStop?.();
    } else if (e.key === 'w') {
      e.preventDefault();
      onToggleRecording?.();
    } else if (e.key === 'L') {
      e.preventDefault();
      toggleTheme();
    }
  }, [isZoneActive, focusedButtonIndex, getButtons, onOpenSettings, onOpenProjectSettings, onStop, onToggleRecording, toggleTheme]);

  // Update data-vim-focused attributes on buttons
  useEffect(() => {
    const buttons = getButtons();
    buttons.forEach((btn, i) => {
      btn.setAttribute('data-vim-focused', isZoneActive && i === focusedButtonIndex ? 'true' : 'false');
      if (isZoneActive && i === focusedButtonIndex) {
        btn.classList.add('ring-1', 'ring-[var(--color-accent-primary)]');
      } else {
        btn.classList.remove('ring-1', 'ring-[var(--color-accent-primary)]');
      }
    });
  }, [focusedButtonIndex, isZoneActive, getButtons]);

  const primaryLabel = folderPath || contextLabel;
  const hasBranchMetadata = Boolean(worktreeName || gitBranch);
  const hasContextMetadata = Boolean(primaryLabel || hasBranchMetadata || containerInfo);
  return (
    <div
      ref={containerRef}
      data-testid="status-bar"
      data-vim-zone="status-bar"
      tabIndex={isZoneActive ? 0 : undefined}
      onKeyDown={handleVimKeyDown}
      className={`flex items-center justify-between h-7 px-3 bg-[var(--color-bg-secondary)] border-t border-[var(--color-border-primary)] text-xs shrink-0 ${
        isZoneActive ? 'ring-1 ring-[var(--color-accent-primary)]' : ''
      }`}
    >
      {/* Left: mode indicator + context label/path + git branch + state */}
      <div className="flex items-center gap-2 text-[var(--color-text-secondary)] truncate overflow-hidden min-w-0">
        {/* Vim mode indicator */}
        <span
          data-testid="vim-mode-indicator"
          className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${
            vim.mode === 'NORMAL'
              ? 'bg-[var(--color-accent-primary)]/20 text-[var(--color-accent-primary)]'
              : 'bg-[var(--color-status-success)]/20 text-[var(--color-status-success)]'
          }`}
        >
          -- {vim.mode} --
        </span>
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
            {renderClaudeUsage(claudeUsage, onOpenSettings)}
          </>
        )}
      </div>

      {/* Right: action buttons and shortcuts hint */}
      <div ref={buttonsRef} className="flex items-center gap-2 flex-shrink-0">
        {/* Stop button (only when running or starting) */}
        {onStop && (containerState === 'running' || containerState === 'starting') && (
          <button
            data-testid="stop-button"
            data-vim-key="q"
            onClick={onStop}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)] transition-colors"
          >
            <Square size={10} className="fill-current" />
            <span className="hidden sm:inline">Stop</span>
            <kbd className="px-1 py-0.5 text-[10px] bg-[var(--color-bg-tertiary)] rounded border border-[var(--color-border-primary)] font-mono">Q</kbd>
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
            data-vim-key="p"
            onClick={onOpenProjectSettings}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] transition-colors"
            title="Project settings"
          >
            <FileJson size={12} />
            <kbd className="px-1 py-0.5 text-[10px] bg-[var(--color-bg-tertiary)] rounded border border-[var(--color-border-primary)] font-mono">P</kbd>
          </button>
        )}

        {/* Settings button */}
        <button
          data-testid="settings-button"
          data-vim-key=","
          onClick={onOpenSettings}
          className="flex items-center gap-1 px-2 py-0.5 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] transition-colors"
        >
          <Settings size={12} />
          <kbd className="px-1 py-0.5 text-[10px] bg-[var(--color-bg-tertiary)] rounded border border-[var(--color-border-primary)] font-mono">,</kbd>
        </button>

        {/* Theme toggle */}
        <button
          data-testid="theme-toggle"
          data-vim-key="L"
          onClick={toggleTheme}
          className="flex items-center gap-1 px-2 py-0.5 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] transition-colors"
        >
          {theme === 'dark' ? (
            <Sun size={12} className="lucide-sun" />
          ) : (
            <Moon size={12} className="lucide-moon" />
          )}
          <kbd className="px-1 py-0.5 text-[10px] bg-[var(--color-bg-tertiary)] rounded border border-[var(--color-border-primary)] font-mono">L</kbd>
        </button>

        {/* Zone navigation shortcut hints (NORMAL mode only) */}
        {vim.mode === 'NORMAL' && (
          <span data-testid="zone-hints" className="flex items-center gap-1">
            {([
              { key: 'E', zone: 'sidebar' },
              { key: 'T', zone: 'tabs' },
              { key: 'C', zone: 'content' },
              { key: 'S', zone: 'status-bar' },
            ] as const).map(({ key, zone }) => {
              const isActive = vim.activeZone === zone;
              return (
                <kbd
                  key={key}
                  data-testid={`zone-hint-${key.toLowerCase()}`}
                  className={`inline-flex items-center justify-center w-4 h-4 text-[10px] font-mono rounded border ${
                    isActive
                      ? 'bg-[var(--color-accent-primary)]/20 border-[var(--color-accent-primary)] text-[var(--color-accent-primary)]'
                      : 'bg-[var(--color-bg-tertiary)] border-[var(--color-border-secondary)] text-[var(--color-text-muted)]'
                  }`}
                >
                  {key}
                </kbd>
              );
            })}
          </span>
        )}

        {/* Keyboard shortcuts hint */}
        <button
          data-testid="shortcuts-button"
          data-vim-key="?"
          onClick={onShowShortcuts}
          className="flex items-center gap-1 px-2 py-0.5 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] transition-colors"
        >
          <Keyboard size={12} />
          <kbd className="px-1 py-0.5 text-[10px] bg-[var(--color-bg-tertiary)] rounded border border-[var(--color-border-primary)] font-mono">?</kbd>
        </button>
      </div>
    </div>
  );
}
