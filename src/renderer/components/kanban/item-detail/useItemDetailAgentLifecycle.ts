import { useCallback, useEffect, useState } from 'react'
import type { LiveAgentStatus } from '@renderer/hooks/useAgentSession'
import type { DraftFlushReason } from './useItemDetailDraft'
import type { KanbanItem } from '@shared/types/kanban'

interface DraftControllerSlice {
  agentProvider: KanbanItem['agentProvider']
  hasUnsavedChanges: boolean
  flushDraft: (reason: DraftFlushReason) => Promise<boolean>
}

interface AgentSessionSlice {
  currentSessionId: string | null
  currentDetail: string | null
  prepareForRun: () => void
  associateSession: (sessionId: string) => void
  appendOutputLine: (line: string) => void
  setRunStatus: (status: LiveAgentStatus, message?: string | null) => void
}

interface UseItemDetailAgentLifecycleOptions {
  item: KanbanItem | null
  projectPath: string
  onUpdated: () => void
  setErrorMessage: (message: string | null) => void
  draft: DraftControllerSlice
  agentSession: AgentSessionSlice
}

export interface ItemDetailAgentLifecycleController {
  isStartingAgent: boolean
  isAnswering: boolean
  isAddingComment: boolean
  answerText: string
  commentText: string
  setAnswerText: (value: string) => void
  setCommentText: (value: string) => void
  startAgent: (agentName: string) => Promise<void>
  resumeAgent: (agentName: string) => Promise<void>
  stopAgent: () => Promise<void>
  answerQuestion: () => Promise<void>
  addComment: () => Promise<void>
}

export function useItemDetailAgentLifecycle({
  item,
  projectPath,
  onUpdated,
  setErrorMessage,
  draft,
  agentSession,
}: UseItemDetailAgentLifecycleOptions): ItemDetailAgentLifecycleController {
  const [isStartingAgent, setIsStartingAgent] = useState(false)
  const [isAnswering, setIsAnswering] = useState(false)
  const [isAddingComment, setIsAddingComment] = useState(false)
  const [answerText, setAnswerText] = useState('')
  const [commentText, setCommentText] = useState('')

  // Reset input text when switching to a different work item
  useEffect(() => {
    setAnswerText('')
    setCommentText('')
  }, [item?.id])

  const runAgent = useCallback(async (
    invoker: (params: {
      agentName: string
      projectPath: string
      itemId: string
      goal: string
      agentProvider: KanbanItem['agentProvider']
    }) => Promise<{ sessionId?: string; error?: string }>,
    agentName: string,
  ) => {
    if (!item || isStartingAgent) return

    if (draft.hasUnsavedChanges) {
      await draft.flushDraft('manual')
    }

    setIsStartingAgent(true)
    agentSession.prepareForRun()
    agentSession.setRunStatus('starting', null)

    try {
      const result = await invoker({
        agentName,
        projectPath,
        itemId: item.id,
        goal: item.description,
        agentProvider: draft.agentProvider,
      })

      if (result.error) {
        agentSession.appendOutputLine(`[Error] ${result.error}`)
        agentSession.setRunStatus('failed', result.error)
      } else if (result.sessionId) {
        agentSession.associateSession(result.sessionId)
        agentSession.setRunStatus('running', null)
      }

      onUpdated()
    } catch (error) {
      const message = String(error)
      agentSession.appendOutputLine(`[Error] ${message}`)
      agentSession.setRunStatus('failed', message)
    } finally {
      setIsStartingAgent(false)
    }
  }, [agentSession, draft, isStartingAgent, item, onUpdated, projectPath])

  const startAgent = useCallback(async (agentName: string) => {
    await runAgent(window.electronAPI.agent.start, agentName)
  }, [runAgent])

  const resumeAgent = useCallback(async (agentName: string) => {
    await runAgent(window.electronAPI.agent.resume, agentName)
  }, [runAgent])

  const stopAgent = useCallback(async () => {
    if (!agentSession.currentSessionId) return

    await window.electronAPI.agent.stop(agentSession.currentSessionId)
    onUpdated()
  }, [agentSession.currentSessionId, onUpdated])

  const answerQuestion = useCallback(async () => {
    if (!item || isAnswering || !answerText.trim()) return

    setIsAnswering(true)
    try {
      await window.electronAPI.agent.answer(projectPath, item.id, answerText.trim())
      setAnswerText('')
      setErrorMessage(null)
      onUpdated()

      // Auto-resume the agent after answering
      const resumeName = item.activeAgentName || item.lastAgentName || item.agentType || 'code-agent'
      await runAgent(window.electronAPI.agent.resume, resumeName)
    } catch (error) {
      console.error('Failed to answer question:', error)
      setErrorMessage('Failed to submit answer. Please try again.')
    } finally {
      setIsAnswering(false)
    }
  }, [answerText, isAnswering, item, onUpdated, projectPath, setErrorMessage, runAgent])

  const addComment = useCallback(async () => {
    if (!item || isAddingComment || !commentText.trim()) return

    setIsAddingComment(true)
    try {
      await window.electronAPI.kanban.addComment(projectPath, item.id, 'user', commentText.trim())
      setCommentText('')
      setErrorMessage(null)
      onUpdated()
    } catch (error) {
      console.error('Failed to add comment:', error)
      setErrorMessage('Failed to add comment. Please try again.')
    } finally {
      setIsAddingComment(false)
    }
  }, [commentText, isAddingComment, item, onUpdated, projectPath, setErrorMessage])

  return {
    isStartingAgent,
    isAnswering,
    isAddingComment,
    answerText,
    commentText,
    setAnswerText,
    setCommentText,
    startAgent,
    resumeAgent,
    stopAgent,
    answerQuestion,
    addComment,
  }
}
