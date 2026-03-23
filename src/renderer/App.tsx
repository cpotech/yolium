import React, { useEffect, useCallback, useState, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { useTabState } from '@renderer/hooks/useTabState';
import { useWhisper } from '@renderer/hooks/useWhisper';
import { useDockerState } from '@renderer/hooks/useDockerState';
import { useDialogState } from '@renderer/hooks/useDialogState';
import { useAgentCreation } from '@renderer/hooks/useAgentCreation';
import { useKeyboardShortcuts } from '@renderer/hooks/useKeyboardShortcuts';
import { useGitBranchPolling } from '@renderer/hooks/useGitBranchPolling';
import { useClaudeUsage } from '@renderer/hooks/useClaudeUsage';
import { TabBar } from '@renderer/components/tabs/TabBar';
import { Terminal } from '@renderer/components/terminal/Terminal';
import { StatusBar } from '@renderer/components/StatusBar';
import { EmptyState } from '@renderer/components/EmptyState';
import { AgentSelectDialog } from '@renderer/components/agent/AgentSelectDialog';
import { PathInputDialog } from '@renderer/components/navigation/PathInputDialog';
import { KeyboardShortcutsDialog } from '@renderer/components/settings/KeyboardShortcutsDialog';
import { DockerSetupDialog } from '@renderer/components/docker/DockerSetupDialog';
import { GitConfigDialog } from '@renderer/components/settings/GitConfigDialog';
import { ProjectConfigDialog } from '@renderer/components/settings/ProjectConfigDialog';
import { WhisperModelDialog } from '@renderer/components/settings/WhisperModelDialog';
import type { WhisperModelSize } from '@shared/types/whisper';
import { Sidebar } from '@renderer/components/navigation/Sidebar';
import type { SidebarWorkItem } from '@renderer/components/navigation/ProjectList';
import {
  getSidebarProjects,
  removeSidebarProject,
  addSidebarProject,
  getOpenKanbanPaths,
  saveOpenKanbanPaths,
  type SidebarProject,
} from '@renderer/stores/sidebar-store';
import { KanbanView } from '@renderer/components/kanban/KanbanView';
import { SchedulePanel } from '@renderer/components/schedule/SchedulePanel';
import { ErrorBoundary } from '@renderer/components/ErrorBoundary';
import { VimModeProvider } from '@renderer/context/VimModeContext';
import { useConfirmDialog } from '@renderer/hooks/useConfirmDialog';
import { ConfirmDialog } from '@renderer/components/shared/ConfirmDialog';
import { WhichKeyPopup } from '@renderer/components/WhichKeyPopup';
import { useVimModeContext } from '@renderer/context/VimModeContext';

function WhichKeyPopupWired(): React.ReactElement | null {
  const vim = useVimModeContext();
  if (!vim.leaderPending || !vim.leaderZone) return null;

  return (
    <WhichKeyPopup
      zone={vim.leaderZone}
      onDismiss={vim.clearLeader}
    />
  );
}

function App(): React.ReactElement {
  // Restore kanban tabs that were open in the previous session
  const savedKanbanPaths = useMemo(() => getOpenKanbanPaths(), []);
  const {
    tabs,
    activeTabId,
    addTab,
    closeTab,
    setActiveTab,
    updateCwd,
    updateContainerState,
    updateGitBranch,
    closeAllTabs,
    closeOtherTabs,
    addKanbanTab,
    closeKanbanForProject,
    addScheduleTab,
  } = useTabState(savedKanbanPaths);

  // Whisper speech-to-text
  const whisper = useWhisper();

  // Claude OAuth usage data
  const { state: claudeUsage, refresh: refreshClaudeUsage } = useClaudeUsage();

  // Stable ref for toggleRecording to avoid IPC listener re-registration
  const stableToggleRecording = useCallback(() => whisper.toggleRecording(), [whisper]);

  // Confirm dialog for stop-container
  const { confirm: confirmAction, dialogProps: confirmDialogProps } = useConfirmDialog();

  // Docker state management
  const docker = useDockerState();

  // Dialog state management
  const dialogs = useDialogState();

  // State for sidebar (must be declared before useAgentCreation which uses setSidebarProjects)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarProjects, setSidebarProjects] = useState<SidebarProject[]>(() => getSidebarProjects());
  const [sidebarItems, setSidebarItems] = useState<SidebarWorkItem[]>([]);

  // Agent creation flow
  const agentCreation = useAgentCreation({
    gitConfig: dialogs.gitConfig,
    buildCancelledRef: docker.buildCancelledRef,
    setBuildProgress: docker.setBuildProgress,
    setBuildError: docker.setBuildError,
    setImageRemoved: docker.setImageRemoved,
    addTab,
    addKanbanTab,
    updateContainerState,
    setSidebarProjects,
    pathDialogMode: dialogs.pathDialogMode,
    closePathDialog: dialogs.closePathDialog,
    setLastUsedPath: dialogs.setLastUsedPath,
  });

  // Handle Back button in agent dialog (returns to path dialog)
  const handleAgentDialogBack = useCallback(() => {
    agentCreation.handleAgentDialogCancel();
    // Reopen path dialog with the previously selected path
    dialogs.openPathDialog(dialogs.pathDialogMode);
  }, [agentCreation, dialogs]);

  // Persist open kanban tab paths so they restore on next launch
  useEffect(() => {
    const kanbanPaths = tabs.filter(t => t.type === 'kanban').map(t => t.cwd);
    saveOpenKanbanPaths(kanbanPaths);
  }, [tabs]);

  // Docker unavailability error shown inline instead of alert()
  const [dockerError, setDockerError] = useState<string | null>(null);

  // Create a new yolium tab
  const handleNewYolium = useCallback(async () => {
    // Check Docker availability first
    const dockerOk = await window.electronAPI.docker.isAvailable();
    if (!dockerOk) {
      setDockerError('Docker is not running. Please start Docker Desktop and try again.');
      return;
    }
    setDockerError(null);

    // Set mode and open path input dialog
    dialogs.openPathDialog('newTab');
  }, [dialogs]);

  // Add a project to sidebar (opens path dialog, then kanban tab)
  const handleOpenProject = useCallback(() => {
    dialogs.openPathDialog('openProject');
  }, [dialogs]);

  // Click a project in sidebar - opens/focuses its kanban tab
  const handleProjectClick = useCallback((path: string) => {
    addKanbanTab(path);
  }, [addKanbanTab]);

  // Remove a project from sidebar (also closes its kanban tab if open)
  const handleProjectRemove = useCallback((path: string) => {
    removeSidebarProject(path);
    setSidebarProjects(getSidebarProjects());
    closeKanbanForProject(path);
  }, [closeKanbanForProject]);

  // Load active work items from all sidebar projects (running, waiting, failed)
  const refreshSidebarItems = useCallback(async () => {
    const items: SidebarWorkItem[] = [];
    for (const project of getSidebarProjects()) {
      try {
        const board = await window.electronAPI.kanban.getBoard(project.path);
        if (board) {
          for (const item of board.items) {
            if (item.column === 'done') continue;
            // Include items with active agent status: running, waiting, or failed
            if (item.agentStatus === 'running' || item.agentStatus === 'failed') {
              items.push({
                projectPath: project.path,
                itemId: item.id,
                itemTitle: item.title,
                agentStatus: item.agentStatus,
                column: item.column,
                agentName: item.activeAgentName,
                agentType: item.agentType,
              });
            } else if (item.agentStatus === 'waiting' && item.agentQuestion) {
              items.push({
                projectPath: project.path,
                itemId: item.id,
                itemTitle: item.title,
                question: item.agentQuestion,
                options: item.agentQuestionOptions,
                agentName: item.activeAgentName,
                agentStatus: item.agentStatus,
                column: item.column,
                agentType: item.agentType,
              });
            }
          }
        }
      } catch {
        // skip projects that fail to load
      }
    }
    setSidebarItems(items);
  }, []);

  // Refresh sidebar items on mount and when board updates occur
  useEffect(() => {
    refreshSidebarItems();
    const cleanup = window.electronAPI.kanban.onBoardUpdated(() => {
      refreshSidebarItems();
    });
    return cleanup;
  }, [refreshSidebarItems]);

  // Answer a question and resume the agent from sidebar
  const handleAnswerAndResume = useCallback(async (projectPath: string, itemId: string, answer: string, agentName: string) => {
    await window.electronAPI.agent.answer(projectPath, itemId, answer);
    // Fetch the item's description to use as goal
    const board = await window.electronAPI.kanban.getBoard(projectPath);
    const item = board?.items.find((i: { id: string }) => i.id === itemId);
    await window.electronAPI.agent.resume({
      agentName,
      projectPath,
      itemId,
      goal: item?.description || '',
    });
  }, []);

  // Delete a project entirely (backend cleanup + sidebar + tab)
  const handleDeleteProject = useCallback(async (projectPath: string) => {
    await window.electronAPI.kanban.deleteBoard(projectPath);
    removeSidebarProject(projectPath);
    setSidebarProjects(getSidebarProjects());
    closeKanbanForProject(projectPath);
  }, [closeKanbanForProject]);

  // Close a tab - instant UI update, cleanup in background
  const handleCloseTab = useCallback((tabId: string) => {
    const tab = tabs.find(t => t.id === tabId);
    if (!tab) return;

    // Close tab immediately in UI for instant feedback
    closeTab(tabId);

    // Cleanup container and worktree in background (always delete worktree)
    window.electronAPI.container.stop(tab.sessionId!, true).catch((err) => {
      console.error('Failed to cleanup container:', err);
    });
  }, [tabs, closeTab]);

  // Close current active tab
  const handleCloseActiveTab = useCallback(() => {
    if (activeTabId) {
      handleCloseTab(activeTabId);
    }
  }, [activeTabId, handleCloseTab]);

  // Switch to next tab
  const handleNextTab = useCallback(() => {
    if (tabs.length <= 1) return;
    const currentIndex = tabs.findIndex(t => t.id === activeTabId);
    const nextIndex = (currentIndex + 1) % tabs.length;
    setActiveTab(tabs[nextIndex].id);
  }, [tabs, activeTabId, setActiveTab]);

  // Switch to previous tab
  const handlePrevTab = useCallback(() => {
    if (tabs.length <= 1) return;
    const currentIndex = tabs.findIndex(t => t.id === activeTabId);
    const prevIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    setActiveTab(tabs[prevIndex].id);
  }, [tabs, activeTabId, setActiveTab]);

  // Go to kanban board (vim 'b' key)
  const handleGoToKanban = useCallback(() => {
    const kanbanTabs = tabs.filter(t => t.type === 'kanban');
    if (kanbanTabs.length === 0) {
      // No kanban tabs — open first sidebar project's kanban
      if (sidebarProjects.length > 0) {
        addKanbanTab(sidebarProjects[0].path);
      }
      return;
    }

    const activeTab = tabs.find(t => t.id === activeTabId);
    if (activeTab?.type === 'kanban' && kanbanTabs.length > 1) {
      // Cycle to next kanban tab
      const currentIndex = kanbanTabs.findIndex(t => t.id === activeTabId);
      const nextIndex = (currentIndex + 1) % kanbanTabs.length;
      setActiveTab(kanbanTabs[nextIndex].id);
    } else {
      // Switch to first kanban tab
      setActiveTab(kanbanTabs[0].id);
    }
  }, [tabs, activeTabId, sidebarProjects, addKanbanTab, setActiveTab]);

  // Close all tabs - instant UI update, cleanup in background
  const handleCloseAllTabs = useCallback(() => {
    // Store session IDs before clearing tabs
    const sessionIds = tabs.map(t => t.sessionId);

    // Close all tabs immediately in UI
    closeAllTabs();

    // Cleanup containers and worktrees in background (always delete worktrees)
    sessionIds.forEach(sessionId => {
      window.electronAPI.container.stop(sessionId!, true).catch((err) => {
        console.error('Failed to cleanup container:', err);
      });
    });
  }, [tabs, closeAllTabs]);

  // Close other tabs (keep one) - instant UI update, cleanup in background
  const handleCloseOtherTabs = useCallback((keepTabId: string) => {
    const otherTabs = tabs.filter(t => t.id !== keepTabId);

    // Store session IDs before clearing tabs
    const sessionIds = otherTabs.map(t => t.sessionId);

    // Close other tabs immediately in UI
    closeOtherTabs(keepTabId);

    // Cleanup containers and worktrees in background (always delete worktrees)
    sessionIds.forEach(sessionId => {
      window.electronAPI.container.stop(sessionId!, true).catch((err) => {
        console.error('Failed to cleanup container:', err);
      });
    });
  }, [tabs, closeOtherTabs]);

  // Stop yolium from StatusBar (per CONTEXT.md: "After stopping, tab closes automatically")
  const handleStopYolium = useCallback(async (tabId: string) => {
    const confirmed = await confirmAction({
      title: 'Stop Container',
      message: 'Stop this yolium container?',
      confirmLabel: 'Stop',
    });
    if (!confirmed) return;

    handleCloseTab(tabId);
  }, [handleCloseTab, confirmAction]);

  // Delete Docker image — close all tabs with proper cleanup, then remove image
  const handleDeleteImage = useCallback(async () => {
    const confirmed = await docker.handleDeleteImage();
    if (!confirmed) return;

    // Close all terminal tabs with proper container + worktree cleanup
    const terminalTabs = tabs.filter(t => t.type === 'terminal' && t.sessionId);
    await Promise.all(
      terminalTabs.map(t => window.electronAPI.container.stop(t.sessionId!, true).catch((err) => {
        console.error('Failed to cleanup container:', err);
      }))
    );
    closeAllTabs();

    // Now remove remaining containers and the image
    await docker.executeImageDeletion();
  }, [docker, tabs, closeAllTabs]);

  // Build Docker image
  const handleBuildImage = useCallback(() => {
    docker.handleBuildImage();
  }, [docker]);

  // Send transcribed text to the active terminal
  useEffect(() => {
    if (whisper.state.transcribedText && activeTabId) {
      const activeTab = tabs.find(t => t.id === activeTabId);
      if (activeTab) {
        window.electronAPI.container.write(activeTab.sessionId!, whisper.state.transcribedText);
        whisper.clearTranscription();
      }
    }
  }, [whisper.state.transcribedText, activeTabId, tabs, whisper]);

  // Handle whisper model deletion (refresh model list by closing and reopening dialog synchronously)
  const handleDeleteWhisperModel = useCallback(async (modelSize: WhisperModelSize) => {
    await window.electronAPI.whisper.deleteModel(modelSize);
    // Close and re-open to force the dialog to re-fetch model list
    whisper.closeModelDialog();
    // Use requestAnimationFrame to wait for React to process the close before reopening
    requestAnimationFrame(() => whisper.openModelDialog());
  }, [whisper]);

  // Handle context menu
  const handleTabContextMenu = useCallback((tabId: string, x: number, y: number) => {
    window.electronAPI.tabs.showContextMenu(tabId, x, y);
  }, []);

  // Handle CWD change from terminal
  const handleCwdChange = useCallback((tabId: string, cwd: string) => {
    updateCwd(tabId, cwd);
  }, [updateCwd]);

  // Register keyboard shortcut listeners
  useKeyboardShortcuts({
    onNewTab: handleNewYolium,
    onCloseActiveTab: handleCloseActiveTab,
    onNextTab: handleNextTab,
    onPrevTab: handlePrevTab,
    onCloseTab: handleCloseTab,
    onCloseOtherTabs: handleCloseOtherTabs,
    onCloseAllTabs: handleCloseAllTabs,
    onShowShortcuts: dialogs.openShortcutsDialog,
    onOpenGitConfig: dialogs.openGitConfigDialog,
    onOpenProject: handleOpenProject,
    onToggleRecording: stableToggleRecording,
    onOpenSchedule: addScheduleTab,
    onRefreshUsage: refreshClaudeUsage,
  });

  // Listen for container exit events to update state
  useEffect(() => {
    const cleanup = window.electronAPI.container.onExit((sessionId, exitCode) => {
      const tab = tabs.find(t => t.sessionId === sessionId);
      if (tab) {
        // Update state based on exit code
        const newState = exitCode === 0 ? 'stopped' : 'crashed';
        updateContainerState(tab.id, newState);
      }
    });
    return cleanup;
  }, [tabs, updateContainerState]);

  // Periodic git branch refresh (handles worktrees and regular repos)
  useGitBranchPolling({
    activeTabId,
    tabs,
    updateGitBranch,
  });


  // Show loading spinner while checking Docker status
  if (docker.dockerReady === null) {
    return (
      <div className="h-screen bg-[var(--color-bg-primary)] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[var(--color-text-secondary)] animate-spin" />
      </div>
    );
  }

  // Show Docker setup dialog if Docker is not ready
  if (!docker.dockerReady) {
    return (
      <div className="h-screen bg-[var(--color-bg-primary)]">
        <DockerSetupDialog onComplete={docker.handleDockerSetupComplete} />
      </div>
    );
  }

  // Normal app UI when Docker is ready
  return (
    <VimModeProvider onGoToKanban={handleGoToKanban} onShowShortcuts={dialogs.openShortcutsDialog}>
    <div className="flex flex-col h-screen bg-[var(--color-bg-primary)]">
      {/* Path input dialog */}
      <PathInputDialog
        isOpen={dialogs.pathDialogOpen}
        initialPath={dialogs.lastUsedPath}
        onConfirm={agentCreation.handlePathConfirm}
        onCancel={dialogs.closePathDialog}
      />

      {/* Agent selection dialog */}
      <AgentSelectDialog
        isOpen={agentCreation.agentDialogOpen}
        folderPath={agentCreation.pendingFolderPath || ''}
        gitStatus={agentCreation.pendingFolderGitStatus}
        onSelect={agentCreation.handleAgentSelect}
        onBack={handleAgentDialogBack}
        onCancel={agentCreation.handleAgentDialogCancel}
        onGitInit={agentCreation.refreshGitStatus}
      />

      {/* Keyboard shortcuts dialog */}
      <KeyboardShortcutsDialog
        isOpen={dialogs.shortcutsDialogOpen}
        onClose={dialogs.closeShortcutsDialog}
      />

      {/* Git config dialog */}
      <GitConfigDialog
        isOpen={dialogs.gitConfigDialogOpen}
        onClose={dialogs.closeGitConfigDialog}
        onSave={dialogs.saveGitConfig}
        initialConfig={dialogs.gitConfig}
        onDeleteImage={handleDeleteImage}
        onBuildImage={handleBuildImage}
        imageRemoved={docker.imageRemoved}
        isRebuilding={docker.isRebuilding}
      />

      {/* Whisper model selection dialog */}
      <WhisperModelDialog
        isOpen={whisper.state.isModelDialogOpen}
        selectedModel={whisper.state.selectedModel}
        downloadProgress={whisper.state.downloadProgress}
        downloadingModel={whisper.state.downloadingModel}
        onSelectModel={whisper.setModel}
        onDownloadModel={whisper.downloadModel}
        onDeleteModel={handleDeleteWhisperModel}
        onClose={whisper.closeModelDialog}
      />

      {/* Project config dialog */}
      <ProjectConfigDialog
        isOpen={dialogs.projectConfigDialogOpen}
        projectPath={dialogs.projectConfigProjectPath}
        onClose={dialogs.closeProjectConfigDialog}
      />

      {/* Docker image build progress overlay */}
      {(docker.buildProgress || docker.buildError) && (
        <div data-testid="build-progress-overlay" className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70">
          <div className="bg-[var(--color-bg-secondary)] rounded-lg p-6 max-w-2xl w-full mx-4 shadow-xl border border-[var(--color-border-primary)]">
            <div className="flex items-center gap-3 mb-4">
              {docker.buildError ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 text-[var(--color-status-error)]">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              ) : (
                <Loader2 className="w-6 h-6 text-[var(--color-accent-primary)] animate-spin" />
              )}
              <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
                {docker.buildError ? 'Docker Image Build Failed' : docker.isRebuilding ? 'Deleting Docker Image' : 'Building Docker Image'}
              </h2>
            </div>
            {docker.buildProgress && (
              <div
                ref={docker.progressRef}
                className="bg-[var(--color-bg-primary)] rounded p-3 font-mono text-xs text-[var(--color-text-secondary)] max-h-64 overflow-y-auto"
              >
                {docker.buildProgress.map((line, index) => (
                  <div key={index} className="whitespace-pre-wrap break-all leading-relaxed">
                    {line}
                  </div>
                ))}
              </div>
            )}
            {docker.buildError && (
              <div className="mt-3 p-3 bg-[var(--color-status-error)]/10 border border-[var(--color-status-error)]/30 rounded text-sm text-[var(--color-status-error)]">
                {docker.buildError}
              </div>
            )}
            {docker.buildError ? (
              <button
                onClick={() => { docker.setBuildError(null); docker.setBuildProgress(null); }}
                className="mt-4 px-4 py-2 bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-border-primary)] text-[var(--color-text-primary)] rounded transition-colors"
              >
                Close
              </button>
            ) : !docker.isRebuilding ? (
              <div className="mt-3 flex items-center justify-between">
                <p className="text-xs text-[var(--color-text-muted)]">
                  This only happens once. Future launches will be instant.
                </p>
                <button
                  data-testid="build-cancel-button"
                  onClick={() => { docker.buildCancelledRef.current = true; docker.setBuildProgress(null); }}
                  className="ml-4 px-3 py-1.5 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] rounded transition-colors border border-[var(--color-border-primary)] hover:bg-[var(--color-bg-tertiary)]"
                >
                  Cancel
                </button>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Tab bar - always visible */}
      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onTabClick={setActiveTab}
        onTabClose={handleCloseTab}
        onTabContextMenu={handleTabContextMenu}
        onNewTab={handleNewYolium}
      />

      {/* Main content area */}
      <main className="flex-1 min-h-0 relative flex flex-row">
        {/* Sidebar - project list for quick kanban access */}
        <Sidebar
          projects={sidebarProjects}
          collapsed={sidebarCollapsed}
          sidebarItems={sidebarItems}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
          onProjectClick={handleProjectClick}
          onProjectRemove={handleProjectRemove}
          onOpenProject={handleOpenProject}
          onAnswerAndResume={handleAnswerAndResume}
          onOpenSchedule={addScheduleTab}
        />

        {/* Content area */}
        <div className="flex-1 min-h-0 relative flex flex-col">
          {tabs.length === 0 ? (
            <>
              <div className="flex-1 min-h-0">
                <EmptyState onNewTab={handleNewYolium} onOpenProject={handleOpenProject} projects={sidebarProjects} onProjectClick={handleProjectClick} />
              </div>
              {/* Minimal status bar for empty state */}
              <StatusBar
                onShowShortcuts={dialogs.openShortcutsDialog}
                onOpenSettings={dialogs.openGitConfigDialog}
                whisperRecordingState={whisper.state.recordingState}
                whisperSelectedModel={whisper.state.selectedModel}
                onToggleRecording={whisper.toggleRecording}
                onOpenModelDialog={whisper.openModelDialog}
                claudeUsage={claudeUsage}
                onRefreshUsage={refreshClaudeUsage}
              />
            </>
          ) : (
            <>
              {/* Render all tabs - show only active one */}
              {tabs.map(tab => {
                const isActive = tab.id === activeTabId;

                if (tab.type === 'kanban') {
                  // Kanban tab
                  return (
                    <div
                      key={tab.id}
                      className={`absolute inset-0 flex flex-col ${isActive ? '' : 'hidden'}`}
                    >
                      <ErrorBoundary fallbackLabel="Kanban Board">
                       <KanbanView
                           projectPath={tab.cwd}
                           onSwitchProject={async (newPath) => {
                             const oldPath = tab.cwd;
                             updateCwd(tab.id, newPath);
                             addSidebarProject(newPath);
                             if (oldPath) {
                               removeSidebarProject(oldPath);
                               await window.electronAPI.kanban.deleteBoard(oldPath);
                             }
                             setSidebarProjects(getSidebarProjects());
                           }}
                           onDeleteProject={handleDeleteProject}
                           // StatusBar props
                           onShowShortcuts={dialogs.openShortcutsDialog}
                           onOpenSettings={dialogs.openGitConfigDialog}
                           onOpenProjectSettings={() => dialogs.openProjectConfigDialog(tab.cwd)}
                           whisperRecordingState={whisper.state.recordingState}
                           whisperSelectedModel={whisper.state.selectedModel}
                           onToggleRecording={whisper.toggleRecording}
                           onOpenModelDialog={whisper.openModelDialog}
                           claudeUsage={claudeUsage}
                           onOpenSchedule={addScheduleTab}
                         />
                      </ErrorBoundary>
                      <StatusBar
                        folderPath={tab.cwd}
                        onShowShortcuts={dialogs.openShortcutsDialog}
                        onOpenSettings={dialogs.openGitConfigDialog}
                        onOpenProjectSettings={() => dialogs.openProjectConfigDialog(tab.cwd)}
                        whisperRecordingState={whisper.state.recordingState}
                        whisperSelectedModel={whisper.state.selectedModel}
                        onToggleRecording={whisper.toggleRecording}
                        onOpenModelDialog={whisper.openModelDialog}
                        claudeUsage={claudeUsage}
                      />
                    </div>
                  );
                }

                if (tab.type === 'schedule') {
                  // Schedule tab
                  return (
                    <div
                      key={tab.id}
                      className={`absolute inset-0 flex flex-col ${isActive ? '' : 'hidden'}`}
                    >
                      <div className="flex-1 min-h-0 relative overflow-hidden">
                        <SchedulePanel onGoToKanban={handleGoToKanban} />
                      </div>
                      <StatusBar
                        contextLabel="Scheduled Agents"
                        onShowShortcuts={dialogs.openShortcutsDialog}
                        onOpenSettings={dialogs.openGitConfigDialog}
                        whisperRecordingState={whisper.state.recordingState}
                        whisperSelectedModel={whisper.state.selectedModel}
                        onToggleRecording={whisper.toggleRecording}
                        onOpenModelDialog={whisper.openModelDialog}
                        claudeUsage={claudeUsage}
                      />
                    </div>
                  );
                }

                // Terminal tab
                return (
                  <div
                    key={tab.id}
                    className={`absolute inset-0 flex flex-col ${isActive ? '' : 'hidden'}`}
                  >
                    <div className="flex-1 min-h-0 relative">
                      <ErrorBoundary fallbackLabel="Terminal">
                        <Terminal
                          sessionId={tab.sessionId!}
                          isVisible={isActive}
                          isContainer={true}
                          onCwdChange={(cwd) => handleCwdChange(tab.id, cwd)}
                          onExit={(exitCode) => {
                            const newState = exitCode === 0 ? 'stopped' : 'crashed';
                            updateContainerState(tab.id, newState);
                          }}
                          className="absolute inset-0 bg-[#0a0a0a]"
                        />
                      </ErrorBoundary>
                    </div>
                    <StatusBar
                      folderPath={tab.cwd}
                      containerState={tab.containerState}
                      onStop={() => handleStopYolium(tab.id)}
                      onShowShortcuts={dialogs.openShortcutsDialog}
                      onOpenSettings={dialogs.openGitConfigDialog}
                      onOpenProjectSettings={() => dialogs.openProjectConfigDialog(tab.cwd)}
                      gitBranch={tab.gitBranch}
                      worktreeName={tab.worktreeName}
                      whisperRecordingState={whisper.state.recordingState}
                      whisperSelectedModel={whisper.state.selectedModel}
                      onToggleRecording={whisper.toggleRecording}
                      onOpenModelDialog={whisper.openModelDialog}
                      claudeUsage={claudeUsage}
                    />
                  </div>
                );
              })}
            </>
          )}
        </div>
      </main>

      {/* Agent creation error notification */}
      {agentCreation.creationError && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-50 bg-[var(--color-status-error)] text-white px-4 py-2 rounded-md shadow-lg text-sm max-w-md">
          <div className="flex items-center gap-2">
            <span>{agentCreation.creationError}</span>
            <button
              onClick={agentCreation.clearCreationError}
              className="text-white/80 hover:text-white ml-2"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Docker unavailability notification */}
      {dockerError && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-50 bg-[var(--color-status-error)] text-white px-4 py-2 rounded-md shadow-lg text-sm max-w-md">
          <div className="flex items-center gap-2">
            <span>{dockerError}</span>
            <button
              onClick={() => setDockerError(null)}
              className="text-white/80 hover:text-white ml-2"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Whisper error notification */}
      {whisper.state.error && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-50 bg-[var(--color-status-error)] text-white px-4 py-2 rounded-md shadow-lg text-sm max-w-md">
          <div className="flex items-center gap-2">
            <span>Speech-to-text: {whisper.state.error}</span>
            <button
              onClick={whisper.clearTranscription}
              className="text-white/80 hover:text-white ml-2"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
      {/* Shared confirm dialogs */}
      <ConfirmDialog {...confirmDialogProps} />
      <ConfirmDialog {...docker.confirmDialogProps} />
      {/* Which-key popup (leader key) */}
      <WhichKeyPopupWired />
    </div>
    </VimModeProvider>
  );
}

export default App;
