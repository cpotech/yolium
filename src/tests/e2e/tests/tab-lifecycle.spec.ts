import { test, expect } from '@playwright/test';
import { launchApp, closeApp, createTestRepo, cleanupTestRepo, cleanupYoliumContainers, AppContext } from '../helpers/app';
import { selectors } from '../helpers/selectors';
import os from 'os';
import path from 'path';

test.describe('Tab Lifecycle', () => {
  let ctx: AppContext;
  let testRepoPath: string;

  test.beforeAll(async () => {
    // Create a test git repo for the tests
    testRepoPath = await createTestRepo(os.tmpdir());
  });

  test.afterAll(async () => {
    // Clean up test repo
    if (testRepoPath) {
      await cleanupTestRepo(testRepoPath);
    }
  });

  test.beforeEach(async () => {
    // Clean up any leftover containers from previous tests
    // Defense in depth: ensures clean slate even if previous test crashed
    await cleanupYoliumContainers();
  });

  test.afterEach(async () => {
    if (ctx) {
      await closeApp(ctx);
    }
  });

  test('should open path dialog when clicking new tab button', async () => {
    ctx = await launchApp();
    const { window } = ctx;

    // Click new tab button
    await window.click(selectors.newTabButton);

    // Path dialog should open
    await expect(window.locator(selectors.pathDialog)).toBeVisible();

    // Path input should be focused
    await expect(window.locator(selectors.pathInput)).toBeFocused();
  });

  test('should close path dialog when clicking cancel', async () => {
    ctx = await launchApp();
    const { window } = ctx;

    // Open path dialog
    await window.click(selectors.newTabButton);
    await expect(window.locator(selectors.pathDialog)).toBeVisible();

    // Click cancel
    await window.click(selectors.pathCancelButton);

    // Dialog should close
    await expect(window.locator(selectors.pathDialog)).not.toBeVisible();

    // Should still show empty state
    await expect(window.locator(selectors.emptyState)).toBeVisible();
  });

  test('should show agent dialog after confirming path', async () => {
    ctx = await launchApp();
    const { window } = ctx;

    // Open path dialog
    await window.click(selectors.newTabButton);

    // Enter test repo path
    await window.fill(selectors.pathInput, testRepoPath);

    // Confirm path
    await window.click(selectors.pathNextButton);

    // Path dialog should close
    await expect(window.locator(selectors.pathDialog)).not.toBeVisible();

    // Agent dialog should open
    await expect(window.locator(selectors.agentDialog)).toBeVisible();
  });

  test('should show agent options in agent dialog', async () => {
    ctx = await launchApp();
    const { window } = ctx;

    // Navigate to agent dialog
    await window.click(selectors.newTabButton);
    await window.fill(selectors.pathInput, testRepoPath);
    await window.click(selectors.pathNextButton);

    // Check all agent options are visible
    await expect(window.locator(selectors.agentOption('claude'))).toBeVisible();
    await expect(window.locator(selectors.agentOption('opencode'))).toBeVisible();
    await expect(window.locator(selectors.agentOption('shell'))).toBeVisible();
  });

  test('should enable GSD toggle only for Claude agent', async () => {
    ctx = await launchApp();
    const { window } = ctx;

    // Navigate to agent dialog
    await window.click(selectors.newTabButton);
    await window.fill(selectors.pathInput, testRepoPath);
    await window.click(selectors.pathNextButton);
    await expect(window.locator(selectors.agentDialog)).toBeVisible();

    // Select Claude - GSD should be available
    await window.click(selectors.agentOption('claude'));
    const gsdToggle = window.locator(selectors.gsdToggle);
    await expect(gsdToggle).toBeVisible();

    // Select Shell - GSD should not be available or disabled
    await window.click(selectors.agentOption('shell'));
    // GSD toggle should be hidden or disabled for shell
    const gsdHiddenOrDisabled = await gsdToggle.isHidden() || await gsdToggle.isDisabled();
    expect(gsdHiddenOrDisabled).toBe(true);
  });

  test('should show worktree option for git repos', async () => {
    ctx = await launchApp();
    const { window } = ctx;

    // Navigate to agent dialog with a git repo
    await window.click(selectors.newTabButton);
    await window.fill(selectors.pathInput, testRepoPath);
    await window.click(selectors.pathNextButton);

    // Worktree toggle should be visible (repo has commits)
    await expect(window.locator(selectors.worktreeToggle)).toBeVisible();
  });

  test('should show branch name input when worktree is enabled', async () => {
    ctx = await launchApp();
    const { window } = ctx;

    // Navigate to agent dialog
    await window.click(selectors.newTabButton);
    await window.fill(selectors.pathInput, testRepoPath);
    await window.click(selectors.pathNextButton);

    // Enable worktree
    await window.click(selectors.worktreeToggle);

    // Branch name input should appear
    await expect(window.locator(selectors.branchNameInput)).toBeVisible();
  });

  test('should create tab when agent is selected and confirmed', async () => {
    // This test requires Docker to actually create a container
    // It may be slow and should be run with appropriate timeout
    test.setTimeout(120000);

    ctx = await launchApp();
    const { window } = ctx;

    // Navigate through dialogs
    await window.click(selectors.newTabButton);
    await window.fill(selectors.pathInput, testRepoPath);
    await window.click(selectors.pathNextButton);

    // Wait for agent dialog to be fully rendered before interacting
    await expect(window.locator(selectors.agentDialog)).toBeVisible();

    // Select shell (fastest to start)
    await window.click(selectors.agentOption('shell'));
    await window.click(selectors.agentStartButton);

    // Should show build progress or tab
    // Wait for either build progress overlay or new tab
    await window.waitForSelector(`${selectors.buildProgressOverlay}, ${selectors.tab()}`, {
      timeout: 30000,
    });

    // Eventually tab should appear
    await expect(window.locator(selectors.tab())).toBeVisible({ timeout: 90000 });

    // Empty state should be hidden
    await expect(window.locator(selectors.emptyState)).not.toBeVisible();

    // Status bar should show container state
    await expect(window.locator(selectors.statusContainerState)).toBeVisible();
  });

  test('should navigate between multiple tabs', async () => {
    // Note: Playwright cannot trigger Electron menu accelerators (keyboard shortcuts).
    // This test uses click-based navigation instead.
    test.setTimeout(180000);

    ctx = await launchApp();
    const { window } = ctx;

    // Create first tab
    await window.click(selectors.newTabButton);
    await window.fill(selectors.pathInput, testRepoPath);
    await window.click(selectors.pathNextButton);
    await expect(window.locator(selectors.agentDialog)).toBeVisible();
    await window.click(selectors.agentOption('shell'));
    await window.click(selectors.agentStartButton);
    await expect(window.locator(selectors.tab())).toBeVisible({ timeout: 90000 });

    // First tab should be active
    const firstTab = window.locator(selectors.tab()).first();
    await expect(firstTab).toHaveAttribute('data-active', 'true');

    // Create second tab using the + button
    await window.click(selectors.newTabButton);
    await window.fill(selectors.pathInput, testRepoPath);
    await window.click(selectors.pathNextButton);
    await expect(window.locator(selectors.agentDialog)).toBeVisible();
    await window.click(selectors.agentOption('shell'));
    await window.click(selectors.agentStartButton);

    // Wait for second tab
    await expect(window.locator(selectors.tab())).toHaveCount(2, { timeout: 90000 });

    // Second tab should now be active
    const secondTab = window.locator(selectors.tab()).nth(1);
    await expect(secondTab).toHaveAttribute('data-active', 'true');

    // Click on first tab to navigate back
    await firstTab.click();

    // First tab should be active again
    await expect(firstTab).toHaveAttribute('data-active', 'true');
    await expect(secondTab).toHaveAttribute('data-active', 'false');
  });
});
