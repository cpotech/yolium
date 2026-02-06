import React, { useEffect, useCallback, useState, useMemo } from 'react';
import { Loader2, GitPullRequest, Settings } from 'lucide-react';
import { useTabState } from '@renderer/hooks/useTabState';
import { useWhisper } from '@renderer/hooks/useWhisper';
import { useDockerState } from '@renderer/hooks/useDockerState';
import { useDialogState } from '@renderer/hooks/useDialogState';
import { useAgentCreation } from '@renderer/hooks/useAgentCreation';
import { useCodeReview } from '@renderer/hooks/useCodeReview';
import { useKeyboardShortcuts } from '@renderer/hooks/useKeyboardShortcuts';
import { useGitBranchPolling } from '@renderer/hooks/useGitBranchPolling';
import { TabBar } from '@renderer/components/tabs/TabBar';
import { Terminal } from '@renderer/components/terminal/Terminal';
import { StatusBar } from '@renderer/components/StatusBar';
import { EmptyState } from '@renderer/components/EmptyState';
import { AgentSelectDialog } from '@renderer/components/agent/AgentSelectDialog';
import { PathInputDialog } from '@renderer/components/navigation/PathInputDialog';
import { KeyboardShortcutsDialog } from '@renderer/components/settings/KeyboardShortcutsDialog';
import { DockerSetupDialog } from '@renderer/components/docker/DockerSetupDialog';
import { GitConfigDialog } from '@renderer/components/settings/GitConfigDialog';
import { CodeReviewDialog } from '@renderer/components/code-review/CodeReviewDialog';
import { WhisperModelDialog } from '@renderer/components/settings/WhisperModelDialog';
import { SpeechToTextButton } from '@renderer/components/SpeechToTextButton';
import type { WhisperModelSize } from '@shared/types/whisper';
import { Sidebar } from '@renderer/components/navigation/Sidebar';
import {
  getSidebarProjects,
  removeSidebarProject,
  getOpenKanbanPaths,
  saveOpenKanbanPaths,
  type SidebarProject,
} from '@renderer/stores/sidebar-store';
import { KanbanView } from '@renderer/components/kanban/KanbanView';

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
  } = useTabState(savedKanbanPaths);

  // Whisper speech-to-text
  const whisper = useWhisper();

  // Stable ref for toggleRecording to avoid IPC listener re-registration
  const stableToggleRecording = useCallback(() => whisper.toggleRecording(), [whisper]);

  // Docker state management
  const docker = useDockerState();

  // Dialog state management
  const dialogs = useDialogState();

  // State for sidebar (must be declared before useAgentCreation which uses setSidebarProjects)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [sidebarProjects, setSidebarProjects] = useState<SidebarProject[]>(() => getSidebarProjects());

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

  // Code review functionality
  const codeReview = useCodeReview({ gitConfig: dialogs.gitConfig });

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

  // Create a new yolium tab
  const handleNewYolium = useCallback(async () => {
    // Check Docker availability first
    const dockerOk = await window.electronAPI.docker.isAvailable();
    if (!dockerOk) {
      // TODO: Show inline error in UI (for now, alert)
      alert('Docker is not running. Please start Docker Desktop and try again.');
      return;
    }

    // Set mode and open path input dialog
    dialogs.openPathDialog('newTab');
  }, [dialogs]);

  // Add a project to sidebar (opens path dialog, then kanban tab)
  const handleAddProject = useCallback(() => {
    dialogs.openPathDialog('addProject');
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

  // Close a tab - instant UI update, cleanup in background
  const handleCloseTab = useCallback((tabId: string) => {
    const tab = tabs.find(t => t.id === tabId);
    if (!tab) return;

    // Close tab immediately in UI for instant feedback
    closeTab(tabId);

    // Cleanup container and worktree in background (always delete worktree)
    window.electronAPI.container.stop(tab.sessionId, true).catch((err) => {
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

  // Close all tabs - instant UI update, cleanup in background
  const handleCloseAllTabs = useCallback(() => {
    // Store session IDs before clearing tabs
    const sessionIds = tabs.map(t => t.sessionId);

    // Close all tabs immediately in UI
    closeAllTabs();

    // Cleanup containers and worktrees in background (always delete worktrees)
    sessionIds.forEach(sessionId => {
      window.electronAPI.container.stop(sessionId, true).catch((err) => {
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
      window.electronAPI.container.stop(sessionId, true).catch((err) => {
        console.error('Failed to cleanup container:', err);
      });
    });
  }, [tabs, closeOtherTabs]);

  // Stop yolium from StatusBar (per CONTEXT.md: "After stopping, tab closes automatically")
  const handleStopYolium = useCallback(async (tabId: string) => {
    const confirmed = await window.electronAPI.dialog.confirmOkCancel(
      'Stop Container',
      'Stop this yolium container?'
    );
    if (!confirmed) return;

    handleCloseTab(tabId);
  }, [handleCloseTab]);

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
        window.electronAPI.container.write(activeTab.sessionId, whisper.state.transcribedText);
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
    onAddProject: handleAddProject,
    onToggleRecording: stableToggleRecording,
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

      {/* Code review dialog */}
      <CodeReviewDialog
        isOpen={codeReview.dialogOpen}
        onClose={codeReview.closeDialog}
        onStartReview={codeReview.startReview}
        hasGitCredentials={!!dialogs.gitConfig?.hasPat}
        reviewStatus={codeReview.reviewStatus}
        reviewError={codeReview.reviewError}
        reviewLog={codeReview.reviewLog}
      />

      {/* Docker image build progress overlay */}
      {(docker.buildProgress || docker.buildError) && (
        <div data-testid="build-progress-overlay" className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
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
              <h2 className="text-lg font-semibold text-white">
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
                className="mt-4 px-4 py-2 bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-border-primary)] text-white rounded transition-colors"
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
                  className="ml-4 px-3 py-1.5 text-sm text-[var(--color-text-secondary)] hover:text-white rounded transition-colors border border-[var(--color-border-primary)] hover:bg-[var(--color-bg-tertiary)]"
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
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
          onProjectClick={handleProjectClick}
          onProjectRemove={handleProjectRemove}
          onAddProject={handleAddProject}
        />

        {/* Content area */}
        <div className="flex-1 min-h-0 relative flex flex-col">
          {tabs.length === 0 ? (
            <>
              <div className="flex-1 min-h-0">
                <EmptyState onNewTab={handleNewYolium} onCreateProject={handleAddProject} />
              </div>
              {/* Minimal status bar for empty state */}
              <div className="flex items-center justify-end h-7 px-3 bg-[var(--color-bg-secondary)] border-t border-[var(--color-border-primary)] text-xs shrink-0 gap-2">
                {/* Speech-to-text button */}
                <SpeechToTextButton
                  recordingState={whisper.state.recordingState}
                  selectedModel={whisper.state.selectedModel}
                  onToggleRecording={whisper.toggleRecording}
                  onOpenModelDialog={whisper.openModelDialog}
                />
                <span className="text-[var(--color-text-disabled)]">|</span>

                {/* PR Review button */}
                <button
                  data-testid="code-review-button"
                  onClick={codeReview.openDialog}
                  className="flex items-center gap-1 px-2 py-0.5 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] transition-colors"
                  title="PR Code Review"
                >
                  <GitPullRequest size={12} />
                  <span>PR Review</span>
                </button>

                {/* Settings button */}
                <button
                  onClick={dialogs.openGitConfigDialog}
                  className="flex items-center gap-1 px-2 py-0.5 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] transition-colors"
                  title="Settings"
                >
                  <Settings size={12} />
                </button>

                <button
                  data-testid="shortcuts-button"
                  onClick={dialogs.openShortcutsDialog}
                  className="flex items-center gap-1 px-2 py-0.5 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] transition-colors"
                  title="Keyboard shortcuts (Ctrl+?)"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <path d="M6 8h.001M10 8h.001M14 8h.001M18 8h.001M8 12h.001M12 12h.001M16 12h.001M7 16h10" />
                  </svg>
                  <span>Ctrl+?</span>
                </button>
              </div>
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
                      <KanbanView projectPath={tab.cwd} />
                      <StatusBar
                        folderPath={tab.cwd}
                        onShowShortcuts={dialogs.openShortcutsDialog}
                        onOpenSettings={dialogs.openGitConfigDialog}
                        onOpenCodeReview={codeReview.openDialog}
                        whisperRecordingState={whisper.state.recordingState}
                        whisperSelectedModel={whisper.state.selectedModel}
                        onToggleRecording={whisper.toggleRecording}
                        onOpenModelDialog={whisper.openModelDialog}
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
                      <Terminal
                        sessionId={tab.sessionId}
                        isVisible={isActive}
                        isContainer={true}
                        onCwdChange={(cwd) => handleCwdChange(tab.id, cwd)}
                        onExit={(exitCode) => {
                          const newState = exitCode === 0 ? 'stopped' : 'crashed';
                          updateContainerState(tab.id, newState);
                        }}
                        className="absolute inset-0 bg-[#0a0a0a]"
                      />
                    </div>
                    <StatusBar
                      folderPath={tab.cwd}
                      containerState={tab.containerState}
                      onStop={() => handleStopYolium(tab.id)}
                      onShowShortcuts={dialogs.openShortcutsDialog}
                      onOpenSettings={dialogs.openGitConfigDialog}
                      onOpenCodeReview={codeReview.openDialog}
                      gitBranch={tab.gitBranch}
                      worktreeName={tab.worktreeName}
                      whisperRecordingState={whisper.state.recordingState}
                      whisperSelectedModel={whisper.state.selectedModel}
                      onToggleRecording={whisper.toggleRecording}
                      onOpenModelDialog={whisper.openModelDialog}
                    />
                  </div>
                );
              })}
            </>
          )}
        </div>
      </main>

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
    </div>
  );
}

export default App;
