import React from 'react'
import { AlertTriangle, ArrowDownToLine, ArrowLeftRight, Check, ExternalLink, GitMerge, GitPullRequest } from 'lucide-react'
import type { KanbanItem } from '@shared/types/kanban'
import type { ConflictCheckResult, RebaseResultState } from './useItemDetailPrWorkflow'

interface ItemDetailMergeSectionProps {
  item: KanbanItem
  prUrl: string | null
  conflictCheck: ConflictCheckResult | null
  rebaseResult: RebaseResultState | null
  isMerging: boolean
  isCheckingConflicts: boolean
  isRebasing: boolean
  isApprovingPr: boolean
  isMergingPr: boolean
  onCompareChanges: () => void
  onOpenPr: () => void
  onApprovePr: () => void
  onMergePr: () => void
  onCheckConflicts: () => void
  onRebase: () => void
  onMerge: () => void
}

export function ItemDetailMergeSection({
  item,
  prUrl,
  conflictCheck,
  rebaseResult,
  isMerging,
  isCheckingConflicts,
  isRebasing,
  isApprovingPr,
  isMergingPr,
  onCompareChanges,
  onOpenPr,
  onApprovePr,
  onMergePr,
  onCheckConflicts,
  onRebase,
  onMerge,
}: ItemDetailMergeSectionProps): React.ReactElement | null {
  if (!item.mergeStatus || !item.branch) {
    return null
  }

  return (
    <div>
      <label className="block text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)] mb-1">
        Merge Status
      </label>
      <button
        data-testid="compare-changes-button"
        onClick={onCompareChanges}
        disabled={isMerging}
        className="w-full px-3 py-1.5 text-xs flex items-center justify-center gap-1 text-blue-400 rounded-md hover:bg-blue-600/10 border border-blue-600/30 transition-colors mb-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <ArrowLeftRight size={12} />
        Compare Changes
      </button>

      {item.mergeStatus === 'merged' && (
        <div data-testid="merge-status-merged">
          <div className="flex items-center gap-1 text-sm text-green-400">
            <Check size={14} />
            <span>Merged</span>
          </div>
          {prUrl && (
            <div className="space-y-2 mt-1.5">
              <button
                data-testid="pr-link"
                onClick={onOpenPr}
                className="w-full px-3 py-1.5 text-xs flex items-center justify-center gap-1 text-blue-400 rounded-md hover:bg-blue-600/10 border border-blue-600/30 transition-colors"
              >
                <GitPullRequest size={12} />
                <span>View PR</span>
                <ExternalLink size={10} />
              </button>
              <button
                data-testid="approve-pr-button"
                onClick={onApprovePr}
                disabled={isApprovingPr || isMergingPr}
                className="w-full px-3 py-1.5 text-xs flex items-center justify-center gap-1 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Check size={12} />
                {isApprovingPr ? 'Approving...' : 'Approve PR'}
              </button>
              <button
                data-testid="merge-pr-button"
                onClick={onMergePr}
                disabled={isMergingPr || isApprovingPr}
                className="w-full px-3 py-1.5 text-xs flex items-center justify-center gap-1 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <GitMerge size={12} />
                {isMergingPr ? 'Merging...' : 'Merge PR'}
              </button>
            </div>
          )}
        </div>
      )}

      {item.mergeStatus === 'conflict' && (
        <div data-testid="merge-status-conflict">
          <div className="flex items-center gap-1 text-sm text-red-400 mb-2">
            <AlertTriangle size={14} />
            <span>Merge Conflict</span>
          </div>
          <button
            data-testid="retry-merge-button"
            onClick={onMerge}
            disabled={isMerging}
            className="w-full px-3 py-1.5 text-xs bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isMerging ? 'Retrying...' : 'Retry Squash Merge & PR'}
          </button>
        </div>
      )}

      {item.mergeStatus === 'unmerged' && (
        <div data-testid="merge-status-unmerged">
          {item.worktreePath && (
            <>
              <button
                data-testid="pull-latest-button"
                onClick={onRebase}
                disabled={isRebasing || isMerging}
                className="w-full px-3 py-1.5 text-xs flex items-center justify-center gap-1 text-purple-400 rounded-md hover:bg-purple-600/10 border border-purple-600/30 transition-colors mb-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ArrowDownToLine size={12} />
                {isRebasing ? 'Pulling...' : 'Pull Latest (Rebase)'}
              </button>
              {rebaseResult && (
                <div data-testid="rebase-result" className="mb-2">
                  {rebaseResult.success ? (
                    <div className="flex items-center gap-1 text-xs text-green-400">
                      <Check size={12} />
                      <span>Rebased onto latest default</span>
                    </div>
                  ) : (
                    <div className="text-xs text-red-400">
                      <div className="flex items-center gap-1 mb-1">
                        <AlertTriangle size={12} />
                        <span>{rebaseResult.conflict ? 'Rebase conflicts — aborted' : rebaseResult.error}</span>
                      </div>
                      {rebaseResult.conflictingFiles && rebaseResult.conflictingFiles.length > 0 && (
                        <ul className="ml-4 space-y-0.5">
                          {rebaseResult.conflictingFiles.map((file, index) => (
                            <li key={index} className="font-mono text-[10px] truncate">
                              {file}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          <button
            data-testid="check-conflicts-button"
            onClick={onCheckConflicts}
            disabled={isCheckingConflicts || isMerging}
            className="w-full px-3 py-1.5 text-xs flex items-center justify-center gap-1 text-[var(--color-text-secondary)] rounded-md hover:bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors mb-2"
          >
            <AlertTriangle size={12} />
            {isCheckingConflicts ? 'Checking...' : 'Check Conflicts'}
          </button>

          {conflictCheck && (
            <div data-testid="conflict-check-result" className="mb-2">
              {conflictCheck.clean ? (
                <div className="flex items-center gap-1 text-xs text-green-400">
                  <Check size={12} />
                  <span>Clean — no conflicts</span>
                </div>
              ) : (
                <div className="text-xs text-red-400">
                  <div className="flex items-center gap-1 mb-1">
                    <AlertTriangle size={12} />
                    <span>Conflicts detected</span>
                  </div>
                  {conflictCheck.conflictingFiles.length > 0 && (
                    <ul className="ml-4 space-y-0.5">
                      {conflictCheck.conflictingFiles.map((file, index) => (
                        <li key={index} className="font-mono text-[10px] truncate">
                          {file}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}

          <button
            data-testid="merge-button"
            onClick={onMerge}
            disabled={isMerging || (item.agentStatus !== 'completed' && item.column !== 'done' && item.column !== 'verify')}
            className="w-full px-3 py-1.5 text-xs flex items-center justify-center gap-1 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <GitMerge size={12} />
            {isMerging ? 'Squashing & Merging...' : 'Squash, Merge & Push PR'}
          </button>
          {item.agentStatus !== 'completed' && item.column !== 'done' && item.column !== 'verify' && (
            <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
              Available when agent completes or item is in Done
            </p>
          )}
        </div>
      )}
    </div>
  )
}
