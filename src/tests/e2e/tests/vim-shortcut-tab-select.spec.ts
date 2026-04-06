import { test, expect } from '@playwright/test';
import { launchApp, closeApp, createTestRepo, cleanupTestRepo, type AppContext } from '../helpers/app';
import { selectors } from '../helpers/selectors';
import * as os from 'os';

/**
 * E2E tests for number key tab selection from any vim zone.
 */
test.describe('Vim Tab Select Shortcuts', () => {
  let ctx: AppContext;
  let testRepoPath: string;
  let testRepoPath2: string;

  test.beforeEach(async () => {
    testRepoPath = await createTestRepo(os.tmpdir());
    testRepoPath2 = await createTestRepo(os.tmpdir());
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
    if (testRepoPath2) {
      await cleanupTestRepo(testRepoPath2);
      testRepoPath2 = '';
    }
  });

  async function openTwoTabs(): Promise<void> {
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

    // Open first project tab
    await page.click(selectors.openProjectButton);
    await page.fill(selectors.pathInput, testRepoPath);
    await page.click(selectors.pathNextButton);
    await page.waitForSelector('[data-testid="kanban-view"]', { timeout: 10000 });

    // Open second project tab via sidebar
    await page.click(selectors.openProjectButton);
    await page.fill(selectors.pathInput, testRepoPath2);
    await page.click(selectors.pathNextButton);
    await page.waitForSelector('[data-testid="kanban-view"]', { timeout: 10000 });
  }

  test('should switch to tab 1 when 1 is pressed from content zone', async () => {
    await openTwoTabs();
    const page = ctx.window;

    // We should be on tab 2 (most recently opened). Press '1' to switch to tab 1.
    await page.keyboard.press('1');
    await page.waitForTimeout(200);

    // The first tab should now be active
    const activeTab = await page.locator('[data-testid="tab"][data-active="true"]').first();
    const tabText = await activeTab.textContent();
    expect(tabText).toContain(testRepoPath.split('/').pop());
  });

  test('should switch to tab 1 when 1 is pressed from sidebar zone', async () => {
    await openTwoTabs();
    const page = ctx.window;

    // Switch to sidebar zone first
    await page.keyboard.press('e');
    await page.waitForTimeout(100);

    // Press '1' to switch to tab 1 — should work from sidebar zone
    await page.keyboard.press('1');
    await page.waitForTimeout(200);

    // The first tab should now be active
    const activeTab = await page.locator('[data-testid="tab"][data-active="true"]').first();
    const tabText = await activeTab.textContent();
    expect(tabText).toContain(testRepoPath.split('/').pop());
  });
});
