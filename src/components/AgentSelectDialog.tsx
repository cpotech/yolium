import React, { useCallback, useRef, useEffect, useState } from 'react';
import type { AgentType } from '../types/agent';

export type { AgentType } from '../types/agent';

interface AgentSelectDialogProps {
  isOpen: boolean;
  folderPath: string;
  gitStatus: { isRepo: boolean; hasCommits: boolean } | null;
  onSelect: (agent: AgentType, gsdEnabled: boolean, worktreeEnabled: boolean, branchName: string | null) => void;
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
  const [selectedAgent, setSelectedAgent] = useState<AgentType>('claude');
  const [gsdEnabled, setGsdEnabled] = useState(false);
  const [worktreeEnabled, setWorktreeEnabled] = useState(false);
  const [branchName, setBranchName] = useState('');
  const [isInitializing, setIsInitializing] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  const handleInitGit = useCallback(async () => {
    setIsInitializing(true);
    setInitError(null);
    try {
      const result = await window.electronAPI.initGitRepo(folderPath);
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

  const handleConfirm = useCallback(() => {
    const gsd = selectedAgent === 'claude' ? gsdEnabled : false;
    onSelect(selectedAgent, gsd, worktreeEnabled, branchName || null);
  }, [selectedAgent, gsdEnabled, worktreeEnabled, branchName, onSelect]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onBack();
      } else if (e.key === 'Enter') {
        handleConfirm();
      } else if (e.key === '1') {
        setSelectedAgent('claude');
      } else if (e.key === '2') {
        setSelectedAgent('opencode');
      } else if (e.key === '3') {
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

  // Extract folder name from path
  const folderName = folderPath.split('/').pop() || folderPath;

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      <div data-testid="agent-dialog" className="bg-gray-800 rounded-lg shadow-xl border border-gray-700 p-6 max-w-md w-full mx-4">
        <h2 className="text-lg font-semibold text-white mb-2">Select Agent</h2>
        <p className="text-sm text-gray-400 mb-4">
          Choose which coding agent to run in{' '}
          <span className="text-gray-200 font-mono">{folderName}</span>
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
                  : 'bg-gray-700 hover:bg-gray-600'
              } focus:outline-none focus:ring-2 focus:ring-blue-500`}
            >
              <span className="text-gray-500 text-sm font-mono">1</span>
              <div className="flex-1">
                <div className="text-white font-medium">Claude Code</div>
                <div className="text-gray-400 text-sm">Anthropic's Claude CLI agent</div>
              </div>
            </button>
            {selectedAgent === 'claude' && (
              <label data-testid="gsd-toggle" className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer mt-1 ml-7">
                <input
                  type="checkbox"
                  checked={gsdEnabled}
                  onChange={e => setGsdEnabled(e.target.checked)}
                  className="rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-800"
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
                : 'bg-gray-700 hover:bg-gray-600'
            } focus:outline-none focus:ring-2 focus:ring-blue-500`}
          >
            <span className="text-gray-500 text-sm font-mono">2</span>
            <div className="flex-1">
              <div className="text-white font-medium">OpenCode</div>
              <div className="text-gray-400 text-sm">Open-source coding agent</div>
            </div>
          </button>

          <button
            data-testid="agent-option-shell"
            onClick={() => setSelectedAgent('shell')}
            className={`w-full flex items-center gap-3 p-3 rounded-md transition-colors text-left group ${
              selectedAgent === 'shell'
                ? 'bg-blue-600 ring-2 ring-blue-500'
                : 'bg-gray-700 hover:bg-gray-600'
            } focus:outline-none focus:ring-2 focus:ring-blue-500`}
          >
            <span className="text-gray-500 text-sm font-mono">3</span>
            <div className="flex-1">
              <div className="text-white font-medium">Shell</div>
              <div className="text-gray-400 text-sm">Interactive zsh terminal</div>
            </div>
          </button>
        </div>

        {/* Options section */}
        <div className="border-t border-gray-700 pt-4 mt-4">
          <div className="text-xs text-gray-500 mb-2">Options</div>
          {(() => {
            const isDisabled = gitStatus === null || !gitStatus.isRepo || !gitStatus.hasCommits;
            const tooltipText = gitStatus === null
              ? undefined
              : !gitStatus.isRepo
              ? 'Folder is not a git repository'
              : !gitStatus.hasCommits
              ? 'Repository has no commits yet'
              : undefined;

            return (
              <label
                data-testid="worktree-toggle"
                className={`flex items-center gap-2 text-sm cursor-pointer ${
                  isDisabled ? 'text-gray-600 cursor-not-allowed' : 'text-gray-400'
                }`}
                title={tooltipText}
              >
                <input
                  type="checkbox"
                  checked={worktreeEnabled}
                  onChange={e => setWorktreeEnabled(e.target.checked)}
                  disabled={isDisabled}
                  className="rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-800 disabled:opacity-50"
                />
                Use git worktree
                {gitStatus === null && <span className="text-xs text-gray-600">(checking...)</span>}
                {gitStatus && gitStatus.isRepo && !gitStatus.hasCommits && <span className="text-xs text-gray-600">(no commits)</span>}
              </label>
            );
          })()}
          {worktreeEnabled && (
            <input
              data-testid="branch-name-input"
              type="text"
              placeholder={`yolium-${Date.now()}`}
              value={branchName}
              onChange={e => setBranchName(e.target.value)}
              className="mt-2 ml-6 w-[calc(100%-1.5rem)] px-2 py-1 text-sm rounded bg-gray-700 border border-gray-600 text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
          )}
          {gitStatus && !gitStatus.isRepo && (
            <div className="mt-3">
              <button
                data-testid="init-git-button"
                onClick={handleInitGit}
                disabled={isInitializing}
                className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors disabled:opacity-50"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                {isInitializing ? 'Initializing...' : 'Initialize git repository'}
                {!isInitializing && <kbd className="text-xs bg-gray-700 px-1 py-0.5 rounded text-gray-500">i</kbd>}
              </button>
              {initError && <div className="mt-1 text-xs text-red-400">{initError}</div>}
            </div>
          )}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            data-testid="agent-back"
            onClick={onBack}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors flex items-center gap-2"
          >
            Back
            <kbd className="text-xs bg-gray-700 px-1.5 py-0.5 rounded text-gray-500">Esc</kbd>
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
