import { test, expect } from '@playwright/test';
import { launchApp, closeApp, createTestRepo, cleanupTestRepo, type AppContext } from '../helpers/app';
import { selectors } from '../helpers/selectors';
import * as os from 'os';

/**
 * E2E tests for Shift+H in kanban content zone → open scheduled agents.
 */
test.describe('Vim Shortcut: Shift+H in Kanban opens Schedule', () => {
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
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector(
      '[data-testid="empty-state"], [data-testid="docker-setup-dialog"], [data-testid="tab-bar"]',
      { timeout: 30000 }
    );

    await page.click(selectors.openProjectButton);
    await page.fill(selectors.pathInput, testRepoPath);
    await page.click(selectors.pathNextButton);
    await page.waitForSelector('[data-testid="kanban-view"]', { timeout: 10000 });
  }

  test('Shift+H in kanban content zone opens the schedule panel', async () => {
    await openKanbanBoard();
    const page = ctx.window;

    // Focus the content zone
    await page.keyboard.press('c');
    await expect(page.locator('[data-vim-zone="content"]')).toHaveClass(/ring-1/, { timeout: 5000 });

    // Press Shift+H to navigate to schedule
    await page.keyboard.press('Shift+H');
    await expect(page.locator('[data-testid="schedule-panel"]')).toBeVisible({ timeout: 5000 });
  });

  test('Shift+H in kanban content zone activates the schedule zone ring highlight', async () => {
    await openKanbanBoard();
    const page = ctx.window;

    // Focus the content zone
    await page.keyboard.press('c');
    await expect(page.locator('[data-vim-zone="content"]')).toHaveClass(/ring-1/, { timeout: 5000 });

    // Press Shift+H to navigate to schedule
    await page.keyboard.press('Shift+H');
    await expect(page.locator('[data-vim-zone="schedule"]')).toHaveClass(/ring-1/, { timeout: 5000 });
  });
});
