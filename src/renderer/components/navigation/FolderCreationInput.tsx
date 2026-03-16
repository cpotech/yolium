/**
 * @module src/components/FolderCreationInput
 * Inline folder creation input component.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react'

interface FolderCreationInputProps {
  parentDirectory: string
  onCreated: (newPath: string) => void
  onCancel: () => void
  inputRef: React.RefObject<HTMLInputElement | null>
}

/**
 * Inline input for creating new folders.
 * @param props - Component props
 */
export function FolderCreationInput({
  parentDirectory,
  onCreated,
  onCancel,
  inputRef: mainInputRef,
}: FolderCreationInputProps): React.ReactElement {
  const [newFolderName, setNewFolderName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const newFolderInputRef = useRef<HTMLInputElement>(null)

  // Focus input on mount
  useEffect(() => {
    setTimeout(() => newFolderInputRef.current?.focus(), 50)
  }, [])

  const handleCancel = useCallback(() => {
    setNewFolderName('')
    setError(null)
    onCancel()
    mainInputRef.current?.focus()
  }, [onCancel, mainInputRef])

  const handleConfirm = useCallback(async () => {
    if (!newFolderName.trim()) {
      setError('Folder name cannot be empty')
      return
    }

    const result = await window.electronAPI.fs.createDirectory(parentDirectory, newFolderName.trim())

    if (result.success && result.path) {
      setNewFolderName('')
      setError(null)
      onCreated(result.path)
      setTimeout(() => mainInputRef.current?.focus(), 50)
    } else {
      setError(result.error || 'Failed to create folder')
    }
  }, [newFolderName, parentDirectory, onCreated, mainInputRef])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleConfirm()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      handleCancel()
    }
  }, [handleConfirm, handleCancel])

  return (
    <div className="mt-2 border border-[var(--color-border-primary)] rounded-md bg-[var(--color-bg-primary)] p-2">
      <div className="flex items-center gap-2">
        <svg
          className="w-4 h-4 text-green-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"
          />
        </svg>
        <input
          ref={newFolderInputRef}
          type="text"
          value={newFolderName}
          onChange={(e) => {
            setNewFolderName(e.target.value)
            setError(null)
          }}
          onKeyDown={handleKeyDown}
          placeholder="New folder name"
          spellCheck={false}
          className="flex-1 px-2 py-1 bg-[var(--color-bg-secondary)] border border-[var(--color-border-secondary)] rounded text-[var(--color-text-primary)] font-mono text-sm focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
        />
        <button
          onClick={handleConfirm}
          className="p-1 text-green-500 hover:bg-[var(--color-bg-tertiary)] rounded"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </button>
        <button
          onClick={handleCancel}
          className="p-1 text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] rounded"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      {error && (
        <div className="mt-1 text-sm text-red-400">{error}</div>
      )}
      <div className="mt-1 text-xs text-[var(--color-text-muted)]">
        Creating in: {parentDirectory}
      </div>
    </div>
  )
}
