import { useCallback, useEffect, useState } from 'react'
import type { KanbanItem } from '@shared/types/kanban'
import { useConfirmDialog } from '@renderer/hooks/useConfirmDialog'
import type { ConfirmDialogProps } from '@renderer/components/shared/ConfirmDialog'

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

/**
 * Shared utility: check conflicts, add system comment, reset mergeStatus.
 * Used by both the hook's fixConflicts() and KanbanView's handleFixConflicts().
 */
export async function prepareConflictResolution(
  projectPath: string,
  itemId: string,
  branch: string,
): Promise<ConflictCheckResult> {
  const result = await window.electronAPI.git.checkMergeConflicts(projectPath, branch)
  const fileList = result.conflictingFiles.length > 0
    ? result.conflictingFiles.map((file: string) => `  - ${file}`).join('\n')
    : '  (unable to determine specific files)'

  await window.electronAPI.kanban.addComment(
    projectPath,
    itemId,
    'system',
    `MERGE CONFLICT RESOLUTION NEEDED\n\nConflicting files:\n${fileList}\n\nRebase the worktree branch onto the latest default branch and resolve all merge conflicts. After resolving, commit the changes.`,
  )

  await window.electronAPI.kanban.updateItem(projectPath, itemId, {
    mergeStatus: 'unmerged',
  })

  return result
}

interface UseItemDetailPrWorkflowOptions {
  item: KanbanItem | null
  projectPath: string
  onUpdated: () => void
  setErrorMessage: (message: string | null) => void
}

export interface ItemDetailPrWorkflowController {
  isMerging: boolean
  isMergingLocally: boolean
  isCheckingConflicts: boolean
  conflictCheck: ConflictCheckResult | null
  prUrl: string | null
  isApprovingPr: boolean
  isMergingPr: boolean
  isRebasing: boolean
  rebaseResult: RebaseResultState | null
  isFixingConflicts: boolean
  confirmDialogProps: ConfirmDialogProps
  fixConflicts: () => Promise<void>
  checkConflicts: () => Promise<void>
  rebaseOntoDefault: () => Promise<void>
  mergeLocally: () => Promise<void>
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
  const [isMergingLocally, setIsMergingLocally] = useState(false)
  const [isCheckingConflicts, setIsCheckingConflicts] = useState(false)
  const [conflictCheck, setConflictCheck] = useState<ConflictCheckResult | null>(null)
  const [prUrl, setPrUrl] = useState<string | null>(item?.prUrl || null)
  const [isApprovingPr, setIsApprovingPr] = useState(false)
  const [isMergingPr, setIsMergingPr] = useState(false)
  const [isRebasing, setIsRebasing] = useState(false)
  const [rebaseResult, setRebaseResult] = useState<RebaseResultState | null>(null)
  const [isFixingConflicts, setIsFixingConflicts] = useState(false)
  const { confirm: confirmAction, dialogProps: confirmDialogProps } = useConfirmDialog()

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

  const fixConflicts = useCallback(async () => {
    if (!item || !item.branch || isFixingConflicts) return

    setIsFixingConflicts(true)
    try {
      const result = await prepareConflictResolution(projectPath, item.id, item.branch)
      setConflictCheck(result)
      onUpdated()
    } catch (error) {
      console.error('Failed to fix conflicts:', error)
      const message = error instanceof Error ? error.message : 'Unknown error'
      setErrorMessage(`Failed to prepare conflict resolution: ${message}`)
    } finally {
      setIsFixingConflicts(false)
    }
  }, [isFixingConflicts, item, onUpdated, projectPath, setErrorMessage])

  const mergeLocally = useCallback(async () => {
    if (!item || !item.branch || !item.worktreePath || isMergingLocally) return

    setIsMergingLocally(true)
    try {
      const stats = await window.electronAPI.git.worktreeDiffStats(projectPath, item.branch)
      const statsMessage = stats.filesChanged > 0
        ? `${stats.filesChanged} file${stats.filesChanged !== 1 ? 's' : ''} changed, +${stats.insertions} -${stats.deletions}`
        : 'No changes detected'

      const confirmed = await confirmAction({
        title: 'Merge Locally',
        message: `Merge branch "${item.branch}" locally into default branch?\n\n${statsMessage}`,
        confirmLabel: 'Merge',
      })
      if (!confirmed) return

      const result = await window.electronAPI.git.mergeBranch(projectPath, item.branch)

      if (result.success) {
        await window.electronAPI.git.cleanupWorktree(projectPath, item.worktreePath!, item.branch)
        await window.electronAPI.kanban.updateItem(projectPath, item.id, {
          mergeStatus: 'merged',
          worktreePath: undefined,
        })
        await window.electronAPI.kanban.addComment(projectPath, item.id, 'system', `Branch merged locally into default branch`)
        setConflictCheck(null)
        setErrorMessage(null)
        onUpdated()
      } else if (result.conflict) {
        await window.electronAPI.kanban.updateItem(projectPath, item.id, {
          mergeStatus: 'conflict',
        })
        setConflictCheck({ clean: false, conflictingFiles: [] })
        setErrorMessage('Merge conflict detected. Please resolve manually.')
        onUpdated()
      } else {
        setErrorMessage(result.error || 'Local merge failed')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      setErrorMessage(`Failed to merge locally: ${message}`)
    } finally {
      setIsMergingLocally(false)
    }
  }, [isMergingLocally, item, onUpdated, projectPath, setErrorMessage])

  const mergeAndPushPr = useCallback(async () => {
    if (!item || !item.branch || !item.worktreePath || isMerging) return

    setIsMerging(true)
    try {
      const stats = await window.electronAPI.git.worktreeDiffStats(projectPath, item.branch)
      const statsMessage = stats.filesChanged > 0
        ? `${stats.filesChanged} file${stats.filesChanged !== 1 ? 's' : ''} changed, +${stats.insertions} -${stats.deletions}`
        : 'No changes detected'

      const confirmed = await confirmAction({
        title: 'Squash, Merge & Create PR',
        message: `Squash merge branch "${item.branch}" and push a PR?\n\n${statsMessage}`,
        confirmLabel: 'Merge',
      })
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

    const confirmed = await confirmAction({
      title: 'Merge PR',
      message: `Squash merge and delete the remote branch for this PR?\n\n${prUrl}`,
      confirmLabel: 'Merge',
    })
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
    isMergingLocally,
    isCheckingConflicts,
    conflictCheck,
    prUrl,
    isApprovingPr,
    isMergingPr,
    isRebasing,
    rebaseResult,
    isFixingConflicts,
    confirmDialogProps,
    fixConflicts,
    checkConflicts,
    rebaseOntoDefault,
    mergeLocally,
    mergeAndPushPr,
    approvePr,
    mergePr,
  }
}
