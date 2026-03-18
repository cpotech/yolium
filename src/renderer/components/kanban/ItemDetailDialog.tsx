/**
 * @module src/components/ItemDetailDialog
 * Dialog for viewing and editing kanban item details with agent controls.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import type { KanbanItem } from '@shared/types/kanban'
import { trapFocus } from '@shared/lib/focus-trap'
import { useAgentSession } from '@renderer/hooks/useAgentSession'
import { useSuspendVimNavigation, useVimModeContext } from '@renderer/context/VimModeContext'
import { AgentLogPanel } from '../agent/AgentLogPanel'
import { GitDiffDialog } from '../code-review/GitDiffDialog'
import { ItemDetailEditorPane } from './item-detail/ItemDetailEditorPane'
import { ItemDetailSidebar } from './item-detail/ItemDetailSidebar'
import { useItemDetailDraft } from './item-detail/useItemDetailDraft'
import { useItemDetailAgentLifecycle } from './item-detail/useItemDetailAgentLifecycle'
import { useItemDetailPrWorkflow } from './item-detail/useItemDetailPrWorkflow'
import { StatusBar } from '@renderer/components/StatusBar'
import type { WhisperRecordingState, WhisperModelSize } from '@shared/types/whisper'
import type { ClaudeUsageState } from '@shared/types/agent'
import { isCloseShortcut } from '@renderer/lib/dialog-shortcuts'

const FIELD_IDS = ['detail-title', 'detail-description', 'comment-input']

interface ItemDetailDialogProps {
  isOpen: boolean
  item: KanbanItem | null
  projectPath: string
  onClose: () => void
  onUpdated: () => void
  // StatusBar props
  onShowShortcuts?: () => void
  onOpenSettings?: () => void
  onOpenProjectSettings?: () => void
  whisperRecordingState?: WhisperRecordingState
  whisperSelectedModel?: WhisperModelSize
  onToggleRecording?: () => void
  onOpenModelDialog?: () => void
  claudeUsage?: ClaudeUsageState
}

export function ItemDetailDialog({
  isOpen,
  item,
  projectPath,
  onClose,
  onUpdated,
  // StatusBar props
  onShowShortcuts,
  onOpenSettings,
  onOpenProjectSettings,
  whisperRecordingState,
  whisperSelectedModel,
  onToggleRecording,
  onOpenModelDialog,
  claudeUsage,
}: ItemDetailDialogProps): React.ReactElement | null {
  useSuspendVimNavigation(isOpen)
  const vim = useVimModeContext()

  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDiffViewer, setShowDiffViewer] = useState(false)
  const [focusedFieldIndex, setFocusedFieldIndex] = useState(0)
  const [focusZone, setFocusZone] = useState<'editor' | 'sidebar'>('editor')
  const answerInputRef = useRef<HTMLTextAreaElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const gPendingRef = useRef(false)

  const agentSession = useAgentSession({
    itemId: item?.id,
    itemAgentStatus: item?.agentStatus,
    projectPath,
    onUpdated,
  })

  const draft = useItemDetailDraft({
    item,
    isOpen,
    projectPath,
    onUpdated,
    setErrorMessage,
  })

  const lifecycle = useItemDetailAgentLifecycle({
    item,
    projectPath,
    onUpdated,
    setErrorMessage,
    draft: {
      agentProvider: draft.agentProvider,
      hasUnsavedChanges: draft.hasUnsavedChanges,
      flushDraft: draft.flushDraft,
    },
    agentSession: {
      currentSessionId: agentSession.currentSessionId,
      currentDetail: agentSession.currentDetail,
      prepareForRun: agentSession.prepareForRun,
      associateSession: agentSession.associateSession,
      appendOutputLine: agentSession.appendOutputLine,
      setRunStatus: agentSession.setRunStatus,
    },
  })

  const prWorkflow = useItemDetailPrWorkflow({
    item,
    projectPath,
    onUpdated,
    setErrorMessage,
  })

  // Focus sentinel: reclaim focus when it escapes the dialog container
  const handleBlur = useCallback((event: React.FocusEvent) => {
    if (!event.relatedTarget || !dialogRef.current?.contains(event.relatedTarget as Node)) {
      requestAnimationFrame(() => {
        if (isOpen && dialogRef.current && !dialogRef.current.contains(document.activeElement)) {
          dialogRef.current.focus()
        }
      })
    }
  }, [isOpen])

  // Focus dialog container when dialog opens so keyboard navigation works immediately
  useEffect(() => {
    if (isOpen) {
      dialogRef.current?.focus()
      setFocusedFieldIndex(0)
      setFocusZone('editor')
    }
  }, [isOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (item?.agentStatus === 'waiting' && item.agentQuestion && answerInputRef.current) {
      answerInputRef.current.focus()
    }
  }, [item?.agentQuestion, item?.agentStatus])

  const handleDelete = useCallback(async () => {
    if (!item || isDeleting) return

    setIsDeleting(true)
    try {
      await window.electronAPI.kanban.deleteItem(projectPath, item.id)
      onUpdated()
      onClose()
    } catch (error) {
      console.error('Failed to delete item:', error)
      setErrorMessage('Failed to delete item. Please try again.')
    } finally {
      setIsDeleting(false)
    }
  }, [isDeleting, item, onClose, onUpdated, projectPath])

  const handleFixConflicts = useCallback(async () => {
    await prWorkflow.fixConflicts()
    await lifecycle.startAgent('code-agent')
  }, [prWorkflow, lifecycle])

  const handleClose = useCallback(() => {
    if (draft.hasUnsavedChanges && draft.title.trim()) {
      void draft.flushDraft('close')
    }
    onClose()
  }, [draft, onClose])

  const focusField = useCallback((index: number) => {
    const el = document.getElementById(FIELD_IDS[index])
    if (el) {
      el.focus()
      el.scrollIntoView?.({ block: 'nearest' })
    }
    vim.enterInsertMode()
    setFocusedFieldIndex(index)
  }, [vim])

  const handleFieldFocus = useCallback((index: number) => {
    vim.enterInsertMode()
    setFocusedFieldIndex(index)
  }, [vim])

  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    // Ctrl+Enter to save
    if (event.key === 'Enter' && event.ctrlKey && draft.saveStatus !== 'saving' && draft.title.trim().length > 0) {
      event.preventDefault()
      void draft.flushDraft('manual')
      return
    }
    // Ctrl+Delete to delete
    if (event.key === 'Delete' && event.ctrlKey && !isDeleting) {
      event.preventDefault()
      void handleDelete()
      return
    }
    // Agent shortcuts: Ctrl+Shift+{S,D,M}
    if (event.ctrlKey && event.shiftKey && item) {
      const agentKeyMap: Record<string, string> = {
        S: 'scout-agent',
        D: 'design-agent',
        M: 'marketing-agent',
      }
      const agentName = agentKeyMap[event.key.toUpperCase()]
      if (agentName) {
        const target = event.target as HTMLElement
        const tagName = target.tagName.toLowerCase()
        const isEditable = tagName === 'input' || tagName === 'textarea' || tagName === 'select' || target.isContentEditable
        const canStart = item.agentStatus === 'idle' || item.agentStatus === 'completed' || item.agentStatus === 'failed'
        if (!isEditable && canStart && !lifecycle.isStartingAgent) {
          event.preventDefault()
          void lifecycle.startAgent(agentName)
        }
      }
    }

    // Ctrl+Q to close dialog
    if (isCloseShortcut(event)) {
      event.preventDefault()
      handleClose()
      return
    }

    // Vim-mode-aware Escape handling
    if (event.key === 'Escape') {
      event.preventDefault()
      if (vim.mode === 'INSERT') {
        vim.exitToNormal()
        dialogRef.current?.focus()
      } else if (focusZone === 'sidebar') {
        // Sidebar zone Escape -> return to editor zone
        setFocusZone('editor')
        dialogRef.current?.focus()
      }
      return
    }

    // NORMAL mode navigation and sidebar shortcuts
    if (vim.mode === 'NORMAL') {
      const target = event.target as HTMLElement
      const tagName = target.tagName.toLowerCase()
      const isEditable = tagName === 'input' || tagName === 'textarea' || tagName === 'select' || target.isContentEditable
      if (isEditable) return

      // Tab toggles focus zone between editor and sidebar
      if (event.key === 'Tab' && !event.shiftKey) {
        event.preventDefault()
        setFocusZone(prev => prev === 'editor' ? 'sidebar' : 'editor')
        dialogRef.current?.focus()
        return
      }

      // Single-key sidebar shortcuts
      if (focusZone === 'sidebar' && item) {
        const canStart = (item.agentStatus === 'idle' || item.agentStatus === 'completed' || item.agentStatus === 'failed') && !lifecycle.isStartingAgent
        const sidebarAgentKeyMap: Record<string, string> = {
          p: 'plan-agent',
          c: 'code-agent',
          v: 'verify-agent',
          s: 'scout-agent',
          D: 'design-agent',
          m: 'marketing-agent',
        }
        const agentName = sidebarAgentKeyMap[event.key]
        if (agentName && canStart) {
          event.preventDefault()
          void lifecycle.startAgent(agentName)
          return
        }
        if (event.key === 'x' && item.agentStatus === 'running' && agentSession.currentSessionId) {
          event.preventDefault()
          void lifecycle.stopAgent()
          return
        }
        if (event.key === 'd' && !event.shiftKey && !isDeleting) {
          event.preventDefault()
          void handleDelete()
          return
        }
        // Merge/PR shortcuts
        if (event.key === 'f' && item.branch && item.mergeStatus) {
          event.preventDefault()
          setShowDiffViewer(true)
          return
        }
        if (event.key === 'r' && item.worktreePath && !prWorkflow.isRebasing) {
          event.preventDefault()
          void prWorkflow.rebaseOntoDefault()
          return
        }
        if (event.key === 'k' && item.mergeStatus && !prWorkflow.isCheckingConflicts) {
          event.preventDefault()
          void prWorkflow.checkConflicts()
          return
        }
        if (event.key === 'g' && (item.agentStatus === 'completed' || item.column === 'done' || item.column === 'verify') && !prWorkflow.isMerging) {
          event.preventDefault()
          void prWorkflow.mergeAndPushPr()
          return
        }
        if (event.key === 'a' && item.mergeStatus === 'merged' && prWorkflow.prUrl && !prWorkflow.isApprovingPr && !prWorkflow.isMergingPr) {
          event.preventDefault()
          void prWorkflow.approvePr()
          return
        }
        if (event.key === 'w' && item.mergeStatus === 'merged' && prWorkflow.prUrl && !prWorkflow.isMergingPr && !prWorkflow.isApprovingPr) {
          event.preventDefault()
          void prWorkflow.mergePr()
          return
        }
        if (event.key === 'o' && prWorkflow.prUrl) {
          event.preventDefault()
          window.electronAPI.app.openExternal(prWorkflow.prUrl)
          return
        }
      }

      // Editor zone field navigation
      if (focusZone === 'editor') {
        if (event.key === 'j' || event.key === 'ArrowDown') {
          event.preventDefault()
          const next = Math.min(focusedFieldIndex + 1, FIELD_IDS.length - 1)
          setFocusedFieldIndex(next)
          document.getElementById(FIELD_IDS[next])?.scrollIntoView({ block: 'nearest' })
          gPendingRef.current = false
        } else if (event.key === 'k' || event.key === 'ArrowUp') {
          event.preventDefault()
          const prev = Math.max(focusedFieldIndex - 1, 0)
          setFocusedFieldIndex(prev)
          document.getElementById(FIELD_IDS[prev])?.scrollIntoView({ block: 'nearest' })
          gPendingRef.current = false
        } else if (event.key === 'g') {
          if (gPendingRef.current) {
            event.preventDefault()
            setFocusedFieldIndex(0)
            document.getElementById(FIELD_IDS[0])?.scrollIntoView({ block: 'nearest' })
            gPendingRef.current = false
          } else {
            gPendingRef.current = true
          }
        } else if (event.key === 'G') {
          event.preventDefault()
          const last = FIELD_IDS.length - 1
          setFocusedFieldIndex(last)
          document.getElementById(FIELD_IDS[last])?.scrollIntoView({ block: 'nearest' })
          gPendingRef.current = false
        } else if (event.key === 'i' || event.key === 'Enter') {
          event.preventDefault()
          focusField(focusedFieldIndex)
          gPendingRef.current = false
        } else {
          gPendingRef.current = false
        }
      }
    }

    // Only run trapFocus for Tab in INSERT mode (NORMAL mode Tab is handled above)
    if (dialogRef.current && !(vim.mode === 'NORMAL' && event.key === 'Tab')) {
      trapFocus(event, dialogRef.current)
    }
  }, [draft, handleClose, handleDelete, isDeleting, item, lifecycle, vim, focusedFieldIndex, focusField, focusZone, agentSession.currentSessionId, prWorkflow])

  if (!isOpen || !item) return null

  const kbdClass = 'px-1.5 py-0.5 text-xs bg-[var(--color-bg-tertiary)] rounded border border-[var(--color-border-primary)]'

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex flex-col bg-[var(--color-bg-secondary)] outline-none"
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
    >
      <div
        data-testid="item-detail-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`Item details: ${item.title}`}
        className="flex flex-col flex-1 min-h-0"
      >
        <div className="flex items-center justify-between px-6 py-3 border-b border-[var(--color-border-primary)] bg-[var(--color-bg-tertiary)]">
          <h2 className="text-base font-semibold text-[var(--color-text-primary)] truncate min-w-0">
            {item.title || 'Untitled Item'}
          </h2>
          <div className="flex items-center gap-2">
            <kbd className="text-xs bg-[var(--color-bg-tertiary)] px-1.5 py-0.5 rounded text-[var(--color-text-muted)]">Ctrl+Q</kbd>
            <button
              data-testid="close-button"
              data-vim-key="Escape"
              onClick={handleClose}
              className="p-1.5 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-primary)] rounded transition-colors flex-shrink-0"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {errorMessage && (
          <div className="flex items-center justify-between px-6 py-2 bg-red-900/30 border-b border-red-700/50 text-red-300 text-sm">
            <span>{errorMessage}</span>
            <button
              onClick={() => setErrorMessage(null)}
              className="p-1 hover:text-[var(--color-text-primary)] transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        )}

        <div className="flex flex-1 overflow-hidden">
          <div
            data-testid="editor-zone"
            className={`flex-1 min-w-0 flex flex-col overflow-hidden${focusZone === 'editor' ? ' ring-1 ring-[var(--color-accent-primary)]' : ''}`}
          >
          <ItemDetailEditorPane
            title={draft.title}
            description={draft.description}
            comments={item.comments}
            commentText={lifecycle.commentText}
            isAddingComment={lifecycle.isAddingComment}
            onTitleChange={draft.setTitle}
            onDescriptionChange={draft.setDescription}
            onCommentTextChange={lifecycle.setCommentText}
            onAddComment={() => void lifecycle.addComment()}
            onSelectCommentOption={lifecycle.setAnswerText}
            vimMode={vim.mode}
            focusedFieldIndex={focusedFieldIndex}
            onFieldFocus={handleFieldFocus}
          />
          </div>

          <ItemDetailSidebar
            focusZone={focusZone}
            showKbdHints={focusZone === 'sidebar'}
            item={item}
            agentProvider={draft.agentProvider}
            model={draft.model}
            column={draft.column}
            verified={draft.verified}
            providerModels={draft.providerModels}
            saveStatus={draft.saveStatus}
            isDeleting={isDeleting}
            answerText={lifecycle.answerText}
            isStartingAgent={lifecycle.isStartingAgent}
            isAnswering={lifecycle.isAnswering}
            currentSessionId={agentSession.currentSessionId}
            currentDetail={agentSession.currentDetail}
            tokenUsage={agentSession.tokenUsage}
            answerInputRef={answerInputRef}
            prUrl={prWorkflow.prUrl}
            conflictCheck={prWorkflow.conflictCheck}
            rebaseResult={prWorkflow.rebaseResult}
            isMerging={prWorkflow.isMerging}
            isCheckingConflicts={prWorkflow.isCheckingConflicts}
            isRebasing={prWorkflow.isRebasing}
            isApprovingPr={prWorkflow.isApprovingPr}
            isMergingPr={prWorkflow.isMergingPr}
            onSetAgentProvider={draft.setAgentProvider}
            onSetModel={draft.setModel}
            onSetColumn={draft.setColumn}
            onSetVerified={draft.setVerified}
            onDelete={() => void handleDelete()}
            onStartAgent={agentName => void lifecycle.startAgent(agentName)}
            onResumeAgent={agentName => void lifecycle.resumeAgent(agentName)}
            onStopAgent={() => void lifecycle.stopAgent()}
            onAnswerQuestion={() => void lifecycle.answerQuestion()}
            onSetAnswerText={lifecycle.setAnswerText}
            onCompareChanges={() => setShowDiffViewer(true)}
            onOpenPr={() => {
              if (prWorkflow.prUrl) {
                window.electronAPI.app.openExternal(prWorkflow.prUrl)
              }
            }}
            onApprovePr={() => void prWorkflow.approvePr()}
            onMergePr={() => void prWorkflow.mergePr()}
            onCheckConflicts={() => void prWorkflow.checkConflicts()}
            onRebase={() => void prWorkflow.rebaseOntoDefault()}
            onMerge={() => void prWorkflow.mergeAndPushPr()}
            onFixConflicts={() => void handleFixConflicts()}
            isFixingConflicts={prWorkflow.isFixingConflicts}
            onUpdated={onUpdated}
          />
        </div>

         {(agentSession.showAgentLog || agentSession.agentOutputLines.length > 0) && (
           <div className="border-t border-[var(--color-border-primary)] bg-[var(--color-bg-tertiary)]">
             <AgentLogPanel
               outputLines={agentSession.agentOutputLines}
               onClear={agentSession.clearAgentOutput}
             />
           </div>
         )}
       </div>

        {/* Shortcuts hint bar */}
        <div
          data-testid="shortcuts-hint-bar"
          className="flex items-center gap-3 px-4 py-1.5 bg-[var(--color-bg-tertiary)] border-t border-[var(--color-border-primary)] text-xs text-[var(--color-text-muted)]"
        >
          {vim.mode === 'NORMAL' ? (
            focusZone === 'editor' ? (
              <>
                <span><kbd className={kbdClass}>j/k</kbd> Navigate</span>
                <span><kbd className={kbdClass}>gg</kbd> First</span>
                <span><kbd className={kbdClass}>G</kbd> Last</span>
                <span><kbd className={kbdClass}>i</kbd> Edit field</span>
                <span><kbd className={kbdClass}>Tab</kbd> Sidebar</span>
                <span><kbd className={kbdClass}>Ctrl+Q</kbd> Close</span>
              </>
            ) : (
              <>
                <span><kbd className={kbdClass}>Tab</kbd> Editor</span>
                <span><kbd className={kbdClass}>p</kbd> Plan</span>
                <span><kbd className={kbdClass}>c</kbd> Code</span>
                <span><kbd className={kbdClass}>v</kbd> Verify</span>
                <span><kbd className={kbdClass}>x</kbd> Stop</span>
                <span><kbd className={kbdClass}>d</kbd> Delete</span>
                <span><kbd className={kbdClass}>f</kbd> Diff</span>
                <span><kbd className={kbdClass}>g</kbd> Merge</span>
                <span><kbd className={kbdClass}>Esc</kbd> Back</span>
              </>
            )
          ) : (
            <>
              <span><kbd className={kbdClass}>Esc</kbd> Normal mode</span>
              <span><kbd className={kbdClass}>Ctrl+Enter</kbd> Save</span>
              <span><kbd className={kbdClass}>Ctrl+Del</kbd> Delete</span>
            </>
          )}
        </div>

        {/* StatusBar at the bottom of the dialog */}
        <StatusBar
          folderPath={projectPath}
          contextLabel={item.branch}
          gitBranch={item.branch}
          worktreeName={item.worktreePath ? item.worktreePath.split('/').pop() : undefined}
          onShowShortcuts={onShowShortcuts ?? (() => {})}
          onOpenSettings={onOpenSettings ?? (() => {})}
          onOpenProjectSettings={onOpenProjectSettings ?? (() => {})}
          whisperRecordingState={whisperRecordingState ?? 'idle'}
          whisperSelectedModel={whisperSelectedModel ?? 'small'}
          onToggleRecording={onToggleRecording ?? (() => {})}
          onOpenModelDialog={onOpenModelDialog ?? (() => {})}
          claudeUsage={claudeUsage}
        />

       {item.branch && (
         <GitDiffDialog
           isOpen={showDiffViewer}
           onClose={() => setShowDiffViewer(false)}
           projectPath={projectPath}
           branchName={item.branch}
         />
       )}
     </div>
   )
}
