import { contextBridge, ipcRenderer } from 'electron';

type CleanupFn = () => void;

contextBridge.exposeInMainWorld('electronAPI', {
  // App info
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  getHomeDir: () => ipcRenderer.invoke('app:get-home-dir'),
  openExternal: (url: string) => ipcRenderer.invoke('app:open-external', url),
  forceQuit: () => ipcRenderer.invoke('app:force-quit'),
  onQuitRequest: (callback: () => void): CleanupFn => {
    const handler = () => callback();
    ipcRenderer.on('app:quit-request', handler);
    return () => ipcRenderer.removeListener('app:quit-request', handler);
  },

  // Terminal operations
  createTerminal: (cwd?: string) => ipcRenderer.invoke('terminal:create', cwd),
  writeTerminal: (sessionId: string, data: string) =>
    ipcRenderer.send('terminal:write', sessionId, data),
  resizeTerminal: (sessionId: string, cols: number, rows: number) =>
    ipcRenderer.send('terminal:resize', sessionId, cols, rows),
  closeTerminal: (sessionId: string) => ipcRenderer.invoke('terminal:close', sessionId),
  hasRunningChildren: (sessionId: string) =>
    ipcRenderer.invoke('terminal:has-running-children', sessionId),

  // Terminal events (main -> renderer)
  onTerminalData: (callback: (sessionId: string, data: string) => void): CleanupFn => {
    const handler = (_event: Electron.IpcRendererEvent, sessionId: string, data: string) =>
      callback(sessionId, data);
    ipcRenderer.on('terminal:data', handler);
    return () => ipcRenderer.removeListener('terminal:data', handler);
  },
  onTerminalExit: (callback: (sessionId: string, exitCode: number) => void): CleanupFn => {
    const handler = (_event: Electron.IpcRendererEvent, sessionId: string, exitCode: number) =>
      callback(sessionId, exitCode);
    ipcRenderer.on('terminal:exit', handler);
    return () => ipcRenderer.removeListener('terminal:exit', handler);
  },

  // Tab events (main -> renderer, triggered by menu accelerators)
  onTabNew: (callback: () => void): CleanupFn => {
    const handler = () => callback();
    ipcRenderer.on('tab:new', handler);
    return () => ipcRenderer.removeListener('tab:new', handler);
  },
  onTabClose: (callback: () => void): CleanupFn => {
    const handler = () => callback();
    ipcRenderer.on('tab:close', handler);
    return () => ipcRenderer.removeListener('tab:close', handler);
  },
  onTabNext: (callback: () => void): CleanupFn => {
    const handler = () => callback();
    ipcRenderer.on('tab:next', handler);
    return () => ipcRenderer.removeListener('tab:next', handler);
  },
  onTabPrev: (callback: () => void): CleanupFn => {
    const handler = () => callback();
    ipcRenderer.on('tab:prev', handler);
    return () => ipcRenderer.removeListener('tab:prev', handler);
  },
  onTabCloseSpecific: (callback: (tabId: string) => void): CleanupFn => {
    const handler = (_event: Electron.IpcRendererEvent, tabId: string) => callback(tabId);
    ipcRenderer.on('tab:close-specific', handler);
    return () => ipcRenderer.removeListener('tab:close-specific', handler);
  },
  onTabCloseOthers: (callback: (keepTabId: string) => void): CleanupFn => {
    const handler = (_event: Electron.IpcRendererEvent, tabId: string) => callback(tabId);
    ipcRenderer.on('tab:close-others', handler);
    return () => ipcRenderer.removeListener('tab:close-others', handler);
  },
  onTabCloseAll: (callback: () => void): CleanupFn => {
    const handler = () => callback();
    ipcRenderer.on('tab:close-all', handler);
    return () => ipcRenderer.removeListener('tab:close-all', handler);
  },

  // Shortcuts dialog event (main -> renderer)
  onShortcutsShow: (callback: () => void): CleanupFn => {
    const handler = () => callback();
    ipcRenderer.on('shortcuts:show', handler);
    return () => ipcRenderer.removeListener('shortcuts:show', handler);
  },

  // Git settings dialog event (main -> renderer)
  onGitSettingsShow: (callback: () => void): CleanupFn => {
    const handler = () => callback();
    ipcRenderer.on('git-settings:show', handler);
    return () => ipcRenderer.removeListener('git-settings:show', handler);
  },

  // Recording toggle event (main -> renderer, Ctrl+Shift+R)
  onRecordingToggle: (callback: () => void): CleanupFn => {
    const handler = () => callback();
    ipcRenderer.on('recording:toggle', handler);
    return () => ipcRenderer.removeListener('recording:toggle', handler);
  },

  // Tab context menu
  showTabContextMenu: (tabId: string, x: number, y: number) =>
    ipcRenderer.invoke('tab:context-menu', tabId, x, y),

  // Dialogs
  showConfirmClose: (message: string) =>
    ipcRenderer.invoke('dialog:confirm-close', message),
  showConfirmOkCancel: (title: string, message: string) =>
    ipcRenderer.invoke('dialog:confirm-ok-cancel', title, message),
  showConfirmCloseMultiple: (count: number) =>
    ipcRenderer.invoke('dialog:confirm-close-multiple', count),
  showWorktreeCleanupDialog: (branchName: string, hasUncommittedChanges: boolean) =>
    ipcRenderer.invoke('dialog:worktree-cleanup', branchName, hasUncommittedChanges),

  // Folder selection
  selectFolder: () => ipcRenderer.invoke('dialog:select-folder'),

  // Directory listing for path autocomplete
  listDirectory: (path: string) => ipcRenderer.invoke('fs:list-directory', path),
  createDirectory: (parentPath: string, folderName: string) =>
    ipcRenderer.invoke('fs:create-directory', parentPath, folderName),

  // Git config operations
  loadGitConfig: () => ipcRenderer.invoke('git-config:load'),
  saveGitConfig: (config: { name: string; email: string; githubPat?: string; openaiApiKey?: string }) =>
    ipcRenderer.invoke('git-config:save', config),

  // Git worktree operations
  checkGitRepo: (folderPath: string) => ipcRenderer.invoke('git:is-repo', folderPath),
  getGitBranch: (folderPath: string) => ipcRenderer.invoke('git:get-branch', folderPath),
  initGitRepo: (folderPath: string) => ipcRenderer.invoke('git:init', folderPath),
  validateBranchName: (branchName: string) => ipcRenderer.invoke('git:validate-branch', branchName),

  // Docker operations
  isDockerAvailable: () => ipcRenderer.invoke('docker:available'),
  ensureImage: (imageName?: string) => ipcRenderer.invoke('docker:ensure-image', imageName),
  onDockerBuildProgress: (callback: (message: string) => void): CleanupFn => {
    const handler = (_event: Electron.IpcRendererEvent, message: string) =>
      callback(message);
    ipcRenderer.on('docker:build-progress', handler);
    return () => ipcRenderer.removeListener('docker:build-progress', handler);
  },

  // Docker setup operations
  detectDockerState: () => ipcRenderer.invoke('docker:detect-state'),
  startDockerDesktop: () => ipcRenderer.invoke('docker:start-desktop'),
  startDockerEngine: () => ipcRenderer.invoke('docker:start-engine'),

  // Docker rebuild operations
  removeAllContainers: () => ipcRenderer.invoke('docker:remove-all-containers'),
  removeImage: () => ipcRenderer.invoke('docker:remove-image'),

  // Cache management operations
  listProjectCaches: () => ipcRenderer.invoke('cache:list'),
  getProjectCacheStats: () => ipcRenderer.invoke('cache:stats'),
  deleteProjectCache: (dirName: string) => ipcRenderer.invoke('cache:delete', dirName),
  cleanupOrphanedCaches: () => ipcRenderer.invoke('cache:cleanup-orphaned'),
  cleanupStaleCaches: (maxAgeDays?: number) => ipcRenderer.invoke('cache:cleanup-stale', maxAgeDays),

  // Yolium operations
  createYolium: (folderPath: string, agent: string = 'claude', gsdEnabled: boolean = true, gitConfig?: { name: string; email: string }, worktreeEnabled: boolean = false, branchName?: string) =>
    ipcRenderer.invoke('yolium:create', folderPath, agent, gsdEnabled, gitConfig, worktreeEnabled, branchName),
  writeYolium: (sessionId: string, data: string) =>
    ipcRenderer.send('yolium:write', sessionId, data),
  resizeYolium: (sessionId: string, cols: number, rows: number) =>
    ipcRenderer.send('yolium:resize', sessionId, cols, rows),
  stopYolium: (sessionId: string, deleteWorktree?: boolean) => ipcRenderer.invoke('yolium:stop', sessionId, deleteWorktree),
  getWorktreeInfo: (sessionId: string) => ipcRenderer.invoke('yolium:get-worktree-info', sessionId),

  // Container events (main -> renderer)
  onContainerData: (callback: (sessionId: string, data: string) => void): CleanupFn => {
    const handler = (_event: Electron.IpcRendererEvent, sessionId: string, data: string) =>
      callback(sessionId, data);
    ipcRenderer.on('container:data', handler);
    return () => ipcRenderer.removeListener('container:data', handler);
  },
  onContainerExit: (callback: (sessionId: string, exitCode: number) => void): CleanupFn => {
    const handler = (_event: Electron.IpcRendererEvent, sessionId: string, exitCode: number) =>
      callback(sessionId, exitCode);
    ipcRenderer.on('container:exit', handler);
    return () => ipcRenderer.removeListener('container:exit', handler);
  },

  // Whisper speech-to-text operations
  whisperListModels: () => ipcRenderer.invoke('whisper:list-models'),
  whisperIsModelDownloaded: (modelSize: string) => ipcRenderer.invoke('whisper:is-model-downloaded', modelSize),
  whisperDownloadModel: (modelSize: string) => ipcRenderer.invoke('whisper:download-model', modelSize),
  whisperDeleteModel: (modelSize: string) => ipcRenderer.invoke('whisper:delete-model', modelSize),
  whisperIsBinaryAvailable: () => ipcRenderer.invoke('whisper:is-binary-available'),
  whisperTranscribe: (audioData: number[], modelSize: string) =>
    ipcRenderer.invoke('whisper:transcribe', audioData, modelSize),
  whisperGetSelectedModel: () => ipcRenderer.invoke('whisper:get-selected-model'),
  whisperSaveSelectedModel: (modelSize: string) => ipcRenderer.invoke('whisper:save-selected-model', modelSize),
  onWhisperDownloadProgress: (callback: (progress: { modelSize: string; downloadedBytes: number; totalBytes: number; percent: number }) => void): CleanupFn => {
    const handler = (_event: Electron.IpcRendererEvent, progress: { modelSize: string; downloadedBytes: number; totalBytes: number; percent: number }) =>
      callback(progress);
    ipcRenderer.on('whisper:download-progress', handler);
    return () => ipcRenderer.removeListener('whisper:download-progress', handler);
  },

  // Code review operations
  listRemoteBranches: (repoUrl: string) =>
    ipcRenderer.invoke('code-review:list-branches', repoUrl),
  checkAgentAuth: (agent: string) =>
    ipcRenderer.invoke('code-review:check-agent-auth', agent),
  startCodeReview: (repoUrl: string, branch: string, agent: string, gitConfig?: { name: string; email: string }) =>
    ipcRenderer.invoke('code-review:start', repoUrl, branch, agent, gitConfig),
  onCodeReviewOutput: (callback: (sessionId: string, data: string) => void): CleanupFn => {
    const handler = (_event: Electron.IpcRendererEvent, sessionId: string, data: string) =>
      callback(sessionId, data);
    ipcRenderer.on('code-review:output', handler);
    return () => ipcRenderer.removeListener('code-review:output', handler);
  },
  onCodeReviewComplete: (callback: (sessionId: string, exitCode: number, authError?: boolean) => void): CleanupFn => {
    const handler = (_event: Electron.IpcRendererEvent, sessionId: string, exitCode: number, authError?: boolean) =>
      callback(sessionId, exitCode, authError);
    ipcRenderer.on('code-review:complete', handler);
    return () => ipcRenderer.removeListener('code-review:complete', handler);
  },
});

// Type declaration for TypeScript
declare global {
  interface Window {
    electronAPI: {
      getVersion: () => Promise<string>;
      getHomeDir: () => Promise<string>;
      openExternal: (url: string) => Promise<void>;
      forceQuit: () => Promise<void>;
      onQuitRequest: (callback: () => void) => CleanupFn;
      createTerminal: (cwd?: string) => Promise<string>;
      writeTerminal: (sessionId: string, data: string) => void;
      resizeTerminal: (sessionId: string, cols: number, rows: number) => void;
      closeTerminal: (sessionId: string) => Promise<void>;
      hasRunningChildren: (sessionId: string) => Promise<boolean>;
      onTerminalData: (callback: (sessionId: string, data: string) => void) => CleanupFn;
      onTerminalExit: (callback: (sessionId: string, exitCode: number) => void) => CleanupFn;
      onTabNew: (callback: () => void) => CleanupFn;
      onTabClose: (callback: () => void) => CleanupFn;
      onTabNext: (callback: () => void) => CleanupFn;
      onTabPrev: (callback: () => void) => CleanupFn;
      onTabCloseSpecific: (callback: (tabId: string) => void) => CleanupFn;
      onTabCloseOthers: (callback: (keepTabId: string) => void) => CleanupFn;
      onTabCloseAll: (callback: () => void) => CleanupFn;
      onShortcutsShow: (callback: () => void) => CleanupFn;
      onGitSettingsShow: (callback: () => void) => CleanupFn;
      onRecordingToggle: (callback: () => void) => CleanupFn;
      showTabContextMenu: (tabId: string, x: number, y: number) => Promise<void>;
      showConfirmClose: (message: string) => Promise<boolean>;
      showConfirmOkCancel: (title: string, message: string) => Promise<boolean>;
      showConfirmCloseMultiple: (count: number) => Promise<boolean>;
      showWorktreeCleanupDialog: (branchName: string, hasUncommittedChanges: boolean) => Promise<{ response: number }>;
      // Folder selection
      selectFolder: () => Promise<string | null>;
      // Directory listing for path autocomplete
      listDirectory: (path: string) => Promise<{
        success: boolean;
        basePath: string;
        entries: Array<{ name: string; path: string; isHidden: boolean }>;
        error: string | null;
      }>;
      createDirectory: (parentPath: string, folderName: string) => Promise<{
        success: boolean;
        path: string | null;
        error: string | null;
      }>;
      // Git config operations
      loadGitConfig: () => Promise<{ name: string; email: string; hasPat?: boolean; hasOpenaiKey?: boolean } | null>;
      saveGitConfig: (config: { name: string; email: string; githubPat?: string; openaiApiKey?: string }) => Promise<void>;
      // Git worktree operations
      checkGitRepo: (folderPath: string) => Promise<{ isRepo: boolean; hasCommits: boolean }>;
      getGitBranch: (folderPath: string) => Promise<string | null>;
      initGitRepo: (folderPath: string) => Promise<{ success: boolean; initialized?: boolean; error?: string }>;
      validateBranchName: (branchName: string) => Promise<{ valid: boolean; error: string | null }>;
      // Docker operations
      isDockerAvailable: () => Promise<boolean>;
      ensureImage: (imageName?: string) => Promise<void>;
      onDockerBuildProgress: (callback: (message: string) => void) => CleanupFn;
      // Docker setup operations
      detectDockerState: () => Promise<{ installed: boolean; running: boolean; desktopPath: string | null }>;
      startDockerDesktop: () => Promise<boolean>;
      startDockerEngine: () => Promise<boolean>;
      // Docker rebuild operations
      removeAllContainers: () => Promise<number>;
      removeImage: () => Promise<void>;
      // Cache management operations
      listProjectCaches: () => Promise<Array<{
        dirName: string;
        path: string;
        folderName: string;
        lastAccessed: string;
        createdAt: string;
        exists: boolean;
        cacheSizeBytes: number;
        historySizeBytes: number;
      }>>;
      getProjectCacheStats: () => Promise<{
        totalProjects: number;
        existingProjects: number;
        orphanedProjects: number;
        totalCacheSizeBytes: number;
        totalHistorySizeBytes: number;
        oldestAccess: string | null;
        newestAccess: string | null;
      }>;
      deleteProjectCache: (dirName: string) => Promise<{ deleted: boolean; error?: string }>;
      cleanupOrphanedCaches: () => Promise<{ deletedCount: number; freedBytes: number; errors: string[] }>;
      cleanupStaleCaches: (maxAgeDays?: number) => Promise<{ deletedCount: number; freedBytes: number; errors: string[] }>;
      // Yolium operations
      createYolium: (folderPath: string, agent?: string, gsdEnabled?: boolean, gitConfig?: { name: string; email: string }, worktreeEnabled?: boolean, branchName?: string) => Promise<string>;
      writeYolium: (sessionId: string, data: string) => void;
      resizeYolium: (sessionId: string, cols: number, rows: number) => void;
      stopYolium: (sessionId: string, deleteWorktree?: boolean) => Promise<void>;
      getWorktreeInfo: (sessionId: string) => Promise<{
        worktreePath: string;
        originalPath: string;
        branchName: string;
        hasUncommittedChanges: boolean;
      } | null>;
      onContainerData: (callback: (sessionId: string, data: string) => void) => CleanupFn;
      onContainerExit: (callback: (sessionId: string, exitCode: number) => void) => CleanupFn;
      // Whisper speech-to-text operations
      whisperListModels: () => Promise<Array<{
        size: string;
        name: string;
        fileName: string;
        sizeBytes: number;
        downloaded: boolean;
        path?: string;
      }>>;
      whisperIsModelDownloaded: (modelSize: string) => Promise<boolean>;
      whisperDownloadModel: (modelSize: string) => Promise<string>;
      whisperDeleteModel: (modelSize: string) => Promise<boolean>;
      whisperIsBinaryAvailable: () => Promise<boolean>;
      whisperTranscribe: (audioData: number[], modelSize: string) => Promise<{ text: string; durationSeconds: number }>;
      whisperGetSelectedModel: () => Promise<string>;
      whisperSaveSelectedModel: (modelSize: string) => Promise<void>;
      onWhisperDownloadProgress: (callback: (progress: { modelSize: string; downloadedBytes: number; totalBytes: number; percent: number }) => void) => CleanupFn;
      // Code review operations
      listRemoteBranches: (repoUrl: string) => Promise<{ branches: string[]; error?: string }>;
      checkAgentAuth: (agent: string) => Promise<{ authenticated: boolean }>;
      startCodeReview: (repoUrl: string, branch: string, agent: string, gitConfig?: { name: string; email: string }) => Promise<string>;
      onCodeReviewOutput: (callback: (sessionId: string, data: string) => void) => CleanupFn;
      onCodeReviewComplete: (callback: (sessionId: string, exitCode: number, authError?: boolean) => void) => CleanupFn;
    };
  }
}
