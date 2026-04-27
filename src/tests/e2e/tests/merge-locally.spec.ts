import { test, expect } from '@playwright/test';
import { launchApp, closeApp, createTestRepo, cleanupTestRepo, type AppContext } from '../helpers/app';
import { selectors } from '../helpers/selectors';
import * as os from 'os';

test.describe('Merge Locally', () => {
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

  async function setupItemDetailDialog(itemOverrides: Record<string, unknown> = {}): Promise<{ itemId: string }> {
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

    // Add project
    await page.click(selectors.openProjectButton);
    await page.fill(selectors.pathInput, testRepoPath);
    await page.click(selectors.pathNextButton);
    await expect(page.locator(selectors.kanbanView)).toBeVisible({ timeout: 10000 });

    // Create item via IPC with completed agent status and a branch
    const item = await page.evaluate(async (repoPath: string) => {
      return window.electronAPI.kanban.addItem(repoPath, {
        title: 'Test merge locally item',
        description: 'E2E test for local merge',
        agentProvider: 'claude' as const,
        order: 0,
      });
    }, testRepoPath) as { id: string };

    // Set item to completed state with branch info
    const defaults = {
      agentStatus: 'completed',
      column: 'done',
      branch: 'test-feature-branch',
      worktreePath: '/tmp/fake-worktree',
      mergeStatus: 'unmerged',
    };
    await page.evaluate(
      async (params: { path: string; id: string; updates: Record<string, unknown> }) => {
        await window.electronAPI.kanban.updateItem(params.path, params.id, params.updates);
      },
      { path: testRepoPath, id: item.id, updates: { ...defaults, ...itemOverrides } },
    );

    // Refresh board and open the item detail dialog
    await page.click(selectors.kanbanRefreshButton);
    // Item is in 'done' column
    const column = (itemOverrides.column as string) || 'done';
    await expect(
      page.locator(selectors.kanbanColumn(column)).locator('[data-testid="kanban-card"]'),
    ).toBeVisible({ timeout: 5000 });
    await page.locator(selectors.kanbanColumn(column))
      .locator('[data-testid="kanban-card"]').first().click();
    await expect(page.locator('[data-testid="item-detail-dialog"]')).toBeVisible();

    return { itemId: item.id };
  }

  test('should show Merge Locally button when item is completed', async () => {
    await setupItemDetailDialog();
    const page = ctx.window;

    const mergeLocallyBtn = page.locator('[data-testid="merge-locally-button"]');
    await expect(mergeLocallyBtn).toBeVisible();
  });

  test('should show both merge buttons', async () => {
    await setupItemDetailDialog();
    const page = ctx.window;

    const mergeLocallyBtn = page.locator('[data-testid="merge-locally-button"]');
    const pushMergeBtn = page.locator('[data-testid="merge-button"]');

    await expect(mergeLocallyBtn).toBeVisible();
    await expect(pushMergeBtn).toBeVisible();
  });

  test('should trigger local merge on m key', async () => {
    await setupItemDetailDialog();
    const page = ctx.window;

    // Press Escape to ensure we're in NORMAL mode
    await page.keyboard.press('Escape');

    // Press m for local merge — should open confirm dialog
    await page.keyboard.press('m');

    // The confirm dialog should appear
    await expect(page.locator('[data-testid="confirm-dialog"]')).toBeVisible({ timeout: 5000 });
  });

  test('should mark item as merged after success', async () => {
    await setupItemDetailDialog();
    const page = ctx.window;

    // Mock the git.mergeBranch to return success
    await ctx.app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('git:merge-branch');
      ipcMain.handle('git:merge-branch', () => ({ success: true }));
      ipcMain.removeHandler('git:cleanup-worktree');
      ipcMain.handle('git:cleanup-worktree', () => undefined);
      ipcMain.removeHandler('git:worktree-diff-stats');
      ipcMain.handle('git:worktree-diff-stats', () => ({
        filesChanged: 2,
        insertions: 10,
        deletions: 3,
      }));
    });

    // Click the Merge Locally button
    await page.click('[data-testid="merge-locally-button"]');

    // Confirm the dialog
    await expect(page.locator('[data-testid="confirm-dialog"]')).toBeVisible({ timeout: 5000 });
    await page.click('[data-testid="confirm-dialog-confirm"]');

    // Should now show merged status
    await expect(page.locator('[data-testid="merge-status-merged"]')).toBeVisible({ timeout: 5000 });
  });

  test('should not show PR buttons after local merge', async () => {
    await setupItemDetailDialog();
    const page = ctx.window;

    // Mock the git.mergeBranch to return success
    await ctx.app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('git:merge-branch');
      ipcMain.handle('git:merge-branch', () => ({ success: true }));
      ipcMain.removeHandler('git:cleanup-worktree');
      ipcMain.handle('git:cleanup-worktree', () => undefined);
      ipcMain.removeHandler('git:worktree-diff-stats');
      ipcMain.handle('git:worktree-diff-stats', () => ({
        filesChanged: 1,
        insertions: 5,
        deletions: 0,
      }));
    });

    // Click the Merge Locally button
    await page.click('[data-testid="merge-locally-button"]');

    // Confirm
    await expect(page.locator('[data-testid="confirm-dialog"]')).toBeVisible({ timeout: 5000 });
    await page.click('[data-testid="confirm-dialog-confirm"]');

    // Should show merged status
    await expect(page.locator('[data-testid="merge-status-merged"]')).toBeVisible({ timeout: 5000 });

    // PR-specific buttons should not be visible (no prUrl was set)
    await expect(page.locator('[data-testid="pr-link"]')).not.toBeVisible();
    await expect(page.locator('[data-testid="approve-pr-button"]')).not.toBeVisible();
    await expect(page.locator('[data-testid="merge-pr-button"]')).not.toBeVisible();
  });
});
