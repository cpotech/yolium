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

  test('Escape in path dialog navigates up one directory, Ctrl+Q closes', async () => {
    ctx = await launchApp();
    const { window } = ctx;

    // Open path dialog
    await window.click(selectors.newTabButton);
    await expect(window.locator(selectors.pathDialog)).toBeVisible();

    const currentPath = await window.locator(selectors.pathInput).inputValue();
    const depth = currentPath.split(/[\\/]+/).filter(Boolean).length;
    const maxPresses = Math.max(6, depth + 3);

    // Press Escape multiple times to navigate up directories
    for (let i = 0; i < maxPresses; i++) {
      await window.keyboard.press('Escape');
      await window.waitForTimeout(100);
    }

    // Escape alone should not close the dialog (just navigate up)
    // Dialog should still be visible
    await expect(window.locator(selectors.pathDialog)).toBeVisible();

    // Ctrl+Q should close the dialog
    await window.keyboard.press('Control+q');
    await expect(window.locator(selectors.pathDialog)).not.toBeVisible();

    // Should return to primary UI (empty-state or restored tabs)
    await expect(window.locator(selectors.tabBar)).toBeVisible();
    const emptyStateVisible = await window.locator(selectors.emptyState).isVisible();
    const tabCount = await window.locator(selectors.tab()).count();
    expect(emptyStateVisible || tabCount > 0).toBe(true);
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

    // Should return to primary UI (empty-state or restored tabs)
    await expect(window.locator(selectors.tabBar)).toBeVisible();
    const emptyStateVisible = await window.locator(selectors.emptyState).isVisible();
    const tabCount = await window.locator(selectors.tab()).count();
    expect(emptyStateVisible || tabCount > 0).toBe(true);
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
