/**
 * @module src/hooks/useCodeReview
 * Hook for managing code review dialog state and actions.
 */

import { useState, useCallback } from 'react'
import type { ReviewAgentType, CodeReviewStatus } from '../types/agent'
import type { GitConfigWithPat } from '../components/GitConfigDialog'

export interface UseCodeReviewOptions {
  gitConfig: GitConfigWithPat | null
}

export interface UseCodeReviewResult {
  /** Whether the code review dialog is open */
  dialogOpen: boolean
  /** Current review status */
  reviewStatus: CodeReviewStatus | null
  /** Error message if review failed */
  reviewError: string | null
  /** Log output from the review process */
  reviewLog: string[]
  /** Opens the code review dialog */
  openDialog: () => void
  /** Closes the code review dialog */
  closeDialog: () => void
  /** Starts a code review */
  startReview: (repoUrl: string, branch: string, agent: ReviewAgentType) => Promise<void>
}

/**
 * Manages code review dialog state and review process.
 * @param options - Configuration options including git credentials
 * @returns State and handlers for code review functionality
 */
export function useCodeReview({ gitConfig }: UseCodeReviewOptions): UseCodeReviewResult {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [reviewStatus, setReviewStatus] = useState<CodeReviewStatus | null>(null)
  const [reviewError, setReviewError] = useState<string | null>(null)
  const [reviewLog, setReviewLog] = useState<string[]>([])

  const openDialog = useCallback(() => {
    setReviewStatus(null)
    setReviewError(null)
    setReviewLog([])
    setDialogOpen(true)
  }, [])

  const closeDialog = useCallback(() => {
    setDialogOpen(false)
  }, [])

  const startReview = useCallback(async (repoUrl: string, branch: string, agent: ReviewAgentType) => {
    setReviewStatus('starting')
    setReviewError(null)
    setReviewLog([])

    try {
      // Set up output listener to capture container logs
      const cleanupOutput = window.electronAPI.codeReview.onOutput((_sessionId, data) => {
        const lines = data.split('\n').filter((line: string) => line.trim() !== '')
        if (lines.length > 0) {
          setReviewLog(prev => [...prev, ...lines])
        }
      })

      // Set up completion listener
      const cleanupComplete = window.electronAPI.codeReview.onComplete((_sessionId, exitCode, authError) => {
        if (exitCode === 0) {
          setReviewStatus('completed')
        } else if (exitCode === 2) {
          setReviewStatus('failed')
          setReviewError('No open PR found for this branch. Please create a PR first.')
        } else if (exitCode === 3 || authError) {
          setReviewStatus('failed')
          setReviewError('Agent authentication failed. Please check your API key in Settings.')
        } else {
          setReviewStatus('failed')
          setReviewError(`Container exited with code ${exitCode}`)
        }
        cleanupOutput()
        cleanupComplete()
      })

      await window.electronAPI.docker.ensureImage()
      await window.electronAPI.codeReview.start(repoUrl, branch, agent, gitConfig || undefined)
      setReviewStatus('running')
    } catch (err) {
      setReviewStatus('failed')
      setReviewError(err instanceof Error ? err.message : 'Failed to start code review')
    }
  }, [gitConfig])

  return {
    dialogOpen,
    reviewStatus,
    reviewError,
    reviewLog,
    openDialog,
    closeDialog,
    startReview,
  }
}
