import React, { useCallback, useRef, useEffect, useState } from 'react';
import type { AgentProvider } from '@shared/types/agent';
import type { ProjectType } from '@shared/types/onboarding';
import { getFolderName } from '@renderer/lib/path-utils';

export type { AgentProvider } from '@shared/types/agent';

interface AgentSelectDialogProps {
  isOpen: boolean;
  folderPath: string;
  gitStatus: { isRepo: boolean; hasCommits: boolean } | null;
  onSelect: (agent: AgentProvider, gsdEnabled: boolean, worktreeEnabled: boolean, branchName: string | null) => void;
  onBack: () => void;
  onCancel: () => void;
  onGitInit?: () => void;
}

export function AgentSelectDialog({
  isOpen,
  folderPath,
  gitStatus,
  onSelect,
  onBack,
  onCancel,
  onGitInit,
}: AgentSelectDialogProps): React.ReactElement | null {
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstButtonRef = useRef<HTMLButtonElement>(null);
  const [selectedAgent, setSelectedAgent] = useState<AgentProvider>('claude');
  const [gsdEnabled, setGsdEnabled] = useState(false);
  const [worktreeEnabled, setWorktreeEnabled] = useState(false);
  const [branchName, setBranchName] = useState('');
  const [branchPlaceholder] = useState(() => `yolium-${Date.now()}`);
  const [branchError, setBranchError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  const handleInitGit = useCallback(async () => {
    setIsInitializing(true);
    setInitError(null);
    try {
      let projectTypes: ProjectType[] = [];
      try {
        projectTypes = await window.electronAPI.onboarding.detectProject(folderPath);
      } catch {
        // Best effort: git init still works without detected project metadata.
      }

      const result = await window.electronAPI.git.init(folderPath, projectTypes);
      if (result.success) {
        onGitInit?.();
      } else {
        setInitError(result.error || 'Failed to initialize git');
      }
    } catch (err) {
      setInitError(err instanceof Error ? err.message : 'Failed to initialize git');
    } finally {
      setIsInitializing(false);
    }
  }, [folderPath, onGitInit]);

  // Auto-focus dialog when opened for keyboard event capture
  useEffect(() => {
    if (isOpen) {
      // Focus dialog wrapper immediately for keyboard events (e.g. Escape)
      dialogRef.current?.focus();
      // Then move focus to first button for better UX
      setTimeout(() => firstButtonRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const validateBranchName = useCallback((value: string): string | null => {
    if (!value.trim()) return null;
    if (value === '@') return 'Branch name cannot be "@"';
    if (/\s/.test(value)) return 'Branch name cannot contain spaces';
    if (value.startsWith('-')) return 'Branch name cannot start with a hyphen';
    if (value.startsWith('/')) return 'Branch name cannot start with a slash';
    if (value.endsWith('/')) return 'Branch name cannot end with a slash';
    if (value.endsWith('.lock')) return 'Branch name cannot end with .lock';
    if (value.includes('..')) return 'Branch name cannot contain consecutive dots';
    if (value.includes('@{')) return 'Branch name cannot contain "@{"';
    if (value.includes('//')) return 'Branch name cannot contain consecutive slashes';
    if (/[\u0000-\u001f\u007f]/.test(value)) return 'Branch name contains control characters';
    if (/[~^:?*\\[\\]\\\\]/.test(value)) {
      return 'Branch name contains invalid characters';
    }
    if (!/^[a-zA-Z0-9._/-]+$/.test(value)) return 'Branch name contains invalid characters';
    return null;
  }, []);

  const handleConfirm = useCallback(async () => {
    if (worktreeEnabled) {
      const error = validateBranchName(branchName);
      setBranchError(error);
      if (error) return;
      if (branchName.trim()) {
        const result = await window.electronAPI.git.validateBranch(branchName);
        if (!result.valid) {
          setBranchError(result.error || 'Invalid branch name');
          return;
        }
      }
    }
    const gsd = selectedAgent === 'claude' ? gsdEnabled : false;
    onSelect(selectedAgent, gsd, worktreeEnabled, branchName || null);
  }, [selectedAgent, gsdEnabled, worktreeEnabled, branchName, onSelect, validateBranchName]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onBack();
      } else if (e.key === 'Enter') {
        void handleConfirm();
      } else if (e.key === '1') {
        setSelectedAgent('claude');
      } else if (e.key === '2') {
        setSelectedAgent('opencode');
      } else if (e.key === '3') {
        setSelectedAgent('codex');
      } else if (e.key === '4') {
        setSelectedAgent('shell');
      } else if (e.key === 'i' || e.key === 'I') {
        // Init git if not a repo
        if (gitStatus && !gitStatus.isRepo && !isInitializing) {
          handleInitGit();
        }
      }
    },
    [onBack, handleConfirm, gitStatus, isInitializing, handleInitGit]
  );

  if (!isOpen) return null;

  const folderName = getFolderName(folderPath);

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      <div data-testid="agent-dialog" className="bg-[var(--color-bg-secondary)] rounded-lg shadow-xl border border-[var(--color-border-primary)] p-6 max-w-md w-full mx-4">
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">Select Agent</h2>
        <p className="text-sm text-[var(--color-text-secondary)] mb-4">
          Choose which coding agent to run in{' '}
          <span className="text-[var(--color-text-primary)] font-mono">{folderName}</span>
        </p>

        <div className="space-y-2">
          <div>
            <button
              ref={firstButtonRef}
              data-testid="agent-option-claude"
              onClick={() => setSelectedAgent('claude')}
              className={`w-full flex items-center gap-3 p-3 rounded-md transition-colors text-left group ${
                selectedAgent === 'claude'
                  ? 'bg-blue-600 ring-2 ring-blue-500'
                  : 'bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-bg-hover)]'
              } focus:outline-none focus:ring-2 focus:ring-blue-500`}
            >
              <span className="text-[var(--color-text-muted)] text-sm font-mono">1</span>
              <div className="flex-1">
                <div className="text-[var(--color-text-primary)] font-medium">Claude Code</div>
                <div className="text-[var(--color-text-secondary)] text-sm">Anthropic's Claude CLI agent</div>
              </div>
            </button>
            {selectedAgent === 'claude' && (
              <label data-testid="gsd-toggle" className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)] cursor-pointer mt-1 ml-7">
                <input
                  type="checkbox"
                  checked={gsdEnabled}
                  onChange={e => setGsdEnabled(e.target.checked)}
                  className="rounded border-[var(--color-border-secondary)] bg-[var(--color-bg-tertiary)] text-blue-500 focus:ring-blue-500 focus:ring-offset-[var(--color-bg-secondary)]"
                />
                Enable GSD plugin
              </label>
            )}
          </div>

          <button
            data-testid="agent-option-opencode"
            onClick={() => setSelectedAgent('opencode')}
            className={`w-full flex items-center gap-3 p-3 rounded-md transition-colors text-left group ${
              selectedAgent === 'opencode'
                ? 'bg-blue-600 ring-2 ring-blue-500'
                : 'bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-bg-hover)]'
            } focus:outline-none focus:ring-2 focus:ring-blue-500`}
          >
            <span className="text-[var(--color-text-muted)] text-sm font-mono">2</span>
            <div className="flex-1">
              <div className="text-white font-medium">OpenCode</div>
              <div className="text-[var(--color-text-secondary)] text-sm">Open-source coding agent</div>
            </div>
          </button>

          <button
            data-testid="agent-option-codex"
            onClick={() => setSelectedAgent('codex')}
            className={`w-full flex items-center gap-3 p-3 rounded-md transition-colors text-left group ${
              selectedAgent === 'codex'
                ? 'bg-blue-600 ring-2 ring-blue-500'
                : 'bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-bg-hover)]'
            } focus:outline-none focus:ring-2 focus:ring-blue-500`}
          >
            <span className="text-[var(--color-text-muted)] text-sm font-mono">3</span>
            <div className="flex-1">
              <div className="text-white font-medium">Codex</div>
              <div className="text-[var(--color-text-secondary)] text-sm">OpenAI's Codex CLI agent</div>
            </div>
          </button>

          <button
            data-testid="agent-option-shell"
            onClick={() => setSelectedAgent('shell')}
            className={`w-full flex items-center gap-3 p-3 rounded-md transition-colors text-left group ${
              selectedAgent === 'shell'
                ? 'bg-blue-600 ring-2 ring-blue-500'
                : 'bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-bg-hover)]'
            } focus:outline-none focus:ring-2 focus:ring-blue-500`}
          >
            <span className="text-[var(--color-text-muted)] text-sm font-mono">4</span>
            <div className="flex-1">
              <div className="text-white font-medium">Shell</div>
              <div className="text-[var(--color-text-secondary)] text-sm">Interactive zsh terminal</div>
            </div>
          </button>
        </div>

        {/* Options section */}
        <div className="border-t border-[var(--color-border-primary)] pt-4 mt-4">
          <div className="text-xs text-[var(--color-text-muted)] mb-2">Options</div>
          {(() => {
            const isDisabled = gitStatus === null || !gitStatus.isRepo || !gitStatus.hasCommits;

            return (
              <label
                data-testid="worktree-toggle"
                className={`flex items-center gap-2 text-sm cursor-pointer ${
                  isDisabled ? 'text-[var(--color-text-disabled)] cursor-not-allowed' : 'text-[var(--color-text-secondary)]'
                }`}
              >
                <input
                  type="checkbox"
                  checked={worktreeEnabled}
                  onChange={e => setWorktreeEnabled(e.target.checked)}
                  disabled={isDisabled}
                  className="rounded border-[var(--color-border-secondary)] bg-[var(--color-bg-tertiary)] text-blue-500 focus:ring-blue-500 focus:ring-offset-[var(--color-bg-secondary)] disabled:opacity-50"
                />
                Use git worktree
                {gitStatus === null && <span className="text-xs text-[var(--color-text-disabled)]">(checking...)</span>}
                {gitStatus && gitStatus.isRepo && !gitStatus.hasCommits && <span className="text-xs text-[var(--color-text-disabled)]">(no commits)</span>}
              </label>
            );
          })()}
          {worktreeEnabled && (
            <>
              <input
                data-testid="branch-name-input"
                type="text"
                placeholder={branchPlaceholder}
                value={branchName}
                onChange={e => {
                  const nextValue = e.target.value;
                  setBranchName(nextValue);
                  setBranchError(validateBranchName(nextValue));
                }}
                spellCheck={false}
                className="mt-2 ml-6 w-[calc(100%-1.5rem)] px-2 py-1 text-sm rounded bg-[var(--color-bg-tertiary)] border border-[var(--color-border-secondary)] text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-blue-500"
              />
              <div data-testid="worktree-branch-helper" className="mt-1 ml-6 text-xs text-[var(--color-text-muted)]">
                Creates a new branch for this session.
              </div>
              {branchError && (
                <div data-testid="worktree-branch-error" className="mt-1 ml-6 text-xs text-red-400">
                  {branchError}
                </div>
              )}
            </>
          )}
          {gitStatus && !gitStatus.isRepo && (
            <div className="mt-3">
              <button
                data-testid="init-git-button"
                onClick={handleInitGit}
                disabled={isInitializing}
                className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors disabled:opacity-50"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                {isInitializing ? 'Initializing...' : 'Initialize git repository'}
                {!isInitializing && <kbd className="text-xs bg-[var(--color-bg-tertiary)] px-1 py-0.5 rounded text-[var(--color-text-muted)]">i</kbd>}
              </button>
              {initError && <div className="mt-1 text-xs text-red-400">{initError}</div>}
            </div>
          )}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            data-testid="agent-back"
            onClick={onBack}
            className="px-4 py-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors flex items-center gap-2"
          >
            Back
            <kbd className="text-xs bg-[var(--color-bg-tertiary)] px-1.5 py-0.5 rounded text-[var(--color-text-muted)]">Esc</kbd>
          </button>
          <button
            data-testid="agent-start"
            onClick={handleConfirm}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-500 transition-colors flex items-center gap-2"
          >
            Start
            <kbd className="text-xs bg-blue-700 px-1.5 py-0.5 rounded text-blue-300">↵</kbd>
          </button>
        </div>
      </div>
    </div>
  );
}
