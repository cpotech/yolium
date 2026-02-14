/**
 * @module src/components/MockPreviewModal
 * Modal for previewing HTML mock files in a sandboxed iframe.
 */

import React, { useEffect, useState } from 'react'

interface MockPreviewModalProps {
  filePath: string | null
  isOpen: boolean
  onClose: () => void
}

/**
 * Modal that loads an HTML mock file via IPC and displays it in a sandboxed iframe.
 */
export function MockPreviewModal({ filePath, isOpen, onClose }: MockPreviewModalProps): React.ReactElement | null {
  const [content, setContent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!isOpen || !filePath) {
      setContent(null)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)
    setContent(null)

    window.electronAPI.fs.readFile(filePath).then(result => {
      if (result.success && result.content) {
        setContent(result.content)
      } else {
        setError(result.error || 'Failed to read file')
      }
      setLoading(false)
    }).catch(err => {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setLoading(false)
    })
  }, [isOpen, filePath])

  if (!isOpen) return null

  const fileName = filePath?.split('/').pop() || 'Mock Preview'

  return (
    <div
      data-testid="mock-preview-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        data-testid="mock-preview-modal"
        className="bg-[var(--color-bg-primary)] rounded-lg border border-[var(--color-border-primary)] shadow-xl w-[90vw] h-[85vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)]">
          <div className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-text-secondary)]">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
            <span className="text-sm font-medium text-[var(--color-text-primary)]">{fileName}</span>
          </div>
          <button
            data-testid="mock-preview-close"
            onClick={onClose}
            className="p-1 rounded hover:bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {loading && (
            <div data-testid="mock-preview-loading" className="flex items-center justify-center h-full">
              <span className="text-sm text-[var(--color-text-secondary)]">Loading mock...</span>
            </div>
          )}
          {error && (
            <div data-testid="mock-preview-error" className="flex items-center justify-center h-full">
              <span className="text-sm text-red-400">{error}</span>
            </div>
          )}
          {content && (
            <iframe
              data-testid="mock-preview-iframe"
              srcDoc={content}
              sandbox=""
              className="w-full h-full border-0 bg-white"
              title={fileName}
            />
          )}
        </div>
      </div>
    </div>
  )
}
