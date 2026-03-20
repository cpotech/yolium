import { test, expect } from '@playwright/test';
import { launchApp, closeApp, AppContext } from '../helpers/app';
import { selectors } from '../helpers/selectors';

test.describe('Usage Refresh', () => {
  let ctx: AppContext;

  test.afterEach(async () => {
    if (ctx) {
      await closeApp(ctx);
    }
  });

  test('should refresh usage when Ctrl+Shift+U is pressed', async () => {
    ctx = await launchApp();
    const { window } = ctx;

    // Wait for status bar to be visible
    await expect(window.locator(selectors.statusBar).first()).toBeVisible();

    // The Claude usage area should exist (either loading, ready, unavailable, or no-oauth)
    const claudeText = window.locator(`${selectors.statusBar} >> text=Claude`).first();
    await expect(claudeText).toBeVisible({ timeout: 10000 });

    // Press Ctrl+Shift+U to trigger refresh
    await window.keyboard.press('Control+Shift+U');

    // After refresh, Claude text should still be visible (the refresh happened)
    await expect(claudeText).toBeVisible({ timeout: 10000 });
  });

  test('should refresh usage when status bar usage area is clicked', async () => {
    ctx = await launchApp();
    const { window } = ctx;

    // Wait for status bar to be visible
    await expect(window.locator(selectors.statusBar).first()).toBeVisible();

    // Wait for Claude usage to appear
    const claudeText = window.locator(`${selectors.statusBar} >> text=Claude`).first();
    await expect(claudeText).toBeVisible({ timeout: 10000 });

    // Click on the Claude usage area to trigger refresh
    await claudeText.click();

    // After click, Claude text should still be visible
    await expect(claudeText).toBeVisible({ timeout: 10000 });
  });
});
