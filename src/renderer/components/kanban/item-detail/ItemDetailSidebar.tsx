import React from 'react'
import { Clock, FolderOpen, GitBranch, ShieldCheck, Trash2 } from 'lucide-react'
import type { KanbanColumn, KanbanItem } from '@shared/types/kanban'
import { AgentControls } from '../../agent/AgentControls'
import { formatTokenCount, formatUsdCost } from '@renderer/utils/formatTokens'
import { agentProviderLabels, columnOptions, CopyPathButton, formatTimestamp } from './itemDetailViewUtils'
import { ItemDetailMergeSection } from './ItemDetailMergeSection'
import type { DraftSaveStatus } from './useItemDetailDraft'
import type { ConflictCheckResult, RebaseResultState } from './useItemDetailPrWorkflow'
import type { AgentTokenUsage } from '@shared/types/agent'

interface ItemDetailSidebarProps {
  item: KanbanItem
  agentProvider: KanbanItem['agentProvider']
  model: string
  column: KanbanColumn
  verified: boolean
  providerModels: Record<string, string[]>
  saveStatus: DraftSaveStatus
  isDeleting: boolean
  answerText: string
  isStartingAgent: boolean
  isAnswering: boolean
  currentSessionId: string | null
  currentDetail: string | null
  tokenUsage: AgentTokenUsage | null
  answerInputRef: React.RefObject<HTMLTextAreaElement | null>
  prUrl: string | null
  conflictCheck: ConflictCheckResult | null
  rebaseResult: RebaseResultState | null
  isMerging: boolean
  isCheckingConflicts: boolean
  isRebasing: boolean
  isApprovingPr: boolean
  isMergingPr: boolean
  onSetAgentProvider: (value: KanbanItem['agentProvider']) => void
  onSetModel: (value: string) => void
  onSetColumn: (value: KanbanColumn) => void
  onSetVerified: (value: boolean) => void
  onDelete: () => void
  onStartAgent: (agentName: string) => void
  onResumeAgent: (agentName: string) => void
  onStopAgent: () => void
  onAnswerQuestion: () => void
  onSetAnswerText: (value: string) => void
  onCompareChanges: () => void
  onOpenPr: () => void
  onApprovePr: () => void
  onMergePr: () => void
  onCheckConflicts: () => void
  onRebase: () => void
  onMerge: () => void
  onFixConflicts: () => void
  isFixingConflicts: boolean
  onUpdated: () => void
}

export function ItemDetailSidebar({
  item,
  agentProvider,
  model,
  column,
  verified,
  providerModels,
  saveStatus,
  isDeleting,
  answerText,
  isStartingAgent,
  isAnswering,
  currentSessionId,
  currentDetail,
  tokenUsage,
  answerInputRef,
  prUrl,
  conflictCheck,
  rebaseResult,
  isMerging,
  isCheckingConflicts,
  isRebasing,
  isApprovingPr,
  isMergingPr,
  onSetAgentProvider,
  onSetModel,
  onSetColumn,
  onSetVerified,
  onDelete,
  onStartAgent,
  onResumeAgent,
  onStopAgent,
  onAnswerQuestion,
  onSetAnswerText,
  onCompareChanges,
  onOpenPr,
  onApprovePr,
  onMergePr,
  onCheckConflicts,
  onRebase,
  onMerge,
  onFixConflicts,
  isFixingConflicts,
  onUpdated,
}: ItemDetailSidebarProps): React.ReactElement {
  return (
    <div className="w-72 overflow-y-auto border-l border-[var(--color-border-primary)] bg-[var(--color-bg-tertiary)]">
      <div className="p-4 border-b border-[var(--color-border-primary)]">
        <AgentControls
          item={item}
          isStartingAgent={isStartingAgent}
          isAnswering={isAnswering}
          answerText={answerText}
          currentSessionId={currentSessionId}
          currentDetail={currentDetail}
          answerInputRef={answerInputRef}
          onStartAgent={onStartAgent}
          onResumeAgent={onResumeAgent}
          onStopAgent={onStopAgent}
          onAnswerQuestion={onAnswerQuestion}
          onSetAnswerText={onSetAnswerText}
          onUpdated={onUpdated}
        />
      </div>

      {tokenUsage && (
        <div data-testid="token-usage" className="p-4 border-b border-[var(--color-border-primary)]">
          <label className="block text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)] mb-1">
            Token Usage
          </label>
          <div className="text-sm text-[var(--color-text-primary)]">
            {formatTokenCount(tokenUsage.inputTokens)} in / {formatTokenCount(tokenUsage.outputTokens)} out
          </div>
          <div className="text-xs text-[var(--color-text-secondary)] mt-0.5">
            {formatUsdCost(tokenUsage.costUsd)}
          </div>
        </div>
      )}

      <div className="p-4 space-y-4">
        <div>
          <label
            htmlFor="detail-agent-provider"
            className="block text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)] mb-1"
          >
            Agent Provider
          </label>
          {item.agentStatus !== 'running' && item.agentStatus !== 'waiting' ? (
            <select
              id="detail-agent-provider"
              data-testid="agent-provider-select"
              value={agentProvider}
              onChange={event => onSetAgentProvider(event.target.value as KanbanItem['agentProvider'])}
              className="w-full px-3 py-2 bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-md text-[var(--color-text-primary)] text-sm focus:outline-none focus:border-[var(--color-accent-primary)] focus:ring-1 focus:ring-[var(--color-accent-primary)]"
            >
              <option value="claude">Claude</option>
              <option value="opencode">OpenCode</option>
              <option value="codex">Codex</option>
            </select>
          ) : (
            <span data-testid="agent-provider-display" className="text-sm text-[var(--color-text-primary)]">
              {agentProviderLabels[item.agentProvider]}
            </span>
          )}
        </div>

        <div>
          <label
            htmlFor="detail-model"
            className="block text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)] mb-1"
          >
            Model
          </label>
          <select
            id="detail-model"
            data-testid="model-select"
            value={model}
            onChange={event => onSetModel(event.target.value)}
            className="w-full px-3 py-2 bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-md text-[var(--color-text-primary)] text-sm focus:outline-none focus:border-[var(--color-accent-primary)] focus:ring-1 focus:ring-[var(--color-accent-primary)]"
          >
            <option value="">Provider default</option>
            {(providerModels[agentProvider] || []).map(providerModel => (
              <option key={providerModel} value={providerModel}>
                {providerModel}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
            Leave empty to use provider default
          </p>
        </div>

        <div>
          <label
            htmlFor="detail-column"
            className="block text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)] mb-1"
          >
            Column
          </label>
          <select
            id="detail-column"
            data-testid="column-select"
            value={column}
            onChange={event => onSetColumn(event.target.value as KanbanColumn)}
            className="w-full px-3 py-2 bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-md text-[var(--color-text-primary)] text-sm focus:outline-none focus:border-[var(--color-accent-primary)] focus:ring-1 focus:ring-[var(--color-accent-primary)]"
          >
            {columnOptions
              .filter(option => {
                if (option.id === 'in-progress') return column === 'in-progress'
                if (option.id === 'verify') return column === 'verify'
                return true
              })
              .map(option => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
          </select>
          {(column === 'in-progress' || column === 'verify') && (
            <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
              Items are moved to {column === 'in-progress' ? 'In Progress' : 'Verify'} by agents
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="detail-verified"
            className="block text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)] mb-1"
          >
            Verified
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              id="detail-verified"
              data-testid="verified-checkbox"
              type="checkbox"
              checked={verified}
              onChange={event => onSetVerified(event.target.checked)}
              className="rounded border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] text-[var(--color-status-success)] focus:ring-[var(--color-status-success)]"
            />
            <span className={`flex items-center gap-1 text-sm ${verified ? 'text-[var(--color-status-success)]' : 'text-[var(--color-text-secondary)]'}`}>
              <ShieldCheck size={14} />
              {verified ? 'Verified' : 'Not verified'}
            </span>
          </label>
        </div>

        <div>
          <label className="block text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)] mb-1">
            Branch
          </label>
          <div data-testid="branch-display" className="flex items-center gap-1.5 text-sm text-[var(--color-text-primary)]">
            <GitBranch size={14} className="text-[var(--color-text-secondary)] flex-shrink-0" />
            <span className="truncate">{item.branch || 'N/A'}</span>
          </div>
        </div>

        {item.worktreePath && (
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)] mb-1">
              Worktree
            </label>
            <div
              data-testid="worktree-path-display"
              className="flex items-center gap-1 text-xs text-[var(--color-text-tertiary)]"
            >
              <FolderOpen size={12} className="flex-shrink-0" />
              <span className="font-mono break-all" title={item.worktreePath}>{item.worktreePath}</span>
              <CopyPathButton path={item.worktreePath} />
            </div>
          </div>
        )}

        <ItemDetailMergeSection
          item={item}
          prUrl={prUrl}
          conflictCheck={conflictCheck}
          rebaseResult={rebaseResult}
          isMerging={isMerging}
          isCheckingConflicts={isCheckingConflicts}
          isRebasing={isRebasing}
          isApprovingPr={isApprovingPr}
          isMergingPr={isMergingPr}
          onCompareChanges={onCompareChanges}
          onOpenPr={onOpenPr}
          onApprovePr={onApprovePr}
          onMergePr={onMergePr}
          onCheckConflicts={onCheckConflicts}
          onRebase={onRebase}
          onMerge={onMerge}
          onFixConflicts={onFixConflicts}
          isFixingConflicts={isFixingConflicts}
        />
      </div>

      <div className="p-4 border-t border-[var(--color-border-primary)]">
        {saveStatus === 'saving' && (
          <div data-testid="save-status" className="text-center text-xs text-[var(--color-status-info)] font-medium mb-2">
            Saving...
          </div>
        )}
        {saveStatus === 'saved' && (
          <div data-testid="save-status" className="text-center text-xs text-[var(--color-status-success)] font-medium mb-2">
            Saved
          </div>
        )}
        {saveStatus === 'error' && (
          <div data-testid="save-status" className="text-center text-xs text-[var(--color-status-error)] font-medium mb-2">
            Save failed
          </div>
        )}
        <div className="space-y-2">
          <button
            data-testid="delete-button"
            onClick={onDelete}
            disabled={isDeleting}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-sm text-[var(--color-status-error)] rounded-md hover:bg-[var(--color-status-error)]/10 border border-[var(--color-status-error)]/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Trash2 size={14} />
            {isDeleting ? 'Deleting...' : 'Delete'}
            <span className="text-xs opacity-60 ml-1">(Ctrl+Del)</span>
          </button>
        </div>
      </div>

      <div className="mt-auto p-4 border-t border-[var(--color-border-primary)]">
        <div className="flex items-center justify-between text-xs text-[var(--color-text-tertiary)]">
          <div className="flex items-center gap-1" data-testid="created-at">
            <Clock size={11} />
            <span>Created {formatTimestamp(item.createdAt)}</span>
          </div>
          <div className="flex items-center gap-1" data-testid="updated-at">
            <Clock size={11} />
            <span>Updated {formatTimestamp(item.updatedAt)}</span>
          </div>
        </div>
        <p className="text-center text-[10px] text-[var(--color-text-tertiary)] mt-2">
          Esc to close
        </p>
      </div>
    </div>
  )
}
