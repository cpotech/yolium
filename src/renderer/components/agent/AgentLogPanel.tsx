/**
 * @module src/components/AgentLogPanel
 * Agent output log panel with auto-scroll and clear functionality.
 */

import React, { useState, useRef, useEffect, useImperativeHandle, forwardRef } from 'react'
import { Trash2, Terminal, ChevronRight, ChevronDown } from 'lucide-react'

/** Regex to match timestamp prefix like "[12:34:56] " at start of line */
const TIMESTAMP_RE = /^(\[\d{2}:\d{2}:\d{2}\]) (.*)$/

export interface AgentLogPanelHandle {
  pauseAutoScroll: () => void
  resumeAutoScroll: () => void
  scrollBy: (delta: number) => void
}

interface AgentLogPanelProps {
  outputLines: string[]
  onClear: () => void
  isExpanded?: boolean
  onToggle?: () => void
}

export const AgentLogPanel = forwardRef<AgentLogPanelHandle, AgentLogPanelProps>(function AgentLogPanel({
  outputLines,
  onClear,
  isExpanded: controlledExpanded,
  onToggle,
}: AgentLogPanelProps, ref): React.ReactElement {
  const [internalExpanded, setInternalExpanded] = useState(false)
  const isControlled = controlledExpanded !== undefined
  const isExpanded = isControlled ? controlledExpanded : internalExpanded

  const logEndRef = useRef<HTMLDivElement>(null)
  const logContainerRef = useRef<HTMLDivElement>(null)
  const autoScrollPausedRef = useRef(false)

  const handleToggle = () => {
    if (isControlled && onToggle) {
      onToggle()
    } else {
      setInternalExpanded(prev => !prev)
    }
  }

  useImperativeHandle(ref, () => ({
    pauseAutoScroll: () => {
      autoScrollPausedRef.current = true
    },
    resumeAutoScroll: () => {
      autoScrollPausedRef.current = false
    },
    scrollBy: (delta: number) => {
      if (logContainerRef.current) {
        logContainerRef.current.scrollTop += delta
      }
    },
  }), [])

  useEffect(() => {
    if (isExpanded && logEndRef.current && !autoScrollPausedRef.current) {
      // scrollIntoView may not be available in jsdom/test environments
      logEndRef.current.scrollIntoView?.({ behavior: 'smooth' })
    }
  }, [outputLines, isExpanded])

  return (
    <div data-testid="agent-log-section">
      <div className="flex items-center justify-between px-4 py-2">
        <button
          data-testid="toggle-log-button"
          onClick={handleToggle}
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
            outputLines.map((line, idx) => {
              const match = TIMESTAMP_RE.exec(line)
              if (match) {
                return (
                  <div key={idx} className="whitespace-pre-wrap break-words leading-5">
                    <span className="text-[var(--color-text-tertiary)] select-none">{match[1]}</span>{' '}
                    {match[2]}
                  </div>
                )
              }
              return (
                <div key={idx} className="whitespace-pre-wrap break-words leading-5">
                  {line}
                </div>
              )
            })
          )}
          <div ref={logEndRef} />
        </div>
      )}
    </div>
  )
})