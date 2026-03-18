/**
 * @module src/components/ItemDetailDialog
 * Dialog for viewing and editing kanban item details with agent controls.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import type { KanbanItem } from '@shared/types/kanban'
import { trapFocus } from '@shared/lib/focus-trap'
import { useAgentSession } from '@renderer/hooks/useAgentSession'
import { useSuspendVimNavigation } from '@renderer/context/VimModeContext'
import { AgentLogPanel } from '../agent/AgentLogPanel'
import { GitDiffDialog } from '../code-review/GitDiffDialog'
import { ItemDetailEditorPane } from './item-detail/ItemDetailEditorPane'
import { ItemDetailSidebar } from './item-detail/ItemDetailSidebar'
import { useItemDetailDraft } from './item-detail/useItemDetailDraft'
import { useItemDetailAgentLifecycle } from './item-detail/useItemDetailAgentLifecycle'
import { useItemDetailPrWorkflow } from './item-detail/useItemDetailPrWorkflow'

interface ItemDetailDialogProps {
  isOpen: boolean
  item: KanbanItem | null
  projectPath: string
  onClose: () => void
  onUpdated: () => void
}

export function ItemDetailDialog({
  isOpen,
  item,
  projectPath,
  onClose,
  onUpdated,
}: ItemDetailDialogProps): React.ReactElement | null {
  useSuspendVimNavigation(isOpen)

  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDiffViewer, setShowDiffViewer] = useState(false)
  const answerInputRef = useRef<HTMLTextAreaElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

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

  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      handleClose()
    }
    if (event.key === 'Enter' && event.ctrlKey && draft.saveStatus !== 'saving' && draft.title.trim().length > 0) {
      event.preventDefault()
      void draft.flushDraft('manual')
    }
    if (event.key === 'Delete' && event.ctrlKey && !isDeleting) {
      event.preventDefault()
      void handleDelete()
    }
    // Agent shortcuts: Ctrl+Shift+{P,C,V,S,D,M}
    if (event.ctrlKey && event.shiftKey && item) {
      const agentKeyMap: Record<string, string> = {
        P: 'plan-agent',
        C: 'code-agent',
        V: 'verify-agent',
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
    if (dialogRef.current) {
      trapFocus(event, dialogRef.current)
    }
  }, [draft, handleClose, handleDelete, isDeleting, item, lifecycle])

  if (!isOpen || !item) return null

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[var(--color-bg-secondary)]" onKeyDown={handleKeyDown}>
      <div
        ref={dialogRef}
        data-testid="item-detail-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`Item details: ${item.title}`}
        className="flex flex-col h-full"
      >
        <div className="flex items-center justify-between px-6 py-3 border-b border-[var(--color-border-primary)] bg-[var(--color-bg-tertiary)]">
          <h2 className="text-base font-semibold text-[var(--color-text-primary)] truncate min-w-0">
            {item.title || 'Untitled Item'}
          </h2>
          <button
            data-testid="close-button"
            onClick={handleClose}
            className="p-1.5 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-primary)] rounded transition-colors flex-shrink-0"
          >
            <X size={18} />
          </button>
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
          />

          <ItemDetailSidebar
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
