import { test, expect } from '@playwright/test';
import { launchApp, closeApp, createTestRepo, cleanupTestRepo, type AppContext } from '../helpers/app';
import { selectors } from '../helpers/selectors';
import * as os from 'os';

test.describe('Search Escape behavior', () => {
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

  test.describe('Kanban board search', () => {
    test('pressing / then Escape should return to normal vim navigation', async () => {
      await openKanbanBoard();
      const page = ctx.window;
      await createItemViaIPC('Test item', 'Description');

      // Focus the kanban view first
      await page.click(selectors.kanbanView);

      // Press / to focus search input
      await page.keyboard.press('/');
      const searchInput = page.locator('[data-testid="search-input"]');
      await expect(searchInput).toBeFocused();

      // Vim mode should be INSERT
      await expect(page.locator(selectors.vimModeIndicator)).toContainText('INSERT');

      // Press Escape to exit search
      await page.keyboard.press('Escape');

      // Search should not be focused
      await expect(searchInput).not.toBeFocused();

      // Vim mode should return to NORMAL
      await expect(page.locator(selectors.vimModeIndicator)).toContainText('NORMAL');

      // Verify vim navigation works by pressing 'j' (should not type into search)
      await page.keyboard.press('j');
      await expect(searchInput).toHaveValue('');
    });

    test('pressing / typing a query then Escape should clear query and restore navigation', async () => {
      await openKanbanBoard();
      const page = ctx.window;
      await createItemViaIPC('Test item', 'Description');

      await page.click(selectors.kanbanView);

      // Press / to focus search, type a query
      await page.keyboard.press('/');
      const searchInput = page.locator('[data-testid="search-input"]');
      await searchInput.fill('test');
      await expect(searchInput).toHaveValue('test');

      // Press Escape
      await page.keyboard.press('Escape');

      // Query should be cleared and vim mode should be NORMAL
      await expect(searchInput).toHaveValue('');
      await expect(page.locator(selectors.vimModeIndicator)).toContainText('NORMAL');
    });
  });

  test.describe('Item detail dialog search', () => {
    test('pressing / then Escape should return focus to dialog container', async () => {
      await openKanbanBoard();
      const page = ctx.window;
      await createItemViaIPC('Test item for dialog', 'Description');

      // Open item detail dialog by clicking the card
      await page.locator(selectors.kanbanCard).first().click();
      await expect(page.locator(selectors.itemDetailDialog)).toBeVisible({ timeout: 5000 });

      // Press / to focus comment search
      await page.keyboard.press('/');
      const commentSearchInput = page.locator('[data-testid="comment-search-input"]');
      await expect(commentSearchInput).toBeFocused();

      // Press Escape to exit search
      await page.keyboard.press('Escape');

      // Comment search should not be focused
      await expect(commentSearchInput).not.toBeFocused();
    });

    test('pressing / typing a query then Escape should clear and exit search', async () => {
      await openKanbanBoard();
      const page = ctx.window;
      await createItemViaIPC('Test item for dialog search', 'Description');

      // Open item detail dialog
      await page.locator(selectors.kanbanCard).first().click();
      await expect(page.locator(selectors.itemDetailDialog)).toBeVisible({ timeout: 5000 });

      // Press / to focus comment search, type a query
      await page.keyboard.press('/');
      const commentSearchInput = page.locator('[data-testid="comment-search-input"]');
      await commentSearchInput.fill('hello');
      await expect(commentSearchInput).toHaveValue('hello');

      // Press Escape
      await page.keyboard.press('Escape');

      // Query should be cleared and input should not be focused
      await expect(commentSearchInput).toHaveValue('');
      await expect(commentSearchInput).not.toBeFocused();
    });
  });
});
