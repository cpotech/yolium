import React from 'react'
import { Clock, Play, Trash2 } from 'lucide-react'
import type { CavemanMode, KanbanColumn, KanbanItem } from '@shared/types/kanban'
import { AgentControls } from '../../agent/AgentControls'
import { formatTokenCount, formatUsdCost } from '@renderer/utils/formatTokens'
import { agentProviderLabels, columnOptions, formatTimestamp } from './itemDetailViewUtils'
import type { DraftSaveStatus } from './useItemDetailDraft'
import type { AgentTokenUsage } from '@shared/types/agent'
import type { DevServerStatus } from '@renderer/hooks/useDevServer'

interface DevServerState {
  status: DevServerStatus
  detectedCommand: string | null
  error: string | null
  start: (command?: string) => Promise<void>
}

interface ItemDetailSidebarProps {
  showKbdHints: boolean
  item: KanbanItem
  agentProvider: KanbanItem['agentProvider']
  model: string
  cavemanMode: CavemanMode | 'inherit'
  column: KanbanColumn
  providerModels: Record<string, string[]>
  saveStatus: DraftSaveStatus
  isDeleting: boolean
  isStartingAgent: boolean
  currentSessionId: string | null
  currentDetail: string | null
  tokenUsage: AgentTokenUsage | null
  devServer?: DevServerState
  onSetAgentProvider: (value: KanbanItem['agentProvider']) => void
  onSetModel: (value: string) => void
  onSetCavemanMode: (value: CavemanMode | 'inherit') => void
  onSetColumn: (value: KanbanColumn) => void
  onDelete: () => void
  onStartAgent: (agentName: string) => void
  onResumeAgent: (agentName: string) => void
  onStopAgent: () => void
  onUpdated: () => void
}

export function ItemDetailSidebar({
  showKbdHints,
  item,
  agentProvider,
  model,
  cavemanMode,
  column,
  providerModels,
  saveStatus,
  isDeleting,
  isStartingAgent,
  currentSessionId,
  currentDetail,
  tokenUsage,
  devServer,
  onSetAgentProvider,
  onSetModel,
  onSetCavemanMode,
  onSetColumn,
  onDelete,
  onStartAgent,
  onResumeAgent,
  onStopAgent,
  onUpdated,
}: ItemDetailSidebarProps): React.ReactElement {
  return (
    <div data-testid="sidebar-zone" className="w-72 overflow-y-auto yolium-scrollbar border-l border-[var(--color-border-primary)] bg-[var(--color-bg-tertiary)] flex flex-col">
      <div className="px-4 pt-4 pb-2">
        <AgentControls
          item={item}
          isStartingAgent={isStartingAgent}
          currentSessionId={currentSessionId}
          currentDetail={currentDetail}
          onStartAgent={onStartAgent}
          onResumeAgent={onResumeAgent}
          onStopAgent={onStopAgent}
          onUpdated={onUpdated}
        />
      </div>

      {tokenUsage && (
        <div data-testid="token-usage" className="px-4 py-2 flex items-baseline justify-between text-xs">
          <span className="text-[var(--color-text-tertiary)]">Tokens</span>
          <span className="text-[var(--color-text-secondary)] tabular-nums">
            {formatTokenCount(tokenUsage.inputTokens)} / {formatTokenCount(tokenUsage.outputTokens)}
            <span className="ml-2 text-[var(--color-text-muted)]">{formatUsdCost(tokenUsage.costUsd)}</span>
          </span>
        </div>
      )}

      {currentSessionId && devServer && (
        <div data-testid="dev-server" className="px-4 py-2">
          <label className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-tertiary)] mb-1.5">
            <span className="flex items-center gap-1.5">
              Dev Server
              {showKbdHints && <kbd className="px-1 py-0.5 text-[10px] bg-[var(--color-bg-primary)] rounded border border-[var(--color-border-primary)] font-mono normal-case tracking-normal text-[var(--color-text-muted)]">s</kbd>}
            </span>
          </label>
          {devServer.status === 'detecting' && (
            <div className="text-xs text-[var(--color-text-secondary)]">Detecting...</div>
          )}
          {devServer.status === 'starting' && (
            <div className="text-xs text-[var(--color-status-info)]">Starting...</div>
          )}
          {devServer.status === 'running' && (
            <div className="flex items-center gap-2 text-sm text-[var(--color-status-success)]">
              <span className="w-2 h-2 rounded-full bg-[var(--color-status-success)] animate-pulse" />
              Running
            </div>
          )}
          {devServer.status === 'error' && (
            <div className="text-xs text-[var(--color-status-error)]">{devServer.error}</div>
          )}
          {(devServer.status === 'idle' || devServer.status === 'detecting' || devServer.status === 'starting' || devServer.status === 'error') && (
            <button
              data-testid="start-dev-server-button"
              onClick={() => devServer.start()}
              disabled={devServer.status === 'detecting' || devServer.status === 'starting'}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-sm text-[var(--color-text-primary)] bg-[var(--color-accent-primary)] rounded-md hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
            >
              <Play size={14} />
              {devServer.status === 'detecting' ? 'Detecting...' : devServer.status === 'starting' ? 'Starting...' : 'Start Dev Server'}
            </button>
          )}
          {devServer.detectedCommand && devServer.status !== 'running' && (
            <div className="mt-2 text-xs text-[var(--color-text-secondary)] font-mono">
              {devServer.detectedCommand}
            </div>
          )}
        </div>
      )}

      {/* Configuration Section — flat, label-on-left form rows */}
      <div className="px-4 py-3 mt-2 space-y-2.5">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-tertiary)] mb-1">Configuration</div>

        <div className="grid grid-cols-[80px_1fr] items-center gap-2">
          <label
            htmlFor="detail-agent-provider"
            className="text-xs text-[var(--color-text-secondary)] flex items-center gap-1"
          >
            Provider
            {showKbdHints && <kbd className="px-1 py-0.5 text-[10px] bg-[var(--color-bg-primary)] rounded border border-[var(--color-border-primary)] font-mono text-[var(--color-text-muted)]">1</kbd>}
          </label>
          {item.agentStatus !== 'running' && item.agentStatus !== 'waiting' ? (
            <select
              id="detail-agent-provider"
              data-testid="agent-provider-select"
              value={agentProvider}
              onChange={event => onSetAgentProvider(event.target.value as KanbanItem['agentProvider'])}
              className="w-full px-2 py-1.5 bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded text-[var(--color-text-primary)] text-sm focus:outline-none focus:border-[var(--color-accent-primary)] focus:ring-1 focus:ring-[var(--color-accent-primary)]"
            >
              <option value="claude">Claude</option>
              <option value="opencode">OpenCode</option>
              <option value="codex">Codex</option>
              <option value="openrouter">OpenRouter</option>
              <option value="xai">xAI</option>
            </select>
          ) : (
            <span data-testid="agent-provider-display" className="text-sm text-[var(--color-text-primary)]">
              {agentProviderLabels[item.agentProvider]}
            </span>
          )}
        </div>

        <div className="grid grid-cols-[80px_1fr] items-center gap-2">
          <label
            htmlFor="detail-model"
            className="text-xs text-[var(--color-text-secondary)] flex items-center gap-1"
          >
            Model
            {showKbdHints && <kbd className="px-1 py-0.5 text-[10px] bg-[var(--color-bg-primary)] rounded border border-[var(--color-border-primary)] font-mono text-[var(--color-text-muted)]">2</kbd>}
          </label>
          <select
            id="detail-model"
            data-testid="model-select"
            value={model}
            onChange={event => onSetModel(event.target.value)}
            title="Leave empty to use provider default"
            className="w-full px-2 py-1.5 bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded text-[var(--color-text-primary)] text-sm focus:outline-none focus:border-[var(--color-accent-primary)] focus:ring-1 focus:ring-[var(--color-accent-primary)]"
          >
            <option value="">Provider default</option>
            {(providerModels[agentProvider] || []).map(providerModel => (
              <option key={providerModel} value={providerModel}>
                {providerModel}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-[80px_1fr] items-center gap-2">
          <label
            htmlFor="detail-caveman-mode"
            className="text-xs text-[var(--color-text-secondary)]"
          >
            Caveman
          </label>
          <select
            id="detail-caveman-mode"
            data-testid="caveman-mode-select"
            value={cavemanMode}
            onChange={event => onSetCavemanMode(event.target.value as CavemanMode | 'inherit')}
            title="Overrides the project default for this item"
            className="w-full px-2 py-1.5 bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded text-[var(--color-text-primary)] text-sm focus:outline-none focus:border-[var(--color-accent-primary)] focus:ring-1 focus:ring-[var(--color-accent-primary)]"
          >
            <option value="inherit">Inherit from project</option>
            <option value="off">Off</option>
            <option value="lite">Lite (~25% fewer tokens)</option>
            <option value="full">Full (~75% fewer tokens)</option>
            <option value="ultra">Ultra (~85% fewer tokens)</option>
          </select>
        </div>

        <div className="grid grid-cols-[80px_1fr] items-center gap-2">
          <label
            htmlFor="detail-column"
            className="text-xs text-[var(--color-text-secondary)] flex items-center gap-1"
          >
            Column
            {showKbdHints && <kbd className="px-1 py-0.5 text-[10px] bg-[var(--color-bg-primary)] rounded border border-[var(--color-border-primary)] font-mono text-[var(--color-text-muted)]">3</kbd>}
          </label>
          <select
            id="detail-column"
            data-testid="column-select"
            value={column}
            onChange={event => onSetColumn(event.target.value as KanbanColumn)}
            title={
              column === 'in-progress' || column === 'verify'
                ? `Items are moved to ${column === 'in-progress' ? 'In Progress' : 'Verify'} by agents`
                : undefined
            }
            className="w-full px-2 py-1.5 bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded text-[var(--color-text-primary)] text-sm focus:outline-none focus:border-[var(--color-accent-primary)] focus:ring-1 focus:ring-[var(--color-accent-primary)]"
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
        </div>
      </div>

      {/* Footer — separated by space, not a heavy border */}
      <div className="mt-auto px-4 py-3">
        {saveStatus === 'saving' && (
          <div data-testid="save-status" className="text-center text-xs text-[var(--color-status-info)] mb-2">
            Saving…
          </div>
        )}
        {saveStatus === 'saved' && (
          <div data-testid="save-status" className="text-center text-xs text-[var(--color-status-success)] mb-2">
            Saved
          </div>
        )}
        {saveStatus === 'error' && (
          <div data-testid="save-status" className="text-center text-xs text-[var(--color-status-error)] mb-2">
            Save failed
          </div>
        )}
        <div className="flex items-center justify-between text-[11px] text-[var(--color-text-muted)] mb-2">
          <span data-testid="created-at" title={`Created ${formatTimestamp(item.createdAt)}`} className="flex items-center gap-1">
            <Clock size={11} />
            {formatTimestamp(item.createdAt)}
          </span>
          <span data-testid="updated-at" title={`Updated ${formatTimestamp(item.updatedAt)}`} className="flex items-center gap-1">
            updated {formatTimestamp(item.updatedAt)}
          </span>
        </div>
        <button
          data-testid="delete-button"
          onClick={onDelete}
          disabled={isDeleting}
          className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs text-[var(--color-status-error)] rounded hover:bg-[var(--color-status-error)]/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Trash2 size={13} />
          {isDeleting ? 'Deleting…' : 'Delete item'}
          <kbd className="px-1 py-0.5 text-[10px] bg-[var(--color-status-error)]/10 rounded font-mono ml-1">D</kbd>
        </button>
      </div>
    </div>
  )
}
