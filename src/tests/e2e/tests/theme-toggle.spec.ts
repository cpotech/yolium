import { test, expect } from '@playwright/test';
import { launchApp, closeApp, AppContext } from '../helpers/app';
import { selectors } from '../helpers/selectors';

test.describe('Theme Toggle', () => {
  let ctx: AppContext;

  test.afterEach(async () => {
    if (ctx) {
      // Clear theme preference to prevent leaking between tests
      try {
        await ctx.window.evaluate(() => localStorage.removeItem('yolium:theme'));
      } catch {
        // Page may already be closed
      }
      await closeApp(ctx);
    }
  });

  test('should display theme toggle button in status bar', async () => {
    ctx = await launchApp();
    const { window } = ctx;

    // Theme toggle should be visible
    await expect(window.locator(selectors.themeToggle)).toBeVisible();
  });

  test('should default to dark theme', async () => {
    ctx = await launchApp();
    const { window } = ctx;

    // HTML should have data-theme="dark" attribute
    const html = window.locator('html');
    await expect(html).toHaveAttribute('data-theme', 'dark');
  });

  test('should switch to light theme when toggle clicked', async () => {
    ctx = await launchApp();
    const { window } = ctx;

    // Click theme toggle
    await window.click(selectors.themeToggle);

    // HTML should now have data-theme="light"
    const html = window.locator('html');
    await expect(html).toHaveAttribute('data-theme', 'light');
  });

  test('should toggle back to dark theme on second click', async () => {
    ctx = await launchApp();
    const { window } = ctx;

    // Click toggle twice (wait for React re-render between clicks)
    await window.click(selectors.themeToggle);
    await expect(window.locator('html')).toHaveAttribute('data-theme', 'light');
    await window.click(selectors.themeToggle);

    // Should be back to dark
    const html = window.locator('html');
    await expect(html).toHaveAttribute('data-theme', 'dark');
  });

  test('should show sun icon in dark mode', async () => {
    ctx = await launchApp();
    const { window } = ctx;

    // In dark mode, should show sun icon (to switch to light)
    const sunIcon = window.locator(`${selectors.themeToggle} svg.lucide-sun`);
    await expect(sunIcon).toBeVisible();
  });

  test('should show moon icon in light mode', async () => {
    ctx = await launchApp();
    const { window } = ctx;

    // Switch to light mode
    await window.click(selectors.themeToggle);

    // Should show moon icon (to switch to dark)
    const moonIcon = window.locator(`${selectors.themeToggle} svg.lucide-moon`);
    await expect(moonIcon).toBeVisible();
  });
});
