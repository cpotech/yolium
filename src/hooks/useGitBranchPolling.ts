/**
 * @module src/hooks/useGitBranchPolling
 * Hook for periodic git branch refresh with worktree support.
 */

import { useEffect } from 'react'
import type { Tab } from './useTabState'

export interface UseGitBranchPollingOptions {
  activeTabId: string | null
  tabs: Tab[]
  updateGitBranch: (tabId: string, branch: string | undefined, worktreeName?: string) => void
}

/**
 * Periodically refreshes the git branch for the active tab.
 * Handles both regular repos and worktree sessions.
 * @param options - Configuration options
 */
export function useGitBranchPolling({
  activeTabId,
  tabs,
  updateGitBranch,
}: UseGitBranchPollingOptions): void {
  useEffect(() => {
    if (!activeTabId) return

    const refreshGitBranch = async () => {
      const activeTab = tabs.find(t => t.id === activeTabId)
      if (!activeTab?.cwd) return

      // Check if session uses a worktree to get the correct path
      const worktreeInfo = await window.electronAPI.container.getWorktreeInfo(activeTab.sessionId)
      // Use worktree path if available, otherwise use the tab's cwd
      const gitPath = worktreeInfo?.worktreePath || activeTab.cwd
      const branch = await window.electronAPI.git.getBranch(gitPath)
      // Pass worktree name (extracted from path) if this is a worktree session
      const worktreeName = worktreeInfo ? worktreeInfo.worktreePath.split('/').pop() : undefined
      updateGitBranch(activeTabId, branch || undefined, worktreeName)
    }

    refreshGitBranch() // Immediate refresh on tab change
    const interval = setInterval(refreshGitBranch, 3000) // Poll every 3s

    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabId])
}
