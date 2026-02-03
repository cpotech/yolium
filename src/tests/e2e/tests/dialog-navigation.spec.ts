import { test, expect } from '@playwright/test';
import { launchApp, closeApp, createTestRepo, cleanupTestRepo, cleanupYoliumContainers, AppContext } from '../helpers/app';
import { selectors } from '../helpers/selectors';
import os from 'os';

test.describe('Dialog Navigation', () => {
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

  test('path dialog should have Next button instead of Open', async () => {
    ctx = await launchApp();
    const { window } = ctx;

    // Open path dialog
    await window.click(selectors.newTabButton);
    await expect(window.locator(selectors.pathDialog)).toBeVisible();

    // Next button should be visible (not Open)
    await expect(window.locator(selectors.pathNextButton)).toBeVisible();
    await expect(window.locator(selectors.pathNextButton)).toContainText('Next');
  });

  test('agent dialog should have Back and Start buttons', async () => {
    ctx = await launchApp();
    const { window } = ctx;

    // Navigate to agent dialog
    await window.click(selectors.newTabButton);
    await window.fill(selectors.pathInput, testRepoPath);
    await window.click(selectors.pathNextButton);
    await expect(window.locator(selectors.agentDialog)).toBeVisible();

    // Back button should be visible (not Cancel)
    await expect(window.locator(selectors.agentBackButton)).toBeVisible();
    await expect(window.locator(selectors.agentBackButton)).toContainText('Back');

    // Start button should be visible (not OK)
    await expect(window.locator(selectors.agentStartButton)).toBeVisible();
    await expect(window.locator(selectors.agentStartButton)).toContainText('Start');
  });

  test('clicking Back in agent dialog should return to path dialog', async () => {
    ctx = await launchApp();
    const { window } = ctx;

    // Navigate to agent dialog
    await window.click(selectors.newTabButton);
    await window.fill(selectors.pathInput, testRepoPath);
    await window.click(selectors.pathNextButton);
    await expect(window.locator(selectors.agentDialog)).toBeVisible();

    // Click Back
    await window.click(selectors.agentBackButton);

    // Agent dialog should close
    await expect(window.locator(selectors.agentDialog)).not.toBeVisible();

    // Path dialog should reopen with the previous path (with trailing slash added)
    await expect(window.locator(selectors.pathDialog)).toBeVisible();
    const expectedPath = testRepoPath.endsWith('/') ? testRepoPath : testRepoPath + '/';
    await expect(window.locator(selectors.pathInput)).toHaveValue(expectedPath);
  });

  test('Escape in agent dialog should go back to path dialog', async () => {
    ctx = await launchApp();
    const { window } = ctx;

    // Navigate to agent dialog
    await window.click(selectors.newTabButton);
    await window.fill(selectors.pathInput, testRepoPath);
    await window.click(selectors.pathNextButton);
    await expect(window.locator(selectors.agentDialog)).toBeVisible();

    // Press Escape - should go back to path dialog
    await window.keyboard.press('Escape');

    // Agent dialog should close
    await expect(window.locator(selectors.agentDialog)).not.toBeVisible();

    // Path dialog should reopen (Escape now acts as Back)
    await expect(window.locator(selectors.pathDialog)).toBeVisible();
  });

  test('Escape in path dialog should go back then close at root', async () => {
    ctx = await launchApp();
    const { window } = ctx;

    // Open path dialog
    await window.click(selectors.newTabButton);
    await expect(window.locator(selectors.pathDialog)).toBeVisible();

    // Press Escape multiple times to navigate back to root and then close
    // (Escape now goes back one directory level, closes only when at root)
    for (let i = 0; i < 10; i++) {
      await window.keyboard.press('Escape');
      // Check if dialog closed
      const isVisible = await window.locator(selectors.pathDialog).isVisible();
      if (!isVisible) break;
      // Small delay between presses
      await window.waitForTimeout(100);
    }

    // Dialog should close
    await expect(window.locator(selectors.pathDialog)).not.toBeVisible();

    // Should show empty state
    await expect(window.locator(selectors.emptyState)).toBeVisible();
  });

  test('Cancel button in path dialog should close immediately', async () => {
    ctx = await launchApp();
    const { window } = ctx;

    // Open path dialog
    await window.click(selectors.newTabButton);
    await expect(window.locator(selectors.pathDialog)).toBeVisible();

    // Click Cancel button
    await window.click(selectors.pathCancelButton);

    // Dialog should close
    await expect(window.locator(selectors.pathDialog)).not.toBeVisible();

    // Should show empty state
    await expect(window.locator(selectors.emptyState)).toBeVisible();
  });

  test('should preserve path when navigating back and forth', async () => {
    ctx = await launchApp();
    const { window } = ctx;

    // Navigate to agent dialog
    await window.click(selectors.newTabButton);
    await window.fill(selectors.pathInput, testRepoPath);
    await window.click(selectors.pathNextButton);
    await expect(window.locator(selectors.agentDialog)).toBeVisible();

    // Go back
    await window.click(selectors.agentBackButton);
    await expect(window.locator(selectors.pathDialog)).toBeVisible();

    // Path should be preserved (with trailing slash)
    const expectedPath = testRepoPath.endsWith('/') ? testRepoPath : testRepoPath + '/';
    await expect(window.locator(selectors.pathInput)).toHaveValue(expectedPath);

    // Go forward again
    await window.click(selectors.pathNextButton);
    await expect(window.locator(selectors.agentDialog)).toBeVisible();
  });
});
