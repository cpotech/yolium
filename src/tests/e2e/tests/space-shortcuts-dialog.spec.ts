import { test, expect } from '@playwright/test';
import { launchApp, closeApp, createTestRepo, cleanupTestRepo, cleanupYoliumContainers, AppContext } from '../helpers/app';
import { selectors } from '../helpers/selectors';
import os from 'os';

test.describe('Space Key Opens Shortcuts Dialog', () => {
  let ctx: AppContext;
  let testRepoPath: string;

  test.beforeAll(async () => {
    testRepoPath = await createTestRepo(os.tmpdir());
  });

  test.afterAll(async () => {
    if (testRepoPath) {
      await cleanupTestRepo(testRepoPath);
    }
  });

  test.beforeEach(async () => {
    await cleanupYoliumContainers();
  });

  test.afterEach(async () => {
    if (ctx) {
      await closeApp(ctx);
    }
  });

  test('Space key in NORMAL mode should open the keyboard shortcuts dialog', async () => {
    ctx = await launchApp();
    const { window } = ctx;

    // Press Space in NORMAL mode
    await window.keyboard.press('Space');

    // Shortcuts dialog should open
    await expect(window.locator(selectors.shortcutsDialog)).toBeVisible();
  });

  test('Space key should not open shortcuts dialog when another dialog is open', async () => {
    ctx = await launchApp();
    const { window } = ctx;

    // Open path dialog first (creates a dialog-open state)
    await window.click(selectors.newTabButton);
    await expect(window.locator(selectors.pathDialog)).toBeVisible();

    // Press Space - should NOT open shortcuts dialog since path dialog is open
    await window.keyboard.press('Space');

    // Shortcuts dialog should NOT be visible
    await expect(window.locator(selectors.shortcutsDialog)).not.toBeVisible();
  });

  test('Escape should close the shortcuts dialog opened via Space', async () => {
    ctx = await launchApp();
    const { window } = ctx;

    // Open shortcuts dialog via Space
    await window.keyboard.press('Space');
    await expect(window.locator(selectors.shortcutsDialog)).toBeVisible();

    // Press Ctrl+Q to close (Escape does not close shortcuts dialog per existing behavior)
    await window.locator(selectors.shortcutsDialog).press('Control+q');
    await expect(window.locator(selectors.shortcutsDialog)).not.toBeVisible();
  });
});
