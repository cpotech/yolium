/**
 * @module src/components/ItemDetailDialog
 * Dialog for viewing and editing kanban item details with agent controls.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import type { KanbanColumn, KanbanItem } from '@shared/types/kanban'
import type { AgentDefinition } from '@shared/types/agent'
import { trapFocus } from '@shared/lib/focus-trap'
import { useAgentSession } from '@renderer/hooks/useAgentSession'
import { useSuspendVimNavigation, useVimModeContext } from '@renderer/context/VimModeContext'
import { AgentLogPanel, type AgentLogPanelHandle } from '../agent/AgentLogPanel'
import { GitDiffDialog } from '../code-review/GitDiffDialog'
import { ItemDetailEditorPane } from './item-detail/ItemDetailEditorPane'
import { ItemDetailInfoBar } from './item-detail/ItemDetailInfoBar'
import { ItemDetailMergeBar } from './item-detail/ItemDetailMergeBar'
import { ItemDetailSidebar } from './item-detail/ItemDetailSidebar'
import { BrowserPreviewPanel } from './item-detail/BrowserPreviewPanel'
import { useBrowserPreview } from '@renderer/hooks/useBrowserPreview'
import { useDevServer } from '@renderer/hooks/useDevServer'
import { useItemDetailDraft } from './item-detail/useItemDetailDraft'
import { useItemDetailAgentLifecycle } from './item-detail/useItemDetailAgentLifecycle'
import { useItemDetailPrWorkflow } from './item-detail/useItemDetailPrWorkflow'
import { ConfirmDialog } from '@renderer/components/shared/ConfirmDialog'
import type { CommentsListHandle } from './CommentsList'
import { StatusBar } from '@renderer/components/StatusBar'
import type { WhisperRecordingState, WhisperModelSize } from '@shared/types/whisper'
import type { ClaudeUsageState } from '@shared/types/agent'
import { isCloseShortcut } from '@renderer/lib/dialog-shortcuts'
import { useVimListNavigation } from '@renderer/hooks/useVimListNavigation'

type NavigableItem =
  | { type: 'field'; id: string }
  | { type: 'comment'; id: string; text: string }

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
  const [focusedItemIndex, setFocusedItemIndex] = useState(0)
  const [dialogVisualMode, setDialogVisualMode] = useState(false)
  const [selectedItemIndices, setSelectedItemIndices] = useState<Set<number>>(new Set())
  const visualAnchorRef = useRef<number>(0)
  const [logFocused, setLogFocused] = useState(false)
  const [browserFocused, setBrowserFocused] = useState(false)
  const [sortedAgents, setSortedAgents] = useState<AgentDefinition[]>([])
  const dialogRef = useRef<HTMLDivElement>(null)
  const logPanelRef = useRef<AgentLogPanelHandle>(null)
  const commentSearchRef = useRef<CommentsListHandle>(null)

  const navigableItems: NavigableItem[] = useMemo(() => [
    { type: 'field', id: 'detail-title' },
    { type: 'field', id: 'detail-description' },
    { type: 'field', id: 'comment-input' },
    ...(item?.comments ?? []).slice().reverse().map(c => ({ type: 'comment' as const, id: c.id, text: c.text })),
  ], [item?.comments])

  // Fetch sorted agent definitions for numbered dispatch
  useEffect(() => {
    if (!isOpen) return
    window.electronAPI.agent.listDefinitions().then(defs => {
      setSortedAgents(defs) // Already sorted by order from IPC handler
    }).catch(() => {})
  }, [isOpen])

  const agentSession = useAgentSession({
    itemId: item?.id,
    itemAgentStatus: item?.agentStatus,
    projectPath,
    onUpdated,
  })

  const browserPreview = useBrowserPreview(item?.id ?? null, projectPath ?? null)

  const devServer = useDevServer({
    itemId: item?.id ?? null,
    projectPath: projectPath ?? null,
    currentSessionId: agentSession.currentSessionId,
    portMappings: browserPreview.portMappings,
    onServerRunning: useCallback(() => {
      if (!browserPreview.isOpen) {
        browserPreview.toggle()
      }
    }, [browserPreview.isOpen, browserPreview.toggle]),
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
      vim.exitToNormal()
      dialogRef.current?.focus()
      setFocusedItemIndex(0)
      setDialogVisualMode(false)
      setSelectedItemIndices(new Set())
      visualAnchorRef.current = 0
      setLogFocused(false)
      setBrowserFocused(false)
    }
  }, [isOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reset transient state when switching to a different work item
  useEffect(() => {
    setErrorMessage(null)
    setShowDiffViewer(false)
    setFocusedItemIndex(0)
    setDialogVisualMode(false)
    setSelectedItemIndices(new Set())
    setLogFocused(false)
    setBrowserFocused(false)
    setIsDeleting(false)
  }, [item?.id]) // eslint-disable-line react-hooks/exhaustive-deps

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
    const item = navigableItems[index]
    if (item?.type === 'field') {
      const el = document.getElementById(item.id)
      if (el) {
        el.focus()
        el.scrollIntoView?.({ block: 'nearest' })
      }
      vim.enterInsertMode()
    }
    setFocusedItemIndex(index)
  }, [vim, navigableItems])

  const scrollToItem = useCallback((idx: number) => {
    const navItem = navigableItems[idx]
    if (navItem?.type === 'field') {
      document.getElementById(navItem.id)?.scrollIntoView({ block: 'nearest' })
    } else if (navItem) {
      document.querySelector(`[data-comment-id="${navItem.id}"]`)?.scrollIntoView({ block: 'nearest' })
    }
  }, [navigableItems])

  const handleFieldNavIndexChange = useCallback((newIndex: number) => {
    setFocusedItemIndex(newIndex)
    scrollToItem(newIndex)
    if (dialogVisualMode) {
      const anchor = visualAnchorRef.current
      const start = Math.min(anchor, newIndex)
      const end = Math.max(anchor, newIndex)
      setSelectedItemIndices(new Set(Array.from({ length: end - start + 1 }, (_, i) => start + i)))
    }
  }, [scrollToItem, dialogVisualMode])

  const { handleNavKeys: handleFieldNavKeys } = useVimListNavigation({
    itemCount: navigableItems.length,
    enabled: vim.mode === 'NORMAL' && isOpen,
    onIndexChange: handleFieldNavIndexChange,
    currentIndex: focusedItemIndex,
    wrap: false,
  })

  // Map field DOM index (0=title, 1=desc, 2=comment-input) to navigableItems index
  const handleFieldFocus = useCallback((fieldIndex: number) => {
    const fieldIds = ['detail-title', 'detail-description', 'comment-input']
    const fieldId = fieldIds[fieldIndex]
    const navIndex = navigableItems.findIndex(it => it.type === 'field' && it.id === fieldId)
    if (navIndex >= 0) {
      vim.enterInsertMode()
      setFocusedItemIndex(navIndex)
    }
  }, [vim, navigableItems])

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
    // Ctrl+Q to close dialog
    if (isCloseShortcut(event)) {
      event.preventDefault()
      event.stopPropagation()
      handleClose()
      return
    }

    // Vim-mode-aware Escape handling
    if (event.key === 'Escape') {
      event.preventDefault()
      if (dialogVisualMode) {
        setDialogVisualMode(false)
        setSelectedItemIndices(new Set())
        return
      }
      if (vim.mode === 'INSERT') {
        vim.exitToNormal()
        dialogRef.current?.focus()
      } else if (browserFocused) {
        setBrowserFocused(false)
        dialogRef.current?.focus()
      } else if (logFocused) {
        setLogFocused(false)
        logPanelRef.current?.resumeAutoScroll()
        dialogRef.current?.focus()
      }
      return
    }

    // NORMAL mode navigation and sidebar shortcuts
    if (vim.mode === 'NORMAL') {
      // Ctrl+1-9: agent dispatch by sorted order
      if (event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey && item) {
        const digit = parseInt(event.key, 10)
        const canStart = (item.agentStatus === 'idle' || item.agentStatus === 'completed' || item.agentStatus === 'failed') && !lifecycle.isStartingAgent
        if (digit >= 1 && digit <= 9 && digit <= sortedAgents.length && canStart) {
          event.preventDefault()
          dialogRef.current?.focus()
          void lifecycle.startAgent(sortedAgents[digit - 1].name)
          return
        }
      }

      // 1b. Browser focus mode — keys control browser when focused
      if (browserFocused) {
        const plain = !event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey
        if (event.key === 'r' && plain) {
          event.preventDefault()
          browserPreview.reload()
          return
        }
        if (event.key === 'h' && plain) {
          event.preventDefault()
          browserPreview.goBack()
          return
        }
        if (event.key === 'l' && plain) {
          event.preventDefault()
          browserPreview.goForward()
          return
        }
        if (event.key === 'u' && plain) {
          event.preventDefault()
          browserPreview.urlBarRef.current?.focus()
          browserPreview.urlBarRef.current?.select()
          return
        }
      }

      // 2. Log focus mode — must be checked BEFORE sidebar shortcuts
      // so j/k always scroll the log when in log-focus mode
      if (logFocused) {
        if ((event.key === 'j' || event.key === 'k') && !event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey) {
          event.preventDefault()
          logPanelRef.current?.pauseAutoScroll()
          logPanelRef.current?.scrollBy(event.key === 'j' ? 80 : -80)
          return
        }
        // l in log focus collapses the log
        if (event.key === 'l' && !event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey) {
          event.preventDefault()
          setLogFocused(false)
          agentSession.toggleAgentLog()
          return
        }
      }

      // 2b. j/k with agent log open → enter log focus mode
      if (agentSession.showAgentLog && (event.key === 'j' || event.key === 'k') && !event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey) {
        event.preventDefault()
        setLogFocused(true)
        logPanelRef.current?.pauseAutoScroll()
        logPanelRef.current?.scrollBy(event.key === 'j' ? 80 : -80)
        return
      }

      // 3. Direct sidebar shortcuts (no leader prefix)
      if (item && !event.ctrlKey && !event.altKey && !event.metaKey) {
        const plain = !event.shiftKey

        if (event.key === 'b' && plain) {
          event.preventDefault()
          dialogRef.current?.focus()
          browserPreview.toggle()
          setBrowserFocused(!browserPreview.isOpen)
          return
        }
        if (event.key === 's' && plain && agentSession.currentSessionId) {
          event.preventDefault()
          dialogRef.current?.focus()
          devServer.start()
          return
        }
        if (event.key === 'd' && plain && !isDeleting) {
          event.preventDefault()
          dialogRef.current?.focus()
          void handleDelete()
          return
        }
        if (event.key === 'l' && plain) {
          event.preventDefault()
          agentSession.toggleAgentLog()
          if (agentSession.showAgentLog) {
            setLogFocused(false)
          }
          return
        }
        if (event.key === 'p' && plain) {
          event.preventDefault()
          dialogRef.current?.focus()
          draft.setVerified(!draft.verified)
          return
        }
        if (event.key === '1' && plain && item.agentStatus !== 'running' && item.agentStatus !== 'waiting') {
          event.preventDefault()
          dialogRef.current?.focus()
          const providers: KanbanItem['agentProvider'][] = ['claude', 'opencode', 'codex']
          const currentIndex = providers.indexOf(draft.agentProvider)
          draft.setAgentProvider(providers[(currentIndex + 1) % providers.length])
          return
        }
        if (event.key === '2' && plain) {
          event.preventDefault()
          dialogRef.current?.focus()
          const models = ['', ...(draft.providerModels[draft.agentProvider] || [])]
          const currentIndex = models.indexOf(draft.model)
          draft.setModel(models[(currentIndex + 1) % models.length])
          return
        }
        if (event.key === '3' && plain) {
          event.preventDefault()
          dialogRef.current?.focus()
          const userColumns: KanbanColumn[] = ['backlog', 'ready', 'done']
          if (draft.column === 'in-progress' || draft.column === 'verify') return
          const currentIndex = userColumns.indexOf(draft.column)
          draft.setColumn(userColumns[(currentIndex + 1) % userColumns.length])
          return
        }
        if (event.key === 'f' && plain && item.branch && item.mergeStatus) {
          event.preventDefault()
          dialogRef.current?.focus()
          setShowDiffViewer(true)
          return
        }
        if (event.key === 'r' && plain && item.worktreePath && !prWorkflow.isRebasing) {
          event.preventDefault()
          dialogRef.current?.focus()
          void prWorkflow.rebaseOntoDefault()
          return
        }
        if (event.key === 'c' && plain && item.mergeStatus === 'conflict') {
          const canStart = (item.agentStatus === 'idle' || item.agentStatus === 'completed' || item.agentStatus === 'failed') && !lifecycle.isStartingAgent
          if (canStart && !prWorkflow.isFixingConflicts) {
            event.preventDefault()
            dialogRef.current?.focus()
            void handleFixConflicts()
            return
          }
        }
        if (event.key === 'c' && plain && item.mergeStatus && item.mergeStatus !== 'conflict' && !prWorkflow.isCheckingConflicts) {
          event.preventDefault()
          dialogRef.current?.focus()
          void prWorkflow.checkConflicts()
          return
        }
        if (event.key === 'm' && plain && (item.agentStatus === 'completed' || item.column === 'done' || item.column === 'verify') && !prWorkflow.isMergingLocally) {
          event.preventDefault()
          dialogRef.current?.focus()
          void prWorkflow.mergeLocally()
          return
        }
        if (event.key === 'M' && !plain && (item.agentStatus === 'completed' || item.column === 'done' || item.column === 'verify') && !prWorkflow.isMerging) {
          event.preventDefault()
          dialogRef.current?.focus()
          void prWorkflow.mergeAndPushPr()
          return
        }
        if (event.key === 'a' && plain && item.mergeStatus === 'merged' && prWorkflow.prUrl && !prWorkflow.isApprovingPr && !prWorkflow.isMergingPr) {
          event.preventDefault()
          dialogRef.current?.focus()
          void prWorkflow.approvePr()
          return
        }
        if (event.key === 'w' && plain && item.mergeStatus === 'merged' && prWorkflow.prUrl && !prWorkflow.isMergingPr && !prWorkflow.isApprovingPr) {
          event.preventDefault()
          dialogRef.current?.focus()
          void prWorkflow.mergePr()
          return
        }
        if (event.key === 'o' && plain && prWorkflow.prUrl) {
          event.preventDefault()
          dialogRef.current?.focus()
          window.electronAPI.app.openExternal(prWorkflow.prUrl)
          return
        }
        if (event.key === 'x' && plain && item.agentStatus === 'running' && agentSession.currentSessionId) {
          event.preventDefault()
          dialogRef.current?.focus()
          void lifecycle.stopAgent()
          return
        }
        if (event.key === 'R' && !plain && item.agentStatus === 'interrupted' && !lifecycle.isStartingAgent) {
          event.preventDefault()
          const resumeName = item.activeAgentName || item.lastAgentName || item.agentType || 'code-agent'
          void lifecycle.resumeAgent(resumeName)
          return
        }
      }

      // 4. isEditable guard — only blocks editor zone navigation
      const target = event.target as HTMLElement
      const tagName = target.tagName.toLowerCase()
      const isEditable = tagName === 'input' || tagName === 'textarea' || tagName === 'select' || target.isContentEditable

      // / to focus comment search input
      if (event.key === '/' && vim.mode === 'NORMAL') {
        event.preventDefault()
        commentSearchRef.current?.focusSearchInput()
        return
      }

      if (isEditable) return

      // 4. Editor zone navigation (NORMAL or dialog VISUAL mode)

      // V (Shift+V) toggles dialog-local visual mode
      if (event.key === 'V' && event.shiftKey) {
        event.preventDefault()
        if (dialogVisualMode) {
          setDialogVisualMode(false)
          setSelectedItemIndices(new Set())
        } else {
          setDialogVisualMode(true)
          visualAnchorRef.current = focusedItemIndex
          setSelectedItemIndices(new Set([focusedItemIndex]))
        }
        return
      }

      // y in visual mode: yank selected text to clipboard
      if (dialogVisualMode && event.key === 'y') {
        event.preventDefault()
        const texts: string[] = []
        const sortedIndices = Array.from(selectedItemIndices).sort((a, b) => a - b)
        for (const idx of sortedIndices) {
          const navItem = navigableItems[idx]
          if (navItem.type === 'comment') {
            texts.push(navItem.text)
          } else if (navItem.type === 'field') {
            const el = document.getElementById(navItem.id) as HTMLInputElement | HTMLTextAreaElement | null
            if (el) texts.push(el.value)
          }
        }
        void navigator.clipboard.writeText(texts.join('\n\n'))
        setDialogVisualMode(false)
        setSelectedItemIndices(new Set())
        return
      }

      if (handleFieldNavKeys(event)) {
        event.preventDefault()
        return
      }

      if ((event.key === 'i' || event.key === 'Enter') && !dialogVisualMode) {
        event.preventDefault()
        const currentItem = navigableItems[focusedItemIndex]
        if (currentItem.type === 'field') {
          focusField(focusedItemIndex)
        } else {
          // Comments are read-only: block the event from reaching global vim handler
          event.stopPropagation()
        }
      }
    }

    // Only run trapFocus in INSERT mode
    if (dialogRef.current && vim.mode !== 'NORMAL') {
      trapFocus(event, dialogRef.current)
    }
  }, [draft, handleClose, handleDelete, isDeleting, item, lifecycle, vim, focusedItemIndex, focusField, agentSession.currentSessionId, prWorkflow, navigableItems, dialogVisualMode, selectedItemIndices, agentSession, commentSearchRef, sortedAgents, handleFieldNavKeys, browserPreview, browserFocused, handleFixConflicts, logFocused])

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
        <div className="flex items-center justify-between px-6 py-3 bg-[var(--color-bg-tertiary)]">
          <h2 className="text-base font-semibold text-[var(--color-text-primary)] truncate min-w-0">
            {item.title || 'Untitled Item'}
          </h2>
          <button
            data-testid="close-button"
            data-vim-key="Escape"
            onClick={handleClose}
            aria-label="Close (Ctrl+Q)"
            title="Close (Ctrl+Q)"
            className="p-1.5 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-primary)] rounded transition-colors flex-shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        <ItemDetailInfoBar
          showKbdHints={true}
          item={item}
          verified={draft.verified}
          onSetVerified={draft.setVerified}
        />

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

        <ItemDetailMergeBar
          showKbdHints={true}
          item={item}
          prUrl={prWorkflow.prUrl}
          conflictCheck={prWorkflow.conflictCheck}
          rebaseResult={prWorkflow.rebaseResult}
          isMerging={prWorkflow.isMerging}
          isMergingLocally={prWorkflow.isMergingLocally}
          isCheckingConflicts={prWorkflow.isCheckingConflicts}
          isRebasing={prWorkflow.isRebasing}
          isApprovingPr={prWorkflow.isApprovingPr}
          isMergingPr={prWorkflow.isMergingPr}
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
          onMergeLocally={() => void prWorkflow.mergeLocally()}
          onMerge={() => void prWorkflow.mergeAndPushPr()}
          onFixConflicts={() => void handleFixConflicts()}
          isFixingConflicts={prWorkflow.isFixingConflicts}
        />

        <div className="flex flex-1 overflow-hidden">
          <div
            data-testid="editor-zone"
            className="flex-1 min-w-0 flex flex-col overflow-hidden"
          >
          <ItemDetailEditorPane
            title={draft.title}
            commentSearchRef={commentSearchRef}
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
            focusedFieldIndex={(() => {
              const currentItem = navigableItems[focusedItemIndex]
              if (!currentItem || currentItem.type !== 'field') return -1
              const fieldIds = ['detail-title', 'detail-description', 'comment-input']
              return fieldIds.indexOf(currentItem.id)
            })()}
            onFieldFocus={handleFieldFocus}
            focusedCommentId={(() => {
              const currentItem = navigableItems[focusedItemIndex]
              return currentItem?.type === 'comment' ? currentItem.id : null
            })()}
            selectedCommentIds={(() => {
              const ids = new Set<string>()
              for (const idx of selectedItemIndices) {
                const navItem = navigableItems[idx]
                if (navItem?.type === 'comment') ids.add(navItem.id)
              }
              return ids
            })()}
            agentStatus={item.agentStatus}
            answerText={lifecycle.answerText}
            isAnswering={lifecycle.isAnswering}
            onSetAnswerText={lifecycle.setAnswerText}
            onAnswerQuestion={() => void lifecycle.answerQuestion()}
            projectPath={projectPath}
            itemId={item.id}
            attachments={item.attachments}
            onAttachmentsChanged={onUpdated}
          />
          </div>

          {browserPreview.isOpen && (
            <BrowserPreviewPanel
              isOpen={browserPreview.isOpen}
              url={browserPreview.url}
              portMappings={browserPreview.portMappings}
              isLoading={browserPreview.isLoading}
              error={browserPreview.error}
              onBack={browserPreview.goBack}
              onForward={browserPreview.goForward}
              onReload={browserPreview.reload}
              onUrlChange={browserPreview.setUrl}
              webviewRef={browserPreview.webviewRef}
              urlBarRef={browserPreview.urlBarRef}
            />
          )}

          <ItemDetailSidebar
            showKbdHints={true}
            item={item}
            agentProvider={draft.agentProvider}
            model={draft.model}
            cavemanMode={draft.cavemanMode}
            column={draft.column}
            providerModels={draft.providerModels}
            saveStatus={draft.saveStatus}
            isDeleting={isDeleting}
            isStartingAgent={lifecycle.isStartingAgent}
            currentSessionId={agentSession.currentSessionId}
            currentDetail={agentSession.currentDetail}
            tokenUsage={agentSession.tokenUsage}
            devServer={devServer}
            onSetAgentProvider={draft.setAgentProvider}
            onSetModel={draft.setModel}
            onSetCavemanMode={draft.setCavemanMode}
            onSetColumn={draft.setColumn}
            onDelete={() => void handleDelete()}
            onStartAgent={agentName => void lifecycle.startAgent(agentName)}
            onResumeAgent={agentName => void lifecycle.resumeAgent(agentName)}
            onStopAgent={() => void lifecycle.stopAgent()}
            onUpdated={onUpdated}
          />
        </div>

         {(agentSession.showAgentLog || agentSession.agentOutputLines.length > 0) && (
           <div className="border-t border-[var(--color-border-primary)] bg-[var(--color-bg-tertiary)]">
             <AgentLogPanel
               ref={logPanelRef}
               outputLines={agentSession.agentOutputLines}
               onClear={agentSession.clearAgentOutput}
               isExpanded={agentSession.showAgentLog}
             />
           </div>
         )}
       </div>

        {/* Shortcuts hint bar */}
        <div
          data-testid="shortcuts-hint-bar"
          className="flex items-center gap-3 px-4 py-1.5 bg-[var(--color-bg-tertiary)] border-t border-[var(--color-border-primary)] text-xs text-[var(--color-text-muted)]"
        >
          {dialogVisualMode ? (
              <>
                <span><kbd className={kbdClass}>j/k</kbd> Extend</span>
                <span><kbd className={kbdClass}>y</kbd> Yank</span>
                <span><kbd className={kbdClass}>Esc</kbd> Exit</span>
              </>
          ) : vim.mode === 'NORMAL' ? (
            browserFocused ? (
              <>
                <span><kbd className={kbdClass}>r</kbd> Reload</span>
                <span><kbd className={kbdClass}>h</kbd> Back</span>
                <span><kbd className={kbdClass}>l</kbd> Forward</span>
                <span><kbd className={kbdClass}>u</kbd> URL bar</span>
                <span><kbd className={kbdClass}>Esc</kbd> Exit browser</span>
              </>
            ) : logFocused ? (
              <>
                <span><kbd className={kbdClass}>j/k</kbd> Navigate</span>
                <span><kbd className={kbdClass}>Esc</kbd> Back</span>
              </>
            ) : (
              <>
                <span><kbd className={kbdClass}>j/k</kbd> Navigate</span>
                <span><kbd className={kbdClass}>gg</kbd> First</span>
                <span><kbd className={kbdClass}>G</kbd> Last</span>
                <span><kbd className={kbdClass}>i</kbd> Edit field</span>
                <span><kbd className={kbdClass}>/</kbd> Search comments</span>
                <span><kbd className={kbdClass}>V</kbd> Visual</span>
                <span><kbd className={kbdClass}>Ctrl+Q</kbd> Close</span>
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

       {/* PR workflow confirm dialog */}
       <ConfirmDialog {...prWorkflow.confirmDialogProps} />
     </div>
   )
}
