/**
 * @module src/hooks/useAgentSession
 * Hook for managing agent session state and IPC subscriptions.
 */

import { useState, useEffect, useRef, useCallback } from 'react'

export type LiveAgentStatus = 'starting' | 'running' | 'completed' | 'failed' | null

export interface AgentSessionState {
  agentOutputLines: string[]
  showAgentLog: boolean
  currentSessionId: string | null
  sessionIdRef: React.MutableRefObject<string | null>
  currentStep: string | null
  currentDetail: string | null
  liveStatus: LiveAgentStatus
  liveStatusMessage: string | null
}

export interface AgentSessionActions {
  setAgentOutputLines: React.Dispatch<React.SetStateAction<string[]>>
  setShowAgentLog: React.Dispatch<React.SetStateAction<boolean>>
  setCurrentSessionId: React.Dispatch<React.SetStateAction<string | null>>
  setCurrentStep: React.Dispatch<React.SetStateAction<string | null>>
  setCurrentDetail: React.Dispatch<React.SetStateAction<string | null>>
  setLiveStatus: React.Dispatch<React.SetStateAction<LiveAgentStatus>>
  setLiveStatusMessage: React.Dispatch<React.SetStateAction<string | null>>
  clearAgentOutput: () => void
  /** Set the session ID and flush any output that arrived before it was known. */
  associateSession: (sessionId: string) => void
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
  // Buffer output that arrives before the session ID is known (race between IPC send and invoke)
  const pendingOutputRef = useRef<{ sessionId: string; data: string }[]>([])

  // Reset agent output state when switching to a different item
  useEffect(() => {
    setAgentOutputLines([])
    setShowAgentLog(false)
    setCurrentSessionId(null)
    sessionIdRef.current = null
    pendingOutputRef.current = []
    setCurrentStep(null)
    setCurrentDetail(null)
    setLiveStatus(null)
    setLiveStatusMessage(null)
  }, [itemId])

  /**
   * Associate a session ID and flush any output that arrived before it was known.
   * Solves the race between IPC send events (output) arriving before the
   * invoke response (which carries the session ID).
   */
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

  // Reconnect to active agent session when dialog reopens for a running item
  useEffect(() => {
    if (!itemId || itemAgentStatus !== 'running') return

    const reconnect = async () => {
      const result = await window.electronAPI.agent.getActiveSession(projectPath, itemId)
      if (result?.sessionId) {
        associateSession(result.sessionId)
        setLiveStatus('running')
        setShowAgentLog(true)
      }
    }
    reconnect()
  }, [itemId, itemAgentStatus, projectPath, associateSession])

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

  const clearAgentOutput = useCallback(() => {
    setAgentOutputLines([])
  }, [])

  return {
    agentOutputLines,
    showAgentLog,
    currentSessionId,
    sessionIdRef,
    currentStep,
    currentDetail,
    liveStatus,
    liveStatusMessage,
    setAgentOutputLines,
    setShowAgentLog,
    setCurrentSessionId,
    setCurrentStep,
    setCurrentDetail,
    setLiveStatus,
    setLiveStatusMessage,
    clearAgentOutput,
    associateSession,
  }
}
