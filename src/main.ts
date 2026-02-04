import { app, BrowserWindow, ipcMain, Menu, dialog, shell } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { createPty, writePty, resizePty, closePty, closeAllPty, hasRunningChildren } from './pty-manager';
import {
  isDockerAvailable,
  ensureImage,
  createYolium,
  writeToContainer,
  resizeContainer,
  stopYolium,
  closeAllContainers,
  removeAllYoliumContainers,
  removeYoliumImage,
  getSessionWorktreeInfo,
  deleteSessionWorktree,
  listProjectCaches,
  getProjectCacheStats,
  deleteProjectCache,
  cleanupOrphanedCaches,
  cleanupStaleCaches,
  listRemoteBranches,
  checkAgentAuth,
  createCodeReviewContainer,
} from './docker-manager';
import {
  detectDockerState,
  startDockerDesktop,
  startDockerEngine,
} from './docker-setup';
import log, { createLogger, getLogPath } from './lib/logger';
import { loadGitConfig, loadDetectedGitConfig, saveGitConfig } from './lib/git-config';
import type { GitConfig } from './types/git';
import { isGitRepo, hasCommits, getWorktreeBranch, initGitRepo, validateBranchNameForUi } from './lib/git-worktree';
import {
  listModels,
  isModelDownloaded,
  downloadModel,
  deleteModel,
  transcribeAudio,
  isWhisperBinaryAvailable,
  getSelectedModel,
  saveSelectedModel,
  isValidModelSize,
} from './whisper-manager';
import type { WhisperModelSize } from './types/whisper';
import {
  getOrCreateBoard,
  addItem,
  updateItem,
  addComment,
  deleteItem,
} from './lib/kanban-store';
import {
  startAgent,
  resumeAgent,
  stopAgent,
  answerAgentQuestion,
  getAgentEvents,
  recoverInterruptedAgents,
} from './lib/agent-runner';
import type { KanbanItem } from './types/kanban';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as crypto from 'node:crypto';

const logger = createLogger('main');

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}


// Declare Vite globals (provided by Electron Forge Vite plugin)
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string;
declare const MAIN_WINDOW_VITE_NAME: string;

let mainWindow: BrowserWindow | null = null;

// Track if cleanup has been done to avoid duplicate cleanup
let cleanupDone = false;

/**
 * Perform async cleanup of PTY sessions, containers, and worktrees.
 * Returns a promise that resolves when cleanup is complete.
 */
async function performCleanup(): Promise<void> {
  if (cleanupDone) return;
  cleanupDone = true;

  logger.info('Starting cleanup...');
  closeAllPty();
  await closeAllContainers();
  logger.info('Cleanup complete');
}

function createAppMenu(window: BrowserWindow): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New Tab',
          accelerator: 'CmdOrCtrl+Shift+T',
          click: () => window.webContents.send('tab:new'),
        },
        {
          label: 'Close Tab',
          accelerator: 'CmdOrCtrl+Shift+W',
          click: () => window.webContents.send('tab:close'),
        },
        { type: 'separator' },
        {
          label: 'Settings',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => window.webContents.send('git-settings:show'),
        },
        {
          label: 'New Project',
          accelerator: 'CmdOrCtrl+Shift+P',
          click: () => window.webContents.send('project:new'),
        },
        { type: 'separator' },
        {
          label: 'Toggle Recording',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: () => window.webContents.send('recording:toggle'),
        },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'Tab',
      submenu: [
        {
          label: 'Next Tab',
          accelerator: 'CmdOrCtrl+Shift+]',
          click: () => window.webContents.send('tab:next'),
        },
        {
          label: 'Previous Tab',
          accelerator: 'CmdOrCtrl+Shift+[',
          click: () => window.webContents.send('tab:prev'),
        },
        { type: 'separator' },
        {
          label: 'Next Tab (Alt)',
          accelerator: 'CmdOrCtrl+PageDown',
          click: () => window.webContents.send('tab:next'),
          visible: false,
        },
        {
          label: 'Previous Tab (Alt)',
          accelerator: 'CmdOrCtrl+PageUp',
          click: () => window.webContents.send('tab:prev'),
          visible: false,
        },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Keyboard Shortcuts',
          accelerator: 'CmdOrCtrl+Shift+/',
          click: () => window.webContents.send('shortcuts:show'),
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

const createWindow = (): void => {
  // Resolve icon path for both development and production
  // Use PNG for Linux, ICO for Windows/macOS
  const iconFile = process.platform === 'linux' ? 'web-app-manifest-512x512.png' : 'favicon.ico';
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'icon', iconFile)
    : path.join(__dirname, '..', '..', 'assets', 'icon', iconFile);

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    autoHideMenuBar: true,
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,      // CRITICAL: Security
      contextIsolation: true,      // CRITICAL: Security
      sandbox: false,              // Required for node-pty
    },
  });

  // Maximize window on launch (skip in test mode for deterministic E2E window size)
  if (process.env.NODE_ENV !== 'test') {
    mainWindow.maximize();
  }

  // Load the renderer
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  // Create application menu with accelerators
  createAppMenu(mainWindow);

  // DevTools available via View menu (Ctrl+Shift+I or Cmd+Opt+I)
};

// App info IPC handler
ipcMain.handle('app:get-version', () => {
  return app.getVersion();
});

// Force quit (called after user confirms)
ipcMain.handle('app:force-quit', async () => {
  await performCleanup();
  app.quit();
});

// Get home directory
ipcMain.handle('app:get-home-dir', () => {
  return app.getPath('home');
});

// Open URL in external browser
ipcMain.handle('app:open-external', (_event, url: string) => {
  return shell.openExternal(url);
});

// Terminal IPC handlers
ipcMain.handle('terminal:create', (event, cwd?: string) => {
  logger.debug('IPC: terminal:create', { webContentsId: event.sender.id, cwd });
  return createPty(event.sender.id, cwd);
});

ipcMain.on('terminal:write', (_event, sessionId: string, data: string) => {
  writePty(sessionId, data);
});

ipcMain.on('terminal:resize', (_event, sessionId: string, cols: number, rows: number) => {
  resizePty(sessionId, cols, rows);
});

ipcMain.handle('terminal:close', (_event, sessionId: string) => {
  logger.debug('IPC: terminal:close', { sessionId });
  closePty(sessionId);
});

// Tab context menu
ipcMain.handle('tab:context-menu', async (event, tabId: string, x: number, y: number) => {
  const menu = Menu.buildFromTemplate([
    {
      label: 'Close',
      click: () => event.sender.send('tab:close-specific', tabId),
    },
    {
      label: 'Close Others',
      click: () => event.sender.send('tab:close-others', tabId),
    },
    {
      label: 'Close All',
      click: () => event.sender.send('tab:close-all'),
    },
  ]);
  menu.popup({ x, y });
});

// Confirmation dialog for closing tab with running process
ipcMain.handle('dialog:confirm-close', async (_event, message: string) => {
  const { response } = await dialog.showMessageBox({
    type: 'question',
    buttons: ['Close', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    title: 'Close Tab',
    message,
  });
  return response === 0; // true if user clicked "Close"
});

// Generic OK/Cancel confirmation dialog
ipcMain.handle('dialog:confirm-ok-cancel', async (_event, title: string, message: string) => {
  const { response } = await dialog.showMessageBox({
    type: 'question',
    buttons: ['OK', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    title,
    message,
  });
  return response === 0; // true if user clicked "OK"
});

// Bulk close confirmation (for Close All, Close Others)
ipcMain.handle('dialog:confirm-close-multiple', async (_event, count: number) => {
  const { response } = await dialog.showMessageBox({
    type: 'question',
    buttons: ['Close All', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    title: 'Close Tabs',
    message: `Close ${count} tab${count > 1 ? 's' : ''} with running processes?`,
  });
  return response === 0;
});

// Worktree cleanup confirmation dialog
ipcMain.handle('dialog:worktree-cleanup', async (_event, branchName: string, hasUncommittedChanges: boolean) => {
  const message = hasUncommittedChanges
    ? `This session uses a git worktree on branch "${branchName}" with uncommitted changes.`
    : `This session uses a git worktree on branch "${branchName}".`;

  const { response } = await dialog.showMessageBox({
    type: 'question',
    buttons: ['Keep Worktree', 'Delete Worktree', 'Cancel'],
    defaultId: 0,
    cancelId: 2,
    title: 'Close Worktree Session',
    message,
    detail: hasUncommittedChanges
      ? 'Warning: Deleting the worktree will lose uncommitted changes!'
      : 'You can review the changes later using: git checkout ' + branchName,
  });
  // response: 0 = Keep, 1 = Delete, 2 = Cancel
  return { response };
});

// Check if session has running children
ipcMain.handle('terminal:has-running-children', (_event, sessionId: string) => {
  return hasRunningChildren(sessionId);
});

// Folder picker
ipcMain.handle('dialog:select-folder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    title: 'Select Project Folder for Yolium',
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
});

// List directory contents for path autocomplete
ipcMain.handle('fs:list-directory', async (_event, inputPath: string) => {
  const os = await import('node:os');
  const fs = await import('node:fs/promises');

  try {
    // Expand ~ to home directory
    let resolvedPath = inputPath;
    if (resolvedPath.startsWith('~')) {
      resolvedPath = resolvedPath.replace('~', os.homedir());
    }

    // Determine the directory to list and the prefix to filter by
    let dirPath: string;
    let prefix = '';

    const stats = await fs.stat(resolvedPath).catch(() => null);
    if (stats?.isDirectory()) {
      // Input is a directory - list its contents
      dirPath = resolvedPath;
    } else {
      // Input is partial - list parent directory and filter
      dirPath = path.dirname(resolvedPath);
      prefix = path.basename(resolvedPath).toLowerCase();
    }

    // Read directory entries
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    // Filter to directories only and optionally by prefix
    const directories = entries
      .filter(entry => entry.isDirectory())
      .filter(entry => prefix === '' || entry.name.toLowerCase().startsWith(prefix))
      .map(entry => ({
        name: entry.name,
        path: path.join(dirPath, entry.name),
        isHidden: entry.name.startsWith('.'),
      }))
      .sort((a, b) => {
        // Sort: non-hidden first, then alphabetically
        if (a.isHidden !== b.isHidden) return a.isHidden ? 1 : -1;
        return a.name.localeCompare(b.name);
      });

    return {
      success: true,
      basePath: dirPath,
      entries: directories,
      error: null,
    };
  } catch (err) {
    return {
      success: false,
      basePath: '',
      entries: [],
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
});

// Create directory for path input dialog
ipcMain.handle('fs:create-directory', async (_event, parentPath: string, folderName: string) => {
  const os = await import('node:os');
  const fs = await import('node:fs/promises');

  try {
    // Expand ~ to home directory
    let resolvedParent = parentPath;
    if (resolvedParent.startsWith('~')) {
      resolvedParent = resolvedParent.replace('~', os.homedir());
    }

    // Validate folder name
    const invalidChars = /[<>:"|?*\/\\]/;
    if (invalidChars.test(folderName) || !folderName.trim()) {
      return { success: false, path: null, error: 'Invalid folder name' };
    }

    const fullPath = path.join(resolvedParent, folderName.trim());

    // Check if already exists
    try {
      await fs.access(fullPath);
      return { success: false, path: null, error: `Folder "${folderName}" already exists` };
    } catch { /* doesn't exist, proceed */ }

    await fs.mkdir(fullPath, { recursive: false });
    return { success: true, path: fullPath, error: null };
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    let message = error.message || 'Unknown error';
    if (error.code === 'EACCES') message = 'Permission denied';
    if (error.code === 'ENOENT') message = 'Parent directory does not exist';
    return { success: false, path: null, error: message };
  }
});

// Git config operations
ipcMain.handle('git-config:load', () => {
  const detectedConfig = loadDetectedGitConfig();
  if (!detectedConfig) return null;
  
  // Return detected config with source info and flags instead of actual secrets for security
  return {
    name: detectedConfig.name,
    email: detectedConfig.email,
    sources: detectedConfig.sources,
    hasPat: !!detectedConfig.githubPat,
    hasOpenaiKey: !!detectedConfig.openaiApiKey,
  };
});

ipcMain.handle('git-config:save', (_event, config: GitConfig & { githubPat?: string; openaiApiKey?: string }) => {
  // Load existing config to preserve secrets if not provided in save
  const existing = loadGitConfig();
  const toSave: GitConfig = {
    name: config.name,
    email: config.email,
  };

  // If new PAT is provided, use it; otherwise preserve existing
  if (config.githubPat !== undefined) {
    if (config.githubPat) {
      toSave.githubPat = config.githubPat;
    }
    // If empty string, PAT is being cleared (don't include it)
  } else if (existing?.githubPat) {
    // Preserve existing PAT if not explicitly changed
    toSave.githubPat = existing.githubPat;
  }

  // If new OpenAI key is provided, use it; otherwise preserve existing
  if (config.openaiApiKey !== undefined) {
    if (config.openaiApiKey) {
      toSave.openaiApiKey = config.openaiApiKey;
    }
    // If empty string, key is being cleared (don't include it)
  } else if (existing?.openaiApiKey) {
    // Preserve existing key if not explicitly changed
    toSave.openaiApiKey = existing.openaiApiKey;
  }

  saveGitConfig(toSave);
});

// Git worktree operations
ipcMain.handle('git:is-repo', (_event, folderPath: string) => {
  const isRepo = isGitRepo(folderPath);
  if (!isRepo) {
    return { isRepo: false, hasCommits: false };
  }
  return { isRepo: true, hasCommits: hasCommits(folderPath) };
});

ipcMain.handle('git:get-branch', (_event, folderPath: string) => {
  return getWorktreeBranch(folderPath);
});

ipcMain.handle('git:init', (_event, folderPath: string) => {
  logger.info('IPC: git:init', { folderPath });
  try {
    const initialized = initGitRepo(folderPath);
    return { success: true, initialized };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error('Failed to init git repo:', { error: message });
    return { success: false, error: message };
  }
});

ipcMain.handle('git:validate-branch', (_event, branchName: string) => {
  return validateBranchNameForUi(branchName);
});

// Docker availability check
ipcMain.handle('docker:available', () => {
  logger.debug('IPC: docker:available');
  return isDockerAvailable();
});

// Image pull/build
ipcMain.handle('docker:ensure-image', (_event, imageName: string) => {
  logger.info('IPC: docker:ensure-image', { imageName });
  return ensureImage(imageName, (msg) => {
    // Send progress to renderer
    const win = BrowserWindow.getAllWindows()[0];
    if (win && !win.isDestroyed()) {
      win.webContents.send('docker:build-progress', msg);
    }
  });
});

// Docker setup operations
ipcMain.handle('docker:detect-state', () => {
  logger.debug('IPC: docker:detect-state');
  return detectDockerState();
});

ipcMain.handle('docker:start-desktop', () => {
  logger.info('IPC: docker:start-desktop');
  return startDockerDesktop();
});

ipcMain.handle('docker:start-engine', () => {
  logger.info('IPC: docker:start-engine');
  return startDockerEngine();
});

// Yolium container operations
ipcMain.handle('yolium:create', (event, folderPath: string, agent: string = 'claude', gsdEnabled: boolean = true, gitConfig?: { name: string; email: string }, worktreeEnabled: boolean = false, branchName?: string) => {
  logger.info('IPC: yolium:create', { folderPath, agent, gsdEnabled, worktreeEnabled, branchName, gitConfig: gitConfig ? { name: gitConfig.name, email: gitConfig.email } : null });
  return createYolium(event.sender.id, folderPath, agent, gsdEnabled, gitConfig, worktreeEnabled, branchName);
});

ipcMain.on('yolium:write', (_event, sessionId: string, data: string) => {
  logger.debug('IPC: yolium:write', { sessionId, dataLength: data.length, dataHex: Buffer.from(data).toString('hex').slice(0, 20) });
  writeToContainer(sessionId, data);
});

ipcMain.on('yolium:resize', (_event, sessionId: string, cols: number, rows: number) => {
  resizeContainer(sessionId, cols, rows);
});

ipcMain.handle('yolium:stop', async (_event, sessionId: string, deleteWorktree?: boolean) => {
  logger.info('IPC: yolium:stop', { sessionId, deleteWorktree });

  // If deleteWorktree is explicitly set, handle worktree cleanup
  if (deleteWorktree === true) {
    deleteSessionWorktree(sessionId);
  }

  return stopYolium(sessionId);
});

// Get worktree info for a session (used for cleanup prompt)
ipcMain.handle('yolium:get-worktree-info', (_event, sessionId: string) => {
  return getSessionWorktreeInfo(sessionId);
});

// Docker rebuild operations
ipcMain.handle('docker:remove-all-containers', () => {
  logger.info('IPC: docker:remove-all-containers');
  return removeAllYoliumContainers();
});

ipcMain.handle('docker:remove-image', () => {
  logger.info('IPC: docker:remove-image');
  return removeYoliumImage();
});

// Cache management operations
ipcMain.handle('cache:list', () => {
  logger.info('IPC: cache:list');
  return listProjectCaches();
});

ipcMain.handle('cache:stats', () => {
  logger.info('IPC: cache:stats');
  return getProjectCacheStats();
});

ipcMain.handle('cache:delete', (_event, dirName: string) => {
  logger.info('IPC: cache:delete', { dirName });
  return deleteProjectCache(dirName);
});

ipcMain.handle('cache:cleanup-orphaned', () => {
  logger.info('IPC: cache:cleanup-orphaned');
  return cleanupOrphanedCaches();
});

ipcMain.handle('cache:cleanup-stale', (_event, maxAgeDays: number = 90) => {
  logger.info('IPC: cache:cleanup-stale', { maxAgeDays });
  return cleanupStaleCaches(maxAgeDays);
});

// ============================================================================
// Whisper speech-to-text IPC handlers
// ============================================================================

ipcMain.handle('whisper:list-models', () => {
  logger.info('IPC: whisper:list-models');
  return listModels();
});

ipcMain.handle('whisper:is-model-downloaded', (_event, modelSize: WhisperModelSize) => {
  if (!isValidModelSize(modelSize)) throw new Error(`Invalid model size: ${modelSize}`);
  return isModelDownloaded(modelSize);
});

ipcMain.handle('whisper:download-model', (event, modelSize: WhisperModelSize) => {
  if (!isValidModelSize(modelSize)) throw new Error(`Invalid model size: ${modelSize}`);
  logger.info('IPC: whisper:download-model', { modelSize });
  return downloadModel(modelSize, event.sender);
});

ipcMain.handle('whisper:delete-model', (_event, modelSize: WhisperModelSize) => {
  if (!isValidModelSize(modelSize)) throw new Error(`Invalid model size: ${modelSize}`);
  logger.info('IPC: whisper:delete-model', { modelSize });
  return deleteModel(modelSize);
});

ipcMain.handle('whisper:is-binary-available', () => {
  return isWhisperBinaryAvailable();
});

ipcMain.handle('whisper:transcribe', async (_event, audioData: number[], modelSize: WhisperModelSize) => {
  if (!isValidModelSize(modelSize)) throw new Error(`Invalid model size: ${modelSize}`);
  logger.info('IPC: whisper:transcribe', { modelSize, audioDataLength: audioData.length });

  // Write audio data to a temp file
  const tempDir = path.join(os.tmpdir(), 'yolium-whisper');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  const tempPath = path.join(tempDir, `audio-${crypto.randomUUID()}.wav`);
  fs.writeFileSync(tempPath, Buffer.from(audioData));

  try {
    const result = await transcribeAudio(tempPath, modelSize);
    return result;
  } finally {
    // Clean up temp file
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
  }
});

ipcMain.handle('whisper:get-selected-model', () => {
  return getSelectedModel();
});

ipcMain.handle('whisper:save-selected-model', (_event, modelSize: WhisperModelSize) => {
  if (!isValidModelSize(modelSize)) throw new Error(`Invalid model size: ${modelSize}`);
  saveSelectedModel(modelSize);
});

// Code review operations
ipcMain.handle('code-review:list-branches', (_event, repoUrl: string) => {
  logger.info('IPC: code-review:list-branches', { repoUrl });
  return listRemoteBranches(repoUrl);
});

ipcMain.handle('code-review:check-agent-auth', (_event, agent: string) => {
  logger.debug('IPC: code-review:check-agent-auth', { agent });
  return checkAgentAuth(agent);
});

ipcMain.handle('code-review:start', (event, repoUrl: string, branch: string, agent: string, gitConfig?: { name: string; email: string }) => {
  logger.info('IPC: code-review:start', { repoUrl, branch, agent });
  return createCodeReviewContainer(event.sender.id, repoUrl, branch, agent, gitConfig);
});

// Kanban board operations
ipcMain.handle('kanban:get-board', (_event, projectPath: string) => {
  return getOrCreateBoard(projectPath);
});

ipcMain.handle('kanban:add-item', (_event, projectPath: string, params: {
  title: string;
  description: string;
  branch?: string;
  agentType: 'claude' | 'codex' | 'opencode' | 'shell';
  order: number;
}) => {
  const board = getOrCreateBoard(projectPath);
  return addItem(board, params);
});

ipcMain.handle('kanban:update-item', (_event, projectPath: string, itemId: string, updates: Partial<KanbanItem>) => {
  const board = getOrCreateBoard(projectPath);
  return updateItem(board, itemId, updates);
});

ipcMain.handle('kanban:add-comment', (_event, projectPath: string, itemId: string, source: 'user' | 'agent' | 'system', text: string) => {
  const board = getOrCreateBoard(projectPath);
  return addComment(board, itemId, source, text);
});

ipcMain.handle('kanban:delete-item', (_event, projectPath: string, itemId: string) => {
  const board = getOrCreateBoard(projectPath);
  return deleteItem(board, itemId);
});

// Agent operations
ipcMain.handle('agent:start', async (event, params: {
  agentName: string;
  projectPath: string;
  itemId: string;
  goal: string;
}) => {
  const webContentsId = event.sender.id;
  logger.info('IPC: agent:start', { ...params, webContentsId });

  const result = await startAgent({
    webContentsId,
    ...params,
  });

  if (result.error) {
    logger.error('Agent start failed', { error: result.error });
    return result;
  }

  // Set up event forwarding from agent to renderer
  const events = getAgentEvents(result.sessionId);
  const win = BrowserWindow.getAllWindows().find(w => w.webContents.id === webContentsId);

  // Notify UI that board was updated (item moved to in-progress)
  win?.webContents.send('kanban:board-updated', params.projectPath);

  if (events) {
    events.on('output', (data: string) => {
      win?.webContents.send('agent:output', result.sessionId, data);
    });

    events.on('question', (question: { text: string; options?: string[] }) => {
      win?.webContents.send('agent:question', result.sessionId, question);
      // Notify UI that board was updated (item moved back to ready)
      win?.webContents.send('kanban:board-updated', params.projectPath);
    });

    events.on('itemCreated', (item: KanbanItem) => {
      win?.webContents.send('agent:item-created', result.sessionId, item);
      // Notify UI that board was updated (new item added)
      win?.webContents.send('kanban:board-updated', params.projectPath);
    });

    events.on('complete', (summary: string) => {
      win?.webContents.send('agent:complete', result.sessionId, summary);
      // Notify UI that board was updated (item moved to done)
      win?.webContents.send('kanban:board-updated', params.projectPath);
    });

    events.on('error', (message: string) => {
      win?.webContents.send('agent:error', result.sessionId, message);
      // Notify UI that board was updated (status changed)
      win?.webContents.send('kanban:board-updated', params.projectPath);
    });
  }

  return result;
});

ipcMain.handle('agent:resume', async (event, params: {
  agentName: string;
  projectPath: string;
  itemId: string;
  goal: string;
}) => {
  const webContentsId = event.sender.id;
  logger.info('IPC: agent:resume', { ...params, webContentsId });

  const result = await resumeAgent({
    webContentsId,
    ...params,
  });

  if (result.error) {
    logger.error('Agent resume failed', { error: result.error });
    return result;
  }

  // Set up event forwarding from agent to renderer
  const events = getAgentEvents(result.sessionId);
  const win = BrowserWindow.getAllWindows().find(w => w.webContents.id === webContentsId);

  // Notify UI that board was updated (item moved to in-progress)
  win?.webContents.send('kanban:board-updated', params.projectPath);

  if (events) {
    events.on('output', (data: string) => {
      win?.webContents.send('agent:output', result.sessionId, data);
    });

    events.on('question', (question: { text: string; options?: string[] }) => {
      win?.webContents.send('agent:question', result.sessionId, question);
      // Notify UI that board was updated (item moved back to ready)
      win?.webContents.send('kanban:board-updated', params.projectPath);
    });

    events.on('itemCreated', (item: KanbanItem) => {
      win?.webContents.send('agent:item-created', result.sessionId, item);
      // Notify UI that board was updated (new item added)
      win?.webContents.send('kanban:board-updated', params.projectPath);
    });

    events.on('complete', (summary: string) => {
      win?.webContents.send('agent:complete', result.sessionId, summary);
      // Notify UI that board was updated (item moved to done)
      win?.webContents.send('kanban:board-updated', params.projectPath);
    });

    events.on('error', (message: string) => {
      win?.webContents.send('agent:error', result.sessionId, message);
      // Notify UI that board was updated (status changed)
      win?.webContents.send('kanban:board-updated', params.projectPath);
    });
  }

  return result;
});

ipcMain.handle('agent:answer', (_event, projectPath: string, itemId: string, answer: string) => {
  logger.info('IPC: agent:answer', { projectPath, itemId, answerLength: answer.length });
  answerAgentQuestion(projectPath, itemId, answer);
});

ipcMain.handle('agent:stop', async (_event, sessionId: string) => {
  logger.info('IPC: agent:stop', { sessionId });
  await stopAgent(sessionId);
});

ipcMain.handle('agent:recover', (_event, projectPath: string) => {
  logger.info('IPC: agent:recover', { projectPath });
  return recoverInterruptedAgents(projectPath);
});

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', () => {
  logger.info('App ready', {
    version: app.getVersion(),
    isPackaged: app.isPackaged,
    logPath: getLogPath(),
  });
  createWindow();
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  logger.info('All windows closed');
  if (process.platform !== 'darwin') {
    // Perform cleanup and then quit
    performCleanup().finally(() => {
      logger.info('Quitting app');
      app.quit();
    });
  } else {
    // On macOS, just cleanup but don't quit
    performCleanup();
  }
});

app.on('before-quit', (event) => {
  // If cleanup hasn't been done yet, prevent quit and do cleanup first
  if (!cleanupDone) {
    event.preventDefault();
    logger.info('App quit requested, performing cleanup first...');
    performCleanup().finally(() => {
      logger.info('Cleanup done, quitting...');
      app.quit();
    });
  } else {
    logger.info('App quitting (cleanup already done)');
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
