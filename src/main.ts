/**
 * @module src/main
 * Electron main process entry point. Handles app lifecycle, window creation, and menu setup.
 */

import { app, BrowserWindow, Menu } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { createLogger, getLogPath } from '@main/lib/logger';
import { clearSessions } from '@main/services/agent-runner';
import { registerAllHandlers, performCleanup, isCleanupDone } from '@main/ipc';

const logger = createLogger('main');

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

// Declare Vite globals (provided by Electron Forge Vite plugin)
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string;
declare const MAIN_WINDOW_VITE_NAME: string;

let mainWindow: BrowserWindow | null = null;

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

/**
 * Create the main application window.
 */
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
}

// Register all IPC handlers
registerAllHandlers();

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', () => {
  logger.info('App ready', {
    version: app.getVersion(),
    isPackaged: app.isPackaged,
    logPath: getLogPath(),
  });
  // Clear stale agent sessions from any previous crash
  clearSessions();
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
