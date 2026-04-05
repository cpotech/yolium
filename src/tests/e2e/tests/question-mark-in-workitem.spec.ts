import { test, expect } from '@playwright/test';
import { launchApp, closeApp, createTestRepo, cleanupTestRepo, type AppContext } from '../helpers/app';
import { selectors } from '../helpers/selectors';
import * as os from 'os';

test.describe('Question mark shortcut in work item dialogs', () => {
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
    await page.waitForSelector(selectors.kanbanView, { timeout: 10000 });
  }

  test('pressing ? in work item detail dialog should open the keyboard shortcuts dialog', async () => {
    await openKanbanBoard();
    const page = ctx.window;

    // Create a work item via IPC
    await page.evaluate(async (repoPath: string) => {
      return window.electronAPI.kanban.addItem(repoPath, {
        title: 'Test item for ? shortcut',
        description: 'Testing ? key in detail dialog',
        agentProvider: 'claude' as const,
        order: 0,
      });
    }, testRepoPath);

    // Refresh board so the item renders
    await page.click(selectors.kanbanRefreshButton);
    await expect(
      page.locator(selectors.kanbanColumn('backlog')).locator(selectors.kanbanCard).first()
    ).toBeVisible({ timeout: 5000 });

    // Click the card to open the detail dialog
    await page.locator(selectors.kanbanColumn('backlog'))
      .locator(selectors.kanbanCard).first().click();
    await expect(page.locator(selectors.itemDetailDialog)).toBeVisible();

    // Press ? — should open the keyboard shortcuts dialog
    await page.keyboard.press('Shift+/');

    // The shortcuts dialog should be visible
    await expect(page.locator(selectors.shortcutsDialog)).toBeVisible({ timeout: 3000 });
  });
});
