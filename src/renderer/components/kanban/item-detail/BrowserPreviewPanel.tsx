/**
 * @module src/renderer/components/kanban/item-detail/BrowserPreviewPanel
 * Live browser preview panel using Electron's <webview> tag.
 * Displays web pages from Docker containers inside the work item dialog.
 */

import React, { useCallback, useState } from 'react'
import { ArrowLeft, ArrowRight, RotateCw, Globe, Loader2, AlertCircle } from 'lucide-react'

interface BrowserPreviewPanelProps {
  isOpen: boolean
  url: string
  portMappings: Record<number, number>
  isLoading: boolean
  error: string | null
  onBack: () => void
  onForward: () => void
  onReload: () => void
  onUrlChange: (url: string) => void
  webviewRef: React.RefObject<HTMLElement | null>
  urlBarRef: React.RefObject<HTMLInputElement | null>
}

export function BrowserPreviewPanel({
  isOpen,
  url,
  portMappings,
  isLoading,
  error,
  onBack,
  onForward,
  onReload,
  onUrlChange,
  webviewRef,
  urlBarRef,
}: BrowserPreviewPanelProps): React.ReactElement | null {
  const [urlBarValue, setUrlBarValue] = useState(url)

  // Sync URL bar when external URL changes
  React.useEffect(() => {
    setUrlBarValue(url)
  }, [url])

  const handleUrlSubmit = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      onUrlChange(urlBarValue)
    }
  }, [onUrlChange, urlBarValue])

  const setWebviewRef = useCallback((el: HTMLElement | null) => {
    (webviewRef as React.MutableRefObject<HTMLElement | null>).current = el
  }, [webviewRef])

  const setUrlBarRefCallback = useCallback((el: HTMLInputElement | null) => {
    (urlBarRef as React.MutableRefObject<HTMLInputElement | null>).current = el
  }, [urlBarRef])

  if (!isOpen) return null

  // Find the first port mapping for the badge
  const portEntries = Object.entries(portMappings)
  const firstPort = portEntries.length > 0 ? portEntries[0] : null

  if (!url) {
    return (
      <div
        data-testid="browser-preview-panel"
        className="flex-1 min-w-0 flex flex-col border-l border-[var(--color-border-primary)] bg-[var(--color-bg-primary)]"
      >
        <div
          data-testid="browser-empty-state"
          className="flex-1 flex flex-col items-center justify-center text-[var(--color-text-muted)] gap-3 p-8"
        >
          <Globe size={48} className="opacity-30" />
          <p className="text-sm font-medium">No ports detected</p>
          <p className="text-xs text-center max-w-xs">
            Start a dev server inside the container on port 3000, 5173, 4200, 8080, or 8000 to see a live preview here.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div
      data-testid="browser-preview-panel"
      className="flex-1 min-w-0 flex flex-col border-l border-[var(--color-border-primary)] bg-[var(--color-bg-primary)]"
    >
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-[var(--color-border-primary)] bg-[var(--color-bg-tertiary)]">
        <button
          data-testid="browser-back-btn"
          onClick={onBack}
          className="p-1 rounded text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-primary)] transition-colors"
          title="Back (h)"
        >
          <ArrowLeft size={14} />
        </button>
        <button
          data-testid="browser-forward-btn"
          onClick={onForward}
          className="p-1 rounded text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-primary)] transition-colors"
          title="Forward (l)"
        >
          <ArrowRight size={14} />
        </button>
        <button
          data-testid="browser-reload-btn"
          onClick={onReload}
          className="p-1 rounded text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-primary)] transition-colors"
          title="Reload (r)"
        >
          <RotateCw size={14} />
        </button>
        <input
          ref={setUrlBarRefCallback}
          data-testid="browser-url-bar"
          type="text"
          value={urlBarValue}
          onChange={e => setUrlBarValue(e.target.value)}
          onKeyDown={handleUrlSubmit}
          className="flex-1 min-w-0 px-2 py-0.5 text-xs bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded text-[var(--color-text-primary)] outline-none focus:border-blue-500"
          title="URL bar (u)"
        />
        {isLoading && (
          <Loader2
            data-testid="browser-loading-spinner"
            size={14}
            className="flex-shrink-0 animate-spin text-blue-400"
          />
        )}
        {firstPort && (
          <span
            data-testid="browser-port-badge"
            className="flex-shrink-0 px-1.5 py-0.5 text-xs bg-blue-900/30 text-blue-400 rounded border border-blue-800/50"
          >
            {firstPort[0]}:{firstPort[1]}
          </span>
        )}
      </div>

      {/* Webview area */}
      <div className="flex-1 min-h-0 relative">
        {error ? (
          <div
            data-testid="browser-error-state"
            className="absolute inset-0 flex flex-col items-center justify-center text-[var(--color-text-muted)] gap-3 p-8"
          >
            <AlertCircle size={36} className="text-red-400 opacity-60" />
            <p className="text-sm font-medium text-red-400">Page failed to load</p>
            <p className="text-xs text-center max-w-xs">{error}</p>
            <button
              data-testid="browser-retry-btn"
              onClick={onReload}
              className="mt-2 px-3 py-1 text-xs rounded bg-[var(--color-bg-tertiary)] border border-[var(--color-border-primary)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
            >
              Retry
            </button>
          </div>
        ) : (
          <webview
            ref={setWebviewRef}
            data-testid="browser-webview"
            src={url}
            className="absolute inset-0 w-full h-full"
            // @ts-expect-error webview attributes not typed in React
            allowpopups="true"
          />
        )}
      </div>
    </div>
  )
}
