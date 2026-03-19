import React, { useCallback, useRef, useEffect } from 'react'
import { trapFocus } from '@shared/lib/focus-trap'
import { useSuspendVimNavigation } from '@renderer/context/VimModeContext'
import { isCloseShortcut } from '@renderer/lib/dialog-shortcuts'

export interface ConfirmDialogProps {
  isOpen: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = 'OK',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}: ConfirmDialogProps): React.ReactElement | null {
  useSuspendVimNavigation(isOpen)

  const dialogRef = useRef<HTMLDivElement>(null)
  const confirmBtnRef = useRef<HTMLButtonElement>(null)

  // Auto-focus confirm button on open
  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => confirmBtnRef.current?.focus())
    }
  }, [isOpen])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (isCloseShortcut(e)) {
        e.preventDefault()
        onCancel()
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        onConfirm()
        return
      }
      if (dialogRef.current) {
        trapFocus(e, dialogRef.current)
      }
    },
    [onCancel, onConfirm]
  )

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onCancel()
      }
    },
    [onCancel]
  )

  if (!isOpen) return null

  return (
    <div
      data-testid="confirm-dialog-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onKeyDown={handleKeyDown}
      onClick={handleBackdropClick}
      tabIndex={-1}
    >
      <div
        ref={dialogRef}
        data-testid="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-sm bg-[var(--color-bg-secondary)] rounded-lg border border-[var(--color-border-primary)] shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4">
          <h2 className="text-base font-semibold text-[var(--color-text-primary)] mb-2">{title}</h2>
          <p className="text-sm text-[var(--color-text-secondary)] whitespace-pre-wrap">{message}</p>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[var(--color-border-primary)] bg-[var(--color-bg-tertiary)]">
          <button
            data-testid="confirm-dialog-cancel"
            onClick={onCancel}
            className="px-3 py-1.5 text-sm text-[var(--color-text-secondary)] rounded-md hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-primary)] transition-colors flex items-center gap-1.5"
          >
            {cancelLabel}
            <kbd className="text-xs bg-[var(--color-bg-tertiary)] px-1 py-0.5 rounded text-[var(--color-text-muted)]">Ctrl+Q</kbd>
          </button>
          <button
            ref={confirmBtnRef}
            data-testid="confirm-dialog-confirm"
            onClick={onConfirm}
            className="px-4 py-1.5 text-sm bg-[var(--color-accent-primary)] text-white rounded-md hover:bg-[var(--color-accent-hover)] transition-colors flex items-center gap-1.5"
          >
            {confirmLabel}
            <kbd className="text-xs bg-white/10 px-1 py-0.5 rounded text-white/70">Enter</kbd>
          </button>
        </div>
      </div>
    </div>
  )
}
