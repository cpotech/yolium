import { test, expect } from '@playwright/test';
import { launchApp, closeApp, AppContext, createTestRepo, cleanupTestRepo } from '../helpers/app';
import { selectors } from '../helpers/selectors';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

test.describe('Kanban Sidebar Integration', () => {
  let ctx: AppContext;
  let testRepoPath: string;

  test.beforeAll(async () => {
    // Create a test repo for kanban tests
    const tmpDir = os.tmpdir();
    testRepoPath = await createTestRepo(tmpDir);
  });

  test.afterAll(async () => {
    // Cleanup test repo
    if (testRepoPath) {
      await cleanupTestRepo(testRepoPath);
    }
  });

  test.afterEach(async () => {
    if (ctx) {
      await closeApp(ctx);
    }
  });

  test('should show sidebar with collapse toggle', async () => {
    ctx = await launchApp();
    const { window } = ctx;

    // Sidebar should be visible
    await expect(window.locator(selectors.sidebar)).toBeVisible();

    // Collapse toggle should be visible
    await expect(window.locator(selectors.sidebarCollapseToggle)).toBeVisible();
  });

  test('should show add project button in sidebar', async () => {
    ctx = await launchApp();
    const { window } = ctx;

    // Add project button should be visible
    await expect(window.locator(selectors.addProjectButton)).toBeVisible();
  });

  test('should toggle sidebar collapse', async () => {
    ctx = await launchApp();
    const { window } = ctx;

    // Get initial sidebar width
    const sidebar = window.locator(selectors.sidebar);
    await expect(sidebar).toBeVisible();

    // Check initial collapsed state (w-10 = 40px)
    const initialWidth = await sidebar.evaluate(el => el.classList.contains('w-10'));
    expect(initialWidth).toBe(true);

    // Click collapse toggle to expand
    await window.click(selectors.sidebarCollapseToggle);
    await window.waitForTimeout(300); // Wait for transition

    // Should now have expanded width (w-48 = 192px)
    const expandedWidth = await sidebar.evaluate(el => el.classList.contains('w-48'));
    expect(expandedWidth).toBe(true);

    // Click again to collapse
    await window.click(selectors.sidebarCollapseToggle);
    await window.waitForTimeout(300);

    // Should be collapsed again
    const collapsedAgain = await sidebar.evaluate(el => el.classList.contains('w-10'));
    expect(collapsedAgain).toBe(true);
  });

  test('should open path dialog when clicking add project', async () => {
    ctx = await launchApp();
    const { window } = ctx;

    // Click add project button
    await window.click(selectors.addProjectButton);

    // Path dialog should open
    await expect(window.locator(selectors.pathDialog)).toBeVisible();
  });

  test('should add project to sidebar and open kanban tab', async () => {
    ctx = await launchApp();
    const { window } = ctx;

    // Click add project button
    await window.click(selectors.addProjectButton);
    await expect(window.locator(selectors.pathDialog)).toBeVisible();

    // Enter test repo path
    await window.fill(selectors.pathInput, testRepoPath);

    // Click next/confirm
    await window.click(selectors.pathNextButton);

    // Wait for path dialog to close
    await expect(window.locator(selectors.pathDialog)).not.toBeVisible({ timeout: 5000 });

    // Kanban view should be visible (it opens as a tab)
    await expect(window.locator(selectors.kanbanView)).toBeVisible({ timeout: 5000 });

    // Project path should be displayed (folder name from the test repo)
    const projectName = path.basename(testRepoPath);
    await expect(window.locator(selectors.projectPathDisplay)).toContainText(projectName);
  });

  test('should show project in sidebar after adding', async () => {
    ctx = await launchApp();
    const { window } = ctx;

    // Expand sidebar first
    await window.click(selectors.sidebarCollapseToggle);
    await window.waitForTimeout(300);

    // Click add project button
    await window.click(selectors.addProjectButton);
    await expect(window.locator(selectors.pathDialog)).toBeVisible();

    // Enter test repo path
    await window.fill(selectors.pathInput, testRepoPath);

    // Click next/confirm
    await window.click(selectors.pathNextButton);

    // Wait for kanban to load
    await expect(window.locator(selectors.kanbanView)).toBeVisible({ timeout: 5000 });

    // Project should appear in sidebar (use specific project item selector)
    await expect(window.locator(selectors.projectItem(testRepoPath))).toBeVisible();
  });

  test('should focus existing kanban tab when clicking project in sidebar', async () => {
    ctx = await launchApp();
    const { window } = ctx;

    // First, add a project
    await window.click(selectors.addProjectButton);
    await window.fill(selectors.pathInput, testRepoPath);
    await window.click(selectors.pathNextButton);
    await expect(window.locator(selectors.kanbanView)).toBeVisible({ timeout: 5000 });

    // Add a terminal tab (click new tab button)
    await window.click(selectors.newTabButton);
    await expect(window.locator(selectors.pathDialog)).toBeVisible();

    // Cancel to stay on empty state
    await window.click(selectors.pathCancelButton);

    // Expand sidebar
    await window.click(selectors.sidebarCollapseToggle);
    await window.waitForTimeout(300);

    // Click the project in sidebar (use specific project item selector)
    await window.click(selectors.projectItem(testRepoPath));

    // Kanban view should be visible again (focused)
    await expect(window.locator(selectors.kanbanView)).toBeVisible();
  });

  test('should show kanban columns when board loads', async () => {
    ctx = await launchApp();
    const { window } = ctx;

    // Add a project
    await window.click(selectors.addProjectButton);
    await window.fill(selectors.pathInput, testRepoPath);
    await window.click(selectors.pathNextButton);

    // Wait for kanban view
    await expect(window.locator(selectors.kanbanView)).toBeVisible({ timeout: 5000 });

    // Columns container should be visible
    await expect(window.locator(selectors.kanbanColumnsContainer)).toBeVisible();

    // Should have 4 columns (Backlog, Ready, In Progress, Done)
    await expect(window.locator('[data-testid^="kanban-column-"]')).toHaveCount(4);
  });

  test('should show new item button in kanban toolbar', async () => {
    ctx = await launchApp();
    const { window } = ctx;

    // Add a project
    await window.click(selectors.addProjectButton);
    await window.fill(selectors.pathInput, testRepoPath);
    await window.click(selectors.pathNextButton);

    // Wait for kanban view
    await expect(window.locator(selectors.kanbanView)).toBeVisible({ timeout: 5000 });

    // New item button should be visible
    await expect(window.locator(selectors.kanbanNewItemButton)).toBeVisible();
  });

  test('should show refresh button in kanban toolbar', async () => {
    ctx = await launchApp();
    const { window } = ctx;

    // Add a project
    await window.click(selectors.addProjectButton);
    await window.fill(selectors.pathInput, testRepoPath);
    await window.click(selectors.pathNextButton);

    // Wait for kanban view
    await expect(window.locator(selectors.kanbanView)).toBeVisible({ timeout: 5000 });

    // Refresh button should be visible
    await expect(window.locator(selectors.kanbanRefreshButton)).toBeVisible();
  });

  test('should display kanban tab in tab bar', async () => {
    ctx = await launchApp();
    const { window } = ctx;

    // Add a project
    await window.click(selectors.addProjectButton);
    await window.fill(selectors.pathInput, testRepoPath);
    await window.click(selectors.pathNextButton);

    // Wait for kanban view
    await expect(window.locator(selectors.kanbanView)).toBeVisible({ timeout: 5000 });

    // Tab bar should show the kanban tab
    const projectName = path.basename(testRepoPath);
    await expect(window.locator(selectors.tabBar)).toContainText(projectName);
  });

  test('should close kanban tab when close button clicked', async () => {
    ctx = await launchApp();
    const { window } = ctx;

    // Add a project
    await window.click(selectors.addProjectButton);
    await window.fill(selectors.pathInput, testRepoPath);
    await window.click(selectors.pathNextButton);

    // Wait for kanban view
    await expect(window.locator(selectors.kanbanView)).toBeVisible({ timeout: 5000 });

    // Find the close button on the tab
    const tabCloseButtons = window.locator('[data-testid^="tab-close-"]');
    await expect(tabCloseButtons).toHaveCount(1);

    // Click close button
    await tabCloseButtons.first().click();

    // Kanban view should not be visible anymore
    await expect(window.locator(selectors.kanbanView)).not.toBeVisible();

    // Empty state should be shown
    await expect(window.locator(selectors.emptyState)).toBeVisible();
  });
});
