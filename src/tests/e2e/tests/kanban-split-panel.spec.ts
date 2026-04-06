import { test, expect } from '@playwright/test';
import { launchApp, closeApp, createTestRepo, cleanupTestRepo, type AppContext } from '../helpers/app';
import { selectors } from '../helpers/selectors';
import * as os from 'os';

test.describe('Kanban Split Panel', () => {
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
    await expect(page.locator(selectors.kanbanView)).toBeVisible({ timeout: 10000 });
  }

  async function createItemViaIPC(title: string, description: string): Promise<{ id: string }> {
    const page = ctx.window;
    const item = await page.evaluate(
      async (params: { path: string; title: string; desc: string }) => {
        return window.electronAPI.kanban.addItem(params.path, {
          title: params.title,
          description: params.desc,
          agentProvider: 'claude' as const,
          order: 0,
        });
      },
      { path: testRepoPath, title, desc: description }
    ) as { id: string };

    await page.click(selectors.kanbanRefreshButton);
    await expect(
      page.locator(selectors.kanbanColumn('backlog')).locator(selectors.kanbanCard)
    ).toBeVisible({ timeout: 5000 });

    return item;
  }

  test('should show kanban columns alongside detail panel when card is opened via Enter key', async () => {
    await openKanbanBoard();
    const page = ctx.window;

    await createItemViaIPC('Split Panel Test', 'Testing split panel layout');

    // Focus on the kanban view and press Enter to open the card
    await page.click(selectors.kanbanView);
    await page.keyboard.press('Enter');

    // Both columns container and detail panel should be visible
    await expect(page.locator(selectors.kanbanColumnsContainer)).toBeVisible({ timeout: 5000 });
    await expect(page.locator(selectors.itemDetailDialog)).toBeVisible({ timeout: 5000 });

    // The split container should exist
    await expect(page.locator('[data-testid="kanban-split-container"]')).toBeVisible();
  });

  test('should close detail panel with Ctrl+Q and restore full board', async () => {
    await openKanbanBoard();
    const page = ctx.window;

    await createItemViaIPC('Close Panel Test', 'Testing close behavior');

    // Open the card
    await page.click(selectors.kanbanView);
    await page.keyboard.press('Enter');
    await expect(page.locator(selectors.itemDetailDialog)).toBeVisible({ timeout: 5000 });

    // Close with Ctrl+Q
    await page.keyboard.press('Control+q');
    await expect(page.locator(selectors.itemDetailDialog)).not.toBeVisible({ timeout: 5000 });

    // Columns should still be visible at full width
    await expect(page.locator(selectors.kanbanColumnsContainer)).toBeVisible();
  });

  test('should navigate between items with card clicks while panel stays open', async () => {
    await openKanbanBoard();
    const page = ctx.window;

    await createItemViaIPC('First Item', 'First item description');
    await createItemViaIPC('Second Item', 'Second item description');

    // Open the first card
    const cards = page.locator(selectors.kanbanColumn('backlog')).locator(selectors.kanbanCard);
    await cards.first().click();
    await expect(page.locator(selectors.itemDetailDialog)).toBeVisible({ timeout: 5000 });

    // Click the second card while panel is open
    await cards.nth(1).click();

    // Panel should still be visible (switched to second item)
    await expect(page.locator(selectors.itemDetailDialog)).toBeVisible();

    // Both columns and panel should be visible simultaneously
    await expect(page.locator(selectors.kanbanColumnsContainer)).toBeVisible();
  });
});
