/**
 * @module src/components/AgentControls
 * Agent control panel with state-dependent UI for starting, stopping, and resuming agents.
 */

import React, { useState, useEffect } from 'react'
import { Play, RotateCcw, MessageSquare, XCircle, CheckCircle2 } from 'lucide-react'
import type { KanbanItem, AgentStatus } from '@shared/types/kanban'
import type { AgentDefinition } from '@shared/types/agent'

const statusColors: Record<AgentStatus, string> = {
  idle: 'bg-gray-500',
  running: 'bg-yellow-500',
  waiting: 'bg-orange-500',
  interrupted: 'bg-orange-500',
  completed: 'bg-green-500',
  failed: 'bg-red-500',
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
  isAnswering: boolean
  answerText: string
  currentSessionId: string | null
  currentDetail: string | null
  answerInputRef: React.RefObject<HTMLTextAreaElement | null>
  onStartAgent: (agentName: string) => void
  onResumeAgent: (agentName: string) => void
  onStopAgent: () => void
  onAnswerQuestion: () => void
  onSetAnswerText: (text: string) => void
  onUpdated: () => void
}

/**
 * Render a list of agent buttons.
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
    <div className="space-y-2">
      {agents.map((agent, index) => (
        <button
          key={agent.name}
          data-testid={`run-${agent.name}-button`}
          onClick={() => onClick(agent.name)}
          disabled={isStartingAgent}
          className={`w-full flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${
            index === 0
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] border border-[var(--color-border-primary)] hover:border-[var(--color-accent-primary)]'
          }`}
        >
          <Play size={14} />
          {isStartingAgent ? startingText : `${buttonTextPrefix} ${formatAgentLabel(agent.name)}`}
        </button>
      ))}
    </div>
  )
}

/**
 * Agent controls panel showing appropriate UI based on agent status.
 */
export function AgentControls({
  item,
  isStartingAgent,
  isAnswering,
  answerText,
  currentSessionId,
  currentDetail,
  answerInputRef,
  onStartAgent,
  onResumeAgent,
  onStopAgent,
  onAnswerQuestion,
  onSetAnswerText,
}: AgentControlsProps): React.ReactElement {
  const [agents, setAgents] = useState<AgentDefinition[]>([])

  useEffect(() => {
    window.electronAPI.agent.listDefinitions().then(setAgents).catch(() => {})
  }, [])

  return (
    <>
      {/* Status Badge */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
          Status
        </label>
        <div className="flex items-center gap-2">
          <span
            data-testid="status-badge"
            className={`inline-block px-2 py-1 text-xs font-medium rounded text-white ${statusColors[item.agentStatus]}`}
          >
            {item.agentStatus}
          </span>
          {item.activeAgentName && (
            <span
              data-testid="active-agent-name"
              className="text-xs text-[var(--color-text-secondary)]"
            >
              {formatAgentLabel(item.activeAgentName)}
            </span>
          )}
        </div>
      </div>

      {/* Agent Controls */}
      <div className="mb-4 p-3 bg-[var(--color-bg-primary)] rounded-md border border-[var(--color-border-primary)] min-h-[100px]">
        <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
          Agent Controls
        </label>

        {/* Idle - Show all agent buttons */}
        {item.agentStatus === 'idle' && agents.length > 0 && (
          <AgentButtonList
            agents={agents}
            isStartingAgent={isStartingAgent}
            onClick={onStartAgent}
            buttonTextPrefix="Run"
            startingText="Starting..."
          />
        )}

        {/* Running - Show indicator with progress and stop button */}
        {item.agentStatus === 'running' && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-yellow-400">
              <div className="w-3 h-3 bg-yellow-400 rounded-full animate-pulse" />
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
                className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
              >
                <XCircle size={14} />
                Stop Agent
              </button>
            )}
          </div>
        )}

        {/* Waiting - Show question and answer input */}
        {item.agentStatus === 'waiting' && item.agentQuestion && (
          <div className="space-y-2">
            <div className="flex items-start gap-2 text-sm text-orange-400">
              <MessageSquare size={14} className="mt-0.5 flex-shrink-0" />
              <span>{item.agentQuestion}</span>
            </div>
            {item.agentQuestionOptions && item.agentQuestionOptions.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {item.agentQuestionOptions.map((option, idx) => (
                  <button
                    key={idx}
                    onClick={() => onSetAnswerText(option)}
                    className="px-2 py-1 text-xs bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] rounded border border-[var(--color-border-primary)] hover:border-[var(--color-accent-primary)] transition-colors"
                  >
                    {option}
                  </button>
                ))}
              </div>
            )}
            <textarea
              ref={answerInputRef}
              data-testid="answer-input"
              value={answerText}
              onChange={e => onSetAnswerText(e.target.value)}
              placeholder="Type your answer..."
              rows={2}
              className="w-full px-2 py-1.5 bg-[var(--color-bg-secondary)] border border-[var(--color-border-primary)] rounded text-sm text-white placeholder-[var(--color-text-tertiary)] focus:outline-none focus:border-[var(--color-accent-primary)]"
            />
            <div className="flex gap-2">
              <button
                data-testid="submit-answer-button"
                onClick={onAnswerQuestion}
                disabled={isAnswering || !answerText.trim()}
                className="flex-1 px-2 py-1.5 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isAnswering ? 'Sending...' : 'Submit Answer'}
              </button>
              <button
                data-testid="resume-agent-button"
                onClick={() => onResumeAgent(item.activeAgentName || 'code-agent')}
                disabled={isStartingAgent}
                className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <RotateCcw size={12} />
                {isStartingAgent ? 'Resuming...' : 'Resume'}
              </button>
            </div>
          </div>
        )}

        {/* Interrupted - Show resume button */}
        {item.agentStatus === 'interrupted' && (
          <button
            data-testid="resume-interrupted-button"
            onClick={() => onResumeAgent(item.activeAgentName || 'code-agent')}
            disabled={isStartingAgent}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <RotateCcw size={14} />
            {isStartingAgent ? 'Resuming...' : 'Resume Agent'}
          </button>
        )}

        {/* Completed - Show all agent buttons */}
        {item.agentStatus === 'completed' && (
          <div className="space-y-2">
            <div className="text-sm text-green-400 flex items-center gap-2">
              <CheckCircle2 size={14} />
              Agent completed successfully
            </div>
            {agents.length > 0 && (
              <AgentButtonList
                agents={agents}
                isStartingAgent={isStartingAgent}
                onClick={onStartAgent}
                buttonTextPrefix="Run"
                startingText="Starting..."
              />
            )}
          </div>
        )}

        {/* Failed - Show retry button and all agent buttons */}
        {item.agentStatus === 'failed' && (
          <div className="space-y-2">
            <div className="text-sm text-red-400">Agent failed</div>
            <button
              data-testid="retry-agent-button"
              onClick={() => onStartAgent(item.activeAgentName || agents[0]?.name || 'code-agent')}
              disabled={isStartingAgent}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <RotateCcw size={14} />
              {isStartingAgent ? 'Starting...' : 'Retry'}
            </button>
            {agents.length > 0 && (
              <AgentButtonList
                agents={agents}
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
