import React from 'react'
import { AlertTriangle, ArrowDownToLine, ArrowLeftRight, Check, ExternalLink, GitMerge, GitPullRequest, Wrench } from 'lucide-react'
import type { KanbanItem } from '@shared/types/kanban'
import type { ConflictCheckResult, RebaseResultState } from './useItemDetailPrWorkflow'

interface ItemDetailMergeBarProps {
  showKbdHints: boolean
  item: KanbanItem
  prUrl: string | null
  conflictCheck: ConflictCheckResult | null
  rebaseResult: RebaseResultState | null
  isMerging: boolean
  isMergingLocally: boolean
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
  onMergeLocally: () => void
  onMerge: () => void
  onFixConflicts: () => void
  isFixingConflicts: boolean
}

const buttonBase = 'px-2.5 py-1 text-xs flex items-center gap-1 whitespace-nowrap rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed'

export function ItemDetailMergeBar({
  showKbdHints,
  item,
  prUrl,
  conflictCheck,
  rebaseResult,
  isMerging,
  isMergingLocally,
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
  onMergeLocally,
  onMerge,
  onFixConflicts,
  isFixingConflicts,
}: ItemDetailMergeBarProps): React.ReactElement | null {
  if (!item.mergeStatus || !item.branch) {
    return null
  }

  const canMergeNow = item.agentStatus === 'completed' || item.column === 'done' || item.column === 'verify'

  return (
    <div className="border-b border-[var(--color-border-primary)] bg-[var(--color-bg-tertiary)]">
      <div
        data-testid="merge-bar"
        className="flex items-center gap-2 px-4 py-2 overflow-x-auto"
      >
        {/* Status pill (leftmost) */}
        {item.mergeStatus === 'merged' && (
          <span
            data-testid="merge-status-merged"
            className="flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-[var(--color-status-success)]/10 text-[var(--color-status-success)] border border-[var(--color-status-success)]/30"
          >
            <Check size={12} />
            Merged
          </span>
        )}
        {item.mergeStatus === 'conflict' && (
          <span
            data-testid="merge-status-conflict"
            className="flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-[var(--color-status-error)]/10 text-[var(--color-status-error)] border border-[var(--color-status-error)]/30"
          >
            <AlertTriangle size={12} />
            Merge Conflict
          </span>
        )}
        {item.mergeStatus === 'unmerged' && (
          <span
            data-testid="merge-status-unmerged"
            className="flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-[var(--color-bg-primary)] text-[var(--color-text-secondary)] border border-[var(--color-border-primary)]"
          >
            Unmerged
          </span>
        )}

        {/* Compare Changes — always shown when bar is visible */}
        <button
          data-testid="compare-changes-button"
          onClick={onCompareChanges}
          disabled={isMerging}
          className={`${buttonBase} text-[var(--color-status-info)] hover:bg-[var(--color-status-info)]/10 border border-[var(--color-status-info)]/30`}
        >
          <ArrowLeftRight size={12} />
          Compare Changes
          {showKbdHints && <kbd className="px-1 py-0.5 text-[10px] bg-[var(--color-status-info)]/10 rounded border border-[var(--color-status-info)]/30 font-mono ml-1">f</kbd>}
        </button>

        {/* Merged state actions */}
        {item.mergeStatus === 'merged' && prUrl && (
          <>
            <button
              data-testid="pr-link"
              onClick={onOpenPr}
              className={`${buttonBase} text-[var(--color-status-info)] hover:bg-[var(--color-status-info)]/10 border border-[var(--color-status-info)]/30`}
            >
              <GitPullRequest size={12} />
              <span>View PR</span>
              <ExternalLink size={10} />
              {showKbdHints && <kbd className="px-1 py-0.5 text-[10px] bg-[var(--color-status-info)]/10 rounded border border-[var(--color-status-info)]/30 font-mono ml-1">o</kbd>}
            </button>
            <button
              data-testid="approve-pr-button"
              onClick={onApprovePr}
              disabled={isApprovingPr || isMergingPr}
              className={`${buttonBase} bg-[var(--color-status-success)] text-white hover:brightness-110`}
            >
              <Check size={12} />
              {isApprovingPr ? 'Approving...' : 'Approve PR'}
              {showKbdHints && <kbd className="px-1 py-0.5 text-[10px] bg-white/20 rounded border border-white/30 font-mono ml-1">a</kbd>}
            </button>
            <button
              data-testid="merge-pr-button"
              onClick={onMergePr}
              disabled={isMergingPr || isApprovingPr}
              className={`${buttonBase} bg-[var(--color-special-worktree)] text-white hover:brightness-110`}
            >
              <GitMerge size={12} />
              {isMergingPr ? 'Merging...' : 'Merge PR'}
              {showKbdHints && <kbd className="px-1 py-0.5 text-[10px] bg-white/20 rounded border border-white/30 font-mono ml-1">w</kbd>}
            </button>
          </>
        )}

        {/* Conflict state actions */}
        {item.mergeStatus === 'conflict' && (
          <>
            {item.worktreePath && (
              <button
                data-testid="conflict-rebase-button"
                onClick={onRebase}
                disabled={isRebasing || isMerging}
                className={`${buttonBase} text-[var(--color-special-worktree)] hover:bg-[var(--color-special-worktree)]/10 border border-[var(--color-special-worktree)]/30`}
              >
                <ArrowDownToLine size={12} />
                {isRebasing ? 'Pulling...' : 'Pull Latest (Rebase)'}
                {showKbdHints && <kbd className="px-1 py-0.5 text-[10px] bg-[var(--color-special-worktree)]/10 rounded border border-[var(--color-special-worktree)]/30 font-mono ml-1">r</kbd>}
              </button>
            )}
            <button
              data-testid="fix-conflicts-button"
              onClick={onFixConflicts}
              disabled={isFixingConflicts}
              className={`${buttonBase} text-[var(--color-status-info)] hover:bg-[var(--color-status-info)]/10 border border-[var(--color-status-info)]/30`}
            >
              <Wrench size={12} />
              {isFixingConflicts ? 'Fixing...' : 'Fix Conflicts (Run Agent)'}
              {showKbdHints && <kbd className="px-1 py-0.5 text-[10px] bg-[var(--color-status-info)]/10 rounded border border-[var(--color-status-info)]/30 font-mono ml-1">k</kbd>}
            </button>
            <button
              data-testid="retry-merge-locally-button"
              onClick={onMergeLocally}
              disabled={isMergingLocally || isMerging}
              className={`${buttonBase} bg-[var(--color-status-error)] text-white hover:brightness-110`}
            >
              {isMergingLocally ? 'Retrying...' : 'Retry Merge Locally'}
              {showKbdHints && <kbd className="px-1 py-0.5 text-[10px] bg-white/20 rounded border border-white/30 font-mono ml-1">m</kbd>}
            </button>
            <button
              data-testid="retry-merge-button"
              onClick={onMerge}
              disabled={isMerging || isMergingLocally}
              className={`${buttonBase} text-[var(--color-status-error)] hover:bg-[var(--color-status-error)]/10 border border-[var(--color-status-error)]/30`}
            >
              {isMerging ? 'Retrying...' : 'Retry Squash Merge & Push PR'}
              {showKbdHints && <kbd className="px-1 py-0.5 text-[10px] bg-[var(--color-status-error)]/10 rounded border border-[var(--color-status-error)]/30 font-mono ml-1">M</kbd>}
            </button>
          </>
        )}

        {/* Unmerged state actions */}
        {item.mergeStatus === 'unmerged' && (
          <>
            {item.worktreePath && (
              <button
                data-testid="pull-latest-button"
                onClick={onRebase}
                disabled={isRebasing || isMerging}
                className={`${buttonBase} text-[var(--color-special-worktree)] hover:bg-[var(--color-special-worktree)]/10 border border-[var(--color-special-worktree)]/30`}
              >
                <ArrowDownToLine size={12} />
                {isRebasing ? 'Pulling...' : 'Pull Latest (Rebase)'}
                {showKbdHints && <kbd className="px-1 py-0.5 text-[10px] bg-[var(--color-special-worktree)]/10 rounded border border-[var(--color-special-worktree)]/30 font-mono ml-1">r</kbd>}
              </button>
            )}
            <button
              data-testid="check-conflicts-button"
              onClick={onCheckConflicts}
              disabled={isCheckingConflicts || isMerging}
              className={`${buttonBase} text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)]`}
            >
              <AlertTriangle size={12} />
              {isCheckingConflicts ? 'Checking...' : 'Check Conflicts'}
              {showKbdHints && <kbd className="px-1 py-0.5 text-[10px] bg-[var(--color-bg-primary)] rounded border border-[var(--color-border-primary)] font-mono ml-1">K</kbd>}
            </button>
            <button
              data-testid="merge-locally-button"
              onClick={onMergeLocally}
              disabled={isMergingLocally || isMerging || !canMergeNow}
              className={`${buttonBase} bg-[var(--color-status-success)] text-white hover:brightness-110`}
            >
              <GitMerge size={12} />
              {isMergingLocally ? 'Merging Locally...' : 'Merge Locally'}
              {showKbdHints && <kbd className="px-1 py-0.5 text-[10px] bg-white/20 rounded border border-white/30 font-mono ml-1">m</kbd>}
            </button>
            <button
              data-testid="merge-button"
              onClick={onMerge}
              disabled={isMerging || isMergingLocally || !canMergeNow}
              className={`${buttonBase} text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)]`}
            >
              <GitPullRequest size={12} />
              {isMerging ? 'Squashing & Merging...' : 'Squash, Merge & Push PR'}
              {showKbdHints && <kbd className="px-1 py-0.5 text-[10px] bg-[var(--color-bg-primary)] rounded border border-[var(--color-border-primary)] font-mono ml-1">M</kbd>}
            </button>
          </>
        )}
      </div>

      {/* Secondary detail row: conflicting files (conflict state) */}
      {item.mergeStatus === 'conflict' && conflictCheck && !conflictCheck.clean && conflictCheck.conflictingFiles.length > 0 && (
        <div className="px-4 pb-2 text-xs text-[var(--color-status-error)]">
          <span className="mr-2">Conflicting files:</span>
          <ul className="inline-flex flex-wrap gap-x-3 gap-y-0.5">
            {conflictCheck.conflictingFiles.map((file, index) => (
              <li key={index} className="font-mono text-[10px]">
                {file}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Secondary detail row: rebase result */}
      {item.mergeStatus === 'unmerged' && rebaseResult && (
        <div data-testid="rebase-result" className="px-4 pb-2 text-xs">
          {rebaseResult.success ? (
            <div className="flex items-center gap-1 text-[var(--color-status-success)]">
              <Check size={12} />
              <span>Rebased onto latest default</span>
            </div>
          ) : (
            <div className="text-[var(--color-status-error)]">
              <div className="flex items-center gap-1">
                <AlertTriangle size={12} />
                <span>{rebaseResult.conflict ? 'Rebase conflicts — aborted' : rebaseResult.error}</span>
              </div>
              {rebaseResult.conflictingFiles && rebaseResult.conflictingFiles.length > 0 && (
                <div className="ml-4 font-mono text-[10px]">{rebaseResult.conflictingFiles.join(', ')}</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Secondary detail row: conflict check result (unmerged state) */}
      {item.mergeStatus === 'unmerged' && conflictCheck && (
        <div data-testid="conflict-check-result" className="px-4 pb-2 text-xs">
          {conflictCheck.clean ? (
            <div className="flex items-center gap-1 text-[var(--color-status-success)]">
              <Check size={12} />
              <span>Clean — no conflicts</span>
            </div>
          ) : (
            <div className="text-[var(--color-status-error)]">
              <div className="flex items-center gap-1">
                <AlertTriangle size={12} />
                <span>Conflicts detected</span>
              </div>
              {conflictCheck.conflictingFiles.length > 0 && (
                <div className="ml-4 font-mono text-[10px]">{conflictCheck.conflictingFiles.join(', ')}</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
