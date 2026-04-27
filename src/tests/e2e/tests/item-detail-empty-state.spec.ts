import { test, expect } from '@playwright/test';
import { launchApp, closeApp, createTestRepo, cleanupTestRepo, type AppContext } from '../helpers/app';
import { selectors } from '../helpers/selectors';
import * as os from 'os';

test.describe('Item Detail Empty State', () => {
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

  async function setupEmptyItemDetailDialog(): Promise<void> {
    ctx = await launchApp();
    const page = ctx.window;

    await ctx.app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('agent:recover');
      ipcMain.handle('agent:recover', () => []);
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

    await page.click(selectors.openProjectButton);
    await page.fill(selectors.pathInput, testRepoPath);
    await page.click(selectors.pathNextButton);
    await expect(page.locator(selectors.kanbanView)).toBeVisible({ timeout: 10000 });

    // Add an empty item (no description)
    const item = await page.evaluate(async (repoPath: string) => {
      return window.electronAPI.kanban.addItem(repoPath, {
        title: 'Empty item',
        description: '',
        agentProvider: 'claude' as const,
        order: 0,
      });
    }, testRepoPath) as { id: string };

    await page.click(selectors.kanbanRefreshButton);
    await expect(
      page.locator(selectors.kanbanColumn('backlog')).locator('[data-testid="kanban-card"]'),
    ).toBeVisible({ timeout: 5000 });
    await page.locator(selectors.kanbanColumn('backlog'))
      .locator('[data-testid="kanban-card"]').first().click();
    await expect(page.locator('[data-testid="item-detail-dialog"]')).toBeVisible();
  }

  test('description textarea defaults to 6 rows when empty', async () => {
    await setupEmptyItemDetailDialog();
    const page = ctx.window;

    const desc = page.locator('[data-testid="description-input"]');
    await expect(desc).toBeVisible();
    const rows = await desc.getAttribute('rows');
    expect(rows).toBe('6');
  });

  test('empty description shows placeholder text', async () => {
    await setupEmptyItemDetailDialog();
    const page = ctx.window;

    const desc = page.locator('[data-testid="description-input"]');
    const placeholder = await desc.getAttribute('placeholder');
    expect(placeholder).not.toBeNull();
    expect((placeholder ?? '').length).toBeGreaterThan(0);
  });
});
