import { useCallback, useEffect, useState } from 'react'
import type { KanbanItem } from '@shared/types/kanban'

export interface ConflictCheckResult {
  clean: boolean
  conflictingFiles: string[]
}

export interface RebaseResultState {
  success: boolean
  error?: string
  conflict?: boolean
  conflictingFiles?: string[]
}

interface UseItemDetailPrWorkflowOptions {
  item: KanbanItem | null
  projectPath: string
  onUpdated: () => void
  setErrorMessage: (message: string | null) => void
}

export interface ItemDetailPrWorkflowController {
  isMerging: boolean
  isCheckingConflicts: boolean
  conflictCheck: ConflictCheckResult | null
  prUrl: string | null
  isApprovingPr: boolean
  isMergingPr: boolean
  isRebasing: boolean
  rebaseResult: RebaseResultState | null
  checkConflicts: () => Promise<void>
  rebaseOntoDefault: () => Promise<void>
  mergeAndPushPr: () => Promise<void>
  approvePr: () => Promise<void>
  mergePr: () => Promise<void>
}

export function useItemDetailPrWorkflow({
  item,
  projectPath,
  onUpdated,
  setErrorMessage,
}: UseItemDetailPrWorkflowOptions): ItemDetailPrWorkflowController {
  const [isMerging, setIsMerging] = useState(false)
  const [isCheckingConflicts, setIsCheckingConflicts] = useState(false)
  const [conflictCheck, setConflictCheck] = useState<ConflictCheckResult | null>(null)
  const [prUrl, setPrUrl] = useState<string | null>(item?.prUrl || null)
  const [isApprovingPr, setIsApprovingPr] = useState(false)
  const [isMergingPr, setIsMergingPr] = useState(false)
  const [isRebasing, setIsRebasing] = useState(false)
  const [rebaseResult, setRebaseResult] = useState<RebaseResultState | null>(null)

  useEffect(() => {
    setPrUrl(item?.prUrl || null)
    setConflictCheck(null)
    setRebaseResult(null)
  }, [item?.id, item?.prUrl])

  const checkConflicts = useCallback(async () => {
    if (!item || !item.branch || isCheckingConflicts) return

    setIsCheckingConflicts(true)
    setConflictCheck(null)
    try {
      const result = await window.electronAPI.git.checkMergeConflicts(projectPath, item.branch)
      setConflictCheck(result)
    } catch (error) {
      console.error('Failed to check merge conflicts:', error)
      setConflictCheck({ clean: false, conflictingFiles: ['(check failed)'] })
    } finally {
      setIsCheckingConflicts(false)
    }
  }, [isCheckingConflicts, item, projectPath])

  const rebaseOntoDefault = useCallback(async () => {
    if (!item || !item.branch || !item.worktreePath || isRebasing) return

    setIsRebasing(true)
    setRebaseResult(null)
    try {
      const result = await window.electronAPI.git.rebaseOntoDefault(item.worktreePath, projectPath)
      setRebaseResult(result)
      if (result.success) {
        setConflictCheck(null)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      setRebaseResult({ success: false, error: message })
    } finally {
      setIsRebasing(false)
    }
  }, [isRebasing, item, projectPath])

  const mergeAndPushPr = useCallback(async () => {
    if (!item || !item.branch || !item.worktreePath || isMerging) return

    setIsMerging(true)
    try {
      const stats = await window.electronAPI.git.worktreeDiffStats(projectPath, item.branch)
      const statsMessage = stats.filesChanged > 0
        ? `${stats.filesChanged} file${stats.filesChanged !== 1 ? 's' : ''} changed, +${stats.insertions} -${stats.deletions}`
        : 'No changes detected'

      const confirmed = await window.electronAPI.dialog.confirmOkCancel(
        'Squash, Merge & Create PR',
        `Squash merge branch "${item.branch}" and push a PR?\n\n${statsMessage}`,
      )
      if (!confirmed) {
        return
      }

      const result = await window.electronAPI.git.mergeAndPushPR(
        projectPath,
        item.branch,
        item.worktreePath,
        item.title,
        item.description,
      )

      if (result.success && !result.error) {
        await window.electronAPI.kanban.updateItem(projectPath, item.id, {
          mergeStatus: 'merged',
          branch: result.prBranch ?? item.branch,
          worktreePath: undefined,
          prUrl: result.prUrl,
        })
        if (result.prUrl) {
          setPrUrl(result.prUrl)
          await window.electronAPI.kanban.addComment(projectPath, item.id, 'system', `PR created: ${result.prUrl}`)
        }
        setConflictCheck(null)
        setErrorMessage(null)
        onUpdated()
      } else if (result.success && result.error) {
        await window.electronAPI.kanban.updateItem(projectPath, item.id, {
          mergeStatus: 'merged',
          branch: result.prBranch ?? item.branch,
          worktreePath: undefined,
        })
        setConflictCheck(null)
        setErrorMessage(result.error)
        onUpdated()
      } else if (result.conflict) {
        await window.electronAPI.kanban.updateItem(projectPath, item.id, {
          mergeStatus: 'conflict',
        })
        const fileList = result.conflictingFiles?.length
          ? `\nConflicting files:\n${result.conflictingFiles.map((file: string) => `  - ${file}`).join('\n')}`
          : ''
        setConflictCheck({ clean: false, conflictingFiles: result.conflictingFiles || [] })
        setErrorMessage(`Merge conflict detected. Please resolve manually.${fileList}`)
        onUpdated()
      } else {
        setErrorMessage(result.error || 'Merge failed')
      }
    } catch (error) {
      console.error('Failed to merge and push PR:', error)
      const message = error instanceof Error ? error.message : 'Unknown error'
      setErrorMessage(`Failed to merge and push PR: ${message}`)
    } finally {
      setIsMerging(false)
    }
  }, [isMerging, item, onUpdated, projectPath, setErrorMessage])

  const approvePr = useCallback(async () => {
    if (!item || !prUrl || isApprovingPr) return

    setIsApprovingPr(true)
    try {
      const result = await window.electronAPI.git.approvePR(projectPath, prUrl)
      if (result.success) {
        await window.electronAPI.kanban.addComment(projectPath, item.id, 'system', `PR approved on GitHub: ${prUrl}`)
        setErrorMessage(null)
        onUpdated()
      } else {
        setErrorMessage(result.error || 'Failed to approve PR')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      setErrorMessage(`Failed to approve PR: ${message}`)
    } finally {
      setIsApprovingPr(false)
    }
  }, [isApprovingPr, item, onUpdated, prUrl, projectPath, setErrorMessage])

  const mergePr = useCallback(async () => {
    if (!item || !prUrl || isMergingPr) return

    const confirmed = await window.electronAPI.dialog.confirmOkCancel(
      'Merge PR',
      `Squash merge and delete the remote branch for this PR?\n\n${prUrl}`,
    )
    if (!confirmed) return

    setIsMergingPr(true)
    try {
      const result = await window.electronAPI.git.mergePR(projectPath, prUrl)
      if (result.success) {
        await window.electronAPI.kanban.addComment(projectPath, item.id, 'system', `PR merged on GitHub: ${prUrl}`)
        await window.electronAPI.kanban.updateItem(projectPath, item.id, { column: 'done' })
        setErrorMessage(null)
        onUpdated()
      } else {
        setErrorMessage(result.error || 'Failed to merge PR')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      setErrorMessage(`Failed to merge PR: ${message}`)
    } finally {
      setIsMergingPr(false)
    }
  }, [isMergingPr, item, onUpdated, prUrl, projectPath, setErrorMessage])

  return {
    isMerging,
    isCheckingConflicts,
    conflictCheck,
    prUrl,
    isApprovingPr,
    isMergingPr,
    isRebasing,
    rebaseResult,
    checkConflicts,
    rebaseOntoDefault,
    mergeAndPushPr,
    approvePr,
    mergePr,
  }
}
