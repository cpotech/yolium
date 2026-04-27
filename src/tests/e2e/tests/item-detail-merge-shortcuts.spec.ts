import { test, expect } from '@playwright/test';
import { launchApp, closeApp, createTestRepo, cleanupTestRepo, type AppContext } from '../helpers/app';
import { selectors } from '../helpers/selectors';
import * as os from 'os';

test.describe('Item Detail Merge Shortcuts', () => {
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
        title: 'Test merge shortcuts item',
        description: 'E2E test for merge keyboard shortcuts',
        agentProvider: 'claude' as const,
        order: 0,
      });
    }, testRepoPath) as { id: string };

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

    await page.click(selectors.kanbanRefreshButton);
    const column = (itemOverrides.column as string) || 'done';
    await expect(
      page.locator(selectors.kanbanColumn(column)).locator('[data-testid="kanban-card"]'),
    ).toBeVisible({ timeout: 5000 });
    await page.locator(selectors.kanbanColumn(column))
      .locator('[data-testid="kanban-card"]').first().click();
    await expect(page.locator('[data-testid="item-detail-dialog"]')).toBeVisible();
  }

  test('keyboard shortcut m triggers local merge confirm dialog', async () => {
    await setupItemDetailDialog();
    const page = ctx.window;

    await page.keyboard.press('Escape');
    await page.keyboard.press('m');

    await expect(page.locator('[data-testid="confirm-dialog"]')).toBeVisible({ timeout: 5000 });
  });

  test('keyboard shortcut Shift+m triggers squash merge confirm dialog', async () => {
    await setupItemDetailDialog();
    const page = ctx.window;

    await page.keyboard.press('Escape');
    await page.keyboard.press('Shift+M');

    await expect(page.locator('[data-testid="confirm-dialog"]')).toBeVisible({ timeout: 5000 });
  });

  test('keyboard shortcut c triggers checkConflicts when unmerged', async () => {
    await setupItemDetailDialog();
    const page = ctx.window;

    await ctx.app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('git:check-merge-conflicts');
      ipcMain.handle('git:check-merge-conflicts', () => ({ clean: true, conflictingFiles: [] }));
    });

    await page.keyboard.press('Escape');
    await page.keyboard.press('c');

    await expect(page.locator('[data-testid="conflict-check-result"]')).toBeVisible({ timeout: 5000 });
  });

  test('keyboard shortcut f opens git diff dialog', async () => {
    await setupItemDetailDialog();
    const page = ctx.window;

    await page.keyboard.press('Escape');
    await page.keyboard.press('f');

    await expect(page.locator('[data-testid="git-diff-dialog"]')).toBeVisible({ timeout: 5000 });
  });

  test('keyboard shortcut r triggers rebase', async () => {
    await setupItemDetailDialog();
    const page = ctx.window;

    await ctx.app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('git:rebase-onto-default');
      ipcMain.handle('git:rebase-onto-default', () => ({ success: true }));
    });

    await page.keyboard.press('Escape');
    await page.keyboard.press('r');

    await expect(page.locator('[data-testid="rebase-result"]')).toBeVisible({ timeout: 5000 });
  });

  test('keyboard shortcut o opens external PR url when merged with PR url', async () => {
    await setupItemDetailDialog({
      mergeStatus: 'merged',
      prUrl: 'https://example.com/pr/42',
    });
    const page = ctx.window;

    await ctx.app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('app:open-external');
      ipcMain.handle('app:open-external', (_e, url: string) => {
        (globalThis as unknown as { __openedUrl?: string }).__openedUrl = url;
      });
    });

    await page.keyboard.press('Escape');
    await page.keyboard.press('o');

    const captured = await ctx.app.evaluate(() => (globalThis as unknown as { __openedUrl?: string }).__openedUrl);
    expect(captured).toBe('https://example.com/pr/42');
  });

  test('keyboard shortcut a triggers approve PR when merged with PR url', async () => {
    await setupItemDetailDialog({
      mergeStatus: 'merged',
      prUrl: 'https://example.com/pr/42',
    });
    const page = ctx.window;

    await ctx.app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('git:approve-pr');
      ipcMain.handle('git:approve-pr', () => ({ success: true }));
    });

    await page.keyboard.press('Escape');
    await page.keyboard.press('a');

    await expect(page.locator('[data-testid="item-detail-header"]')).toBeVisible();
  });

  test('keyboard shortcut w triggers merge PR when merged with PR url', async () => {
    await setupItemDetailDialog({
      mergeStatus: 'merged',
      prUrl: 'https://example.com/pr/42',
    });
    const page = ctx.window;

    await ctx.app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('git:merge-pr');
      ipcMain.handle('git:merge-pr', () => ({ success: true }));
    });

    await page.keyboard.press('Escape');
    await page.keyboard.press('w');

    await expect(page.locator('[data-testid="item-detail-header"]')).toBeVisible();
  });
});
