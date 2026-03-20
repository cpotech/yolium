/**
 * @module src/hooks/useKeyboardShortcuts
 * Hook for registering global keyboard shortcut IPC listeners.
 */

import { useEffect } from 'react'

export interface UseKeyboardShortcutsOptions {
  onNewTab: () => void
  onCloseActiveTab: () => void
  onNextTab: () => void
  onPrevTab: () => void
  onCloseTab: (tabId: string) => void
  onCloseOtherTabs: (keepTabId: string) => void
  onCloseAllTabs: () => void
  onShowShortcuts: () => void
  onOpenGitConfig: () => void
  onOpenProject: () => void
  onToggleRecording: () => void
  onOpenSchedule?: () => void
  onRefreshUsage?: () => void
}

/**
 * Registers IPC listeners for global keyboard shortcuts.
 * @param options - Callback handlers for each shortcut action
 */
export function useKeyboardShortcuts({
  onNewTab,
  onCloseActiveTab,
  onNextTab,
  onPrevTab,
  onCloseTab,
  onCloseOtherTabs,
  onCloseAllTabs,
  onShowShortcuts,
  onOpenGitConfig,
  onOpenProject,
  onToggleRecording,
  onOpenSchedule,
  onRefreshUsage,
}: UseKeyboardShortcutsOptions): void {
  useEffect(() => {
    const cleanupNew = window.electronAPI.tabs.onNew(onNewTab)
    const cleanupClose = window.electronAPI.tabs.onClose(onCloseActiveTab)
    const cleanupNext = window.electronAPI.tabs.onNext(onNextTab)
    const cleanupPrev = window.electronAPI.tabs.onPrev(onPrevTab)
    const cleanupCloseSpecific = window.electronAPI.tabs.onCloseSpecific(onCloseTab)
    const cleanupCloseOthers = window.electronAPI.tabs.onCloseOthers(onCloseOtherTabs)
    const cleanupCloseAll = window.electronAPI.tabs.onCloseAll(onCloseAllTabs)
    const cleanupShortcuts = window.electronAPI.events.onShortcutsShow(onShowShortcuts)
    const cleanupGitSettings = window.electronAPI.events.onGitSettingsShow(onOpenGitConfig)
    const cleanupProjectOpen = window.electronAPI.events.onProjectOpen(onOpenProject)
    const cleanupRecording = window.electronAPI.events.onRecordingToggle(onToggleRecording)
    const cleanupSchedule = onOpenSchedule
      ? window.electronAPI.events.onScheduleShow(onOpenSchedule)
      : undefined
    const cleanupUsageRefresh = onRefreshUsage
      ? window.electronAPI.events.onUsageRefresh(onRefreshUsage)
      : undefined

    return () => {
      cleanupNew()
      cleanupClose()
      cleanupNext()
      cleanupPrev()
      cleanupCloseSpecific()
      cleanupCloseOthers()
      cleanupCloseAll()
      cleanupShortcuts()
      cleanupGitSettings()
      cleanupProjectOpen()
      cleanupRecording()
      cleanupSchedule?.()
      cleanupUsageRefresh?.()
    }
  }, [
    onNewTab,
    onCloseActiveTab,
    onNextTab,
    onPrevTab,
    onCloseTab,
    onCloseOtherTabs,
    onCloseAllTabs,
    onShowShortcuts,
    onOpenGitConfig,
    onOpenProject,
    onToggleRecording,
    onOpenSchedule,
    onRefreshUsage,
  ])
}
