import React from 'react'
import { AlertTriangle, ArrowDownToLine, ArrowLeftRight, Check, ExternalLink, GitMerge, GitPullRequest, Wrench } from 'lucide-react'
import type { KanbanItem } from '@shared/types/kanban'
import type { ConflictCheckResult, RebaseResultState } from './useItemDetailPrWorkflow'

interface ItemDetailMergeSectionProps {
  showKbdHints: boolean
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
  onFixConflicts: () => void
  isFixingConflicts: boolean
}

export function ItemDetailMergeSection({
  showKbdHints,
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
  onFixConflicts,
  isFixingConflicts,
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
        className="w-full px-3 py-1.5 text-xs flex items-center justify-center gap-1 text-[var(--color-status-info)] rounded-md hover:bg-[var(--color-status-info)]/10 border border-[var(--color-status-info)]/30 transition-colors mb-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <ArrowLeftRight size={12} />
        Compare Changes
        {showKbdHints && <kbd className="px-1 py-0.5 text-[10px] bg-[var(--color-status-info)]/10 rounded border border-[var(--color-status-info)]/30 font-mono ml-1">f</kbd>}
      </button>

      {item.mergeStatus === 'merged' && (
        <div data-testid="merge-status-merged">
          <div className="flex items-center gap-1 text-sm text-[var(--color-status-success)]">
            <Check size={14} />
            <span>Merged</span>
          </div>
          {prUrl && (
            <div className="space-y-2 mt-1.5">
              <button
                data-testid="pr-link"
                onClick={onOpenPr}
                className="w-full px-3 py-1.5 text-xs flex items-center justify-center gap-1 text-[var(--color-status-info)] rounded-md hover:bg-[var(--color-status-info)]/10 border border-[var(--color-status-info)]/30 transition-colors"
              >
                <GitPullRequest size={12} />
                <span>View PR</span>
                <ExternalLink size={10} />
                {showKbdHints && <kbd className="px-1 py-0.5 text-[10px] bg-[var(--color-status-info)]/10 rounded border border-[var(--color-status-info)]/30 font-mono ml-auto">o</kbd>}
              </button>
              <button
                data-testid="approve-pr-button"
                onClick={onApprovePr}
                disabled={isApprovingPr || isMergingPr}
                className="w-full px-3 py-1.5 text-xs flex items-center justify-center gap-1 bg-[var(--color-status-success)] text-white rounded-md hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Check size={12} />
                {isApprovingPr ? 'Approving...' : 'Approve PR'}
                {showKbdHints && <kbd className="px-1 py-0.5 text-[10px] bg-white/20 rounded border border-white/30 font-mono ml-auto">a</kbd>}
              </button>
              <button
                data-testid="merge-pr-button"
                onClick={onMergePr}
                disabled={isMergingPr || isApprovingPr}
                className="w-full px-3 py-1.5 text-xs flex items-center justify-center gap-1 bg-[var(--color-special-worktree)] text-white rounded-md hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <GitMerge size={12} />
                {isMergingPr ? 'Merging...' : 'Merge PR'}
                {showKbdHints && <kbd className="px-1 py-0.5 text-[10px] bg-white/20 rounded border border-white/30 font-mono ml-auto">w</kbd>}
              </button>
            </div>
          )}
        </div>
      )}

      {item.mergeStatus === 'conflict' && (
        <div data-testid="merge-status-conflict">
          <div className="flex items-center gap-1 text-sm text-[var(--color-status-error)] mb-2">
            <AlertTriangle size={14} />
            <span>Merge Conflict</span>
          </div>
          {conflictCheck && !conflictCheck.clean && conflictCheck.conflictingFiles.length > 0 && (
            <div className="mb-2 text-xs text-[var(--color-status-error)]">
              <ul className="ml-4 space-y-0.5">
                {conflictCheck.conflictingFiles.map((file, index) => (
                  <li key={index} className="font-mono text-[10px] truncate">
                    {file}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {item.worktreePath && (
            <button
              data-testid="conflict-rebase-button"
              onClick={onRebase}
              disabled={isRebasing || isMerging}
              className="w-full px-3 py-1.5 text-xs flex items-center justify-center gap-1 text-[var(--color-special-worktree)] rounded-md hover:bg-[var(--color-special-worktree)]/10 border border-[var(--color-special-worktree)]/30 transition-colors mb-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ArrowDownToLine size={12} />
              {isRebasing ? 'Pulling...' : 'Pull Latest (Rebase)'}
              {showKbdHints && <kbd className="px-1 py-0.5 text-[10px] bg-[var(--color-special-worktree)]/10 rounded border border-[var(--color-special-worktree)]/30 font-mono ml-auto">r</kbd>}
            </button>
          )}
          <button
            data-testid="fix-conflicts-button"
            onClick={onFixConflicts}
            disabled={isFixingConflicts}
            className="w-full px-3 py-1.5 text-xs flex items-center justify-center gap-1 text-[var(--color-status-info)] rounded-md hover:bg-[var(--color-status-info)]/10 border border-[var(--color-status-info)]/30 transition-colors mb-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Wrench size={12} />
            {isFixingConflicts ? 'Fixing...' : 'Fix Conflicts (Run Agent)'}
          </button>
          <button
            data-testid="retry-merge-button"
            onClick={onMerge}
            disabled={isMerging}
            className="w-full px-3 py-1.5 text-xs bg-[var(--color-status-error)] text-white rounded-md hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isMerging ? 'Retrying...' : 'Retry Squash Merge & PR'}
            {showKbdHints && <kbd className="px-1 py-0.5 text-[10px] bg-white/20 rounded border border-white/30 font-mono ml-auto">g</kbd>}
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
                className="w-full px-3 py-1.5 text-xs flex items-center justify-center gap-1 text-[var(--color-special-worktree)] rounded-md hover:bg-[var(--color-special-worktree)]/10 border border-[var(--color-special-worktree)]/30 transition-colors mb-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ArrowDownToLine size={12} />
                {isRebasing ? 'Pulling...' : 'Pull Latest (Rebase)'}
                {showKbdHints && <kbd className="px-1 py-0.5 text-[10px] bg-[var(--color-special-worktree)]/10 rounded border border-[var(--color-special-worktree)]/30 font-mono ml-auto">r</kbd>}
              </button>
              {rebaseResult && (
                <div data-testid="rebase-result" className="mb-2">
                  {rebaseResult.success ? (
                    <div className="flex items-center gap-1 text-xs text-[var(--color-status-success)]">
                      <Check size={12} />
                      <span>Rebased onto latest default</span>
                    </div>
                  ) : (
                    <div className="text-xs text-[var(--color-status-error)]">
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
            {showKbdHints && <kbd className="px-1 py-0.5 text-[10px] bg-[var(--color-bg-primary)] rounded border border-[var(--color-border-primary)] font-mono ml-auto">k</kbd>}
          </button>

          {conflictCheck && (
            <div data-testid="conflict-check-result" className="mb-2">
              {conflictCheck.clean ? (
                <div className="flex items-center gap-1 text-xs text-[var(--color-status-success)]">
                  <Check size={12} />
                  <span>Clean — no conflicts</span>
                </div>
              ) : (
                <div className="text-xs text-[var(--color-status-error)]">
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
            className="w-full px-3 py-1.5 text-xs flex items-center justify-center gap-1 bg-[var(--color-status-success)] text-white rounded-md hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <GitMerge size={12} />
            {isMerging ? 'Squashing & Merging...' : 'Squash, Merge & Push PR'}
            {showKbdHints && <kbd className="px-1 py-0.5 text-[10px] bg-white/20 rounded border border-white/30 font-mono ml-auto">g</kbd>}
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
