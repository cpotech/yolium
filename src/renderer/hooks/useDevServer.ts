import { useCallback, useEffect, useRef, useState } from 'react'

export type DevServerStatus = 'idle' | 'detecting' | 'starting' | 'running' | 'error'

export interface DevServerState {
  status: DevServerStatus
  detectedCommand: string | null
  error: string | null
}

export interface DevServerActions {
  detect: () => Promise<void>
  start: (command?: string) => Promise<void>
}

export interface UseDevServerOptions {
  itemId: string | null
  projectPath: string | null
  currentSessionId: string | null
  portMappings: Record<number, number>
  onServerRunning?: () => void
}

export function useDevServer({
  itemId,
  projectPath,
  currentSessionId,
  portMappings,
  onServerRunning,
}: UseDevServerOptions): DevServerState & DevServerActions {
  const [status, setStatus] = useState<DevServerStatus>('idle')
  const [detectedCommand, setDetectedCommand] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const prevStatusRef = useRef<DevServerStatus>('idle')

  const detect = useCallback(async () => {
    if (!itemId || !projectPath || !currentSessionId) {
      return
    }

    setStatus('detecting')
    setError(null)

    try {
      const command = await window.electronAPI.agent.detectDevCommand(projectPath, itemId)
      setDetectedCommand(command)
      setStatus('idle')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStatus('error')
    }
  }, [itemId, projectPath, currentSessionId])

  const start = useCallback(async (command?: string) => {
    if (!itemId || !projectPath) {
      return
    }

    setStatus('starting')
    setError(null)

    try {
      const result = await window.electronAPI.agent.startDevServer(projectPath, itemId, command)
      if (!result.success) {
        setError(result.error ?? 'Failed to start dev server')
        setStatus('error')
        return
      }

      setStatus('running')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStatus('error')
    }
  }, [itemId, projectPath])

  // Auto-detect when container session becomes available
  useEffect(() => {
    if (currentSessionId && itemId && projectPath) {
      void detect()
    } else {
      setStatus('idle')
      setDetectedCommand(null)
      setError(null)
    }
  }, [currentSessionId, itemId, projectPath, detect])

  // Transition to running when ports respond after starting
  useEffect(() => {
    const activePorts = Object.keys(portMappings).map(Number).filter(p => p > 0)
    if (activePorts.length > 0 && (status === 'starting' || status === 'running')) {
      setStatus('running')
    }
  }, [portMappings, status])

  // Auto-open browser preview when server transitions to running
  useEffect(() => {
    if (status === 'running' && prevStatusRef.current !== 'running') {
      onServerRunning?.()
    }
    prevStatusRef.current = status
  }, [status, onServerRunning])

  return {
    status,
    detectedCommand,
    error,
    detect,
    start,
  }
}
