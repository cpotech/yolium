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
    <div data-testid="sidebar-zone" className="w-72 overflow-y-auto yolium-scrollbar border-l border-[var(--color-border-primary)] bg-[var(--color-bg-tertiary)]">
      <div className="p-4 border-b border-[var(--color-border-primary)]">
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

      {currentSessionId && devServer && (
        <div data-testid="dev-server" className="p-4 border-b border-[var(--color-border-primary)]">
          <label className="block text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)] mb-2">
            Dev Server
            {showKbdHints && <kbd className="px-1 py-0.5 text-[10px] bg-[var(--color-bg-primary)] rounded border border-[var(--color-border-primary)] font-mono ml-1">s</kbd>}
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

      {/* Configuration Section */}
      <div className="p-4 space-y-4 border-b border-[var(--color-border-primary)]">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-disabled)] mb-3">Configuration</div>
        <div>
          <label
            htmlFor="detail-agent-provider"
            className="block text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)] mb-1"
          >
            Agent Provider
            {showKbdHints && <kbd className="px-1 py-0.5 text-[10px] bg-[var(--color-bg-primary)] rounded border border-[var(--color-border-primary)] font-mono ml-1">1</kbd>}
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
               <option value="openrouter">OpenRouter</option>
               <option value="xai">xAI</option>
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
            {showKbdHints && <kbd className="px-1 py-0.5 text-[10px] bg-[var(--color-bg-primary)] rounded border border-[var(--color-border-primary)] font-mono ml-1">2</kbd>}
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
            htmlFor="detail-caveman-mode"
            className="block text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)] mb-1"
          >
            Caveman Mode
          </label>
          <select
            id="detail-caveman-mode"
            data-testid="caveman-mode-select"
            value={cavemanMode}
            onChange={event => onSetCavemanMode(event.target.value as CavemanMode | 'inherit')}
            className="w-full px-3 py-2 bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-md text-[var(--color-text-primary)] text-sm focus:outline-none focus:border-[var(--color-accent-primary)] focus:ring-1 focus:ring-[var(--color-accent-primary)]"
          >
            <option value="inherit">Inherit from project</option>
            <option value="off">Off</option>
            <option value="lite">Lite (~25% fewer tokens)</option>
            <option value="full">Full (~75% fewer tokens)</option>
            <option value="ultra">Ultra (~85% fewer tokens)</option>
          </select>
          <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
            Overrides the project default for this item
          </p>
        </div>

        <div>
          <label
            htmlFor="detail-column"
            className="block text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)] mb-1"
          >
            Column
            {showKbdHints && <kbd className="px-1 py-0.5 text-[10px] bg-[var(--color-bg-primary)] rounded border border-[var(--color-border-primary)] font-mono ml-1">3</kbd>}
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
      </div>

      {/* Footer */}
      <div className="mt-auto p-4 border-t border-[var(--color-border-primary)]">
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
        <div className="space-y-1 text-xs text-[var(--color-text-tertiary)] mb-3">
          <div className="flex items-center gap-1" data-testid="created-at">
            <Clock size={14} />
            <span>Created {formatTimestamp(item.createdAt)}</span>
          </div>
          <div className="flex items-center gap-1" data-testid="updated-at">
            <Clock size={14} />
            <span>Updated {formatTimestamp(item.updatedAt)}</span>
          </div>
        </div>
        <button
          data-testid="delete-button"
          onClick={onDelete}
          disabled={isDeleting}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-sm text-[var(--color-status-error)] rounded-md hover:bg-[var(--color-status-error)]/10 border border-[var(--color-status-error)]/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Trash2 size={14} />
          {isDeleting ? 'Deleting...' : 'Delete'}
          <kbd className="px-1 py-0.5 text-[10px] bg-[var(--color-status-error)]/10 rounded border border-[var(--color-status-error)]/30 font-mono ml-1">D</kbd>
        </button>
        <p className="text-center text-[10px] text-[var(--color-text-tertiary)] mt-3">
          <kbd className="px-1 py-0.5 text-[10px] bg-[var(--color-bg-tertiary)] rounded border border-[var(--color-border-primary)] font-mono">Esc</kbd> to close
        </p>
      </div>
    </div>
  )
}
