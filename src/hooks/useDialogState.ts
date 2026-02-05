/**
 * @module src/hooks/useDialogState
 * Hook for managing dialog open/close states and git config.
 */

import { useState, useEffect, useCallback } from 'react'
import type { GitConfig, GitConfigWithPat } from '../components/GitConfigDialog'
import { normalizePath } from '../lib/path-utils'

export type PathDialogMode = 'newTab' | 'addProject'

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
  saveGitConfig: (config: GitConfig) => Promise<void>
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

  const saveGitConfig = useCallback(async (config: GitConfig) => {
    await window.electronAPI.git.saveConfig(config)
    // Reload from IPC to get sanitized form with hasPat/hasOpenaiKey flags
    const reloaded = await window.electronAPI.git.loadConfig()
    setGitConfig(reloaded)
    setGitConfigDialogOpen(false)
  }, [])

  return {
    pathDialogOpen,
    lastUsedPath,
    pathDialogMode,
    shortcutsDialogOpen,
    gitConfigDialogOpen,
    gitConfig,
    openPathDialog,
    closePathDialog,
    setLastUsedPath,
    openShortcutsDialog,
    closeShortcutsDialog,
    openGitConfigDialog,
    closeGitConfigDialog,
    saveGitConfig,
  }
}
