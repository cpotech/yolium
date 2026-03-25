/**
 * @module src/main
 * Electron main process entry point. Handles app lifecycle, window creation, and menu setup.
 */

import { app, BrowserWindow, Menu, session } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { createLogger, getLogPath } from '@main/lib/logger';
import { clearSessions } from '@main/services/agent-runner';
import { registerAllHandlers, performCleanup, isCleanupDone } from '@main/ipc';
import { scheduler } from '@main/services/scheduler';
import { buildContextMenuItems } from '@main/context-menu';
import { initSpellChecker } from '@main/services/spellcheck-setup';

const logger = createLogger('main');

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

// Declare Vite globals (provided by Electron Forge Vite plugin)
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string;
declare const MAIN_WINDOW_VITE_NAME: string;

let mainWindow: BrowserWindow | null = null;
const DEV_SERVER_LOAD_RETRY_MS = 500;
const DEV_SERVER_MAX_LOAD_ATTEMPTS = 60;

/**
 * Create the application menu with keyboard shortcuts.
 * @param window - The browser window to attach the menu to
 */
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
          accelerator: 'CmdOrCtrl+Shift+,',
          click: () => window.webContents.send('git-settings:show'),
        },
        {
          label: 'Open Project',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: () => window.webContents.send('project:open'),
        },
        { type: 'separator' },
        {
          label: 'Toggle Recording',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: () => window.webContents.send('recording:toggle'),
        },
        {
          label: 'Scheduled Agents',
          accelerator: 'CmdOrCtrl+Shift+H',
          click: () => window.webContents.send('schedule:show'),
        },
        { type: 'separator' },
        {
          label: 'Refresh Usage',
          accelerator: 'CmdOrCtrl+Shift+U',
          click: () => window.webContents.send('usage:refresh'),
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

function loadRenderer(window: BrowserWindow, attempt = 0): void {
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    const devServerUrl = MAIN_WINDOW_VITE_DEV_SERVER_URL.replace('://localhost', '://127.0.0.1');

    void window.loadURL(devServerUrl).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      const shouldRetry = message.includes('ERR_CONNECTION_REFUSED') && attempt < DEV_SERVER_MAX_LOAD_ATTEMPTS;

      if (!shouldRetry) {
        logger.error('Failed to load renderer URL', { message, attempt });
        return;
      }

      setTimeout(() => {
        if (!window.isDestroyed()) {
          loadRenderer(window, attempt + 1);
        }
      }, DEV_SERVER_LOAD_RETRY_MS);
    });
    return;
  }

  void window.loadFile(
    path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
  );
}

function createWindow(): void {
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

  loadRenderer(mainWindow);

  // Native right-click context menu (Copy, Cut, Paste, Select All, Spell Check)
  mainWindow.webContents.on('context-menu', (_event, params) => {
    const items = buildContextMenuItems(params, mainWindow!.webContents);
    const menu = Menu.buildFromTemplate(items);
    menu.popup();
  });

  // Create application menu with accelerators
  createAppMenu(mainWindow);
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', () => {
  logger.info('App ready', {
    version: app.getVersion(),
    isPackaged: app.isPackaged,
    logPath: getLogPath(),
  });

  try {
    const registeredNow = registerAllHandlers();
    logger.info('IPC handler bootstrap completed', { registeredNow });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Failed to register IPC handlers', { error: message });
    app.quit();
    return;
  }

  // Clear stale agent sessions from any previous crash
  clearSessions();

  // Start the CRON scheduler for specialist agents
  try {
    scheduler.start();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Failed to start scheduler (non-fatal)', { error: message });
  }

  // Enable built-in spell checker
  initSpellChecker(session.defaultSession);

  // Always create the window, even if non-critical services failed above
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
  if (!isCleanupDone()) {
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
