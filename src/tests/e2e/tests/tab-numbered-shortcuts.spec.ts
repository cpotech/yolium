// src/tests/e2e/tests/tab-numbered-shortcuts.spec.ts
import { test, expect } from '@playwright/test';
import os from 'os';
import { launchApp, closeApp, createTestRepo, cleanupTestRepo, type AppContext } from '../helpers/app';
import { selectors } from '../helpers/selectors';

/**
 * E2E tests for numbered tab selection shortcuts (1-9, 0) in the content zone.
 * Pressing 1-9 or 0 in the kanban content zone should select tabs by index.
 */
test.describe('Tab numbered shortcuts (1-9, 0)', () => {
  let ctx: AppContext;
  let testRepoPath: string;

  test.beforeAll(async () => {
    testRepoPath = await createTestRepo(os.tmpdir());
  });

  test.afterAll(async () => {
    if (testRepoPath) await cleanupTestRepo(testRepoPath);
  });

  test.afterEach(async () => {
    if (ctx) await closeApp(ctx);
  });

  async function setupKanbanWithProject(): Promise<void> {
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
    await page.waitForSelector('[data-testid="kanban-view"]', { timeout: 10000 });
  }

  test('should select first tab when pressing 1 in content zone', async () => {
    await setupKanbanWithProject();
    const page = ctx.window;

    // Ensure content zone is active
    await page.keyboard.press('c');

    // Press 1 to select first tab
    await page.keyboard.press('1');

    // Wait briefly for state update
    await page.waitForTimeout(100);

    // First tab should be active
    const firstTab = page.locator('[data-testid="tab-bar"] [role="tab"]').first();
    await expect(firstTab).toHaveAttribute('data-active', 'true');
  });

  test('should be inert when tab index exceeds number of tabs', async () => {
    await setupKanbanWithProject();
    const page = ctx.window;

    // Ensure content zone is active
    await page.keyboard.press('c');

    // Only 1 tab exists, pressing 2 should do nothing
    await page.keyboard.press('2');
    await page.waitForTimeout(100);

    // Should still have exactly 1 tab
    const tabs = page.locator('[data-testid="tab-bar"] [role="tab"]');
    await expect(tabs).toHaveCount(1);
  });

  test('should not trigger numbered shortcuts when dialog is open', async () => {
    await setupKanbanWithProject();
    const page = ctx.window;

    // Open new item dialog
    await page.keyboard.press('n');
    await page.waitForSelector('[data-testid="new-item-dialog"]', { timeout: 5000 });

    // Press 1 - should NOT switch tabs (should be inert while dialog is open)
    await page.keyboard.press('1');
    await page.waitForTimeout(100);

    // Dialog should still be open
    await expect(page.locator('[data-testid="new-item-dialog"]')).toBeVisible();
  });

  test('should not trigger numbered shortcuts when input is focused', async () => {
    await setupKanbanWithProject();
    const page = ctx.window;

    // Focus search input
    await page.keyboard.press('/');
    await page.waitForSelector('[data-testid="search-input"]:focus', { timeout: 5000 });

    // Press 1 - should NOT switch tabs (should type "1" in search instead)
    await page.keyboard.press('1');
    await page.waitForTimeout(100);

    // Search input should still be focused and contain "1"
    const searchInput = page.locator('[data-testid="search-input"]');
    await expect(searchInput).toBeFocused();
    await expect(searchInput).toHaveValue('1');
  });

  test('should select second tab when pressing 2 in content zone', async () => {
    await setupKanbanWithProject();
    const page = ctx.window;

    // Create a second tab by opening another project
    await page.click(selectors.openProjectButton);
    await page.fill(selectors.pathInput, testRepoPath);
    await page.click(selectors.pathNextButton);
    await page.waitForSelector('[data-testid="kanban-view"]', { timeout: 10000 });

    // Wait for tabs to settle
    await page.waitForTimeout(200);

    // Verify we have 2 tabs
    const tabs = page.locator('[data-testid="tab-bar"] [role="tab"]');
    await expect(tabs).toHaveCount(2);

    // Ensure content zone is active
    await page.keyboard.press('c');

    // Press 2 to select second tab
    await page.keyboard.press('2');
    await page.waitForTimeout(100);

    // Second tab should be active
    const secondTab = tabs.nth(1);
    await expect(secondTab).toHaveAttribute('data-active', 'true');
  });

  test('should focus tab content after selection via numbered shortcut', async () => {
    await setupKanbanWithProject();
    const page = ctx.window;

    // Ensure content zone is active
    await page.keyboard.press('c');

    // Press 1 to select first tab
    await page.keyboard.press('1');
    await page.waitForTimeout(100);

    // First tab should be active
    const firstTab = page.locator('[data-testid="tab-bar"] [role="tab"]').first();
    await expect(firstTab).toHaveAttribute('data-active', 'true');

    // Kanban view should be focused (content zone receives focus)
    const kanbanView = page.locator('[data-testid="kanban-view"]');
    await expect(kanbanView).toBeFocused();
  });
});
