/**
 * @module src/renderer/hooks/useBrowserPreview
 * Manages browser preview state, port polling, and webview control.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

interface BrowserPreviewState {
  isOpen: boolean
  url: string
  portMappings: Record<number, number>
  isLoading: boolean
  error: string | null
  toggle: () => void
  setUrl: (url: string) => void
  goBack: () => void
  goForward: () => void
  reload: () => void
  webviewRef: React.RefObject<HTMLElement | null>
  urlBarRef: React.RefObject<HTMLInputElement | null>
}

export function useBrowserPreview(
  itemId: string | null,
  projectPath: string | null,
): BrowserPreviewState {
  const [isOpen, setIsOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [portMappings, setPortMappings] = useState<Record<number, number>>({})
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const manualUrlRef = useRef(false)
  const webviewRef = useRef<HTMLElement | null>(null)
  const urlBarRef = useRef<HTMLInputElement | null>(null)
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const toggle = useCallback(() => {
    setIsOpen(prev => !prev)
  }, [])

  const setUrlManual = useCallback((newUrl: string) => {
    manualUrlRef.current = true
    setUrl(newUrl)
  }, [])

  const fetchPorts = useCallback(async () => {
    if (!projectPath || !itemId) return
    try {
      const ports = await window.electronAPI.agent.getPortMappings(projectPath, itemId)
      setPortMappings(ports)
      setError(null)

      // Auto-select first port URL if not manually set
      if (!manualUrlRef.current) {
        const hostPorts = Object.values(ports)
        if (hostPorts.length > 0) {
          setUrl(`http://localhost:${hostPorts[0]}`)
        } else {
          setUrl('')
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setUrl('')
    }
  }, [projectPath, itemId])

  // Poll for port mappings while panel is open
  useEffect(() => {
    if (!isOpen || !projectPath || !itemId) {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
      return
    }

    // Initial fetch
    void fetchPorts()

    // Poll every 3 seconds
    pollIntervalRef.current = setInterval(() => {
      void fetchPorts()
    }, 3000)

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
    }
  }, [isOpen, projectPath, itemId, fetchPorts])

  // Reset manual URL flag when panel closes
  useEffect(() => {
    if (!isOpen) {
      manualUrlRef.current = false
    }
  }, [isOpen])

  const goBack = useCallback(() => {
    const wv = webviewRef.current as unknown as { goBack?: () => void }
    wv?.goBack?.()
  }, [])

  const goForward = useCallback(() => {
    const wv = webviewRef.current as unknown as { goForward?: () => void }
    wv?.goForward?.()
  }, [])

  const reload = useCallback(() => {
    const wv = webviewRef.current as unknown as { reload?: () => void }
    wv?.reload?.()
  }, [])

  const handleLoadStart = useCallback(() => {
    setIsLoading(true)
    setError(null)
  }, [])

  const handleLoadStop = useCallback(() => {
    setIsLoading(false)
  }, [])

  const handleLoadFail = useCallback((_e: unknown, errorCode: number, errorDescription: string) => {
    // Ignore aborted loads (user navigated away)
    if (errorCode === -3) return
    setIsLoading(false)
    setError(`Failed to load: ${errorDescription} (${errorCode})`)
  }, [])

  const handleNavigate = useCallback((e: { url: string }) => {
    setUrl(e.url)
    manualUrlRef.current = true
  }, [])

  // Attach webview event listeners
  useEffect(() => {
    const wv = webviewRef.current
    if (!wv || !isOpen) return

    const el = wv as unknown as {
      addEventListener: (event: string, handler: (...args: unknown[]) => void) => void
      removeEventListener: (event: string, handler: (...args: unknown[]) => void) => void
    }

    el.addEventListener('did-start-loading', handleLoadStart)
    el.addEventListener('did-stop-loading', handleLoadStop)
    el.addEventListener('did-fail-load', handleLoadFail as (...args: unknown[]) => void)
    el.addEventListener('did-navigate', handleNavigate as (...args: unknown[]) => void)

    return () => {
      el.removeEventListener('did-start-loading', handleLoadStart)
      el.removeEventListener('did-stop-loading', handleLoadStop)
      el.removeEventListener('did-fail-load', handleLoadFail as (...args: unknown[]) => void)
      el.removeEventListener('did-navigate', handleNavigate as (...args: unknown[]) => void)
    }
  }, [isOpen, url, handleLoadStart, handleLoadStop, handleLoadFail, handleNavigate])

  return {
    isOpen,
    url,
    portMappings,
    isLoading,
    error,
    toggle,
    setUrl: setUrlManual,
    goBack,
    goForward,
    reload,
    webviewRef,
    urlBarRef,
  }
}
