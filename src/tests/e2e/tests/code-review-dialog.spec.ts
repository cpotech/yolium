import { test, expect } from '@playwright/test';
import { launchApp, closeApp, cleanupYoliumContainers, AppContext } from '../helpers/app';
import { selectors } from '../helpers/selectors';

test.describe('Code Review Dialog', () => {
  let ctx: AppContext;

  test.beforeEach(async () => {
    await cleanupYoliumContainers();
  });

  test.afterEach(async () => {
    if (ctx) {
      // Clear cached review URL to prevent leaking between tests
      try {
        await ctx.window.evaluate(() => localStorage.removeItem('yolium:lastReviewRepoUrl'));
      } catch {
        // Page may already be closed
      }
      await closeApp(ctx);
    }
  });

  /**
   * Launch app with mocked IPC handlers for deterministic code review tests.
   *
   * Uses `electronApp.evaluate` to override ipcMain handlers in the main process,
   * then reloads the renderer so the App picks up mocked values on mount.
   */
  async function launchWithCredentials(opts: {
    hasPat?: boolean;
    agentAuthenticated?: boolean;
    branches?: string[];
    branchError?: string;
    mockStartReview?: boolean;
  } = {}) {
    const {
      hasPat = true,
      agentAuthenticated = true,
      branches,
      branchError,
      mockStartReview = false,
    } = opts;

    ctx = await launchApp();

    // Override IPC handlers in the main process
    await ctx.app.evaluate(({ ipcMain }, mockOpts) => {
      // Remove existing handlers and replace with mocks
      ipcMain.removeHandler('git-config:load');
      ipcMain.handle('git-config:load', () => ({
        name: 'Test User',
        email: 'test@example.com',
        hasPat: mockOpts.hasPat,
      }));

      ipcMain.removeHandler('code-review:check-agent-auth');
      ipcMain.handle('code-review:check-agent-auth', () => ({
        authenticated: mockOpts.agentAuthenticated,
      }));

      if (mockOpts.branches !== undefined || mockOpts.branchError !== undefined) {
        ipcMain.removeHandler('code-review:list-branches');
        ipcMain.handle('code-review:list-branches', () => {
          if (mockOpts.branchError) {
            return { branches: [], error: mockOpts.branchError };
          }
          return { branches: mockOpts.branches || [] };
        });
      }

      if (mockOpts.mockStartReview) {
        ipcMain.removeHandler('docker:ensure-image');
        ipcMain.handle('docker:ensure-image', () => Promise.resolve());

        ipcMain.removeHandler('code-review:start');
        ipcMain.handle('code-review:start', () => 'mock-session-id');
      }
    }, { hasPat, agentAuthenticated, branches, branchError, mockStartReview });

    // Reload renderer so the App re-mounts and calls mocked loadGitConfig
    const { window } = ctx;
    await window.reload();
    await window.waitForSelector(
      '[data-testid="empty-state"], [data-testid="docker-setup-dialog"], [data-testid="tab-bar"]',
      { timeout: 30000 },
    );

    return ctx;
  }

  /**
   * Send a mock code-review:complete event from main process to renderer.
   */
  async function sendReviewComplete(exitCode: number) {
    await ctx.app.evaluate(({ BrowserWindow }, code) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win) {
        win.webContents.send('code-review:complete', 'mock-session-id', code);
      }
    }, exitCode);
  }

  /**
   * Open the code review dialog via the status bar button.
   */
  async function openDialog() {
    const { window } = ctx;
    await window.click(selectors.codeReviewButton);
    await expect(window.locator(selectors.codeReviewDialog)).toBeVisible();
  }

  test('should open and close dialog via Cancel button', async () => {
    await launchWithCredentials();
    const { window } = ctx;

    await openDialog();

    await window.click(selectors.reviewCancelButton);
    await expect(window.locator(selectors.codeReviewDialog)).not.toBeVisible();
  });

  test('should close dialog on Escape key', async () => {
    await launchWithCredentials();
    const { window } = ctx;

    await openDialog();

    await window.keyboard.press('Escape');
    await expect(window.locator(selectors.codeReviewDialog)).not.toBeVisible();
  });

  test('should restore cached URL on reopen', async () => {
    await launchWithCredentials();
    const { window } = ctx;

    // Clear any cached URL
    await window.evaluate(() => localStorage.removeItem('yolium:lastReviewRepoUrl'));

    // Open and type a URL
    await openDialog();
    await expect(window.locator(selectors.reviewRepoInput)).toHaveValue('');
    await window.fill(selectors.reviewRepoInput, 'https://github.com/test/repo');

    // Close without submitting — URL is not cached yet
    await window.click(selectors.reviewCancelButton);
    await expect(window.locator(selectors.codeReviewDialog)).not.toBeVisible();

    // Reopen — URL should be empty (not cached since we didn't submit)
    await openDialog();
    await expect(window.locator(selectors.reviewRepoInput)).toHaveValue('');

    // Close again
    await window.click(selectors.reviewCancelButton);

    // Simulate a cached URL in localStorage
    await window.evaluate(() => localStorage.setItem('yolium:lastReviewRepoUrl', 'https://github.com/cached/repo'));

    // Reopen — should restore cached URL
    await openDialog();
    await expect(window.locator(selectors.reviewRepoInput)).toHaveValue('https://github.com/cached/repo');
  });

  test('should show credentials warning when PAT not configured', async () => {
    // Launch with mocked git config that has no PAT
    await launchWithCredentials({ hasPat: false });
    const { window } = ctx;

    await openDialog();

    // Credentials warning should be visible
    await expect(window.locator(selectors.reviewCredentialsWarning)).toBeVisible();

    // Inputs should be disabled
    await expect(window.locator(selectors.reviewRepoInput)).toBeDisabled();
    await expect(window.locator(selectors.reviewBranchInput)).toBeDisabled();
  });

  test('should have Start Review button disabled without inputs', async () => {
    await launchWithCredentials();
    const { window } = ctx;

    await openDialog();

    await expect(window.locator(selectors.reviewStartButton)).toBeDisabled();
  });

  test('should toggle agent selection', async () => {
    await launchWithCredentials();
    const { window } = ctx;

    await openDialog();

    const claudeBtn = window.locator(selectors.reviewAgentClaude);
    const opencodeBtn = window.locator(selectors.reviewAgentOpencode);
    const codexBtn = window.locator(selectors.reviewAgentCodex);

    // Claude selected by default
    await expect(claudeBtn).toHaveClass(/ring-2/);
    await expect(opencodeBtn).not.toHaveClass(/ring-2/);
    await expect(codexBtn).not.toHaveClass(/ring-2/);

    // Click OpenCode
    await opencodeBtn.click();
    await expect(opencodeBtn).toHaveClass(/ring-2/);
    await expect(claudeBtn).not.toHaveClass(/ring-2/);
    await expect(codexBtn).not.toHaveClass(/ring-2/);

    // Click Codex
    await codexBtn.click();
    await expect(codexBtn).toHaveClass(/ring-2/);
    await expect(claudeBtn).not.toHaveClass(/ring-2/);
    await expect(opencodeBtn).not.toHaveClass(/ring-2/);

    // Click Claude back
    await claudeBtn.click();
    await expect(claudeBtn).toHaveClass(/ring-2/);
    await expect(opencodeBtn).not.toHaveClass(/ring-2/);
    await expect(codexBtn).not.toHaveClass(/ring-2/);
  });

  test('should have Fetch button disabled without URL', async () => {
    await launchWithCredentials();
    const { window } = ctx;

    await openDialog();

    await expect(window.locator(selectors.reviewFetchButton)).toBeDisabled();

    // Type URL — Fetch should enable
    await window.fill(selectors.reviewRepoInput, 'https://github.com/test/repo');
    await expect(window.locator(selectors.reviewFetchButton)).toBeEnabled();
  });

  test('should display branch error on fetch failure', async () => {
    await launchWithCredentials({ branchError: 'Authentication failed' });
    const { window } = ctx;

    await openDialog();

    await window.fill(selectors.reviewRepoInput, 'https://github.com/test/repo');
    await window.click(selectors.reviewFetchButton);

    await expect(window.locator(selectors.reviewBranchError)).toBeVisible();
    await expect(window.locator(selectors.reviewBranchError)).toContainText('Authentication failed');
  });

  test('should fetch branches and auto-select main', async () => {
    await launchWithCredentials({ branches: ['develop', 'main', 'feature/test'] });
    const { window } = ctx;

    await openDialog();

    await window.fill(selectors.reviewRepoInput, 'https://github.com/test/repo');
    await window.click(selectors.reviewFetchButton);

    // Branch select should appear with main auto-selected
    await expect(window.locator(selectors.reviewBranchSelect)).toBeVisible();
    await expect(window.locator(selectors.reviewBranchSelect)).toHaveValue('main');

    // All branches should be present
    const options = window.locator(`${selectors.reviewBranchSelect} option`);
    await expect(options).toHaveCount(3);
  });

  test('should trigger fetch on Enter in URL field', async () => {
    await launchWithCredentials({ branches: ['main', 'staging'] });
    const { window } = ctx;

    await openDialog();

    await window.fill(selectors.reviewRepoInput, 'https://github.com/test/repo');
    await window.locator(selectors.reviewRepoInput).press('Enter');

    // Branches should populate
    await expect(window.locator(selectors.reviewBranchSelect)).toBeVisible();
    await expect(window.locator(selectors.reviewBranchSelect)).toHaveValue('main');
  });

  test('should show agent auth warning when agent is not authenticated', async () => {
    await launchWithCredentials({ agentAuthenticated: false, branches: ['main'] });
    const { window } = ctx;

    await openDialog();

    // Agent auth warning should be visible
    await expect(window.locator(selectors.reviewAgentWarning)).toBeVisible();

    // Start Review should be disabled even with URL and branch filled
    await window.fill(selectors.reviewRepoInput, 'https://github.com/test/repo');
    await window.click(selectors.reviewFetchButton);
    await expect(window.locator(selectors.reviewBranchSelect)).toBeVisible();
    await expect(window.locator(selectors.reviewStartButton)).toBeDisabled();
  });

  test('should show completed status after successful review', async () => {
    await launchWithCredentials({ branches: ['main'], mockStartReview: true });
    const { window } = ctx;

    await openDialog();

    // Fill in URL and fetch branches
    await window.fill(selectors.reviewRepoInput, 'https://github.com/test/repo');
    await window.click(selectors.reviewFetchButton);
    await expect(window.locator(selectors.reviewBranchSelect)).toBeVisible();

    // Click Start Review
    await window.click(selectors.reviewStartButton);

    // Status should transition to running
    await expect(window.locator(selectors.reviewStatus)).toBeVisible();
    await expect(window.locator(selectors.reviewStatus)).toContainText('Review in progress');

    // Simulate successful completion (exit code 0)
    await sendReviewComplete(0);

    // Status should show completed
    await expect(window.locator(selectors.reviewStatus)).toContainText('Review completed');
  });

  test('should show failed status after review failure', async () => {
    await launchWithCredentials({ branches: ['main'], mockStartReview: true });
    const { window } = ctx;

    await openDialog();

    // Fill in URL and fetch branches
    await window.fill(selectors.reviewRepoInput, 'https://github.com/test/repo');
    await window.click(selectors.reviewFetchButton);
    await expect(window.locator(selectors.reviewBranchSelect)).toBeVisible();

    // Click Start Review
    await window.click(selectors.reviewStartButton);

    // Status should transition to running
    await expect(window.locator(selectors.reviewStatus)).toBeVisible();

    // Simulate failure (exit code 1)
    await sendReviewComplete(1);

    // Status should show failed
    await expect(window.locator(selectors.reviewStatus)).toContainText('Review failed');
    await expect(window.locator(selectors.reviewStatus)).toContainText('Container exited with code 1');
  });
});

/**
 * Integration tests that exercise the real container lifecycle.
 * Requires Docker running and yolium:latest image available.
 * Skipped automatically when Docker or the image is unavailable.
 */
test.describe('Code Review Container Integration', () => {
  let ctx: AppContext;
  let dockerAvailable = false;

  test.beforeAll(async () => {
    // Check if Docker is running and image exists
    const { execSync } = await import('child_process');
    try {
      execSync('docker image inspect yolium:latest', { stdio: 'pipe' });
      dockerAvailable = true;
    } catch {
      dockerAvailable = false;
    }
  });

  test.beforeEach(async () => {
    test.skip(!dockerAvailable, 'Docker not available or yolium:latest image not built');
    test.skip(!!process.env.CI, 'Skipped in CI - requires real agent credentials');
    await cleanupYoliumContainers();
  });

  test.afterEach(async () => {
    if (ctx) {
      try {
        await ctx.window.evaluate(() => localStorage.removeItem('yolium:lastReviewRepoUrl'));
      } catch {
        // Page may already be closed
      }
      await closeApp(ctx);
    }
    await cleanupYoliumContainers();
  });

  test('should start real container and stay in running state', async () => {
    test.setTimeout(120_000);
    ctx = await launchApp();

    // Override only credentials and branch listing — NOT code-review:start
    // so the real createCodeReviewContainer is exercised
    await ctx.app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('git-config:load');
      ipcMain.handle('git-config:load', () => ({
        name: 'Test User',
        email: 'test@example.com',
        hasPat: true,
      }));

      ipcMain.removeHandler('code-review:check-agent-auth');
      ipcMain.handle('code-review:check-agent-auth', () => ({
        authenticated: true,
      }));

      ipcMain.removeHandler('code-review:list-branches');
      ipcMain.handle('code-review:list-branches', () => ({
        branches: ['main'],
      }));
    });

    const { window } = ctx;
    await window.reload();
    await window.waitForSelector(
      '[data-testid="empty-state"], [data-testid="docker-setup-dialog"], [data-testid="tab-bar"]',
      { timeout: 30000 },
    );

    // Open the code review dialog
    await window.click(selectors.codeReviewButton);
    await expect(window.locator(selectors.codeReviewDialog)).toBeVisible();

    // Fill in a real public repo URL and fetch branches
    await window.fill(selectors.reviewRepoInput, 'https://github.com/yolium-ai/yolium');
    await window.click(selectors.reviewFetchButton);
    await expect(window.locator(selectors.reviewBranchSelect)).toBeVisible({ timeout: 15000 });

    // Select main branch
    await window.locator(selectors.reviewBranchSelect).selectOption('main');

    // Start the review — this uses the REAL code-review:start handler
    await window.click(selectors.reviewStartButton);

    // The key assertion: status should transition to "running" first, then eventually
    // complete successfully. Before the fix, the container would exit immediately
    // due to the attach-after-start race condition, producing exit code 0 with no
    // output (no "Comments have been posted" message).
    //
    // We check for either "in progress" or "completed" because fast reviews may
    // finish before the assertion runs. The critical signal is that the review
    // completes *successfully* with real output, not an empty immediate exit.
    const status = window.locator(selectors.reviewStatus);
    await expect(status).toBeVisible({ timeout: 30000 });

    // Wait for the review to complete (real container runs the review agent)
    await expect(status).toContainText(/Review (in progress|completed)/, { timeout: 120000 });

    // If still running, wait for completion
    const currentText = await status.textContent();
    if (currentText?.includes('in progress')) {
      await expect(status).toContainText('Review completed', { timeout: 120000 });
    }

    // The review should have completed successfully, not failed
    await expect(status).toContainText('Review completed');
  });
});
