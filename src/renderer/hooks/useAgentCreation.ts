/**
 * @module src/hooks/useAgentCreation
 * Hook for managing the agent creation flow (path selection → agent selection → container creation).
 */

import { useState, useCallback, useRef } from 'react'
import type { AgentProvider } from '@renderer/components/agent/AgentSelectDialog'
import type { GitConfigWithPat } from '@renderer/components/settings/GitConfigDialog'
import type { PathDialogMode } from './useDialogState'
import type { SidebarProject } from '@renderer/stores/sidebar-store'
import { addSidebarProject, getSidebarProjects } from '@renderer/stores/sidebar-store'

export interface UseAgentCreationOptions {
  /** Current git configuration */
  gitConfig: GitConfigWithPat | null
  /** Build cancelled ref from docker state */
  buildCancelledRef: React.MutableRefObject<boolean>
  /** Set build progress from docker state */
  setBuildProgress: React.Dispatch<React.SetStateAction<string[] | null>>
  /** Set build error from docker state */
  setBuildError: React.Dispatch<React.SetStateAction<string | null>>
  /** Set image removed from docker state */
  setImageRemoved: React.Dispatch<React.SetStateAction<boolean>>
  /** Add a new terminal tab */
  addTab: (sessionId: string, cwd: string, containerState: 'starting' | 'running' | 'stopped' | 'crashed', gitBranch?: string) => string
  /** Add a kanban tab */
  addKanbanTab: (projectPath: string) => void
  /** Update container state */
  updateContainerState: (tabId: string, state: 'starting' | 'running' | 'stopped' | 'crashed') => void
  /** Update sidebar projects */
  setSidebarProjects: React.Dispatch<React.SetStateAction<SidebarProject[]>>
  /** Path dialog mode */
  pathDialogMode: PathDialogMode
  /** Close path dialog */
  closePathDialog: () => void
  /** Set last used path */
  setLastUsedPath: (path: string) => void
}

export interface UseAgentCreationResult {
  /** Whether agent selection dialog is open */
  agentDialogOpen: boolean
  /** Pending folder path for agent creation */
  pendingFolderPath: string | null
  /** Git status of pending folder */
  pendingFolderGitStatus: { isRepo: boolean; hasCommits: boolean } | null
  /** Handle path confirmation from PathInputDialog */
  handlePathConfirm: (path: string) => Promise<void>
  /** Handle agent selection from AgentSelectDialog */
  handleAgentSelect: (agent: AgentProvider, gsdEnabled: boolean, worktreeEnabled: boolean, branchName: string | null) => void
  /** Handle agent dialog cancel (Escape - cancels entire flow) */
  handleAgentDialogCancel: () => void
  /** Handle agent dialog back (returns to path dialog) */
  handleAgentDialogBack: () => void
  /** Refresh git status for the pending folder */
  refreshGitStatus: () => Promise<void>
  /** Error from agent creation flow (replaces alert()) */
  creationError: string | null
  /** Clear the creation error */
  clearCreationError: () => void
}

/**
 * Manages the agent creation flow from path selection to container creation.
 * @param options - Dependencies and callbacks
 * @returns State and handlers for the agent creation flow
 */
export function useAgentCreation({
  gitConfig,
  buildCancelledRef,
  setBuildProgress,
  setBuildError,
  setImageRemoved,
  addTab,
  addKanbanTab,
  updateContainerState,
  setSidebarProjects,
  pathDialogMode,
  closePathDialog,
  setLastUsedPath,
}: UseAgentCreationOptions): UseAgentCreationResult {
  const [agentDialogOpen, setAgentDialogOpen] = useState(false)
  const [pendingFolderPath, setPendingFolderPath] = useState<string | null>(null)
  const [pendingFolderGitStatus, setPendingFolderGitStatus] = useState<{ isRepo: boolean; hasCommits: boolean } | null>(null)
  const [creationError, setCreationError] = useState<string | null>(null)

  // Create yolium with selected agent
  const createYoliumWithAgent = useCallback(async (
    folderPath: string,
    agent: AgentProvider,
    gsdEnabled: boolean,
    worktreeEnabled: boolean = false,
    branchName: string | null = null
  ) => {
    buildCancelledRef.current = false

    // Validate project path before spending time on image setup and container creation.
    try {
      const preFlightResult = await window.electronAPI.onboarding.validate(folderPath)
      if (!preFlightResult.success) {
        setCreationError(`Pre-flight validation failed: ${preFlightResult.errors.join(', ')}`)
        return
      }
    } catch (err) {
      console.error('Pre-flight validation failed:', err)
      setCreationError('Unable to validate project path before container startup.')
      return
    }

    // Set up progress listener before starting
    const cleanupProgress = window.electronAPI.docker.onBuildProgress((message) => {
      setBuildProgress(prev => {
        const lines = prev || []
        // Keep last 50 lines to prevent memory issues
        const newLines = [...lines, message].slice(-50)
        return newLines
      })
    })

    // Ensure image is available (builds if needed)
    try {
      setBuildError(null)
      setBuildProgress(['Checking Yolium image...'])
      await window.electronAPI.docker.ensureImage()
      if (buildCancelledRef.current) {
        cleanupProgress()
        return
      }
      setBuildProgress(null)
      setImageRemoved(false) // Image now exists
    } catch (err) {
      console.error('Failed to ensure yolium image:', err)
      const message = err instanceof Error ? err.message : 'Unknown error'
      // Show error in the build progress overlay instead of hiding it
      setBuildError(message)
      cleanupProgress()
      return
    }
    cleanupProgress()

    // Create yolium container with selected agent
    try {
      const sessionId = await window.electronAPI.container.create(folderPath, agent, gsdEnabled, gitConfig || undefined, worktreeEnabled, branchName || undefined)

      // Use worktree branch name if enabled, otherwise fetch from folder
      const gitBranch = worktreeEnabled && branchName
        ? branchName
        : await window.electronAPI.git.getBranch(folderPath)
      const tabId = addTab(sessionId, folderPath, 'starting', gitBranch || undefined)

      // Add project to sidebar
      addSidebarProject(folderPath)
      setSidebarProjects(getSidebarProjects())

      // Update to running once container is attached
      // For now, set running after a brief delay (proper approach: IPC state event)
      setTimeout(() => {
        updateContainerState(tabId, 'running')
      }, 1000)
    } catch (err) {
      console.error('Failed to create yolium:', err)
      setCreationError('Failed to start yolium. Check Docker is running.')
    }
  }, [addTab, updateContainerState, gitConfig, buildCancelledRef, setBuildProgress, setBuildError, setImageRemoved, setSidebarProjects])

  // Handle agent selection from dialog
  const handleAgentSelect = useCallback((agent: AgentProvider, gsdEnabled: boolean, worktreeEnabled: boolean, branchName: string | null) => {
    if (pendingFolderPath) {
      createYoliumWithAgent(pendingFolderPath, agent, gsdEnabled, worktreeEnabled, branchName)
    }
    setAgentDialogOpen(false)
    setPendingFolderPath(null)
    setPendingFolderGitStatus(null)
  }, [pendingFolderPath, createYoliumWithAgent])

  // Handle dialog cancel (Escape key - cancels entire flow)
  const handleAgentDialogCancel = useCallback(() => {
    setAgentDialogOpen(false)
    setPendingFolderPath(null)
    setPendingFolderGitStatus(null)
  }, [])

  // Handle Back button in agent dialog (returns to path dialog)
  const handleAgentDialogBack = useCallback(() => {
    setAgentDialogOpen(false)
    // Note: The caller should reopen the path dialog
  }, [])

  // Handle path confirmation from PathInputDialog
  const handlePathConfirm = useCallback(async (path: string) => {
    // Normalize path: expand ~ and remove trailing slash for storage
    let normalizedPath = path
    if (normalizedPath.endsWith('/') && normalizedPath.length > 1) {
      normalizedPath = normalizedPath.slice(0, -1)
    }

    // Store last used path for next time
    localStorage.setItem('yolium:lastPath', path)
    setLastUsedPath(path)

    closePathDialog()

    // Handle based on mode
    if (pathDialogMode === 'openProject') {
      // Add project to sidebar and open its kanban tab
      addSidebarProject(normalizedPath)
      setSidebarProjects(getSidebarProjects())
      addKanbanTab(normalizedPath)
      return
    }

    // New Tab mode: open agent dialog to select agent type
    setPendingFolderPath(normalizedPath)

    // Check if folder is a git repo (async, UI will show "checking...")
    setPendingFolderGitStatus(null)
    setAgentDialogOpen(true)

    try {
      const gitStatus = await window.electronAPI.git.isRepo(normalizedPath)
      setPendingFolderGitStatus(gitStatus)
    } catch {
      setPendingFolderGitStatus({ isRepo: false, hasCommits: false })
    }
  }, [pathDialogMode, addKanbanTab, closePathDialog, setLastUsedPath, setSidebarProjects])

  // Refresh git status for the pending folder (used after git init)
  const refreshGitStatus = useCallback(async () => {
    if (pendingFolderPath) {
      const gitStatus = await window.electronAPI.git.isRepo(pendingFolderPath)
      setPendingFolderGitStatus(gitStatus)
    }
  }, [pendingFolderPath])

  const clearCreationError = useCallback(() => setCreationError(null), [])

  return {
    agentDialogOpen,
    pendingFolderPath,
    pendingFolderGitStatus,
    handlePathConfirm,
    handleAgentSelect,
    handleAgentDialogCancel,
    handleAgentDialogBack,
    refreshGitStatus,
    creationError,
    clearCreationError,
  }
}
