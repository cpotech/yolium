import { test, expect } from '@playwright/test';
import { launchApp, closeApp, createTestRepo, cleanupTestRepo, type AppContext } from '../helpers/app';
import { selectors } from '../helpers/selectors';
import * as os from 'os';

test.describe('Item Detail Header', () => {
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
        title: 'Test header item',
        description: 'E2E test for unified header',
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

  test('renders a single unified header (replaces 3 stacked bars)', async () => {
    await setupItemDetailDialog();
    const page = ctx.window;

    const header = page.locator('[data-testid="item-detail-header"]');
    await expect(header).toBeVisible();

    // Old separate bars should not exist anymore
    await expect(page.locator('[data-testid="info-bar"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="merge-bar"]')).toHaveCount(0);
  });

  test('header sits above the editor zone', async () => {
    await setupItemDetailDialog();
    const page = ctx.window;

    const header = page.locator('[data-testid="item-detail-header"]');
    const editor = page.locator('[data-testid="editor-zone"]');
    const headerBox = await header.boundingBox();
    const editorBox = await editor.boundingBox();
    expect(headerBox).not.toBeNull();
    expect(editorBox).not.toBeNull();
    if (headerBox && editorBox) {
      expect(headerBox.y).toBeLessThan(editorBox.y);
    }
  });

  test('verified-checkbox, branch-display, and close-button live in the header', async () => {
    await setupItemDetailDialog();
    const page = ctx.window;

    const header = page.locator('[data-testid="item-detail-header"]');
    await expect(header.locator('[data-testid="verified-checkbox"]')).toBeVisible();
    await expect(header.locator('[data-testid="branch-display"]')).toBeVisible();
    await expect(header.locator('[data-testid="close-button"]')).toBeVisible();

    const sidebar = page.locator('[data-testid="sidebar-zone"]');
    await expect(sidebar.locator('[data-testid="verified-checkbox"]')).toHaveCount(0);
    await expect(sidebar.locator('[data-testid="branch-display"]')).toHaveCount(0);
  });

  test('worktree path is no longer in the header (moved to StatusBar)', async () => {
    await setupItemDetailDialog();
    const page = ctx.window;

    const header = page.locator('[data-testid="item-detail-header"]');
    await expect(header.locator('[data-testid="worktree-path-display"]')).toHaveCount(0);
  });

  test('header height is at most 56px when no merge actions are visible', async () => {
    await setupItemDetailDialog({ mergeStatus: undefined, branch: undefined });
    const page = ctx.window;

    const header = page.locator('[data-testid="item-detail-header"]');
    const box = await header.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      expect(box.height).toBeLessThanOrEqual(56);
    }
  });

  test('Compare Changes button is in the header when mergeStatus is set', async () => {
    await setupItemDetailDialog({ mergeStatus: 'unmerged' });
    const page = ctx.window;

    const header = page.locator('[data-testid="item-detail-header"]');
    await expect(header.locator('[data-testid="compare-changes-button"]')).toBeVisible();
  });

  test('Ctrl+Q still closes the dialog', async () => {
    await setupItemDetailDialog();
    const page = ctx.window;

    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+q');

    await expect(page.locator('[data-testid="item-detail-dialog"]')).toHaveCount(0);
  });
});
