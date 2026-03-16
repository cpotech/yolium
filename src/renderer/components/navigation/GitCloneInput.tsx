/**
 * @module src/components/GitCloneInput
 * Inline git clone input component.
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { normalizePath } from '@shared/lib/path-utils'

const MISSING_GIT_CLONE_HANDLER_MESSAGE = "No handler registered for 'git:clone'"
const CLONE_HANDLER_UNAVAILABLE_MESSAGE = 'Git clone is temporarily unavailable. Please restart Yolium and try again.'

interface GitCloneInputProps {
  parentDirectory: string
  onCloned: (clonedPath: string) => void
  onCancel: () => void
  inputRef: React.RefObject<HTMLInputElement | null>
}

function extractRepoName(repoUrl: string): string | null {
  const trimmed = repoUrl.trim()
  if (!trimmed) return null

  const withoutQuery = trimmed.replace(/[?#].*$/, '')
  const withoutSlash = withoutQuery.replace(/[\\/]+$/, '')
  const withoutDotGit = withoutSlash.replace(/\.git$/i, '')
  if (!withoutDotGit) return null

  const scpLikeMatch = withoutDotGit.match(/^[^@\s]+@[^:\s]+:(.+)$/)
  if (scpLikeMatch?.[1]) {
    const parts = scpLikeMatch[1].split('/').filter(Boolean)
    return parts.length > 0 ? parts[parts.length - 1] : null
  }

  try {
    const parsed = new URL(withoutDotGit)
    const parts = parsed.pathname.split('/').filter(Boolean)
    return parts.length > 0 ? parts[parts.length - 1] : null
  } catch {
    const parts = withoutDotGit.split(/[\\/]/).filter(Boolean)
    return parts.length >= 2 ? parts[parts.length - 1] : null
  }
}

function joinPath(parentPath: string, folderName: string): string {
  const normalizedParent = normalizePath(parentPath)
  if (!normalizedParent) return folderName
  return normalizedParent.endsWith('/')
    ? `${normalizedParent}${folderName}`
    : `${normalizedParent}/${folderName}`
}

function getCloneErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message || ''
    if (message.includes(MISSING_GIT_CLONE_HANDLER_MESSAGE)) {
      return CLONE_HANDLER_UNAVAILABLE_MESSAGE
    }

    return message || 'Failed to clone repository'
  }

  return 'Failed to clone repository'
}

/**
 * Inline input for cloning repositories.
 * @param props - Component props
 */
export function GitCloneInput({
  parentDirectory,
  onCloned,
  onCancel,
  inputRef: mainInputRef,
}: GitCloneInputProps): React.ReactElement {
  const [repoUrl, setRepoUrl] = useState('')
  const [isCloning, setIsCloning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cloneInputRef = useRef<HTMLInputElement>(null)

  const repoName = useMemo(() => extractRepoName(repoUrl), [repoUrl])
  const cloneTarget = useMemo(
    () => (repoName ? joinPath(parentDirectory, repoName) : null),
    [parentDirectory, repoName],
  )

  // Focus input on mount
  useEffect(() => {
    setTimeout(() => cloneInputRef.current?.focus(), 50)
  }, [])

  const handleCancel = useCallback(() => {
    if (isCloning) return
    setRepoUrl('')
    setError(null)
    onCancel()
    mainInputRef.current?.focus()
  }, [isCloning, onCancel, mainInputRef])

  const handleConfirm = useCallback(async () => {
    if (isCloning) return

    const trimmedUrl = repoUrl.trim()
    if (!trimmedUrl) {
      setError('Repository URL cannot be empty')
      return
    }

    if (!repoName || !cloneTarget) {
      setError('Invalid repository URL')
      return
    }

    setIsCloning(true)
    setError(null)

    try {
      const result = await window.electronAPI.git.clone(trimmedUrl, cloneTarget)

      if (result.success && result.clonedPath) {
        setRepoUrl('')
        setError(null)
        onCloned(result.clonedPath)
        setTimeout(() => mainInputRef.current?.focus(), 50)
      } else {
        setError(result.error || 'Failed to clone repository')
      }
    } catch (error) {
      setError(getCloneErrorMessage(error))
    } finally {
      setIsCloning(false)
    }
  }, [isCloning, repoUrl, repoName, cloneTarget, onCloned, mainInputRef])

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
            d="M8 6a2 2 0 110 4 2 2 0 010-4zm8 8a2 2 0 110 4 2 2 0 010-4zM8 10v4a2 2 0 002 2h4"
          />
        </svg>
        <input
          ref={cloneInputRef}
          type="text"
          value={repoUrl}
          onChange={(e) => {
            setRepoUrl(e.target.value)
            setError(null)
          }}
          onKeyDown={handleKeyDown}
          placeholder="Repository URL (https://... or git@...)"
          spellCheck={false}
          className="flex-1 px-2 py-1 bg-[var(--color-bg-secondary)] border border-[var(--color-border-secondary)] rounded text-[var(--color-text-primary)] font-mono text-sm focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
          disabled={isCloning}
        />
        <button
          onClick={handleConfirm}
          className="p-1 text-green-500 hover:bg-[var(--color-bg-tertiary)] rounded disabled:opacity-60 disabled:cursor-not-allowed"
          disabled={isCloning}
          aria-label="Confirm clone"
        >
          {isCloning ? (
            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={3} />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </button>
        <button
          onClick={handleCancel}
          className="p-1 text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] rounded disabled:opacity-60 disabled:cursor-not-allowed"
          disabled={isCloning}
          aria-label="Cancel clone"
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
        {cloneTarget ? `Cloning into: ${cloneTarget}` : `Cloning into: ${normalizePath(parentDirectory)}`}
      </div>
    </div>
  )
}
