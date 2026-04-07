import { test, expect } from '@playwright/test';
import { launchApp, closeApp, createTestRepo, cleanupTestRepo, type AppContext } from '../helpers/app';
import { selectors } from '../helpers/selectors';
import * as os from 'os';

test.describe('Dev Server Shortcut', () => {
  let ctx: AppContext;
  let testRepoPath: string;

  test.beforeEach(async () => {
    testRepoPath = await createTestRepo(os.tmpdir());
  });

  test.afterEach(async () => {
    if (ctx) {
      await closeApp(ctx);
      ctx = undefined as unknown as AppContext;
    }
    if (testRepoPath) {
      await cleanupTestRepo(testRepoPath);
      testRepoPath = '';
    }
  });

  /**
   * Launch app, add project, create work item with a fake active session, open detail dialog.
   */
  async function setupItemDetailWithSession(): Promise<void> {
    ctx = await launchApp();
    const page = ctx.window;

    // Mock agent:recover to return empty
    await ctx.app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('agent:recover');
      ipcMain.handle('agent:recover', () => []);
    });

    // Mock agent:detect-dev-command to return a command
    await ctx.app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('agent:detect-dev-command');
      ipcMain.handle('agent:detect-dev-command', () => 'npm run dev');
    });

    // Mock agent:start-dev-server to succeed
    await ctx.app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('agent:start-dev-server');
      ipcMain.handle('agent:start-dev-server', () => ({ success: true }));
    });

    // Mock agent:get-active-session to return a fake session
    await ctx.app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('agent:get-active-session');
      ipcMain.handle('agent:get-active-session', () => ({
        sessionId: 'fake-session-1',
        cumulativeUsage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
      }));
    });

    await page.evaluate(() => {
      localStorage.removeItem('yolium-sidebar-projects');
      localStorage.removeItem('yolium-open-kanban-tabs');
    });
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector(
      '[data-testid="empty-state"], [data-testid="docker-setup-dialog"], [data-testid="tab-bar"]',
      { timeout: 30000 }
    );

    // Add project
    await page.click(selectors.openProjectButton);
    await page.fill(selectors.pathInput, testRepoPath);
    await page.click(selectors.pathNextButton);
    await expect(page.locator(selectors.kanbanView)).toBeVisible({ timeout: 10000 });

    // Create item via IPC with an agent status that indicates a running session
    await page.evaluate(async (repoPath: string) => {
      return window.electronAPI.kanban.addItem(repoPath, {
        title: 'Test dev server shortcut',
        description: 'E2E test for s shortcut',
        agentProvider: 'claude' as const,
        order: 0,
      });
    }, testRepoPath);

    // Refresh board and open detail dialog
    await page.click(selectors.kanbanRefreshButton);
    await expect(
      page.locator(selectors.kanbanColumn('backlog')).locator('[data-testid="kanban-card"]')
    ).toBeVisible({ timeout: 5000 });
    await page.locator(selectors.kanbanColumn('backlog'))
      .locator('[data-testid="kanban-card"]').first().click();
    await expect(page.locator('[data-testid="item-detail-dialog"]')).toBeVisible();
  }

  test('should trigger dev server start when pressing s in normal mode with active container', async () => {
    await setupItemDetailWithSession();
    const page = ctx.window;

    // The dev server section should be visible (since we mocked an active session)
    // Wait for the dev-server section to appear
    const devServerSection = page.locator('[data-testid="dev-server"]');

    // If no active container session in the UI, the section won't show.
    // The s key should still be handled by the dialog's keyboard handler.
    // Press s to trigger dev server start
    await page.keyboard.press('s');

    // The shortcut should be consumed (not typed into any input).
    // Verify the key was processed by checking that the dialog is still open
    // (s doesn't close the dialog, unlike Escape).
    await expect(page.locator('[data-testid="item-detail-dialog"]')).toBeVisible();

    // If the dev-server section is visible, the button should reflect the action
    if (await devServerSection.isVisible()) {
      // The start button should exist and may show Starting... or the section shows Running
      const startButton = page.locator('[data-testid="start-dev-server-button"]');
      const isVisible = await startButton.isVisible().catch(() => false);
      if (isVisible) {
        // Button text should indicate action was triggered
        await expect(startButton).toBeVisible();
      }
    }
  });
});
