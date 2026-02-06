/**
 * @module src/components/AgentLogPanel
 * Agent output log panel with auto-scroll and clear functionality.
 */

import React, { useState, useRef, useEffect } from 'react'
import { Trash2, Terminal, ChevronRight, ChevronDown } from 'lucide-react'

interface AgentLogPanelProps {
  outputLines: string[]
  onClear: () => void
}

/**
 * Display agent log with collapsible panel and auto-scroll.
 * Collapsed by default.
 * @param props - Component props
 */
export function AgentLogPanel({
  outputLines,
  onClear,
}: AgentLogPanelProps): React.ReactElement {
  const [isExpanded, setIsExpanded] = useState(false)
  const logEndRef = useRef<HTMLDivElement>(null)
  const logContainerRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new output arrives (only when expanded)
  useEffect(() => {
    if (isExpanded && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [outputLines, isExpanded])

  return (
    <div data-testid="agent-log-section">
      <div className="flex items-center justify-between px-4 py-2">
        <button
          data-testid="toggle-log-button"
          onClick={() => setIsExpanded(prev => !prev)}
          className="flex items-center gap-1.5 text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
        >
          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <Terminal size={14} />
          <span>Log</span>
          {outputLines.length > 0 && (
            <span className="ml-1 px-1.5 py-0.5 text-[10px] rounded-full bg-[var(--color-bg-primary)] text-[var(--color-text-tertiary)]">
              {outputLines.length}
            </span>
          )}
        </button>
        {isExpanded && (
          <button
            data-testid="clear-log-button"
            onClick={onClear}
            className="p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors"
            title="Clear log"
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>
      {isExpanded && (
        <div
          ref={logContainerRef}
          data-testid="agent-log-content"
          aria-live="polite"
          aria-label="Agent log"
          className="px-4 pb-3 text-xs text-[var(--color-text-primary)] font-mono overflow-y-auto max-h-56"
        >
          {outputLines.length === 0 ? (
            <span className="text-[var(--color-text-tertiary)]">Waiting for output...</span>
          ) : (
            outputLines.map((line, idx) => (
              <div key={idx} className="whitespace-pre-wrap break-words leading-5">
                {line}
              </div>
            ))
          )}
          <div ref={logEndRef} />
        </div>
      )}
    </div>
  )
}
