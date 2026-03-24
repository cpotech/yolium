/**
 * @module src/hooks/useDialogState
 * Hook for managing dialog open/close states and git config.
 */

import { useState, useEffect, useCallback } from 'react'
import type { GitConfigWithPat } from '@renderer/components/settings/GitConfigDialog'
import { normalizePath } from '@shared/lib/path-utils'

export type PathDialogMode = 'newTab' | 'openProject'

export interface UseDialogStateResult {
  /** Whether path input dialog is open */
  pathDialogOpen: boolean
  /** Last used path for the path dialog */
  lastUsedPath: string
  /** Mode for the path dialog */
  pathDialogMode: PathDialogMode
  /** Whether keyboard shortcuts dialog is open */
  shortcutsDialogOpen: boolean
  /** Whether git config dialog is open */
  gitConfigDialogOpen: boolean
  /** Current git configuration */
  gitConfig: GitConfigWithPat | null
  /** Whether project config dialog is open */
  projectConfigDialogOpen: boolean
  /** Project path for the project config dialog */
  projectConfigProjectPath: string
  /** Whether agent settings dialog is open */
  agentSettingsDialogOpen: boolean
  /** Open path dialog in specified mode */
  openPathDialog: (mode: PathDialogMode) => void
  /** Close path dialog */
  closePathDialog: () => void
  /** Update last used path */
  setLastUsedPath: (path: string) => void
  /** Open shortcuts dialog */
  openShortcutsDialog: () => void
  /** Close shortcuts dialog */
  closeShortcutsDialog: () => void
  /** Open git config dialog */
  openGitConfigDialog: () => Promise<void>
  /** Close git config dialog */
  closeGitConfigDialog: () => void
  /** Save git config */
  saveGitConfig: (config: { githubPat?: string; openaiApiKey?: string; anthropicApiKey?: string; useClaudeOAuth?: boolean; useCodexOAuth?: boolean; providerModelDefaults?: Record<string, string>; providerModels?: Record<string, string[]> }) => Promise<void>
  /** Open project config dialog for a specific project */
  openProjectConfigDialog: (projectPath: string) => void
  /** Close project config dialog */
  closeProjectConfigDialog: () => void
  /** Open agent settings dialog */
  openAgentSettingsDialog: () => void
  /** Close agent settings dialog */
  closeAgentSettingsDialog: () => void
}

/**
 * Manages dialog open/close states and git configuration.
 * @returns State and handlers for dialog management
 */
export function useDialogState(): UseDialogStateResult {
  const [pathDialogOpen, setPathDialogOpen] = useState(false)
  const [lastUsedPath, setLastUsedPath] = useState<string>(() => {
    const stored = localStorage.getItem('yolium:lastPath')
    return stored ? normalizePath(stored) : '~/'
  })
  const [pathDialogMode, setPathDialogMode] = useState<PathDialogMode>('newTab')

  const [shortcutsDialogOpen, setShortcutsDialogOpen] = useState(false)
  const [gitConfigDialogOpen, setGitConfigDialogOpen] = useState(false)
  const [gitConfig, setGitConfig] = useState<GitConfigWithPat | null>(null)
  const [projectConfigDialogOpen, setProjectConfigDialogOpen] = useState(false)
  const [projectConfigProjectPath, setProjectConfigProjectPath] = useState('')
  const [agentSettingsDialogOpen, setAgentSettingsDialogOpen] = useState(false)

  // Load git config on mount
  useEffect(() => {
    window.electronAPI.git.loadConfig().then((config) => {
      if (config) {
        setGitConfig(config)
      }
    })
  }, [])

  const openPathDialog = useCallback((mode: PathDialogMode) => {
    setPathDialogMode(mode)
    setPathDialogOpen(true)
  }, [])

  const closePathDialog = useCallback(() => {
    setPathDialogOpen(false)
  }, [])

  const openShortcutsDialog = useCallback(() => {
    setShortcutsDialogOpen(true)
  }, [])

  const closeShortcutsDialog = useCallback(() => {
    setShortcutsDialogOpen(false)
  }, [])

  const openGitConfigDialog = useCallback(async () => {
    // Fetch latest config values before opening dialog
    const config = await window.electronAPI.git.loadConfig()
    if (config) {
      setGitConfig(config)
    }
    setGitConfigDialogOpen(true)
  }, [])

  const closeGitConfigDialog = useCallback(() => {
    setGitConfigDialogOpen(false)
  }, [])

  const saveGitConfig = useCallback(async (config: { githubPat?: string; openaiApiKey?: string; anthropicApiKey?: string; useClaudeOAuth?: boolean; useCodexOAuth?: boolean; providerModelDefaults?: Record<string, string>; providerModels?: Record<string, string[]> }) => {
    await window.electronAPI.git.saveConfig(config)
    // Reload from IPC to get sanitized form with hasPat/hasOpenaiKey flags
    const reloaded = await window.electronAPI.git.loadConfig()
    setGitConfig(reloaded)
    setGitConfigDialogOpen(false)
  }, [])

  const openProjectConfigDialog = useCallback((projectPath: string) => {
    setProjectConfigProjectPath(projectPath)
    setProjectConfigDialogOpen(true)
  }, [])

  const closeProjectConfigDialog = useCallback(() => {
    setProjectConfigDialogOpen(false)
  }, [])

  const openAgentSettingsDialog = useCallback(() => {
    setAgentSettingsDialogOpen(true)
  }, [])

  const closeAgentSettingsDialog = useCallback(() => {
    setAgentSettingsDialogOpen(false)
  }, [])

  return {
    pathDialogOpen,
    lastUsedPath,
    pathDialogMode,
    shortcutsDialogOpen,
    gitConfigDialogOpen,
    gitConfig,
    projectConfigDialogOpen,
    projectConfigProjectPath,
    openPathDialog,
    closePathDialog,
    setLastUsedPath,
    openShortcutsDialog,
    closeShortcutsDialog,
    openGitConfigDialog,
    closeGitConfigDialog,
    saveGitConfig,
    openProjectConfigDialog,
    closeProjectConfigDialog,
    agentSettingsDialogOpen,
    openAgentSettingsDialog,
    closeAgentSettingsDialog,
  }
}
