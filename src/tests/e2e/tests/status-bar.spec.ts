import { test, expect } from '@playwright/test';
import { launchApp, closeApp, createTestRepo, cleanupTestRepo, type AppContext } from '../helpers/app';
import * as os from 'os';
import * as path from 'path';

/**
 * Status bar E2E tests.
 *
 * Tests cover:
 * - Project name display in status bar
 * - Tooltip showing full path
 */
test.describe('Status Bar', () => {
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

  async function openKanbanBoard(): Promise<void> {
    ctx = await launchApp();
    const page = ctx.window;

    await page.evaluate(() => {
      localStorage.removeItem('yolium-sidebar-projects');
      localStorage.removeItem('yolium-open-kanban-tabs');
    });
    await page.reload();

    await page.click('[data-testid="new-tab-button"]');
    await page.waitForSelector('[data-testid="kanban-board"]', { state: 'visible' });
  }

  test('should display project name in status bar', async () => {
    await openKanbanBoard();
    const { window } = ctx;

    const projectName = path.basename(testRepoPath);
    const statusBar = window.locator('[data-testid="status-bar"]');
    await expect(statusBar).toContainText(projectName);
  });

  test('should show full path as tooltip on status bar project name', async () => {
    await openKanbanBoard();
    const { window } = ctx;

    const statusPath = window.locator('[data-testid="status-path"]');
    await expect(statusPath).toHaveAttribute('title', testRepoPath);
  });
});
