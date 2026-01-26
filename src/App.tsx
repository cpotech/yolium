import React, { useEffect, useCallback, useState, useRef } from 'react';
import { Loader2, GitGraph } from 'lucide-react';
import { useTabState } from './hooks/useTabState';
import { TabBar } from './components/TabBar';
import { Terminal } from './components/Terminal';
import { StatusBar } from './components/StatusBar';
import { EmptyState } from './components/EmptyState';
import { AgentSelectDialog, AgentType } from './components/AgentSelectDialog';
import { PathInputDialog } from './components/PathInputDialog';
import { KeyboardShortcutsDialog } from './components/KeyboardShortcutsDialog';
import { DockerSetupDialog } from './components/DockerSetupDialog';
import { GitConfigDialog, GitConfig } from './components/GitConfigDialog';

function App(): React.ReactElement {
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
    splitDirection,
    splitTabId,
    splitTab,
    splitHorizontal,
    splitVertical,
  } = useTabState();

  // State for Docker readiness (null = checking, true = ready, false = needs setup)
  const [dockerReady, setDockerReady] = useState<boolean | null>(null);

  // State for path input dialog
  const [pathDialogOpen, setPathDialogOpen] = useState(false);
  const [lastUsedPath, setLastUsedPath] = useState<string>(() => {
    return localStorage.getItem('yolium:lastPath') || '~/';
  });

  // State for agent selection dialog
  const [agentDialogOpen, setAgentDialogOpen] = useState(false);
  const [pendingFolderPath, setPendingFolderPath] = useState<string | null>(null);
  const [pendingFolderGitStatus, setPendingFolderGitStatus] = useState<{ isRepo: boolean; hasCommits: boolean } | null>(null);

  // State for keyboard shortcuts dialog
  const [shortcutsDialogOpen, setShortcutsDialogOpen] = useState(false);

  // State for git config dialog
  const [gitConfigDialogOpen, setGitConfigDialogOpen] = useState(false);
  const [gitConfig, setGitConfig] = useState<GitConfig | null>(null);

  // State for Docker image build progress (array of lines)
  const [buildProgress, setBuildProgress] = useState<string[] | null>(null);

  // State for image rebuild
  const [isRebuilding, setIsRebuilding] = useState(false);
  const [imageRemoved, setImageRemoved] = useState(false);

  // Ref for auto-scrolling build progress
  const progressRef = useRef<HTMLDivElement>(null);

  // Create yolium with selected agent
  const createYoliumWithAgent = useCallback(async (folderPath: string, agent: AgentType, gsdEnabled: boolean, worktreeEnabled: boolean = false, branchName: string | null = null) => {
    // Set up progress listener before starting
    const cleanupProgress = window.electronAPI.onDockerBuildProgress((message) => {
      setBuildProgress(prev => {
        const lines = prev || [];
        // Keep last 50 lines to prevent memory issues
        const newLines = [...lines, message].slice(-50);
        return newLines;
      });
    });

    // Ensure image is available (builds if needed)
    try {
      setBuildProgress(['Checking Yolium image...']);
      await window.electronAPI.ensureImage();
      setBuildProgress(null);
      setImageRemoved(false); // Image now exists
    } catch (err) {
      setBuildProgress(null);
      console.error('Failed to ensure yolium image:', err);
      const message = err instanceof Error ? err.message : 'Unknown error';
      alert(message);
      cleanupProgress();
      return;
    }
    cleanupProgress();

    // Create yolium container with selected agent
    try {
      const sessionId = await window.electronAPI.createYolium(folderPath, agent, gsdEnabled, gitConfig || undefined, worktreeEnabled, branchName || undefined);

      // Use worktree branch name if enabled, otherwise fetch from folder
      const gitBranch = worktreeEnabled && branchName
        ? branchName
        : await window.electronAPI.getGitBranch(folderPath);
      const tabId = addTab(sessionId, folderPath, 'starting', gitBranch || undefined);

      // Update to running once container is attached
      // For now, set running after a brief delay (proper approach: IPC state event)
      setTimeout(() => {
        updateContainerState(tabId, 'running');
      }, 1000);
    } catch (err) {
      console.error('Failed to create yolium:', err);
      alert('Failed to start yolium. Check Docker is running.');
    }
  }, [addTab, updateContainerState, gitConfig]);

  // Handle agent selection from dialog
  const handleAgentSelect = useCallback((agent: AgentType, gsdEnabled: boolean, worktreeEnabled: boolean, branchName: string | null) => {
    if (pendingFolderPath) {
      createYoliumWithAgent(pendingFolderPath, agent, gsdEnabled, worktreeEnabled, branchName);
    }
    setAgentDialogOpen(false);
    setPendingFolderPath(null);
    setPendingFolderGitStatus(null);
  }, [pendingFolderPath, createYoliumWithAgent]);

  // Handle dialog cancel
  const handleAgentDialogCancel = useCallback(() => {
    setAgentDialogOpen(false);
    setPendingFolderPath(null);
    setPendingFolderGitStatus(null);
  }, []);

  // Handle path confirmation from PathInputDialog
  const handlePathConfirm = useCallback(async (path: string) => {
    // Normalize path: expand ~ and remove trailing slash for storage
    let normalizedPath = path;
    if (normalizedPath.endsWith('/') && normalizedPath.length > 1) {
      normalizedPath = normalizedPath.slice(0, -1);
    }

    // Store last used path for next time
    localStorage.setItem('yolium:lastPath', path);
    setLastUsedPath(path);

    setPathDialogOpen(false);
    setPendingFolderPath(normalizedPath);

    // Check if folder is a git repo (async, UI will show "checking...")
    setPendingFolderGitStatus(null);
    setAgentDialogOpen(true);

    try {
      const gitStatus = await window.electronAPI.checkGitRepo(normalizedPath);
      setPendingFolderGitStatus(gitStatus);
    } catch {
      setPendingFolderGitStatus({ isRepo: false, hasCommits: false });
    }
  }, []);

  // Handle path dialog cancel
  const handlePathDialogCancel = useCallback(() => {
    setPathDialogOpen(false);
  }, []);

  // Shortcuts dialog handlers
  const handleShowShortcuts = useCallback(() => {
    setShortcutsDialogOpen(true);
  }, []);

  const handleCloseShortcuts = useCallback(() => {
    setShortcutsDialogOpen(false);
  }, []);

  // Git config dialog handlers
  const handleOpenGitConfig = useCallback(() => {
    setGitConfigDialogOpen(true);
  }, []);

  const handleCloseGitConfig = useCallback(() => {
    setGitConfigDialogOpen(false);
  }, []);

  const handleSaveGitConfig = useCallback(async (config: GitConfig) => {
    await window.electronAPI.saveGitConfig(config);
    setGitConfig(config);
    setGitConfigDialogOpen(false);
  }, []);

  // Handle quit request with confirmation
  const handleQuitRequest = useCallback(async () => {
    // Count tabs with running containers
    const runningCount = tabs.filter(
      t => t.containerState === 'running' || t.containerState === 'starting'
    ).length;

    if (runningCount > 0) {
      const confirmed = await window.electronAPI.showConfirmClose(
        `${runningCount} yolium${runningCount > 1 ? 's are' : ' is'} still running. Quit anyway?`
      );
      if (!confirmed) return;
    }

    // Force quit the app
    window.electronAPI.forceQuit();
  }, [tabs]);

  // Check Docker state on app launch
  useEffect(() => {
    window.electronAPI.detectDockerState().then((state) => {
      if (state.running) {
        setDockerReady(true);
      } else {
        setDockerReady(false);
      }
    }).catch(() => {
      setDockerReady(false);
    });
  }, []);

  // Load git config on mount
  useEffect(() => {
    window.electronAPI.loadGitConfig().then((config) => {
      if (config) {
        setGitConfig(config);
      }
    });
  }, []);

  // Auto-scroll build progress to bottom
  useEffect(() => {
    if (progressRef.current && buildProgress) {
      progressRef.current.scrollTop = progressRef.current.scrollHeight;
    }
  }, [buildProgress]);

  // Handle Docker setup completion
  const handleDockerSetupComplete = useCallback(() => {
    setDockerReady(true);
  }, []);

  // Create a new yolium tab
  const handleNewYolium = useCallback(async () => {
    // Check Docker availability first
    const dockerOk = await window.electronAPI.isDockerAvailable();
    if (!dockerOk) {
      // TODO: Show inline error in UI (for now, alert)
      alert('Docker is not running. Please start Docker Desktop and try again.');
      return;
    }

    // Open path input dialog
    setPathDialogOpen(true);
  }, []);

  // Close a tab (with confirmation for running containers and worktree cleanup)
  const handleCloseTab = useCallback(async (tabId: string) => {
    const tab = tabs.find(t => t.id === tabId);
    if (!tab) return;

    // For running containers, confirm before closing
    if (tab.containerState === 'running' || tab.containerState === 'starting') {
      const confirmed = await window.electronAPI.showConfirmClose(
        `"${tab.label}" has a running yolium. Stop and close?`
      );
      if (!confirmed) return;
    }

    // Check if this session has a worktree
    const worktreeInfo = await window.electronAPI.getWorktreeInfo(tab.sessionId);

    if (worktreeInfo) {
      // Show worktree cleanup dialog
      const { response } = await window.electronAPI.showWorktreeCleanupDialog(
        worktreeInfo.branchName,
        worktreeInfo.hasUncommittedChanges
      );

      // response: 0 = Keep, 1 = Delete, 2 = Cancel
      if (response === 2) {
        return; // User cancelled, don't close
      }

      const shouldDeleteWorktree = response === 1;

      // Stop the container with worktree cleanup option
      await window.electronAPI.stopYolium(tab.sessionId, shouldDeleteWorktree);
    } else {
      // Stop the container normally
      await window.electronAPI.stopYolium(tab.sessionId);
    }

    closeTab(tabId);
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

  // Close all tabs (with confirmation)
  const handleCloseAllTabs = useCallback(async () => {
    // Count tabs with running containers
    const runningCount = tabs.filter(
      t => t.containerState === 'running' || t.containerState === 'starting'
    ).length;

    if (runningCount > 0) {
      const confirmed = await window.electronAPI.showConfirmCloseMultiple(runningCount);
      if (!confirmed) return;
    }

    // Stop all containers
    await Promise.all(tabs.map(t => window.electronAPI.stopYolium(t.sessionId)));
    closeAllTabs();
  }, [tabs, closeAllTabs]);

  // Close other tabs (keep one)
  const handleCloseOtherTabs = useCallback(async (keepTabId: string) => {
    const otherTabs = tabs.filter(t => t.id !== keepTabId);

    // Count tabs with running containers
    const runningCount = otherTabs.filter(
      t => t.containerState === 'running' || t.containerState === 'starting'
    ).length;

    if (runningCount > 0) {
      const confirmed = await window.electronAPI.showConfirmCloseMultiple(runningCount);
      if (!confirmed) return;
    }

    // Stop other containers
    await Promise.all(otherTabs.map(t => window.electronAPI.stopYolium(t.sessionId)));
    closeOtherTabs(keepTabId);
  }, [tabs, closeOtherTabs]);

  // Stop yolium from StatusBar (per CONTEXT.md: "After stopping, tab closes automatically")
  const handleStopYolium = useCallback(async (tabId: string) => {
    const confirmed = await window.electronAPI.showConfirmClose(
      'Stop this yolium?'
    );
    if (!confirmed) return;

    handleCloseTab(tabId);
  }, [handleCloseTab]);

  // Rebuild Docker image
  const handleRebuildImage = useCallback(async () => {
    // Show confirmation dialog
    const confirmed = await window.electronAPI.showConfirmClose(
      'Delete Docker Image?\n\nThis will:\n\u2022 End all active terminals\n\u2022 Remove all yolium containers\n\u2022 Remove the Docker image\n\nThe image will be rebuilt automatically when you start a new terminal.\n\nContinue?'
    );
    if (!confirmed) return;

    setIsRebuilding(true);

    try {
      // Close all tabs (which stops all containers)
      await Promise.all(tabs.map(t => window.electronAPI.stopYolium(t.sessionId)));
      closeAllTabs();

      // Remove any remaining containers
      await window.electronAPI.removeAllContainers();

      // Remove the image
      await window.electronAPI.removeImage();

      // Mark image as removed
      setImageRemoved(true);

      // Show success (brief toast-like feedback via build progress)
      setBuildProgress(['Docker image removed. It will rebuild on next terminal start.']);
      setTimeout(() => setBuildProgress(null), 2000);
    } catch (err) {
      console.error('Failed to rebuild image:', err);
      const message = err instanceof Error ? err.message : 'Unknown error';
      setBuildProgress([`Error: ${message}`]);
      setTimeout(() => setBuildProgress(null), 3000);
    } finally {
      setIsRebuilding(false);
    }
  }, [tabs, closeAllTabs]);

  // Handle context menu
  const handleTabContextMenu = useCallback((tabId: string, x: number, y: number) => {
    window.electronAPI.showTabContextMenu(tabId, x, y);
  }, []);

  // Handle CWD change from terminal
  const handleCwdChange = useCallback((tabId: string, cwd: string) => {
    updateCwd(tabId, cwd);
  }, [updateCwd]);

  // Register keyboard shortcut listeners
  useEffect(() => {
    const cleanupNew = window.electronAPI.onTabNew(handleNewYolium);
    const cleanupClose = window.electronAPI.onTabClose(handleCloseActiveTab);
    const cleanupNext = window.electronAPI.onTabNext(handleNextTab);
    const cleanupPrev = window.electronAPI.onTabPrev(handlePrevTab);
    const cleanupCloseSpecific = window.electronAPI.onTabCloseSpecific(handleCloseTab);
    const cleanupCloseOthers = window.electronAPI.onTabCloseOthers(handleCloseOtherTabs);
    const cleanupCloseAll = window.electronAPI.onTabCloseAll(handleCloseAllTabs);
    const cleanupShortcuts = window.electronAPI.onShortcutsShow(handleShowShortcuts);
    const cleanupQuit = window.electronAPI.onQuitRequest(handleQuitRequest);
    const cleanupSplitH = window.electronAPI.onTabSplitHorizontal(splitHorizontal);
    const cleanupSplitV = window.electronAPI.onTabSplitVertical(splitVertical);

    return () => {
      cleanupNew();
      cleanupClose();
      cleanupNext();
      cleanupPrev();
      cleanupCloseSpecific();
      cleanupCloseOthers();
      cleanupCloseAll();
      cleanupShortcuts();
      cleanupQuit();
      cleanupSplitH();
      cleanupSplitV();
    };
  }, [handleNewYolium, handleCloseActiveTab, handleNextTab, handlePrevTab, handleCloseTab, handleCloseOtherTabs, handleCloseAllTabs, handleShowShortcuts, handleQuitRequest, splitHorizontal, splitVertical]);

  // Listen for container exit events to update state
  useEffect(() => {
    const cleanup = window.electronAPI.onContainerExit((sessionId, exitCode) => {
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
  useEffect(() => {
    if (!activeTabId) return;

    const refreshGitBranch = async () => {
      const activeTab = tabs.find(t => t.id === activeTabId);
      if (!activeTab?.cwd) return;

      // Check if session uses a worktree to get the correct path
      const worktreeInfo = await window.electronAPI.getWorktreeInfo(activeTab.sessionId);
      // Use worktree path if available, otherwise use the tab's cwd
      const gitPath = worktreeInfo?.worktreePath || activeTab.cwd;
      const branch = await window.electronAPI.getGitBranch(gitPath);
      // Pass worktree name (extracted from path) if this is a worktree session
      const worktreeName = worktreeInfo ? worktreeInfo.worktreePath.split('/').pop() : undefined;
      updateGitBranch(activeTabId, branch || undefined, worktreeName);
    };

    refreshGitBranch(); // Immediate refresh on tab change
    const interval = setInterval(refreshGitBranch, 3000); // Poll every 3s

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabId]);

  // Show loading spinner while checking Docker status
  if (dockerReady === null) {
    return (
      <div className="h-screen bg-gray-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
      </div>
    );
  }

  // Show Docker setup dialog if Docker is not ready
  if (!dockerReady) {
    return (
      <div className="h-screen bg-gray-900">
        <DockerSetupDialog onComplete={handleDockerSetupComplete} />
      </div>
    );
  }

  // Normal app UI when Docker is ready
  return (
    <div className="flex flex-col h-screen bg-gray-900">
      {/* Path input dialog */}
      <PathInputDialog
        isOpen={pathDialogOpen}
        initialPath={lastUsedPath}
        onConfirm={handlePathConfirm}
        onCancel={handlePathDialogCancel}
      />

      {/* Agent selection dialog */}
      <AgentSelectDialog
        isOpen={agentDialogOpen}
        folderPath={pendingFolderPath || ''}
        gitStatus={pendingFolderGitStatus}
        onSelect={handleAgentSelect}
        onCancel={handleAgentDialogCancel}
      />

      {/* Keyboard shortcuts dialog */}
      <KeyboardShortcutsDialog
        isOpen={shortcutsDialogOpen}
        onClose={handleCloseShortcuts}
      />

      {/* Git config dialog */}
      <GitConfigDialog
        isOpen={gitConfigDialogOpen}
        onClose={handleCloseGitConfig}
        onSave={handleSaveGitConfig}
        initialConfig={gitConfig}
      />

      {/* Docker image build progress overlay */}
      {buildProgress && (
        <div data-testid="build-progress-overlay" className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="bg-gray-800 rounded-lg p-6 max-w-2xl w-full mx-4 shadow-xl border border-gray-700">
            <div className="flex items-center gap-3 mb-4">
              <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
              <h2 className="text-lg font-semibold text-white">{isRebuilding ? 'Deleting Docker Image' : 'Building Docker Image'}</h2>
            </div>
            <div
              ref={progressRef}
              className="bg-gray-900 rounded p-3 font-mono text-xs text-gray-300 max-h-64 overflow-y-auto"
            >
              {buildProgress.map((line, index) => (
                <div key={index} className="whitespace-pre-wrap break-all leading-relaxed">
                  {line}
                </div>
              ))}
            </div>
            {!isRebuilding && (
              <p className="mt-3 text-xs text-gray-500">
                This only happens once. Future launches will be instant.
              </p>
            )}
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
      <main className="flex-1 min-h-0 relative flex flex-col">
        {tabs.length === 0 ? (
          <>
            <div className="flex-1 min-h-0">
              <EmptyState onNewTab={handleNewYolium} />
            </div>
            {/* Minimal status bar for empty state */}
            <div className="flex items-center justify-end h-7 px-3 bg-gray-800 border-t border-gray-700 text-xs shrink-0 gap-2">
              {/* Docker image info and rebuild button (only shown when image exists) */}
              {!imageRemoved && (
                <>
                  <span className="flex items-center gap-1 text-gray-500">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
                      <path d="m3.3 7 8.7 5 8.7-5" />
                      <path d="M12 22V12" />
                    </svg>
                    <span>yolium:latest</span>
                  </span>

                  {/* Rebuild button */}
                  <button
                    onClick={handleRebuildImage}
                    disabled={isRebuilding}
                    className="flex items-center gap-1 px-2 py-0.5 rounded text-gray-400 hover:text-white hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Delete Docker image"
                  >
                    {isRebuilding ? (
                      <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin">
                        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                        <path d="M21 3v5h-5" />
                        <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                        <path d="M8 16H3v5" />
                      </svg>
                    )}
                    <span>Delete</span>
                  </button>

                  {/* Separator */}
                  <span className="text-gray-600">|</span>
                </>
              )}

              {/* Git settings button */}
              <button
                onClick={handleOpenGitConfig}
                className="flex items-center gap-1 px-2 py-0.5 rounded text-gray-500 hover:text-gray-300 hover:bg-gray-700 transition-colors"
                title="Git Settings"
              >
                <GitGraph size={12} />
              </button>

              <button
                data-testid="shortcuts-button"
                onClick={handleShowShortcuts}
                className="flex items-center gap-1 px-2 py-0.5 rounded text-gray-500 hover:text-gray-300 hover:bg-gray-700 transition-colors"
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
        ) : splitDirection && splitTab && activeTabId && splitTabId !== activeTabId ? (
          <>
            {/* Split view mode - show two terminals */}
            <div className={`flex-1 min-h-0 flex ${splitDirection === 'horizontal' ? 'flex-row' : 'flex-col'}`}>
              {/* First pane - the split tab */}
              <div className={`relative ${splitDirection === 'horizontal' ? 'w-1/2 border-r border-gray-700' : 'h-1/2 border-b border-gray-700'}`}>
                <Terminal
                  sessionId={splitTab.sessionId}
                  isVisible={true}
                  isContainer={true}
                  onCwdChange={(cwd) => handleCwdChange(splitTab.id, cwd)}
                  onExit={(exitCode) => {
                    const newState = exitCode === 0 ? 'stopped' : 'crashed';
                    updateContainerState(splitTab.id, newState);
                  }}
                  className="absolute inset-0 bg-[#0a0a0a]"
                />
              </div>
              {/* Second pane - the active tab */}
              <div className={`relative ${splitDirection === 'horizontal' ? 'w-1/2' : 'h-1/2'}`}>
                {tabs.filter(tab => tab.id === activeTabId).map(tab => (
                  <Terminal
                    key={tab.id}
                    sessionId={tab.sessionId}
                    isVisible={true}
                    isContainer={true}
                    onCwdChange={(cwd) => handleCwdChange(tab.id, cwd)}
                    onExit={(exitCode) => {
                      const newState = exitCode === 0 ? 'stopped' : 'crashed';
                      updateContainerState(tab.id, newState);
                    }}
                    className="absolute inset-0 bg-[#0a0a0a]"
                  />
                ))}
              </div>
            </div>
            {/* Status bar for active tab in split mode */}
            {tabs.filter(tab => tab.id === activeTabId).map(tab => (
              <StatusBar
                key={tab.id}
                folderPath={tab.cwd}
                containerState={tab.containerState}
                onStop={() => handleStopYolium(tab.id)}
                onShowShortcuts={handleShowShortcuts}
                onOpenSettings={handleOpenGitConfig}
                imageName={imageRemoved ? undefined : 'yolium:latest'}
                onRebuild={handleRebuildImage}
                isRebuilding={isRebuilding}
                gitBranch={tab.gitBranch}
                worktreeName={tab.worktreeName}
              />
            ))}
          </>
        ) : (
          <>
            {/* Normal mode - render all terminals with StatusBar, show only active one */}
            {tabs.map(tab => (
              <div
                key={tab.id}
                className={`absolute inset-0 flex flex-col ${tab.id === activeTabId ? '' : 'hidden'}`}
              >
                <div className="flex-1 min-h-0 relative">
                  <Terminal
                    sessionId={tab.sessionId}
                    isVisible={tab.id === activeTabId}
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
                  onShowShortcuts={handleShowShortcuts}
                  onOpenSettings={handleOpenGitConfig}
                  imageName={imageRemoved ? undefined : 'yolium:latest'}
                  onRebuild={handleRebuildImage}
                  isRebuilding={isRebuilding}
                  gitBranch={tab.gitBranch}
                  worktreeName={tab.worktreeName}
                />
              </div>
            ))}
          </>
        )}
      </main>
    </div>
  );
}

export default App;
