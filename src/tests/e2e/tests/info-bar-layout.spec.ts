import { test, expect } from '@playwright/test';
import { launchApp, closeApp, createTestRepo, cleanupTestRepo, type AppContext } from '../helpers/app';
import { selectors } from '../helpers/selectors';
import * as os from 'os';

test.describe('Info Bar Layout', () => {
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

  async function setupItemDetailDialog(itemOverrides: Record<string, unknown> = {}): Promise<void> {
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

    const item = await page.evaluate(async (repoPath: string) => {
      return window.electronAPI.kanban.addItem(repoPath, {
        title: 'Test info bar item',
        description: 'E2E test for info bar',
        agentProvider: 'claude' as const,
        order: 0,
      });
    }, testRepoPath) as { id: string };

    const defaults = {
      agentStatus: 'completed',
      column: 'done',
      branch: 'test-feature-branch',
      worktreePath: '/tmp/fake-worktree',
    };
    await page.evaluate(
      async (params: { path: string; id: string; updates: Record<string, unknown> }) => {
        await window.electronAPI.kanban.updateItem(params.path, params.id, params.updates);
      },
      { path: testRepoPath, id: item.id, updates: { ...defaults, ...itemOverrides } },
    );

    await page.click(selectors.kanbanRefreshButton);
    const column = (itemOverrides.column as string) || 'done';
    await expect(
      page.locator(selectors.kanbanColumn(column)).locator('[data-testid="kanban-card"]'),
    ).toBeVisible({ timeout: 5000 });
    await page.locator(selectors.kanbanColumn(column))
      .locator('[data-testid="kanban-card"]').first().click();
    await expect(page.locator('[data-testid="item-detail-dialog"]')).toBeVisible();
  }

  test('info-bar is visible above the editor zone whenever an item is open', async () => {
    await setupItemDetailDialog();
    const page = ctx.window;

    const bar = page.locator('[data-testid="info-bar"]');
    await expect(bar).toBeVisible();

    const barBox = await bar.boundingBox();
    const editorBox = await page.locator('[data-testid="editor-zone"]').boundingBox();
    expect(barBox).not.toBeNull();
    expect(editorBox).not.toBeNull();
    if (barBox && editorBox) {
      expect(barBox.y).toBeLessThan(editorBox.y);
    }
  });

  test('verified-checkbox, branch-display, and worktree-path-display render inside the info bar and not inside sidebar-zone', async () => {
    await setupItemDetailDialog();
    const page = ctx.window;

    const bar = page.locator('[data-testid="info-bar"]');
    await expect(bar.locator('[data-testid="verified-checkbox"]')).toBeVisible();
    await expect(bar.locator('[data-testid="branch-display"]')).toBeVisible();
    await expect(bar.locator('[data-testid="worktree-path-display"]')).toBeVisible();

    const sidebar = page.locator('[data-testid="sidebar-zone"]');
    await expect(sidebar.locator('[data-testid="verified-checkbox"]')).toHaveCount(0);
    await expect(sidebar.locator('[data-testid="branch-display"]')).toHaveCount(0);
    await expect(sidebar.locator('[data-testid="worktree-path-display"]')).toHaveCount(0);
  });

  test('pressing p toggles the verified-checkbox in the info bar end-to-end', async () => {
    await setupItemDetailDialog();
    const page = ctx.window;

    const bar = page.locator('[data-testid="info-bar"]');
    const checkbox = bar.locator('[data-testid="verified-checkbox"]');
    await expect(checkbox).toBeVisible();
    await expect(checkbox).not.toBeChecked();

    // Make sure focus is not in an input
    await page.keyboard.press('Escape');
    await page.keyboard.press('p');

    await expect(checkbox).toBeChecked({ timeout: 5000 });
  });
});
