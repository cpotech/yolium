import React, { useCallback, useRef, useEffect, useState } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import type { ReviewAgentProvider, CodeReviewStatus } from '@shared/types/agent';

interface CodeReviewDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onStartReview: (repoUrl: string, branch: string, agent: ReviewAgentProvider) => void;
  hasGitCredentials: boolean;
  reviewStatus: CodeReviewStatus | null;
  reviewError: string | null;
  reviewLog: string[];
}

export function CodeReviewDialog({
  isOpen,
  onClose,
  onStartReview,
  hasGitCredentials,
  reviewStatus,
  reviewError,
  reviewLog,
}: CodeReviewDialogProps): React.ReactElement | null {
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  const [repoUrl, setRepoUrl] = useState('');
  const [branch, setBranch] = useState('');
  const [branches, setBranches] = useState<string[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [branchError, setBranchError] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<ReviewAgentProvider>('claude');
  const [agentAuthWarning, setAgentAuthWarning] = useState<string | null>(null);

  // Auto-focus URL input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      // Restore cached repo URL or reset
      setRepoUrl(localStorage.getItem('yolium:lastReviewRepoUrl') ?? '');
      setBranch('');
      setBranches([]);
      setBranchError(null);
      setAgentAuthWarning(null);
    }
  }, [isOpen]);

  // Auto-scroll log to bottom when new lines arrive
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [reviewLog]);

  // Document-level Escape listener (works regardless of focus state)
  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Check agent auth warning when agent changes
  useEffect(() => {
    if (!isOpen) return;
    checkAgentAuth(selectedAgent);
  }, [selectedAgent, isOpen]);

  const checkAgentAuth = useCallback(async (agent: ReviewAgentProvider) => {
    try {
      const result = await window.electronAPI.codeReview.checkAuth(agent);
      if (!result.authenticated) {
        const agentName = agent === 'claude' ? 'Claude Code' : agent === 'opencode' ? 'OpenCode' : 'Codex CLI';
        const keyType = agent === 'codex' ? 'OpenAI' : 'Anthropic';
        setAgentAuthWarning(
          `${agentName} is not authenticated. Add your ${keyType} API Key in Settings.`
        );
      } else {
        setAgentAuthWarning(null);
      }
    } catch {
      // If the check fails, don't block - agent might still work
      setAgentAuthWarning(null);
    }
  }, []);

  const handleFetchBranches = useCallback(async () => {
    if (!repoUrl.trim()) return;
    setLoadingBranches(true);
    setBranchError(null);
    setBranches([]);
    setBranch('');

    try {
      const result = await window.electronAPI.codeReview.listBranches(repoUrl.trim());
      if (result.error) {
        setBranchError(result.error);
      } else {
        setBranches(result.branches);
        // Auto-select main/master if available
        if (result.branches.includes('main')) {
          setBranch('main');
        } else if (result.branches.includes('master')) {
          setBranch('master');
        } else if (result.branches.length > 0) {
          setBranch(result.branches[0]);
        }
      }
    } catch (err) {
      setBranchError(err instanceof Error ? err.message : 'Failed to fetch branches');
    } finally {
      setLoadingBranches(false);
    }
  }, [repoUrl]);

  const handleSubmit = useCallback(() => {
    if (!repoUrl.trim() || !branch.trim()) return;
    if (agentAuthWarning) return;
    localStorage.setItem('yolium:lastReviewRepoUrl', repoUrl.trim());
    onStartReview(repoUrl.trim(), branch.trim(), selectedAgent);
  }, [repoUrl, branch, selectedAgent, agentAuthWarning, onStartReview]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        // If we're in the URL field and have no branches yet, fetch branches
        if (document.activeElement === inputRef.current && branches.length === 0 && repoUrl.trim()) {
          e.preventDefault();
          handleFetchBranches();
        } else if (branch) {
          e.preventDefault();
          handleSubmit();
        }
      }
    },
    [handleFetchBranches, handleSubmit, branches.length, repoUrl, branch]
  );

  if (!isOpen) return null;

  const isReviewRunning = reviewStatus === 'starting' || reviewStatus === 'running';
  const canStart = repoUrl.trim() && branch.trim() && !isReviewRunning && !agentAuthWarning && hasGitCredentials;

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      <div data-testid="code-review-dialog" className="bg-gray-800 rounded-lg shadow-xl border border-gray-700 p-6 max-w-md w-full mx-4">
        <h2 className="text-lg font-semibold text-white mb-2">PR Code Review</h2>
        <p className="text-sm text-gray-400 mb-4">
          Run an AI agent to review a branch and post comments to the PR.
        </p>

        {/* Git credentials warning */}
        {!hasGitCredentials && (
          <div data-testid="review-credentials-warning" className="flex items-start gap-2 p-3 mb-4 rounded-md bg-yellow-900/30 border border-yellow-700/50">
            <AlertTriangle size={16} className="text-yellow-500 mt-0.5 shrink-0" />
            <div className="text-sm text-yellow-300">
              GitHub PAT not configured. Go to Git Settings and add a Personal Access Token to enable code review.
            </div>
          </div>
        )}

        {/* Agent auth warning */}
        {agentAuthWarning && (
          <div data-testid="review-agent-warning" className="flex items-start gap-2 p-3 mb-4 rounded-md bg-yellow-900/30 border border-yellow-700/50">
            <AlertTriangle size={16} className="text-yellow-500 mt-0.5 shrink-0" />
            <div className="text-sm text-yellow-300">
              {agentAuthWarning}
            </div>
          </div>
        )}

        {/* Repo URL */}
        <div className="mb-3">
          <label className="block text-sm text-gray-400 mb-1">Repository URL</label>
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              data-testid="review-repo-input"
              value={repoUrl}
              onChange={e => setRepoUrl(e.target.value)}
              placeholder="https://github.com/owner/repo"
              disabled={isReviewRunning || !hasGitCredentials}
              className="flex-1 px-3 py-2 text-sm rounded bg-gray-700 border border-gray-600 text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500 disabled:opacity-50"
            />
            <button
              data-testid="review-fetch-button"
              onClick={handleFetchBranches}
              disabled={!repoUrl.trim() || loadingBranches || isReviewRunning || !hasGitCredentials}
              className="px-3 py-2 text-sm bg-gray-600 text-white rounded hover:bg-gray-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loadingBranches ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                'Fetch'
              )}
            </button>
          </div>
          {branchError && (
            <div data-testid="review-branch-error" className="mt-1 text-xs text-red-400">{branchError}</div>
          )}
        </div>

        {/* Branch selection */}
        <div className="mb-3">
          <label className="block text-sm text-gray-400 mb-1">Branch</label>
          {branches.length > 0 ? (
            <select
              data-testid="review-branch-select"
              value={branch}
              onChange={e => setBranch(e.target.value)}
              disabled={isReviewRunning}
              className="w-full px-3 py-2 text-sm rounded bg-gray-700 border border-gray-600 text-gray-200 focus:outline-none focus:border-blue-500 disabled:opacity-50"
            >
              {branches.map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              data-testid="review-branch-input"
              value={branch}
              onChange={e => setBranch(e.target.value)}
              placeholder="Enter branch name or fetch branches above"
              disabled={isReviewRunning || !hasGitCredentials}
              className="w-full px-3 py-2 text-sm rounded bg-gray-700 border border-gray-600 text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500 disabled:opacity-50"
            />
          )}
        </div>

        {/* Agent selection */}
        <div className="mb-4">
          <label className="block text-sm text-gray-400 mb-1">Review Agent</label>
          <div className="flex gap-2">
            <button
              data-testid="review-agent-claude"
              onClick={() => setSelectedAgent('claude')}
              disabled={isReviewRunning}
              className={`flex-1 px-3 py-2 text-sm rounded transition-colors ${
                selectedAgent === 'claude'
                  ? 'bg-blue-600 text-white ring-2 ring-blue-500'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              } disabled:opacity-50`}
            >
              Claude Code
            </button>
            <button
              data-testid="review-agent-opencode"
              onClick={() => setSelectedAgent('opencode')}
              disabled={isReviewRunning}
              className={`flex-1 px-3 py-2 text-sm rounded transition-colors ${
                selectedAgent === 'opencode'
                  ? 'bg-blue-600 text-white ring-2 ring-blue-500'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              } disabled:opacity-50`}
            >
              OpenCode
            </button>
            <button
              data-testid="review-agent-codex"
              onClick={() => setSelectedAgent('codex')}
              disabled={isReviewRunning}
              className={`flex-1 px-3 py-2 text-sm rounded transition-colors ${
                selectedAgent === 'codex'
                  ? 'bg-blue-600 text-white ring-2 ring-blue-500'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              } disabled:opacity-50`}
            >
              Codex
            </button>
          </div>
        </div>

        {/* Review status */}
        {reviewStatus && (
          <div data-testid="review-status" className={`mb-4 p-3 rounded-md text-sm ${
            reviewStatus === 'completed' ? 'bg-green-900/30 border border-green-700/50 text-green-300' :
            reviewStatus === 'failed' ? 'bg-red-900/30 border border-red-700/50 text-red-300' :
            'bg-blue-900/30 border border-blue-700/50 text-blue-300'
          }`}>
            {reviewStatus === 'starting' && (
              <span className="flex items-center gap-2">
                <Loader2 size={14} className="animate-spin" />
                Starting code review container...
              </span>
            )}
            {reviewStatus === 'running' && (
              <span className="flex items-center gap-2">
                <Loader2 size={14} className="animate-spin" />
                Review in progress. The agent will post comments to the PR when finished.
              </span>
            )}
            {reviewStatus === 'completed' && 'Review completed. Comments have been posted to the PR.'}
            {reviewStatus === 'failed' && `Review failed: ${reviewError || 'Unknown error'}`}
          </div>
        )}

        {/* Container log output */}
        {reviewLog.length > 0 && (
          <div data-testid="review-log" className="mb-4 max-h-48 overflow-y-auto rounded-md bg-gray-950 border border-gray-700 p-2 font-mono text-xs text-gray-400">
            {reviewLog.map((line, i) => (
              <div key={i} className="whitespace-pre-wrap break-all">{line}</div>
            ))}
            <div ref={logEndRef} />
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <button
            data-testid="review-cancel-button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
          >
            {isReviewRunning ? 'Close' : 'Cancel'}
          </button>
          <button
            data-testid="start-review-button"
            onClick={handleSubmit}
            disabled={!canStart}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isReviewRunning ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Reviewing...
              </>
            ) : (
              'Start Review'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
