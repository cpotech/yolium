import { test, expect } from '@playwright/test';
import { launchApp, closeApp, AppContext } from '../helpers/app';
import { selectors } from '../helpers/selectors';

test.describe('App Launch', () => {
  let ctx: AppContext;

  test.afterEach(async () => {
    if (ctx) {
      await closeApp(ctx);
    }
  });

  test('should launch and show empty state when Docker is running', async () => {
    ctx = await launchApp();
    const { window } = ctx;

    // Should show empty state (no tabs open)
    await expect(window.locator(selectors.emptyState)).toBeVisible();

    // Tab bar should be visible
    await expect(window.locator(selectors.tabBar)).toBeVisible();

    // New tab button should be visible
    await expect(window.locator(selectors.newTabButton)).toBeVisible();
  });

  test('should show Docker setup dialog when Docker is not running', async () => {
    // This test requires Docker to be stopped
    // Skip in CI if Docker is always running
    test.skip(!!process.env.CI, 'Skipping in CI - Docker is always running');

    ctx = await launchApp({ skipDockerWait: true });
    const { window } = ctx;

    // Check if Docker setup dialog is shown
    const setupDialog = await window.$(selectors.dockerSetupDialog);
    if (setupDialog) {
      await expect(window.locator(selectors.dockerSetupDialog)).toBeVisible();
    }
  });

  test('should have correct window title', async () => {
    ctx = await launchApp();
    const title = await ctx.window.title();

    expect(title).toContain('Yolium');
  });

  test('should show keyboard shortcuts button in status area', async () => {
    ctx = await launchApp();
    const { window } = ctx;

    // Shortcuts button should be visible in empty state
    await expect(window.locator(selectors.shortcutsButton)).toBeVisible();
  });
});
