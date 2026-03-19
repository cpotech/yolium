/**
 * @module src/hooks/useAgentSession
 * Hook for managing agent session state and IPC subscriptions.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import type { AgentTokenUsage } from '@shared/types/agent'

export type LiveAgentStatus = 'starting' | 'running' | 'completed' | 'failed' | null

export interface AgentSessionState {
  agentOutputLines: string[]
  showAgentLog: boolean
  currentSessionId: string | null
  currentDetail: string | null
  tokenUsage: AgentTokenUsage | null
}

export interface AgentSessionActions {
  clearAgentOutput: () => void
  associateSession: (sessionId: string) => void
  prepareForRun: () => void
  appendOutputLine: (line: string) => void
  setRunStatus: (status: LiveAgentStatus, message?: string | null) => void
  toggleAgentLog: () => void
}

export interface UseAgentSessionOptions {
  itemId: string | undefined
  itemAgentStatus: string | undefined
  projectPath: string
  onUpdated: () => void
}

/**
 * Hook for managing agent session state and IPC event subscriptions.
 * @param options - Configuration options
 * @returns Session state and actions
 */
export function useAgentSession({
  itemId,
  itemAgentStatus,
  projectPath,
  onUpdated,
}: UseAgentSessionOptions): AgentSessionState & AgentSessionActions {
  const [agentOutputLines, setAgentOutputLines] = useState<string[]>([])
  const [showAgentLog, setShowAgentLog] = useState(false)
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const [currentStep, setCurrentStep] = useState<string | null>(null)
  const [currentDetail, setCurrentDetail] = useState<string | null>(null)
  const [liveStatus, setLiveStatus] = useState<LiveAgentStatus>(null)
  const [liveStatusMessage, setLiveStatusMessage] = useState<string | null>(null)
  const [tokenUsage, setTokenUsage] = useState<AgentTokenUsage | null>(null)
  // Buffer output that arrives before the session ID is known (race between IPC send and invoke)
  const pendingOutputRef = useRef<{ sessionId: string; data: string }[]>([])

  // Load persistent log and reset agent output state when switching to a different item
  useEffect(() => {
    setShowAgentLog(false)
    setCurrentSessionId(null)
    sessionIdRef.current = null
    pendingOutputRef.current = []
    setCurrentStep(null)
    setCurrentDetail(null)
    setLiveStatus(null)
    setLiveStatusMessage(null)
    setTokenUsage(null)

    if (!itemId) {
      setAgentOutputLines([])
      return
    }

    // Load persistent log from disk
    window.electronAPI.agent.readLog(projectPath, itemId).then((logContent) => {
      if (logContent) {
        const lines = logContent.split('\n').filter(Boolean)
        setAgentOutputLines(lines)
      } else {
        setAgentOutputLines([])
      }
    }).catch(() => {
      setAgentOutputLines([])
    })
  }, [itemId, projectPath])

  const associateSession = useCallback((sessionId: string) => {
    sessionIdRef.current = sessionId
    setCurrentSessionId(sessionId)

    // Flush output that arrived before we knew the session ID
    const pending = pendingOutputRef.current.filter(p => p.sessionId === sessionId)
    pendingOutputRef.current = []
    const allLines = pending.flatMap(p => p.data.split('\n').filter(Boolean))
    if (allLines.length > 0) {
      setAgentOutputLines(prev => [...prev, ...allLines])
      setShowAgentLog(true)
    }
  }, [])

  const appendOutputLine = useCallback((line: string) => {
    setAgentOutputLines(prev => [...prev, line])
    setShowAgentLog(true)
  }, [])

  const setRunStatus = useCallback((status: LiveAgentStatus, message?: string | null) => {
    setLiveStatus(status)
    setLiveStatusMessage(message ?? null)
    if (status === 'starting') {
      setCurrentStep(null)
      setCurrentDetail(null)
      setShowAgentLog(true)
    }
  }, [])

  const prepareForRun = useCallback(() => {
    setAgentOutputLines([])
    setCurrentStep(null)
    setCurrentDetail(null)
    setLiveStatusMessage(null)
    setShowAgentLog(true)
    if (itemId) {
      window.electronAPI.agent.clearLog(projectPath, itemId).catch(() => {})
    }
  }, [itemId, projectPath])

  // Reconnect to active agent session when dialog reopens for a running item
  useEffect(() => {
    if (!itemId || itemAgentStatus !== 'running') return

    const reconnect = async () => {
      try {
        const result = await window.electronAPI.agent.getActiveSession(projectPath, itemId)
        if (result?.sessionId) {
          associateSession(result.sessionId)
          if (
            result.cumulativeUsage.inputTokens > 0 ||
            result.cumulativeUsage.outputTokens > 0 ||
            result.cumulativeUsage.costUsd > 0
          ) {
            setTokenUsage(result.cumulativeUsage)
          }
          setLiveStatus('running')
          setShowAgentLog(true)
          return
        }

        // Running with no active session usually means stale state after restart/crash.
        const recovered = await window.electronAPI.agent.recover(projectPath)
        if (Array.isArray(recovered) && recovered.some((item: { id?: string }) => item.id === itemId)) {
          onUpdated()
        }
      } catch {
        // Best-effort reconnect/recover only.
      }
    }
    reconnect()
  }, [itemId, itemAgentStatus, projectPath, associateSession, onUpdated])

  // Subscribe to agent output events
  useEffect(() => {
    if (!itemId) return

    const cleanup = window.electronAPI.agent.onOutput((sessionId, data) => {
      if (sessionId === sessionIdRef.current) {
        const lines = data.split('\n').filter(Boolean)
        if (lines.length > 0) {
          setAgentOutputLines(prev => [...prev, ...lines])
          setShowAgentLog(true)
        }
      } else if (!sessionIdRef.current) {
        // Session ID not yet known — buffer output to flush when it arrives
        pendingOutputRef.current.push({ sessionId, data })
      }
    })

    return cleanup
  }, [itemId])

  // Subscribe to agent progress events
  useEffect(() => {
    if (!itemId) return

    const cleanup = window.electronAPI.agent.onProgress((sessionId, progress) => {
      if (sessionId === sessionIdRef.current) {
        setLiveStatus('running')
        setCurrentStep(progress.step)
        setCurrentDetail(
          progress.attempt
            ? `${progress.detail} (attempt ${progress.attempt}/${progress.maxAttempts || '?'})`
            : progress.detail
        )
      }
    })

    return cleanup
  }, [itemId])

  // Subscribe to agent completion events
  useEffect(() => {
    if (!itemId) return

    const cleanup = window.electronAPI.agent.onComplete((sessionId, summary) => {
      if (sessionId === sessionIdRef.current) {
        setLiveStatus('completed')
        setLiveStatusMessage(summary)
        onUpdated()
      }
    })

    return cleanup
  }, [itemId, onUpdated])

  // Subscribe to agent error events
  useEffect(() => {
    if (!itemId) return

    const cleanup = window.electronAPI.agent.onError((sessionId, message) => {
      if (sessionId === sessionIdRef.current) {
        setLiveStatus('failed')
        setLiveStatusMessage(message)
        onUpdated()
      }
    })

    return cleanup
  }, [itemId, onUpdated])

  // Subscribe to agent exit events
  useEffect(() => {
    if (!itemId) return

    const cleanup = window.electronAPI.agent.onExit((sessionId, exitCode) => {
      if (sessionId === sessionIdRef.current) {
        setLiveStatus(prev => prev === 'running' || prev === 'starting'
          ? (exitCode === 0 ? 'completed' : 'failed')
          : prev
        )
        onUpdated()
      }
    })

    return cleanup
  }, [itemId, onUpdated])

  // Subscribe to agent token usage events
  useEffect(() => {
    if (!itemId) return

    const cleanup = window.electronAPI.agent.onCostUpdate((sessionId, _projectPath, _eventItemId, usage) => {
      if (sessionId === sessionIdRef.current) {
        setTokenUsage(prev => ({
          inputTokens: (prev?.inputTokens ?? 0) + usage.inputTokens,
          outputTokens: (prev?.outputTokens ?? 0) + usage.outputTokens,
          costUsd: (prev?.costUsd ?? 0) + usage.costUsd,
        }))
      }
    })

    return cleanup
  }, [itemId])

  const clearAgentOutput = useCallback(() => {
    setAgentOutputLines([])
    if (itemId) {
      window.electronAPI.agent.clearLog(projectPath, itemId).catch(() => {})
    }
  }, [itemId, projectPath])

  const toggleAgentLog = useCallback(() => {
    setShowAgentLog(prev => !prev)
  }, [])

  return {
    agentOutputLines,
    showAgentLog,
    currentSessionId,
    currentDetail,
    tokenUsage,
    clearAgentOutput,
    associateSession,
    prepareForRun,
    appendOutputLine,
    setRunStatus,
    toggleAgentLog,
  }
}
