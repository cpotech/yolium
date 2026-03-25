import { _electron as electron, ElectronApplication, Page } from '@playwright/test';
import path from 'path';

export interface AppContext {
  app: ElectronApplication;
  window: Page;
}

/**
 * Launch the Yolium Electron app for testing.
 *
 * Prerequisites:
 * - App must be built first: `npm run package`
 * - Docker must be running (or tests will see setup wizard)
 */
export async function launchApp(options: {
  /** Skip waiting for Docker check (for testing setup wizard) */
  skipDockerWait?: boolean;
  /** Environment variables to pass to the app */
  env?: Record<string, string>;
} = {}): Promise<AppContext> {
  const needsHeadlessLinux = process.platform === 'linux' && !process.env.DISPLAY;
  const extraArgs = needsHeadlessLinux
    ? [
        // Allow Electron/Chromium to start in headless Linux CI shells that
        // do not provide an X server.
        '--ozone-platform=headless',
        '--disable-gpu',
      ]
    : [];

  const app = await electron.launch({
    args: [
      path.join(__dirname, '../../../../.vite/build/main.js'),
      // Disable sandbox for CI/headless environments (Linux without chrome-sandbox setuid)
      '--no-sandbox',
      ...extraArgs,
    ],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      YOLIUM_E2E_MOCK_DOCKER: '1',
      // Disable hardware acceleration for CI stability
      ELECTRON_DISABLE_GPU: '1',
      ...(needsHeadlessLinux ? { ELECTRON_OZONE_PLATFORM_HINT: 'headless' } : {}),
      ...options.env,
    },
    timeout: 15000,
  });

  // Use a race to detect if the app crashes before creating a window.
  // Without this, firstWindow() silently waits 30s per attempt when the
  // main process fails to load (e.g. native module ABI mismatch).
  const window = await Promise.race([
    app.firstWindow(),
    new Promise<never>((_resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(
          'Timed out waiting for first window (10s). ' +
          'The Electron main process may have crashed during startup. ' +
          'Check that all native modules are rebuilt for Electron ' +
          '(npx electron-rebuild --only better-sqlite3,node-pty).'
        ));
      }, 10000);
      // If firstWindow resolves first, this timer is harmless (cleared below)
      timer.unref?.();
    }),
  ]);

  // Wait for app to be ready (either shows main UI or Docker setup)
  await window.waitForLoadState('domcontentloaded');

  if (!options.skipDockerWait) {
    // Wait for Docker check to complete (loading spinner disappears)
    // Either we see the empty state or the Docker setup dialog
    await window.waitForSelector('[data-testid="empty-state"], [data-testid="docker-setup-dialog"], [data-testid="tab-bar"]', {
      timeout: 30000,
    });
  }

  return { app, window };
}

/**
 * Close the app gracefully, ensuring Docker containers are cleaned up.
 */
export async function closeApp(ctx: AppContext): Promise<void> {
  // Clean up Docker containers before closing
  // This prevents container state from leaking between tests
  try {
    await ctx.window.evaluate(async () => {
      await window.electronAPI.docker.removeAllContainers();
    });
  } catch {
    // App may be in a broken state, fall back to docker CLI cleanup
    await cleanupYoliumContainers();
  }

  await ctx.app.close();
}

/**
 * Clean up all yolium containers using docker CLI.
 * Used as a fallback when the app's IPC isn't available.
 * Silently succeeds if docker is not available.
 */
export async function cleanupYoliumContainers(): Promise<void> {
  const { execSync } = await import('child_process');
  try {
    // Get all yolium container IDs
    // Use full path or PATH lookup; silence stderr if docker not found
    const containerIds = execSync(
      'docker ps -aq --filter ancestor=yolium:latest 2>/dev/null || true',
      { encoding: 'utf-8', shell: '/bin/bash' }
    ).trim();

    if (containerIds) {
      // Stop and remove containers
      execSync(`docker rm -f ${containerIds.split('\n').join(' ')} 2>/dev/null || true`, {
        shell: '/bin/bash',
      });
    }
  } catch {
    // No containers to clean up or docker not available
  }
}

/**
 * Wait for Docker to be ready (skip setup wizard)
 */
export async function waitForDockerReady(window: Page): Promise<void> {
  // If Docker setup dialog is shown, we need to wait for user action
  // In CI, Docker should already be running
  const setupDialog = await window.$('[data-testid="docker-setup-dialog"]');
  if (setupDialog) {
    throw new Error('Docker is not running. Start Docker before running E2E tests.');
  }
}

/**
 * Create a test git repository for E2E tests
 */
export async function createTestRepo(baseDir: string): Promise<string> {
  const { execSync } = await import('child_process');
  const fs = await import('fs');
  const repoPath = path.join(baseDir, `test-repo-${Date.now()}`);

  fs.mkdirSync(repoPath, { recursive: true });

  execSync('git init -b main', { cwd: repoPath });
  execSync('git config user.email "test@example.com"', { cwd: repoPath });
  execSync('git config user.name "Test User"', { cwd: repoPath });

  // Create initial commit (required for worktree)
  fs.writeFileSync(path.join(repoPath, 'README.md'), '# Test Repo\n');
  execSync('git add .', { cwd: repoPath });
  execSync('git commit -m "Initial commit"', { cwd: repoPath });

  return repoPath;
}

/**
 * Clean up test repository
 */
export async function cleanupTestRepo(repoPath: string): Promise<void> {
  const fs = await import('fs');
  fs.rmSync(repoPath, { recursive: true, force: true });
}
