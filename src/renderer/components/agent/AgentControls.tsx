/**
 * @module src/components/AgentControls
 * Agent control panel with state-dependent UI for starting, stopping, and resuming agents.
 */

import React, { useState, useEffect } from 'react'
import { Code, Lightbulb, Search, ShieldCheck, RotateCcw, MessageSquare, XCircle, Palette, Megaphone, Bug, Bot } from 'lucide-react'
import type { KanbanItem, AgentStatus } from '@shared/types/kanban'
import type { AgentDefinition } from '@shared/types/agent'

const statusColors: Record<AgentStatus, string> = {
  idle: 'bg-[var(--color-status-stopped)]',
  running: 'bg-[var(--color-status-warning)]',
  waiting: 'bg-[var(--color-status-warning)]',
  interrupted: 'bg-[var(--color-status-warning)]',
  completed: 'bg-[var(--color-status-success)]',
  failed: 'bg-[var(--color-status-error)]',
}

/**
 * Agent icon mapping - distinct icon per agent type
 */
export const agentIcons: Record<string, React.ReactNode> = {
  'code-agent': <Code size={16} />,
  'plan-agent': <Lightbulb size={16} />,
  'verify-agent': <ShieldCheck size={16} />,
  'scout-agent': <Search size={16} />,
  'design-agent': <Palette size={16} />,
  'marketing-agent': <Megaphone size={16} />,
  'qa-agent': <Bug size={16} />,
}

/**
 * Agent accent colors for subtle visual distinction (left-border stripe).
 */
export const agentAccentColors: Record<string, string> = {
  'code-agent': 'border-l-blue-500',
  'plan-agent': 'border-l-yellow-500',
  'verify-agent': 'border-l-purple-500',
  'scout-agent': 'border-l-green-500',
  'design-agent': 'border-l-pink-500',
  'marketing-agent': 'border-l-orange-500',
  'qa-agent': 'border-l-red-500',
}

/**
 * Mirror of agentAccentColors expressed as icon text colors, used to tint
 * the icon glyph in addition to the left border for visual hierarchy.
 */
const agentIconColors: Record<string, string> = {
  'code-agent': 'text-blue-400',
  'plan-agent': 'text-yellow-400',
  'verify-agent': 'text-purple-400',
  'scout-agent': 'text-green-400',
  'design-agent': 'text-pink-400',
  'marketing-agent': 'text-orange-400',
  'qa-agent': 'text-red-400',
}

/**
 * Canonical display order for agent buttons: Plan → Code → Verify
 */
export const agentDisplayOrder: Record<string, number> = {
  'plan-agent': 0,
  'code-agent': 1,
  'verify-agent': 2,
  'scout-agent': 3,
  'design-agent': 4,
  'marketing-agent': 5,
  'qa-agent': 6,
}

/**
 * Convert agent name like 'code-agent' to 'Code Agent'.
 */
function formatAgentLabel(name: string): string {
  return name
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

interface AgentControlsProps {
  item: KanbanItem
  isStartingAgent: boolean
  currentSessionId: string | null
  currentDetail: string | null
  onStartAgent: (agentName: string) => void
  onResumeAgent: (agentName: string) => void
  onStopAgent: () => void
  onUpdated: () => void
}

/**
 * Render a list of agent buttons with 1-based number hints.
 */
function AgentButtonList({
  agents,
  isStartingAgent,
  onClick,
  buttonTextPrefix,
  startingText,
}: {
  agents: AgentDefinition[]
  isStartingAgent: boolean
  onClick: (agentName: string) => void
  buttonTextPrefix: string
  startingText: string
}) {
  return (
    <div className="space-y-1">
      {agents.map((agent, index) => {
        const label = formatAgentLabel(agent.name).replace(/ Agent$/, '')
        return (
          <button
            key={agent.name}
            data-testid={`run-${agent.name}-button`}
            onClick={() => onClick(agent.name)}
            disabled={isStartingAgent}
            title={`${buttonTextPrefix} ${formatAgentLabel(agent.name)}`}
            className={`group w-full flex items-center gap-2.5 pl-2 pr-2.5 py-1.5 text-sm rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-[var(--color-text-primary)] hover:bg-[var(--color-bg-secondary)] border-l-2 ${agentAccentColors[agent.name] || 'border-l-gray-500'}`}
          >
            {index < 9 ? (
              <kbd
                data-testid="agent-number-hint"
                className="w-5 h-5 inline-flex items-center justify-center text-[10px] font-mono rounded bg-[var(--color-bg-secondary)] text-[var(--color-text-muted)] flex-shrink-0 group-hover:bg-[var(--color-bg-primary)]"
              >
                {index + 1}
              </kbd>
            ) : (
              <span className="w-5 flex-shrink-0" />
            )}
            <span className={`flex-shrink-0 ${agentIconColors[agent.name] || 'text-[var(--color-text-secondary)]'}`}>
              {agentIcons[agent.name] || <Bot size={16} />}
            </span>
            <span className="flex-1 text-left">
              {isStartingAgent ? startingText : label}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/**
 * Agent controls panel showing appropriate UI based on agent status.
 */
export function AgentControls({
  item,
  isStartingAgent,
  currentSessionId,
  currentDetail,
  onStartAgent,
  onResumeAgent,
  onStopAgent,
}: AgentControlsProps): React.ReactElement {
  const [agents, setAgents] = useState<AgentDefinition[]>([])
  const resumeAgentName = item.activeAgentName || item.lastAgentName || item.agentType || 'code-agent'

  useEffect(() => {
    window.electronAPI.agent.listDefinitions().then(setAgents).catch(() => {})
  }, [])

  // Sort agents in canonical order: Plan → Code → Verify
  const sortedAgents = [...agents].sort((a, b) => {
    const orderA = agentDisplayOrder[a.name] ?? 99
    const orderB = agentDisplayOrder[b.name] ?? 99
    return orderA - orderB
  })

  return (
    <>
      {/* Section header: Agents + inline status */}
      <div className="flex items-center justify-between mb-2">
        <label className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-tertiary)]">
          Agents
        </label>
        <div className="flex items-center gap-1.5">
          <span
            className={`w-1.5 h-1.5 rounded-full ${statusColors[item.agentStatus]}`}
            aria-hidden="true"
          />
          <span
            data-testid="status-badge"
            className="text-[11px] text-[var(--color-text-secondary)] capitalize"
          >
            {item.agentStatus}
          </span>
          {item.activeAgentName && (
            <span
              data-testid="active-agent-name"
              className="text-[11px] text-[var(--color-text-muted)]"
            >
              · {formatAgentLabel(item.activeAgentName)}
            </span>
          )}
        </div>
      </div>
      {!item.activeAgentName && item.lastAgentName && (
        <div
          data-testid="last-agent-name"
          className="text-[11px] text-[var(--color-text-muted)] mb-2"
        >
          Last Agent: {formatAgentLabel(item.lastAgentName)}
        </div>
      )}

      {/* Agent Controls — flat, no nested card */}
      <div className="mb-4">

        {/* Idle - Show all agent buttons */}
        {item.agentStatus === 'idle' && sortedAgents.length > 0 && (
          <AgentButtonList
            agents={sortedAgents}
            isStartingAgent={isStartingAgent}
            onClick={onStartAgent}
            buttonTextPrefix="Run"
            startingText="Starting..."
          />
        )}

        {/* Running - Show indicator with progress and stop button */}
        {item.agentStatus === 'running' && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-[var(--color-status-warning)]">
              <div className="w-3 h-3 bg-[var(--color-status-warning)] rounded-full animate-pulse" />
              Agent is running...
            </div>
            {currentDetail && (
              <p
                data-testid="agent-progress-detail"
                className="text-xs text-[var(--color-text-secondary)] pl-5"
              >
                {currentDetail}
              </p>
            )}
            {currentSessionId && (
              <button
                data-testid="stop-agent-button"
                onClick={onStopAgent}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm bg-[var(--color-agent-danger-bg)] text-white rounded-md hover:bg-[var(--color-agent-danger-hover)] transition-colors"
              >
                <XCircle size={14} />
                Stop Agent
                <kbd className="px-1 py-0.5 text-[10px] bg-white/10 rounded border border-white/20 font-mono">X</kbd>
              </button>
            )}
          </div>
        )}

        {/* Waiting - Simple indicator (answer form is in the comments area) */}
        {item.agentStatus === 'waiting' && (
          <div className="flex items-center gap-2 text-sm text-[var(--color-status-warning)]">
            <MessageSquare size={14} className="flex-shrink-0" />
            <span>Waiting for answer — see comments below</span>
          </div>
        )}

        {/* Interrupted - Show resume button */}
        {item.agentStatus === 'interrupted' && (
          <button
            data-testid="resume-interrupted-button"
            onClick={() => onResumeAgent(resumeAgentName)}
            disabled={isStartingAgent}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm bg-[var(--color-agent-warning-bg)] text-white rounded-md hover:bg-[var(--color-agent-warning-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <RotateCcw size={14} />
            {isStartingAgent ? 'Resuming...' : 'Resume Agent'}
          </button>
        )}

        {/* Completed - Show all agent buttons */}
        {item.agentStatus === 'completed' && (
          <div className="space-y-2">
            {sortedAgents.length > 0 && (
              <AgentButtonList
                agents={sortedAgents}
                isStartingAgent={isStartingAgent}
                onClick={onStartAgent}
                buttonTextPrefix="Run"
                startingText="Starting..."
              />
            )}
          </div>
        )}

        {/* Failed - Show all agent buttons */}
        {item.agentStatus === 'failed' && (
          <div className="space-y-2">
            <div className="text-sm text-[var(--color-status-error)]">Agent failed</div>
            {sortedAgents.length > 0 && (
              <AgentButtonList
                agents={sortedAgents}
                isStartingAgent={isStartingAgent}
                onClick={onStartAgent}
                buttonTextPrefix="Run"
                startingText="Starting..."
              />
            )}
          </div>
        )}
      </div>
    </>
  )
}
