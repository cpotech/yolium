/**
 * @module src/components/AgentLogPanel
 * Agent output log panel with auto-scroll and clear functionality.
 */

import React, { useRef, useEffect } from 'react'
import { X, Trash2, Terminal } from 'lucide-react'

interface AgentLogPanelProps {
  outputLines: string[]
  onClear: () => void
  onClose: () => void
}

/**
 * Display agent output log with auto-scroll and controls.
 * @param props - Component props
 */
export function AgentLogPanel({
  outputLines,
  onClear,
  onClose,
}: AgentLogPanelProps): React.ReactElement {
  const logEndRef = useRef<HTMLDivElement>(null)
  const logContainerRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new output arrives
  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [outputLines])

  return (
    <div data-testid="agent-log-section" className="mt-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-[var(--color-text-secondary)] flex items-center gap-2">
          <Terminal size={14} />
          Agent Output
        </h3>
        <div className="flex items-center gap-1">
          <button
            data-testid="clear-log-button"
            onClick={onClear}
            className="p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors"
            title="Clear log"
          >
            <Trash2 size={12} />
          </button>
          <button
            data-testid="close-log-button"
            onClick={onClose}
            className="p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors"
            title="Hide log"
          >
            <X size={12} />
          </button>
        </div>
      </div>
      <div
        ref={logContainerRef}
        data-testid="agent-log-content"
        aria-live="polite"
        aria-label="Agent output log"
        className="bg-[var(--color-bg-primary)] rounded-md p-3 border border-[var(--color-border-primary)] text-xs text-[var(--color-text-primary)] font-mono overflow-y-auto max-h-96"
      >
        {outputLines.length === 0 ? (
          <span className="text-[var(--color-text-tertiary)]">Waiting for agent output...</span>
        ) : (
          outputLines.map((line, idx) => (
            <div key={idx} className="whitespace-pre-wrap break-words leading-5">
              {line}
            </div>
          ))
        )}
        <div ref={logEndRef} />
      </div>
    </div>
  )
}
