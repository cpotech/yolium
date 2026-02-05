import React, { useEffect, useCallback, useState, useRef, useMemo } from 'react';
import { Loader2, GitPullRequest, Settings } from 'lucide-react';
import { useTabState } from './hooks/useTabState';
import { useWhisper } from './hooks/useWhisper';
import { TabBar } from './components/TabBar';
import { Terminal } from './components/Terminal';
import { StatusBar } from './components/StatusBar';
import { EmptyState } from './components/EmptyState';
import { AgentSelectDialog, AgentType } from './components/AgentSelectDialog';
import { PathInputDialog } from './components/PathInputDialog';
import { KeyboardShortcutsDialog } from './components/KeyboardShortcutsDialog';
import { DockerSetupDialog } from './components/DockerSetupDialog';
import { GitConfigDialog, GitConfig, GitConfigWithPat } from './components/GitConfigDialog';
import { CodeReviewDialog } from './components/CodeReviewDialog';
import type { ReviewAgentType, CodeReviewStatus } from './types/agent';
import { WhisperModelDialog } from './components/WhisperModelDialog';
import { SpeechToTextButton } from './components/SpeechToTextButton';
import type { WhisperModelSize } from './types/whisper';
import { normalizePath } from './lib/path-utils';
import { Sidebar } from './components/Sidebar';
import {
  getSidebarProjects,
  addSidebarProject,
  removeSidebarProject,
  getOpenKanbanPaths,
  saveOpenKanbanPaths,
  type SidebarProject,
} from './lib/sidebar-store';
import { KanbanView } from './components/KanbanView';

type PathDialogMode = 'newTab' | 'addProject';

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
  const toggleRecordingRef = useRef(whisper.toggleRecording);
  toggleRecordingRef.current = whisper.toggleRecording;
  const stableToggleRecording = useCallback(() => toggleRecordingRef.current(), []);

  // Stable ref for clearTranscription to avoid useEffect dependency issues
  const clearTranscriptionRef = useRef(whisper.clearTranscription);
  clearTranscriptionRef.current = whisper.clearTranscription;

  // State for Docker readiness (null = checking, true = ready, false = needs setup)
  const [dockerReady, setDockerReady] = useState<boolean | null>(null);

  // State for path input dialog
  const [pathDialogOpen, setPathDialogOpen] = useState(false);
  const [lastUsedPath, setLastUsedPath] = useState<string>(() => {
    const stored = localStorage.getItem('yolium:lastPath');
    return stored ? normalizePath(stored) : '~/';
  });

  // State for agent selection dialog
  const [agentDialogOpen, setAgentDialogOpen] = useState(false);
  const [pendingFolderPath, setPendingFolderPath] = useState<string | null>(null);
  const [pendingFolderGitStatus, setPendingFolderGitStatus] = useState<{ isRepo: boolean; hasCommits: boolean } | null>(null);

  // State for keyboard shortcuts dialog
  const [shortcutsDialogOpen, setShortcutsDialogOpen] = useState(false);

  // State for git config dialog
  const [gitConfigDialogOpen, setGitConfigDialogOpen] = useState(false);
  const [gitConfig, setGitConfig] = useState<GitConfigWithPat | null>(null);

  // State for Docker image build progress (array of lines)
  const [buildProgress, setBuildProgress] = useState<string[] | null>(null);
  // State for build failure (shows error in overlay instead of hiding it)
  const [buildError, setBuildError] = useState<string | null>(null);

  // State for image rebuild
  const [isRebuilding, setIsRebuilding] = useState(false);
  const [imageRemoved, setImageRemoved] = useState(false);

  // State for code review dialog
  const [codeReviewDialogOpen, setCodeReviewDialogOpen] = useState(false);
  const [reviewStatus, setReviewStatus] = useState<CodeReviewStatus | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewLog, setReviewLog] = useState<string[]>([]);

  // State for sidebar
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [sidebarProjects, setSidebarProjects] = useState<SidebarProject[]>(() => getSidebarProjects());
  const [pathDialogMode, setPathDialogMode] = useState<PathDialogMode>('newTab');

  // Ref for auto-scrolling build progress
  const progressRef = useRef<HTMLDivElement>(null);
  const buildCancelledRef = useRef<boolean>(false);

  // Create yolium with selected agent
  const createYoliumWithAgent = useCallback(async (folderPath: string, agent: AgentType, gsdEnabled: boolean, worktreeEnabled: boolean = false, branchName: string | null = null) => {
    buildCancelledRef.current = false;

    // Set up progress listener before starting
    const cleanupProgress = window.electronAPI.docker.onBuildProgress((message) => {
      setBuildProgress(prev => {
        const lines = prev || [];
        // Keep last 50 lines to prevent memory issues
        const newLines = [...lines, message].slice(-50);
        return newLines;
      });
    });

    // Ensure image is available (builds if needed)
    try {
      setBuildError(null);
      setBuildProgress(['Checking Yolium image...']);
      await window.electronAPI.docker.ensureImage();
      if (buildCancelledRef.current) {
        cleanupProgress();
        return;
      }
      setBuildProgress(null);
      setImageRemoved(false); // Image now exists
    } catch (err) {
      console.error('Failed to ensure yolium image:', err);
      const message = err instanceof Error ? err.message : 'Unknown error';
      // Show error in the build progress overlay instead of hiding it
      setBuildError(message);
      cleanupProgress();
      return;
    }
    cleanupProgress();

    // Create yolium container with selected agent
    try {
      const sessionId = await window.electronAPI.container.create(folderPath, agent, gsdEnabled, gitConfig || undefined, worktreeEnabled, branchName || undefined);

      // Use worktree branch name if enabled, otherwise fetch from folder
      const gitBranch = worktreeEnabled && branchName
        ? branchName
        : await window.electronAPI.git.getBranch(folderPath);
      const tabId = addTab(sessionId, folderPath, 'starting', gitBranch || undefined);

      // Add project to sidebar
      addSidebarProject(folderPath);
      setSidebarProjects(getSidebarProjects());

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

  // Handle dialog cancel (Escape key - cancels entire flow)
  const handleAgentDialogCancel = useCallback(() => {
    setAgentDialogOpen(false);
    setPendingFolderPath(null);
    setPendingFolderGitStatus(null);
  }, []);

  // Handle Back button in agent dialog (returns to path dialog)
  const handleAgentDialogBack = useCallback(() => {
    setAgentDialogOpen(false);
    // Reopen path dialog with the previously selected path
    setPathDialogOpen(true);
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

    // Handle based on mode
    if (pathDialogMode === 'addProject') {
      // Add project to sidebar and open its kanban tab
      addSidebarProject(normalizedPath);
      setSidebarProjects(getSidebarProjects());
      addKanbanTab(normalizedPath);
      return;
    }

    // New Tab mode: open agent dialog to select agent type
    setPendingFolderPath(normalizedPath);

    // Check if folder is a git repo (async, UI will show "checking...")
    setPendingFolderGitStatus(null);
    setAgentDialogOpen(true);

    try {
      const gitStatus = await window.electronAPI.git.isRepo(normalizedPath);
      setPendingFolderGitStatus(gitStatus);
    } catch {
      setPendingFolderGitStatus({ isRepo: false, hasCommits: false });
    }
  }, [pathDialogMode, addKanbanTab]);

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
  const handleOpenGitConfig = useCallback(async () => {
    // Fetch latest config values before opening dialog
    const config = await window.electronAPI.git.loadConfig();
    if (config) {
      setGitConfig(config);
    }
    setGitConfigDialogOpen(true);
  }, []);

  const handleCloseGitConfig = useCallback(() => {
    setGitConfigDialogOpen(false);
  }, []);

  const handleSaveGitConfig = useCallback(async (config: GitConfig) => {
    await window.electronAPI.git.saveConfig(config);
    // Reload from IPC to get sanitized form with hasPat/hasOpenaiKey flags
    const reloaded = await window.electronAPI.git.loadConfig();
    setGitConfig(reloaded);
    setGitConfigDialogOpen(false);
  }, []);

  // Code review dialog handlers
  const handleOpenCodeReview = useCallback(() => {
    setReviewStatus(null);
    setReviewError(null);
    setReviewLog([]);
    setCodeReviewDialogOpen(true);
  }, []);

  const handleCloseCodeReview = useCallback(() => {
    setCodeReviewDialogOpen(false);
  }, []);

  const handleStartReview = useCallback(async (repoUrl: string, branch: string, agent: ReviewAgentType) => {
    setReviewStatus('starting');
    setReviewError(null);
    setReviewLog([]);

    try {
      // Set up output listener to capture container logs
      const cleanupOutput = window.electronAPI.codeReview.onOutput((_sessionId, data) => {
        const lines = data.split('\n').filter((line: string) => line.trim() !== '');
        if (lines.length > 0) {
          setReviewLog(prev => [...prev, ...lines]);
        }
      });

      // Set up completion listener
      const cleanupComplete = window.electronAPI.codeReview.onComplete((_sessionId, exitCode, authError) => {
        if (exitCode === 0) {
          setReviewStatus('completed');
        } else if (exitCode === 2) {
          setReviewStatus('failed');
          setReviewError('No open PR found for this branch. Please create a PR first.');
        } else if (exitCode === 3 || authError) {
          setReviewStatus('failed');
          setReviewError('Agent authentication failed. Please check your API key in Settings.');
        } else {
          setReviewStatus('failed');
          setReviewError(`Container exited with code ${exitCode}`);
        }
        cleanupOutput();
        cleanupComplete();
      });

      await window.electronAPI.docker.ensureImage();
      await window.electronAPI.codeReview.start(repoUrl, branch, agent, gitConfig || undefined);
      setReviewStatus('running');
    } catch (err) {
      setReviewStatus('failed');
      setReviewError(err instanceof Error ? err.message : 'Failed to start code review');
    }
  }, [gitConfig]);

  // Persist open kanban tab paths so they restore on next launch
  useEffect(() => {
    const kanbanPaths = tabs.filter(t => t.type === 'kanban').map(t => t.cwd);
    saveOpenKanbanPaths(kanbanPaths);
  }, [tabs]);

  // Check Docker state on app launch
  useEffect(() => {
    window.electronAPI.docker.detectState().then((state) => {
      if (state.running) {
        setDockerReady(true);
      } else {
        setDockerReady(false);
      }
    }).catch(() => {
      setDockerReady(false);
    });
  }, []);

  // Auto-check/build Docker image on startup when Docker is ready
  useEffect(() => {
    if (!dockerReady) return;
    buildCancelledRef.current = false;

    const cleanupProgress = window.electronAPI.docker.onBuildProgress((message) => {
      setBuildProgress(prev => {
        const lines = prev || [];
        return [...lines, message].slice(-50);
      });
    });

    setBuildError(null);
    setBuildProgress(['Checking Yolium image...']);

    window.electronAPI.docker.ensureImage()
      .then(() => {
        cleanupProgress();
        if (!buildCancelledRef.current) {
          setBuildProgress(null);
          setImageRemoved(false);
        }
      })
      .catch((err) => {
        cleanupProgress();
        if (!buildCancelledRef.current) {
          const message = err instanceof Error ? err.message : 'Unknown error';
          setBuildError(message);
        }
      });

    return () => { cleanupProgress(); };
  }, [dockerReady]);

  // Load git config on mount
  useEffect(() => {
    window.electronAPI.git.loadConfig().then((config) => {
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
    const dockerOk = await window.electronAPI.docker.isAvailable();
    if (!dockerOk) {
      // TODO: Show inline error in UI (for now, alert)
      alert('Docker is not running. Please start Docker Desktop and try again.');
      return;
    }

    // Set mode and open path input dialog
    setPathDialogMode('newTab');
    setPathDialogOpen(true);
  }, []);

  // Add a project to sidebar (opens path dialog, then kanban tab)
  const handleAddProject = useCallback(() => {
    setPathDialogMode('addProject');
    setPathDialogOpen(true);
  }, []);

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

  // Rebuild Docker image
  const handleRebuildImage = useCallback(async () => {
    // Show confirmation dialog
    const confirmed = await window.electronAPI.dialog.confirmOkCancel(
      'Delete Docker Image',
      'This will:\n\u2022 End all active terminals\n\u2022 Remove all yolium containers\n\u2022 Remove the Docker image\n\nThe image will be rebuilt automatically when you start a new terminal.\n\nContinue?'
    );
    if (!confirmed) return;

    setIsRebuilding(true);

    try {
      // Close all tabs (which stops all containers)
      await Promise.all(tabs.map(t => window.electronAPI.container.stop(t.sessionId)));
      closeAllTabs();

      // Remove any remaining containers
      await window.electronAPI.docker.removeAllContainers();

      // Remove the image
      await window.electronAPI.docker.removeImage();

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

  // Send transcribed text to the active terminal
  useEffect(() => {
    if (whisper.state.transcribedText && activeTabId) {
      const activeTab = tabs.find(t => t.id === activeTabId);
      if (activeTab) {
        window.electronAPI.container.write(activeTab.sessionId, whisper.state.transcribedText);
        clearTranscriptionRef.current();
      }
    }
  }, [whisper.state.transcribedText, activeTabId, tabs]);

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
  useEffect(() => {
    const cleanupNew = window.electronAPI.tabs.onNew(handleNewYolium);
    const cleanupClose = window.electronAPI.tabs.onClose(handleCloseActiveTab);
    const cleanupNext = window.electronAPI.tabs.onNext(handleNextTab);
    const cleanupPrev = window.electronAPI.tabs.onPrev(handlePrevTab);
    const cleanupCloseSpecific = window.electronAPI.tabs.onCloseSpecific(handleCloseTab);
    const cleanupCloseOthers = window.electronAPI.tabs.onCloseOthers(handleCloseOtherTabs);
    const cleanupCloseAll = window.electronAPI.tabs.onCloseAll(handleCloseAllTabs);
    const cleanupShortcuts = window.electronAPI.events.onShortcutsShow(handleShowShortcuts);
    const cleanupGitSettings = window.electronAPI.events.onGitSettingsShow(handleOpenGitConfig);
    const cleanupProjectNew = window.electronAPI.events.onProjectNew(handleAddProject);
    const cleanupRecording = window.electronAPI.events.onRecordingToggle(stableToggleRecording);

    return () => {
      cleanupNew();
      cleanupClose();
      cleanupNext();
      cleanupPrev();
      cleanupCloseSpecific();
      cleanupCloseOthers();
      cleanupCloseAll();
      cleanupShortcuts();
      cleanupGitSettings();
      cleanupProjectNew();
      cleanupRecording();
    };
  }, [handleNewYolium, handleCloseActiveTab, handleNextTab, handlePrevTab, handleCloseTab, handleCloseOtherTabs, handleCloseAllTabs, handleShowShortcuts, handleOpenGitConfig, handleAddProject, stableToggleRecording]);

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
  useEffect(() => {
    if (!activeTabId) return;

    const refreshGitBranch = async () => {
      const activeTab = tabs.find(t => t.id === activeTabId);
      if (!activeTab?.cwd) return;

      // Check if session uses a worktree to get the correct path
      const worktreeInfo = await window.electronAPI.container.getWorktreeInfo(activeTab.sessionId);
      // Use worktree path if available, otherwise use the tab's cwd
      const gitPath = worktreeInfo?.worktreePath || activeTab.cwd;
      const branch = await window.electronAPI.git.getBranch(gitPath);
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
      <div className="h-screen bg-[var(--color-bg-primary)] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[var(--color-text-secondary)] animate-spin" />
      </div>
    );
  }

  // Show Docker setup dialog if Docker is not ready
  if (!dockerReady) {
    return (
      <div className="h-screen bg-[var(--color-bg-primary)]">
        <DockerSetupDialog onComplete={handleDockerSetupComplete} />
      </div>
    );
  }

  // Normal app UI when Docker is ready
  return (
    <div className="flex flex-col h-screen bg-[var(--color-bg-primary)]">
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
        onBack={handleAgentDialogBack}
        onCancel={handleAgentDialogCancel}
        onGitInit={async () => {
          if (pendingFolderPath) {
            const gitStatus = await window.electronAPI.git.isRepo(pendingFolderPath);
            setPendingFolderGitStatus(gitStatus);
          }
        }}
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
        isOpen={codeReviewDialogOpen}
        onClose={handleCloseCodeReview}
        onStartReview={handleStartReview}
        hasGitCredentials={!!gitConfig?.hasPat}
        reviewStatus={reviewStatus}
        reviewError={reviewError}
        reviewLog={reviewLog}
      />

      {/* Docker image build progress overlay */}
      {(buildProgress || buildError) && (
        <div data-testid="build-progress-overlay" className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="bg-[var(--color-bg-secondary)] rounded-lg p-6 max-w-2xl w-full mx-4 shadow-xl border border-[var(--color-border-primary)]">
            <div className="flex items-center gap-3 mb-4">
              {buildError ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 text-[var(--color-status-error)]">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              ) : (
                <Loader2 className="w-6 h-6 text-[var(--color-accent-primary)] animate-spin" />
              )}
              <h2 className="text-lg font-semibold text-white">
                {buildError ? 'Docker Image Build Failed' : isRebuilding ? 'Deleting Docker Image' : 'Building Docker Image'}
              </h2>
            </div>
            {buildProgress && (
              <div
                ref={progressRef}
                className="bg-[var(--color-bg-primary)] rounded p-3 font-mono text-xs text-[var(--color-text-secondary)] max-h-64 overflow-y-auto"
              >
                {buildProgress.map((line, index) => (
                  <div key={index} className="whitespace-pre-wrap break-all leading-relaxed">
                    {line}
                  </div>
                ))}
              </div>
            )}
            {buildError && (
              <div className="mt-3 p-3 bg-[var(--color-status-error)]/10 border border-[var(--color-status-error)]/30 rounded text-sm text-[var(--color-status-error)]">
                {buildError}
              </div>
            )}
            {buildError ? (
              <button
                onClick={() => { setBuildError(null); setBuildProgress(null); }}
                className="mt-4 px-4 py-2 bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-border-primary)] text-white rounded transition-colors"
              >
                Close
              </button>
            ) : !isRebuilding ? (
              <div className="mt-3 flex items-center justify-between">
                <p className="text-xs text-[var(--color-text-muted)]">
                  This only happens once. Future launches will be instant.
                </p>
                <button
                  data-testid="build-cancel-button"
                  onClick={() => { buildCancelledRef.current = true; setBuildProgress(null); }}
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
                {/* Docker image info and rebuild button (only shown when image exists) */}
                {!imageRemoved && (
                  <>
                    <span className="flex items-center gap-1 text-[var(--color-text-muted)]">
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
                      className="flex items-center gap-1 px-2 py-0.5 rounded text-[var(--color-text-secondary)] hover:text-white hover:bg-[var(--color-bg-tertiary)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                    <span className="text-[var(--color-text-disabled)]">|</span>
                  </>
                )}

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
                  onClick={handleOpenCodeReview}
                  className="flex items-center gap-1 px-2 py-0.5 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] transition-colors"
                  title="PR Code Review"
                >
                  <GitPullRequest size={12} />
                  <span>PR Review</span>
                </button>

                {/* Settings button */}
                <button
                  onClick={handleOpenGitConfig}
                  className="flex items-center gap-1 px-2 py-0.5 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] transition-colors"
                  title="Settings"
                >
                  <Settings size={12} />
                </button>

                <button
                  data-testid="shortcuts-button"
                  onClick={handleShowShortcuts}
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
                      onShowShortcuts={handleShowShortcuts}
                      onOpenSettings={handleOpenGitConfig}
                      onOpenCodeReview={handleOpenCodeReview}
                      imageName={imageRemoved ? undefined : 'yolium:latest'}
                      onRebuild={handleRebuildImage}
                      isRebuilding={isRebuilding}
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
