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
    agentAuthenticated?: boolean;
    branches?: string[];
    branchError?: string;
  } = {}) {
    const {
      agentAuthenticated = true,
      branches,
      branchError,
    } = opts;

    ctx = await launchApp();

    // Override IPC handlers in the main process
    await ctx.app.evaluate(({ ipcMain }, mockOpts) => {
      // Remove existing handlers and replace with mocks
      ipcMain.removeHandler('git-config:load');
      ipcMain.handle('git-config:load', () => ({
        name: 'Test User',
        email: 'test@example.com',
        hasPat: true,
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
    }, { agentAuthenticated, branches, branchError });

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
    // Launch without mocks — test env has no PAT configured by default
    ctx = await launchApp();
    const { window } = ctx;

    await window.click(selectors.codeReviewButton);
    await expect(window.locator(selectors.codeReviewDialog)).toBeVisible();

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

    // Claude selected by default
    await expect(claudeBtn).toHaveClass(/ring-2/);
    await expect(opencodeBtn).not.toHaveClass(/ring-2/);

    // Click OpenCode
    await opencodeBtn.click();
    await expect(opencodeBtn).toHaveClass(/ring-2/);
    await expect(claudeBtn).not.toHaveClass(/ring-2/);

    // Click Claude back
    await claudeBtn.click();
    await expect(claudeBtn).toHaveClass(/ring-2/);
    await expect(opencodeBtn).not.toHaveClass(/ring-2/);
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
});
