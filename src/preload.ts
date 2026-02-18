/**
 * @module src/preload
 * Electron preload script exposing namespaced IPC API to renderer process.
 */

import { contextBridge, ipcRenderer } from 'electron';
import type { PreFlightResult, ProjectType } from '@shared/types/onboarding';
import type { ClaudeUsageData } from '@shared/types/agent';

type CleanupFn = () => void;

// App namespace
const app = {
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  getHomeDir: () => ipcRenderer.invoke('app:get-home-dir'),
  openExternal: (url: string) => ipcRenderer.invoke('app:open-external', url),
  forceQuit: () => ipcRenderer.invoke('app:force-quit'),
  onQuitRequest: (callback: () => void): CleanupFn => {
    const handler = () => callback();
    ipcRenderer.on('app:quit-request', handler);
    return () => ipcRenderer.removeListener('app:quit-request', handler);
  },
};

// Terminal namespace
const terminal = {
  create: (cwd?: string) => ipcRenderer.invoke('terminal:create', cwd),
  write: (sessionId: string, data: string) =>
    ipcRenderer.send('terminal:write', sessionId, data),
  resize: (sessionId: string, cols: number, rows: number) =>
    ipcRenderer.send('terminal:resize', sessionId, cols, rows),
  close: (sessionId: string) => ipcRenderer.invoke('terminal:close', sessionId),
  hasRunningChildren: (sessionId: string) =>
    ipcRenderer.invoke('terminal:has-running-children', sessionId),
  onData: (callback: (sessionId: string, data: string) => void): CleanupFn => {
    const handler = (_event: Electron.IpcRendererEvent, sessionId: string, data: string) =>
      callback(sessionId, data);
    ipcRenderer.on('terminal:data', handler);
    return () => ipcRenderer.removeListener('terminal:data', handler);
  },
  onExit: (callback: (sessionId: string, exitCode: number) => void): CleanupFn => {
    const handler = (_event: Electron.IpcRendererEvent, sessionId: string, exitCode: number) =>
      callback(sessionId, exitCode);
    ipcRenderer.on('terminal:exit', handler);
    return () => ipcRenderer.removeListener('terminal:exit', handler);
  },
};

// Tabs namespace
const tabs = {
  showContextMenu: (tabId: string, x: number, y: number) =>
    ipcRenderer.invoke('tab:context-menu', tabId, x, y),
  onNew: (callback: () => void): CleanupFn => {
    const handler = () => callback();
    ipcRenderer.on('tab:new', handler);
    return () => ipcRenderer.removeListener('tab:new', handler);
  },
  onClose: (callback: () => void): CleanupFn => {
    const handler = () => callback();
    ipcRenderer.on('tab:close', handler);
    return () => ipcRenderer.removeListener('tab:close', handler);
  },
  onNext: (callback: () => void): CleanupFn => {
    const handler = () => callback();
    ipcRenderer.on('tab:next', handler);
    return () => ipcRenderer.removeListener('tab:next', handler);
  },
  onPrev: (callback: () => void): CleanupFn => {
    const handler = () => callback();
    ipcRenderer.on('tab:prev', handler);
    return () => ipcRenderer.removeListener('tab:prev', handler);
  },
  onCloseSpecific: (callback: (tabId: string) => void): CleanupFn => {
    const handler = (_event: Electron.IpcRendererEvent, tabId: string) => callback(tabId);
    ipcRenderer.on('tab:close-specific', handler);
    return () => ipcRenderer.removeListener('tab:close-specific', handler);
  },
  onCloseOthers: (callback: (keepTabId: string) => void): CleanupFn => {
    const handler = (_event: Electron.IpcRendererEvent, tabId: string) => callback(tabId);
    ipcRenderer.on('tab:close-others', handler);
    return () => ipcRenderer.removeListener('tab:close-others', handler);
  },
  onCloseAll: (callback: () => void): CleanupFn => {
    const handler = () => callback();
    ipcRenderer.on('tab:close-all', handler);
    return () => ipcRenderer.removeListener('tab:close-all', handler);
  },
};

// Events namespace (menu-triggered events)
const events = {
  onShortcutsShow: (callback: () => void): CleanupFn => {
    const handler = () => callback();
    ipcRenderer.on('shortcuts:show', handler);
    return () => ipcRenderer.removeListener('shortcuts:show', handler);
  },
  onGitSettingsShow: (callback: () => void): CleanupFn => {
    const handler = () => callback();
    ipcRenderer.on('git-settings:show', handler);
    return () => ipcRenderer.removeListener('git-settings:show', handler);
  },
  onProjectNew: (callback: () => void): CleanupFn => {
    const handler = () => callback();
    ipcRenderer.on('project:new', handler);
    return () => ipcRenderer.removeListener('project:new', handler);
  },
  onRecordingToggle: (callback: () => void): CleanupFn => {
    const handler = () => callback();
    ipcRenderer.on('recording:toggle', handler);
    return () => ipcRenderer.removeListener('recording:toggle', handler);
  },
};

// Dialog namespace
const dialog = {
  confirmClose: (message: string) =>
    ipcRenderer.invoke('dialog:confirm-close', message),
  confirmOkCancel: (title: string, message: string) =>
    ipcRenderer.invoke('dialog:confirm-ok-cancel', title, message),
  confirmCloseMultiple: (count: number) =>
    ipcRenderer.invoke('dialog:confirm-close-multiple', count),
  worktreeCleanup: (branchName: string, hasUncommittedChanges: boolean) =>
    ipcRenderer.invoke('dialog:worktree-cleanup', branchName, hasUncommittedChanges),
  selectFolder: () => ipcRenderer.invoke('dialog:select-folder'),
};

// Filesystem namespace
const fs = {
  listDirectory: (path: string) => ipcRenderer.invoke('fs:list-directory', path),
  createDirectory: (parentPath: string, folderName: string) =>
    ipcRenderer.invoke('fs:create-directory', parentPath, folderName),
  readFile: (filePath: string) => ipcRenderer.invoke('fs:read-file', filePath),
};

// Git namespace
const git = {
  loadConfig: () => ipcRenderer.invoke('git-config:load'),
  saveConfig: (config: { githubPat?: string; openaiApiKey?: string; anthropicApiKey?: string; useClaudeOAuth?: boolean; useCodexOAuth?: boolean; providerModelDefaults?: Record<string, string>; providerModels?: Record<string, string[]> }) =>
    ipcRenderer.invoke('git-config:save', config),
  isRepo: (folderPath: string) => ipcRenderer.invoke('git:is-repo', folderPath),
  getBranch: (folderPath: string) => ipcRenderer.invoke('git:get-branch', folderPath),
  init: (folderPath: string, projectTypes?: ProjectType[]) => ipcRenderer.invoke('git:init', folderPath, projectTypes),
  clone: (url: string, targetDir: string) => ipcRenderer.invoke('git:clone', url, targetDir),
  validateBranch: (branchName: string) => ipcRenderer.invoke('git:validate-branch', branchName),
  mergeBranch: (projectPath: string, branchName: string) =>
    ipcRenderer.invoke('git:merge-branch', projectPath, branchName),
  worktreeDiffStats: (projectPath: string, branchName: string) =>
    ipcRenderer.invoke('git:worktree-diff-stats', projectPath, branchName),
  cleanupWorktree: (projectPath: string, worktreePath: string, branchName: string) =>
    ipcRenderer.invoke('git:cleanup-worktree', projectPath, worktreePath, branchName),
  checkMergeConflicts: (projectPath: string, branchName: string) =>
    ipcRenderer.invoke('git:check-merge-conflicts', projectPath, branchName),
  mergeAndPushPR: (projectPath: string, branchName: string, worktreePath: string, itemTitle: string, itemDescription: string) =>
    ipcRenderer.invoke('git:merge-and-push-pr', projectPath, branchName, worktreePath, itemTitle, itemDescription),
  approvePR: (projectPath: string, prUrl: string) =>
    ipcRenderer.invoke('git:approve-pr', projectPath, prUrl),
  mergePR: (projectPath: string, prUrl: string) =>
    ipcRenderer.invoke('git:merge-pr', projectPath, prUrl),
  worktreeChangedFiles: (projectPath: string, branchName: string) =>
    ipcRenderer.invoke('git:worktree-changed-files', projectPath, branchName),
  worktreeFileDiff: (projectPath: string, branchName: string, filePath: string) =>
    ipcRenderer.invoke('git:worktree-file-diff', projectPath, branchName, filePath),
  detectNestedRepos: (folderPath: string) =>
    ipcRenderer.invoke('git:detect-nested-repos', folderPath),
  rebaseOntoDefault: (worktreePath: string, projectPath: string) =>
    ipcRenderer.invoke('git:rebase-onto-default', worktreePath, projectPath),
};

// Onboarding namespace
const onboarding = {
  validate: (folderPath: string): Promise<PreFlightResult> =>
    ipcRenderer.invoke('onboarding:validate', folderPath),
  detectProject: (folderPath: string): Promise<ProjectType[]> =>
    ipcRenderer.invoke('onboarding:detect-project', folderPath),
};

// Docker namespace
const docker = {
  isAvailable: () => ipcRenderer.invoke('docker:available'),
  ensureImage: (imageName?: string) => ipcRenderer.invoke('docker:ensure-image', imageName),
  detectState: () => ipcRenderer.invoke('docker:detect-state'),
  startDesktop: () => ipcRenderer.invoke('docker:start-desktop'),
  startEngine: () => ipcRenderer.invoke('docker:start-engine'),
  removeAllContainers: () => ipcRenderer.invoke('docker:remove-all-containers'),
  removeImage: () => ipcRenderer.invoke('docker:remove-image'),
  getImageInfo: () => ipcRenderer.invoke('docker:get-image-info'),
  onBuildProgress: (callback: (message: string) => void): CleanupFn => {
    const handler = (_event: Electron.IpcRendererEvent, message: string) =>
      callback(message);
    ipcRenderer.on('docker:build-progress', handler);
    return () => ipcRenderer.removeListener('docker:build-progress', handler);
  },
};

// Container namespace (Yolium containers)
const container = {
  create: (folderPath: string, agent: string = 'claude', gsdEnabled: boolean = true, gitConfig?: { name: string; email: string }, worktreeEnabled: boolean = false, branchName?: string) =>
    ipcRenderer.invoke('yolium:create', folderPath, agent, gsdEnabled, gitConfig, worktreeEnabled, branchName),
  write: (sessionId: string, data: string) =>
    ipcRenderer.send('yolium:write', sessionId, data),
  resize: (sessionId: string, cols: number, rows: number) =>
    ipcRenderer.send('yolium:resize', sessionId, cols, rows),
  stop: (sessionId: string, deleteWorktree?: boolean) => ipcRenderer.invoke('yolium:stop', sessionId, deleteWorktree),
  getWorktreeInfo: (sessionId: string) => ipcRenderer.invoke('yolium:get-worktree-info', sessionId),
  onData: (callback: (sessionId: string, data: string) => void): CleanupFn => {
    const handler = (_event: Electron.IpcRendererEvent, sessionId: string, data: string) =>
      callback(sessionId, data);
    ipcRenderer.on('container:data', handler);
    return () => ipcRenderer.removeListener('container:data', handler);
  },
  onExit: (callback: (sessionId: string, exitCode: number) => void): CleanupFn => {
    const handler = (_event: Electron.IpcRendererEvent, sessionId: string, exitCode: number) =>
      callback(sessionId, exitCode);
    ipcRenderer.on('container:exit', handler);
    return () => ipcRenderer.removeListener('container:exit', handler);
  },
};

// Kanban namespace
const kanban = {
  getBoard: (projectPath: string) =>
    ipcRenderer.invoke('kanban:get-board', projectPath),
  addItem: (projectPath: string, params: {
    title: string;
    description: string;
    branch?: string;
    agentProvider: 'claude' | 'codex' | 'opencode';
    agentType?: string;
    order: number;
    model?: string;
  }) => ipcRenderer.invoke('kanban:add-item', projectPath, params),
  updateItem: (projectPath: string, itemId: string, updates: object) =>
    ipcRenderer.invoke('kanban:update-item', projectPath, itemId, updates),
  addComment: (projectPath: string, itemId: string, source: string, text: string) =>
    ipcRenderer.invoke('kanban:add-comment', projectPath, itemId, source, text),
  deleteItem: (projectPath: string, itemId: string) =>
    ipcRenderer.invoke('kanban:delete-item', projectPath, itemId),
  deleteItems: (projectPath: string, itemIds: string[]) =>
    ipcRenderer.invoke('kanban:delete-items', projectPath, itemIds),
  deleteBoard: (projectPath: string) =>
    ipcRenderer.invoke('kanban:delete-board', projectPath),
  onBoardUpdated: (callback: (projectPath: string) => void): CleanupFn => {
    const handler = (_event: Electron.IpcRendererEvent, projectPath: string) =>
      callback(projectPath);
    ipcRenderer.on('kanban:board-updated', handler);
    return () => ipcRenderer.removeListener('kanban:board-updated', handler);
  },
};

// Agent namespace
const agent = {
  start: (params: {
    agentName: string;
    projectPath: string;
    itemId: string;
    goal: string;
    agentProvider: string;
  }) => ipcRenderer.invoke('agent:start', params),
  resume: (params: {
    agentName: string;
    projectPath: string;
    itemId: string;
    goal: string;
    agentProvider: string;
  }) => ipcRenderer.invoke('agent:resume', params),
  answer: (projectPath: string, itemId: string, answer: string) =>
    ipcRenderer.invoke('agent:answer', projectPath, itemId, answer),
  stop: (sessionId: string) =>
    ipcRenderer.invoke('agent:stop', sessionId),
  getActiveSession: (projectPath: string, itemId: string) =>
    ipcRenderer.invoke('agent:get-active-session', projectPath, itemId),
  recover: (projectPath: string) =>
    ipcRenderer.invoke('agent:recover', projectPath),
  listDefinitions: () =>
    ipcRenderer.invoke('agent:list-definitions'),
  readLog: (projectPath: string, itemId: string) =>
    ipcRenderer.invoke('agent:read-log', projectPath, itemId),
  clearLog: (projectPath: string, itemId: string) =>
    ipcRenderer.invoke('agent:clear-log', projectPath, itemId),
  onOutput: (callback: (sessionId: string, data: string) => void): CleanupFn => {
    const handler = (_event: Electron.IpcRendererEvent, sessionId: string, data: string) =>
      callback(sessionId, data);
    ipcRenderer.on('agent:output', handler);
    return () => ipcRenderer.removeListener('agent:output', handler);
  },
  onQuestion: (callback: (sessionId: string, question: { text: string; options?: string[] }) => void): CleanupFn => {
    const handler = (_event: Electron.IpcRendererEvent, sessionId: string, question: { text: string; options?: string[] }) =>
      callback(sessionId, question);
    ipcRenderer.on('agent:question', handler);
    return () => ipcRenderer.removeListener('agent:question', handler);
  },
  onItemCreated: (callback: (sessionId: string, item: object) => void): CleanupFn => {
    const handler = (_event: Electron.IpcRendererEvent, sessionId: string, item: object) =>
      callback(sessionId, item);
    ipcRenderer.on('agent:item-created', handler);
    return () => ipcRenderer.removeListener('agent:item-created', handler);
  },
  onComplete: (callback: (sessionId: string, summary: string) => void): CleanupFn => {
    const handler = (_event: Electron.IpcRendererEvent, sessionId: string, summary: string) =>
      callback(sessionId, summary);
    ipcRenderer.on('agent:complete', handler);
    return () => ipcRenderer.removeListener('agent:complete', handler);
  },
  onError: (callback: (sessionId: string, message: string) => void): CleanupFn => {
    const handler = (_event: Electron.IpcRendererEvent, sessionId: string, message: string) =>
      callback(sessionId, message);
    ipcRenderer.on('agent:error', handler);
    return () => ipcRenderer.removeListener('agent:error', handler);
  },
  onProgress: (callback: (sessionId: string, progress: { step: string; detail: string; attempt?: number; maxAttempts?: number }) => void): CleanupFn => {
    const handler = (_event: Electron.IpcRendererEvent, sessionId: string, progress: { step: string; detail: string; attempt?: number; maxAttempts?: number }) =>
      callback(sessionId, progress);
    ipcRenderer.on('agent:progress', handler);
    return () => ipcRenderer.removeListener('agent:progress', handler);
  },
  onExit: (callback: (sessionId: string, exitCode: number) => void): CleanupFn => {
    const handler = (_event: Electron.IpcRendererEvent, sessionId: string, exitCode: number) =>
      callback(sessionId, exitCode);
    ipcRenderer.on('agent:exit', handler);
    return () => ipcRenderer.removeListener('agent:exit', handler);
  },
  onCostUpdate: (callback: (sessionId: string, projectPath: string, itemId: string, usage: { inputTokens: number; outputTokens: number; costUsd: number }) => void): CleanupFn => {
    const handler = (_event: Electron.IpcRendererEvent, sessionId: string, projectPath: string, itemId: string, usage: { inputTokens: number; outputTokens: number; costUsd: number }) =>
      callback(sessionId, projectPath, itemId, usage);
    ipcRenderer.on('agent:cost-update', handler);
    return () => ipcRenderer.removeListener('agent:cost-update', handler);
  },
};

// Cache namespace
const cache = {
  list: () => ipcRenderer.invoke('cache:list'),
  stats: () => ipcRenderer.invoke('cache:stats'),
  delete: (dirName: string) => ipcRenderer.invoke('cache:delete', dirName),
  cleanupOrphaned: () => ipcRenderer.invoke('cache:cleanup-orphaned'),
  cleanupStale: (maxAgeDays?: number) => ipcRenderer.invoke('cache:cleanup-stale', maxAgeDays),
};

// Whisper namespace
const whisper = {
  listModels: () => ipcRenderer.invoke('whisper:list-models'),
  isModelDownloaded: (modelSize: string) => ipcRenderer.invoke('whisper:is-model-downloaded', modelSize),
  downloadModel: (modelSize: string) => ipcRenderer.invoke('whisper:download-model', modelSize),
  deleteModel: (modelSize: string) => ipcRenderer.invoke('whisper:delete-model', modelSize),
  isBinaryAvailable: () => ipcRenderer.invoke('whisper:is-binary-available'),
  installBinary: () => ipcRenderer.invoke('whisper:install-binary'),
  onInstallProgress: (callback: (message: string) => void): CleanupFn => {
    const handler = (_event: Electron.IpcRendererEvent, message: string) =>
      callback(message);
    ipcRenderer.on('whisper:install-progress', handler);
    return () => ipcRenderer.removeListener('whisper:install-progress', handler);
  },
  transcribe: (audioData: number[], modelSize: string) =>
    ipcRenderer.invoke('whisper:transcribe', audioData, modelSize),
  getSelectedModel: () => ipcRenderer.invoke('whisper:get-selected-model'),
  saveSelectedModel: (modelSize: string) => ipcRenderer.invoke('whisper:save-selected-model', modelSize),
  onDownloadProgress: (callback: (progress: { modelSize: string; downloadedBytes: number; totalBytes: number; percent: number }) => void): CleanupFn => {
    const handler = (_event: Electron.IpcRendererEvent, progress: { modelSize: string; downloadedBytes: number; totalBytes: number; percent: number }) =>
      callback(progress);
    ipcRenderer.on('whisper:download-progress', handler);
    return () => ipcRenderer.removeListener('whisper:download-progress', handler);
  },
};

// Project config namespace
const projectConfig = {
  load: (projectPath: string) => ipcRenderer.invoke('project-config:load', projectPath),
  save: (projectPath: string, config: { sharedDirs?: string[] }) =>
    ipcRenderer.invoke('project-config:save', projectPath, config),
  checkDirs: (projectPath: string, dirs: string[]) =>
    ipcRenderer.invoke('project-config:check-dirs', projectPath, dirs),
};

// Usage namespace (Claude OAuth usage data)
const usage = {
  getClaude: () => ipcRenderer.invoke('usage:get-claude'),
};

// Expose all namespaces to renderer
contextBridge.exposeInMainWorld('electronAPI', {
  app,
  terminal,
  tabs,
  events,
  dialog,
  fs,
  git,
  onboarding,
  docker,
  container,
  kanban,
  agent,
  cache,
  whisper,
  projectConfig,
  usage,
});

// Type declarations for TypeScript
type CleanupFunction = () => void;

declare global {
  interface Window {
    electronAPI: {
      app: {
        getVersion: () => Promise<string>;
        getHomeDir: () => Promise<string>;
        openExternal: (url: string) => Promise<void>;
        forceQuit: () => Promise<void>;
        onQuitRequest: (callback: () => void) => CleanupFunction;
      };
      terminal: {
        create: (cwd?: string) => Promise<string>;
        write: (sessionId: string, data: string) => void;
        resize: (sessionId: string, cols: number, rows: number) => void;
        close: (sessionId: string) => Promise<void>;
        hasRunningChildren: (sessionId: string) => Promise<boolean>;
        onData: (callback: (sessionId: string, data: string) => void) => CleanupFunction;
        onExit: (callback: (sessionId: string, exitCode: number) => void) => CleanupFunction;
      };
      tabs: {
        showContextMenu: (tabId: string, x: number, y: number) => Promise<void>;
        onNew: (callback: () => void) => CleanupFunction;
        onClose: (callback: () => void) => CleanupFunction;
        onNext: (callback: () => void) => CleanupFunction;
        onPrev: (callback: () => void) => CleanupFunction;
        onCloseSpecific: (callback: (tabId: string) => void) => CleanupFunction;
        onCloseOthers: (callback: (keepTabId: string) => void) => CleanupFunction;
        onCloseAll: (callback: () => void) => CleanupFunction;
      };
      events: {
        onShortcutsShow: (callback: () => void) => CleanupFunction;
        onGitSettingsShow: (callback: () => void) => CleanupFunction;
        onProjectNew: (callback: () => void) => CleanupFunction;
        onRecordingToggle: (callback: () => void) => CleanupFunction;
      };
      dialog: {
        confirmClose: (message: string) => Promise<boolean>;
        confirmOkCancel: (title: string, message: string) => Promise<boolean>;
        confirmCloseMultiple: (count: number) => Promise<boolean>;
        worktreeCleanup: (branchName: string, hasUncommittedChanges: boolean) => Promise<{ response: number }>;
        selectFolder: () => Promise<string | null>;
      };
      fs: {
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
        readFile: (filePath: string) => Promise<{
          success: boolean;
          content: string | null;
          error: string | null;
        }>;
      };
      git: {
        loadConfig: () => Promise<{ name: string; email: string; hasPat?: boolean; hasOpenaiKey?: boolean; hasAnthropicKey?: boolean; hasClaudeOAuth?: boolean; useClaudeOAuth?: boolean; hasCodexOAuth?: boolean; useCodexOAuth?: boolean; githubLogin?: string; providerModelDefaults?: Record<string, string>; providerModels?: Record<string, string[]> } | null>;
        saveConfig: (config: { githubPat?: string; openaiApiKey?: string; anthropicApiKey?: string; useClaudeOAuth?: boolean; useCodexOAuth?: boolean; providerModelDefaults?: Record<string, string>; providerModels?: Record<string, string[]> }) => Promise<void>;
        isRepo: (folderPath: string) => Promise<{ isRepo: boolean; hasCommits: boolean }>;
        getBranch: (folderPath: string) => Promise<string | null>;
        init: (folderPath: string, projectTypes?: ProjectType[]) => Promise<{ success: boolean; initialized?: boolean; hasCommits?: boolean; error?: string }>;
        clone: (url: string, targetDir: string) => Promise<{ success: boolean; clonedPath: string | null; error: string | null }>;
        validateBranch: (branchName: string) => Promise<{ valid: boolean; error: string | null }>;
        mergeBranch: (projectPath: string, branchName: string) => Promise<{ success: boolean; error?: string; conflict?: boolean }>;
        worktreeDiffStats: (projectPath: string, branchName: string) => Promise<{ filesChanged: number; insertions: number; deletions: number }>;
        cleanupWorktree: (projectPath: string, worktreePath: string, branchName: string) => Promise<void>;
        checkMergeConflicts: (projectPath: string, branchName: string) => Promise<{ clean: boolean; conflictingFiles: string[] }>;
        mergeAndPushPR: (projectPath: string, branchName: string, worktreePath: string, itemTitle: string, itemDescription: string) => Promise<{ success: boolean; prUrl?: string; prBranch?: string; error?: string; conflict?: boolean; conflictingFiles?: string[] }>;
        approvePR: (projectPath: string, prUrl: string) => Promise<{ success: boolean; error?: string }>;
        mergePR: (projectPath: string, prUrl: string) => Promise<{ success: boolean; error?: string }>;
        worktreeChangedFiles: (projectPath: string, branchName: string) => Promise<{
          files: Array<{ path: string; status: 'M' | 'A' | 'D' | 'R' }>;
          error?: string;
        }>;
        worktreeFileDiff: (projectPath: string, branchName: string, filePath: string) => Promise<{
          diff: string;
          error?: string;
        }>;
        detectNestedRepos: (folderPath: string) => Promise<{
          isRepo: boolean;
          nestedRepos: Array<{ name: string; path: string }>;
        }>;
        rebaseOntoDefault: (worktreePath: string, projectPath: string) => Promise<{
          success: boolean;
          error?: string;
          conflict?: boolean;
          conflictingFiles?: string[];
        }>;
      };
      onboarding: {
        validate: (folderPath: string) => Promise<PreFlightResult>;
        detectProject: (folderPath: string) => Promise<ProjectType[]>;
      };
      docker: {
        isAvailable: () => Promise<boolean>;
        ensureImage: (imageName?: string) => Promise<void>;
        detectState: () => Promise<{ installed: boolean; running: boolean; desktopPath: string | null }>;
        startDesktop: () => Promise<boolean>;
        startEngine: () => Promise<boolean>;
        removeAllContainers: () => Promise<number>;
        removeImage: () => Promise<void>;
        getImageInfo: () => Promise<{ name: string; size: number; created: string; stale: boolean } | null>;
        onBuildProgress: (callback: (message: string) => void) => CleanupFunction;
      };
      container: {
        create: (folderPath: string, agent?: string, gsdEnabled?: boolean, gitConfig?: { name: string; email: string }, worktreeEnabled?: boolean, branchName?: string) => Promise<string>;
        write: (sessionId: string, data: string) => void;
        resize: (sessionId: string, cols: number, rows: number) => void;
        stop: (sessionId: string, deleteWorktree?: boolean) => Promise<void>;
        getWorktreeInfo: (sessionId: string) => Promise<{
          worktreePath: string;
          originalPath: string;
          branchName: string;
          hasUncommittedChanges: boolean;
        } | null>;
        onData: (callback: (sessionId: string, data: string) => void) => CleanupFunction;
        onExit: (callback: (sessionId: string, exitCode: number) => void) => CleanupFunction;
      };
      kanban: {
        getBoard: (projectPath: string) => Promise<{
          id: string;
          projectPath: string;
          items: Array<{
            id: string;
            title: string;
            description: string;
            column: 'backlog' | 'ready' | 'in-progress' | 'verify' | 'done';
            branch?: string;
            agentProvider: 'claude' | 'codex' | 'opencode';
            agentType?: string;
            order: number;
            model?: string;
            agentStatus: 'idle' | 'running' | 'waiting' | 'interrupted' | 'completed' | 'failed';
            activeAgentName?: string;
            lastAgentName?: string;
            agentQuestion?: string;
            agentQuestionOptions?: string[];
            worktreePath?: string;
            mergeStatus?: 'unmerged' | 'merged' | 'conflict';
            verified?: boolean;
            comments: Array<{ id: string; source: 'user' | 'agent' | 'system'; text: string; timestamp: string; options?: string[] }>;
            createdAt: string;
            updatedAt: string;
          }>;
          lastAgentName?: string;
          createdAt: string;
          updatedAt: string;
        }>;
        addItem: (projectPath: string, params: {
          title: string;
          description: string;
          branch?: string;
          agentProvider: 'claude' | 'codex' | 'opencode';
          agentType?: string;
          order: number;
          model?: string;
        }) => Promise<object>;
        updateItem: (projectPath: string, itemId: string, updates: object) => Promise<object | null>;
        addComment: (projectPath: string, itemId: string, source: string, text: string) => Promise<object | null>;
        deleteItem: (projectPath: string, itemId: string) => Promise<boolean>;
        deleteItems: (projectPath: string, itemIds: string[]) => Promise<string[]>;
        deleteBoard: (projectPath: string) => Promise<{ deleted: boolean }>;
        onBoardUpdated: (callback: (projectPath: string) => void) => CleanupFunction;
      };
      agent: {
        start: (params: {
          agentName: string;
          projectPath: string;
          itemId: string;
          goal: string;
          agentProvider: string;
        }) => Promise<{ sessionId: string; error?: string }>;
        resume: (params: {
          agentName: string;
          projectPath: string;
          itemId: string;
          goal: string;
          agentProvider: string;
        }) => Promise<{ sessionId: string; error?: string }>;
        answer: (projectPath: string, itemId: string, answer: string) => Promise<void>;
        stop: (sessionId: string) => Promise<void>;
        getActiveSession: (projectPath: string, itemId: string) => Promise<{
          sessionId: string;
          cumulativeUsage: { inputTokens: number; outputTokens: number; costUsd: number };
        } | null>;
        recover: (projectPath: string) => Promise<Array<object>>;
        listDefinitions: () => Promise<Array<{
          name: string;
          description: string;
          model: 'opus' | 'sonnet' | 'haiku';
          tools: string[];
          timeout?: number;
        }>>;
        readLog: (projectPath: string, itemId: string) => Promise<string>;
        clearLog: (projectPath: string, itemId: string) => Promise<boolean>;
        onOutput: (callback: (sessionId: string, data: string) => void) => CleanupFunction;
        onQuestion: (callback: (sessionId: string, question: { text: string; options?: string[] }) => void) => CleanupFunction;
        onItemCreated: (callback: (sessionId: string, item: object) => void) => CleanupFunction;
        onComplete: (callback: (sessionId: string, summary: string) => void) => CleanupFunction;
        onError: (callback: (sessionId: string, message: string) => void) => CleanupFunction;
        onProgress: (callback: (sessionId: string, progress: { step: string; detail: string; attempt?: number; maxAttempts?: number }) => void) => CleanupFunction;
        onExit: (callback: (sessionId: string, exitCode: number) => void) => CleanupFunction;
        onCostUpdate: (callback: (sessionId: string, projectPath: string, itemId: string, usage: { inputTokens: number; outputTokens: number; costUsd: number }) => void) => CleanupFunction;
      };
      cache: {
        list: () => Promise<Array<{
          dirName: string;
          path: string;
          folderName: string;
          lastAccessed: string;
          createdAt: string;
          exists: boolean;
          cacheSizeBytes: number;
          historySizeBytes: number;
        }>>;
        stats: () => Promise<{
          totalProjects: number;
          existingProjects: number;
          orphanedProjects: number;
          totalCacheSizeBytes: number;
          totalHistorySizeBytes: number;
          oldestAccess: string | null;
          newestAccess: string | null;
        }>;
        delete: (dirName: string) => Promise<{ deleted: boolean; error?: string }>;
        cleanupOrphaned: () => Promise<{ deletedCount: number; freedBytes: number; errors: string[] }>;
        cleanupStale: (maxAgeDays?: number) => Promise<{ deletedCount: number; freedBytes: number; errors: string[] }>;
      };
      whisper: {
        listModels: () => Promise<Array<{
          size: string;
          name: string;
          fileName: string;
          sizeBytes: number;
          downloaded: boolean;
          path?: string;
        }>>;
        isModelDownloaded: (modelSize: string) => Promise<boolean>;
        downloadModel: (modelSize: string) => Promise<string>;
        deleteModel: (modelSize: string) => Promise<boolean>;
        isBinaryAvailable: () => Promise<boolean>;
        installBinary: () => Promise<string>;
        onInstallProgress: (callback: (message: string) => void) => CleanupFunction;
        transcribe: (audioData: number[], modelSize: string) => Promise<{ text: string; durationSeconds: number }>;
        getSelectedModel: () => Promise<string>;
        saveSelectedModel: (modelSize: string) => Promise<void>;
        onDownloadProgress: (callback: (progress: { modelSize: string; downloadedBytes: number; totalBytes: number; percent: number }) => void) => CleanupFunction;
      };
      projectConfig: {
        load: (projectPath: string) => Promise<{ sharedDirs?: string[] } | null>;
        save: (projectPath: string, config: { sharedDirs?: string[] }) => Promise<void>;
        checkDirs: (projectPath: string, dirs: string[]) => Promise<Record<string, boolean>>;
      };
      usage: {
        getClaude: () => Promise<ClaudeUsageData | null>;
      };
    };
  }
}
