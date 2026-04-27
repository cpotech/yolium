import { test, expect } from '@playwright/test';
import { launchApp, closeApp, createTestRepo, cleanupTestRepo, type AppContext } from '../helpers/app';
import { selectors } from '../helpers/selectors';
import * as os from 'os';

test.describe('Item Detail Sidebar', () => {
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
        title: 'Test sidebar item',
        description: 'E2E test for sidebar',
        agentProvider: 'claude' as const,
        order: 0,
      });
    }, testRepoPath) as { id: string };

    const defaults = {
      agentStatus: 'idle',
      column: 'backlog',
    };
    await page.evaluate(
      async (params: { path: string; id: string; updates: Record<string, unknown> }) => {
        await window.electronAPI.kanban.updateItem(params.path, params.id, params.updates);
      },
      { path: testRepoPath, id: item.id, updates: { ...defaults, ...itemOverrides } },
    );

    await page.click(selectors.kanbanRefreshButton);
    const column = (itemOverrides.column as string) || 'backlog';
    await expect(
      page.locator(selectors.kanbanColumn(column)).locator('[data-testid="kanban-card"]'),
    ).toBeVisible({ timeout: 5000 });
    await page.locator(selectors.kanbanColumn(column))
      .locator('[data-testid="kanban-card"]').first().click();
    await expect(page.locator('[data-testid="item-detail-dialog"]')).toBeVisible();
  }

  test('first three agent buttons (Plan/Code/Verify) are full-width primary', async () => {
    await setupItemDetailDialog();
    const page = ctx.window;

    const sidebar = page.locator('[data-testid="sidebar-zone"]');
    const planBtn = sidebar.locator('[data-testid="run-plan-agent-button"]');
    const codeBtn = sidebar.locator('[data-testid="run-code-agent-button"]');
    const verifyBtn = sidebar.locator('[data-testid="run-verify-agent-button"]');

    await expect(planBtn).toBeVisible();
    await expect(codeBtn).toBeVisible();
    await expect(verifyBtn).toBeVisible();

    const sidebarBox = await sidebar.boundingBox();
    const planBox = await planBtn.boundingBox();
    expect(sidebarBox).not.toBeNull();
    expect(planBox).not.toBeNull();

    if (sidebarBox && planBox) {
      // Primary agent button should take roughly the full inner width of the sidebar
      // (allow ~64px padding/margin for the column).
      expect(planBox.width).toBeGreaterThan(sidebarBox.width - 64);
    }
  });

  test('non-primary agents are arranged in a 2-column grid', async () => {
    await setupItemDetailDialog();
    const page = ctx.window;

    const grid = page.locator('[data-testid="agent-grid"]');
    if (await grid.count() === 0) {
      // No non-primary agents in this build — skip
      test.skip(true, 'no non-primary agents available');
      return;
    }
    await expect(grid).toBeVisible();
    const gridStyle = await grid.evaluate(el => getComputedStyle(el).gridTemplateColumns);
    // Should have exactly 2 columns
    const cols = gridStyle.split(/\s+/).length;
    expect(cols).toBe(2);
  });

  test('numbered hints are visible on agent buttons (1-9)', async () => {
    await setupItemDetailDialog();
    const page = ctx.window;

    const sidebar = page.locator('[data-testid="sidebar-zone"]');
    const planBtn = sidebar.locator('[data-testid="run-plan-agent-button"]');
    await expect(planBtn.locator('[data-testid="agent-number-hint"]')).toBeVisible();
  });

  test('Configuration label column is at most 64px wide', async () => {
    await setupItemDetailDialog();
    const page = ctx.window;

    const providerLabel = page.locator('label[for="detail-agent-provider"]');
    const box = await providerLabel.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      expect(box.width).toBeLessThanOrEqual(64);
    }
  });
});
