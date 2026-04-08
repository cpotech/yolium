import React, { useState, useEffect, useCallback, useRef } from 'react'
import { X, FileText, FilePlus, FileMinus, FileEdit, Loader2, AlertTriangle } from 'lucide-react'
import { isCloseShortcut } from '@renderer/lib/dialog-shortcuts'
import { useSuspendVimNavigation } from '@renderer/context/VimModeContext'
import { restoreFocusSafely } from '@shared/lib/focus-trap'

interface GitDiffDialogProps {
  isOpen: boolean
  onClose: () => void
  projectPath: string
  branchName: string
}

interface ChangedFile {
  path: string
  status: 'M' | 'A' | 'D' | 'R'
}

interface DiffLine {
  type: 'context' | 'added' | 'removed' | 'hunk-header' | 'empty'
  content: string
  lineNumber: number | null
}

interface SideBySideLine {
  left: DiffLine
  right: DiffLine
}

function parseUnifiedDiff(diffText: string): SideBySideLine[] {
  const lines = diffText.split('\n')
  const result: SideBySideLine[] = []

  let oldLineNum = 0
  let newLineNum = 0
  let inHunk = false

  // Collect removed and added lines for alignment
  let removedBuffer: DiffLine[] = []
  let addedBuffer: DiffLine[] = []

  function flushBuffers() {
    const maxLen = Math.max(removedBuffer.length, addedBuffer.length)
    for (let i = 0; i < maxLen; i++) {
      const left: DiffLine = i < removedBuffer.length
        ? removedBuffer[i]
        : { type: 'empty', content: '', lineNumber: null }
      const right: DiffLine = i < addedBuffer.length
        ? addedBuffer[i]
        : { type: 'empty', content: '', lineNumber: null }
      result.push({ left, right })
    }
    removedBuffer = []
    addedBuffer = []
  }

  for (const line of lines) {
    // Skip diff metadata lines
    if (line.startsWith('diff --git') || line.startsWith('index ') || line.startsWith('---') || line.startsWith('+++')) {
      continue
    }

    // Hunk header
    if (line.startsWith('@@')) {
      flushBuffers()
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)/)
      if (match) {
        oldLineNum = parseInt(match[1], 10)
        newLineNum = parseInt(match[2], 10)
        inHunk = true
        const hunkLabel = match[3] ? line : line
        result.push({
          left: { type: 'hunk-header', content: hunkLabel, lineNumber: null },
          right: { type: 'hunk-header', content: hunkLabel, lineNumber: null },
        })
      }
      continue
    }

    if (!inHunk) continue

    if (line.startsWith('-')) {
      removedBuffer.push({
        type: 'removed',
        content: line.substring(1),
        lineNumber: oldLineNum++,
      })
    } else if (line.startsWith('+')) {
      addedBuffer.push({
        type: 'added',
        content: line.substring(1),
        lineNumber: newLineNum++,
      })
    } else {
      // Context line — flush any pending removed/added first
      flushBuffers()
      const content = line.startsWith(' ') ? line.substring(1) : line
      result.push({
        left: { type: 'context', content, lineNumber: oldLineNum++ },
        right: { type: 'context', content, lineNumber: newLineNum++ },
      })
    }
  }

  flushBuffers()
  return result
}

const statusIcons: Record<string, { icon: React.ReactNode; color: string }> = {
  M: { icon: <FileEdit size={14} />, color: 'text-yellow-400' },
  A: { icon: <FilePlus size={14} />, color: 'text-green-400' },
  D: { icon: <FileMinus size={14} />, color: 'text-red-400' },
  R: { icon: <FileEdit size={14} />, color: 'text-blue-400' },
}

function getFileName(filePath: string): string {
  return filePath.split('/').pop() || filePath
}

function getFileDir(filePath: string): string {
  const parts = filePath.split('/')
  if (parts.length <= 1) return ''
  return parts.slice(0, -1).join('/') + '/'
}

export function GitDiffDialog({
  isOpen,
  onClose,
  projectPath,
  branchName,
}: GitDiffDialogProps): React.ReactElement | null {
  useSuspendVimNavigation(isOpen)

  const previousFocusRef = useRef<HTMLElement | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  // Capture focus on open, restore on close
  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement | null
      setTimeout(() => dialogRef.current?.focus(), 0)
    }
    return () => {
      restoreFocusSafely(previousFocusRef.current)
      previousFocusRef.current = null
    }
  }, [isOpen])

  const [files, setFiles] = useState<ChangedFile[]>([])
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [diffLines, setDiffLines] = useState<SideBySideLine[]>([])
  const [isLoadingFiles, setIsLoadingFiles] = useState(false)
  const [isLoadingDiff, setIsLoadingDiff] = useState(false)
  const [filesError, setFilesError] = useState<string | null>(null)
  const [diffError, setDiffError] = useState<string | null>(null)
  const [focusedFileIndex, setFocusedFileIndex] = useState(0)

  const leftScrollRef = useRef<HTMLDivElement>(null)
  const rightScrollRef = useRef<HTMLDivElement>(null)
  const fileListRef = useRef<HTMLDivElement>(null)
  const isSyncing = useRef(false)

  // Load changed files on open
  useEffect(() => {
    if (!isOpen) return

    setIsLoadingFiles(true)
    setFiles([])
    setSelectedFile(null)
    setDiffLines([])
    setFilesError(null)
    setDiffError(null)
    setFocusedFileIndex(0)

    window.electronAPI.git.worktreeChangedFiles(projectPath, branchName)
      .then((result) => {
        setFiles(result.files)
        setFilesError(result.error ?? null)
        setFocusedFileIndex(0)
        if (!result.error && result.files.length > 0) {
          setSelectedFile(result.files[0].path)
        }
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : 'Failed to load changed files'
        setFiles([])
        setFilesError(message)
      })
      .finally(() => setIsLoadingFiles(false))
  }, [isOpen, projectPath, branchName])

  // Load diff when file selected
  useEffect(() => {
    if (!selectedFile || !isOpen) return

    setIsLoadingDiff(true)
    setDiffLines([])
    setDiffError(null)

    window.electronAPI.git.worktreeFileDiff(projectPath, branchName, selectedFile)
      .then((result) => {
        setDiffError(result.error ?? null)
        const parsed = parseUnifiedDiff(result.diff)
        setDiffLines(parsed)
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : 'Failed to load file diff'
        setDiffLines([])
        setDiffError(message)
      })
      .finally(() => setIsLoadingDiff(false))
  }, [selectedFile, isOpen, projectPath, branchName])

  // Synchronized scrolling
  const handleLeftScroll = useCallback(() => {
    if (isSyncing.current) return
    isSyncing.current = true
    if (leftScrollRef.current && rightScrollRef.current) {
      rightScrollRef.current.scrollTop = leftScrollRef.current.scrollTop
    }
    isSyncing.current = false
  }, [])

  const handleRightScroll = useCallback(() => {
    if (isSyncing.current) return
    isSyncing.current = true
    if (leftScrollRef.current && rightScrollRef.current) {
      leftScrollRef.current.scrollTop = rightScrollRef.current.scrollTop
    }
    isSyncing.current = false
  }, [])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (isCloseShortcut(e) || e.key.toLowerCase() === 'q') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
        return
      }

      if (files.length === 0) return

      if (e.key === 'j') {
        e.preventDefault()
        const newIndex = (focusedFileIndex + 1) % files.length
        setFocusedFileIndex(newIndex)
        const targetFile = files[newIndex]
        setSelectedFile(targetFile.path)
        const fileEl = fileListRef.current?.querySelector(`[data-testid="diff-file-${CSS.escape(targetFile.path)}"]`)
        if (fileEl) {
          fileEl.scrollIntoView({ block: 'nearest' })
        }
      } else if (e.key === 'k') {
        e.preventDefault()
        const newIndex = (focusedFileIndex - 1 + files.length) % files.length
        setFocusedFileIndex(newIndex)
        const targetFile = files[newIndex]
        setSelectedFile(targetFile.path)
        const fileEl = fileListRef.current?.querySelector(`[data-testid="diff-file-${CSS.escape(targetFile.path)}"]`)
        if (fileEl) {
          fileEl.scrollIntoView({ block: 'nearest' })
        }
      }
    },
    [onClose, files, focusedFileIndex],
  )

  if (!isOpen) return null

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-[70] flex flex-col bg-[var(--color-bg-secondary)] outline-none"
      onKeyDown={handleKeyDown}
      tabIndex={-1}
      data-testid="git-diff-dialog"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--color-border-primary)] bg-[var(--color-bg-tertiary)] flex-shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Compare Changes</h2>
          <span className="text-xs text-[var(--color-text-tertiary)]">
            {branchName} &rarr; main
          </span>
          {files.length > 0 && (
            <span className="px-1.5 py-0.5 text-[10px] font-medium bg-blue-600/20 text-blue-400 rounded">
              {files.length} file{files.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--color-text-tertiary)]">
            <kbd className="inline-block px-1 py-0.5 bg-[var(--color-bg-tertiary)] rounded text-[var(--color-text-muted)]">j</kbd>
            {' '}<kbd className="inline-block px-1 py-0.5 bg-[var(--color-bg-tertiary)] rounded text-[var(--color-text-muted)]">k</kbd>
            {' '}navigate
          </span>
          <kbd className="text-xs bg-[var(--color-bg-tertiary)] px-1.5 py-0.5 rounded text-[var(--color-text-muted)]">q</kbd>
          <button
            data-testid="diff-dialog-close"
            onClick={onClose}
            className="p-1.5 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-primary)] rounded transition-colors"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* File sidebar */}
        <div className="w-64 overflow-y-auto border-r border-[var(--color-border-primary)] bg-[var(--color-bg-tertiary)] flex-shrink-0">
          {isLoadingFiles ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={20} className="animate-spin text-[var(--color-text-tertiary)]" />
            </div>
          ) : filesError ? (
            <div className="p-3 text-xs text-red-400">
              <div className="flex items-start gap-2">
                <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                <p className="break-words">{filesError}</p>
              </div>
            </div>
          ) : files.length === 0 ? (
            <div className="p-4 text-xs text-[var(--color-text-tertiary)] text-center">
              No files changed
            </div>
          ) : (
            <div className="py-1" ref={fileListRef}>
              {files.map((file, index) => {
                const statusInfo = statusIcons[file.status] || statusIcons.M
                const isSelected = file.path === selectedFile
                const isFocused = index === focusedFileIndex
                return (
                  <button
                    key={file.path}
                    data-testid={`diff-file-${file.path}`}
                    onClick={() => {
                      setSelectedFile(file.path)
                      setFocusedFileIndex(index)
                    }}
                    className={`w-full text-left px-3 py-1.5 flex items-center gap-2 text-xs hover:bg-[var(--color-bg-hover)] transition-colors ${
                      isSelected ? 'bg-[var(--color-bg-primary)]' : ''
                    } ${isFocused ? 'ring-1 ring-[var(--color-border-secondary)]' : ''}`}
                  >
                    <span className={`flex-shrink-0 ${statusInfo.color}`}>
                      {statusInfo.icon}
                    </span>
                    <span className="truncate text-[var(--color-text-primary)]" title={file.path}>
                      <span className="text-[var(--color-text-tertiary)]">{getFileDir(file.path)}</span>
                      {getFileName(file.path)}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Diff content area */}
        <div className="flex-1 overflow-hidden flex">
          {isLoadingDiff ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 size={24} className="animate-spin text-[var(--color-text-tertiary)]" />
            </div>
          ) : diffError ? (
            <div className="flex-1 flex items-center justify-center text-sm text-red-400 px-8">
              <div className="text-center max-w-2xl">
                <AlertTriangle size={32} className="mx-auto mb-2" />
                <p className="break-words">{diffError}</p>
              </div>
            </div>
          ) : !selectedFile ? (
            <div className="flex-1 flex items-center justify-center text-sm text-[var(--color-text-tertiary)]">
              <div className="text-center">
                <FileText size={32} className="mx-auto mb-2 opacity-50" />
                <p>Select a file to view changes</p>
              </div>
            </div>
          ) : diffLines.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-sm text-[var(--color-text-tertiary)]">
              <div className="text-center">
                <FileText size={32} className="mx-auto mb-2 opacity-50" />
                <p>No diff available for this file</p>
              </div>
            </div>
          ) : (
            <>
              {/* Left column (old/removed) */}
              <div
                ref={leftScrollRef}
                onScroll={handleLeftScroll}
                className="flex-1 overflow-auto border-r border-[var(--color-border-primary)]"
              >
                <table className="w-full border-collapse font-mono text-xs">
                  <tbody>
                    {diffLines.map((pair, i) => {
                      const line = pair.left
                      if (line.type === 'hunk-header') {
                        return (
                          <tr key={i} className="bg-blue-900/20">
                            <td colSpan={2} className="px-3 py-1 text-blue-400 text-[10px]">
                              {line.content}
                            </td>
                          </tr>
                        )
                      }
                      const bgClass =
                        line.type === 'removed' ? 'bg-red-900/30' :
                        line.type === 'empty' ? 'bg-[var(--color-bg-tertiary)]' : ''
                      const textClass =
                        line.type === 'removed' ? 'text-red-300' :
                        line.type === 'empty' ? '' : 'text-[var(--color-text-secondary)]'
                      return (
                        <tr key={i} className={bgClass}>
                          <td className="w-12 px-2 py-0 text-right text-[var(--color-text-tertiary)] select-none border-r border-[var(--color-border-primary)] text-[10px]">
                            {line.lineNumber ?? ''}
                          </td>
                          <td className={`px-3 py-0 whitespace-pre ${textClass}`}>
                            {line.content}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Right column (new/added) */}
              <div
                ref={rightScrollRef}
                onScroll={handleRightScroll}
                className="flex-1 overflow-auto"
              >
                <table className="w-full border-collapse font-mono text-xs">
                  <tbody>
                    {diffLines.map((pair, i) => {
                      const line = pair.right
                      if (line.type === 'hunk-header') {
                        return (
                          <tr key={i} className="bg-blue-900/20">
                            <td colSpan={2} className="px-3 py-1 text-blue-400 text-[10px]">
                              {line.content}
                            </td>
                          </tr>
                        )
                      }
                      const bgClass =
                        line.type === 'added' ? 'bg-green-900/30' :
                        line.type === 'empty' ? 'bg-[var(--color-bg-tertiary)]' : ''
                      const textClass =
                        line.type === 'added' ? 'text-green-300' :
                        line.type === 'empty' ? '' : 'text-[var(--color-text-secondary)]'
                      return (
                        <tr key={i} className={bgClass}>
                          <td className="w-12 px-2 py-0 text-right text-[var(--color-text-tertiary)] select-none border-r border-[var(--color-border-primary)] text-[10px]">
                            {line.lineNumber ?? ''}
                          </td>
                          <td className={`px-3 py-0 whitespace-pre ${textClass}`}>
                            {line.content}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
