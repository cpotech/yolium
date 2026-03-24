/**
 * @module src/tests/e2e/tests/which-key.spec
 * E2E tests for the which-key popup (Space leader key).
 */

import { test, expect } from '@playwright/test';
import { launchApp, closeApp, createTestRepo, cleanupTestRepo, cleanupYoliumContainers, type AppContext } from '../helpers/app';
import { selectors } from '../helpers/selectors';
import * as os from 'os';

test.describe('Which-Key Popup', () => {
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

  async function openKanbanBoard(page: typeof ctx.window): Promise<void> {
    // Add project via sidebar
    await page.evaluate((repoPath) => {
      localStorage.removeItem('yolium-sidebar-projects');
      localStorage.setItem('yolium-sidebar-projects', JSON.stringify([{ path: repoPath }]));
    }, testRepoPath);

    // Reload to pick up the sidebar project
    await page.reload();
    await page.waitForSelector(selectors.emptyState, { state: 'visible', timeout: 10000 }).catch(() => {});

    // Click the project in the sidebar to open kanban
    const projectItem = page.locator(`[data-testid="project-item"]`).first();
    if (await projectItem.isVisible()) {
      await projectItem.click();
    }
    // Wait for kanban view to be visible
    await page.waitForSelector('[data-testid="kanban-view"]', { timeout: 10000 }).catch(() => {});
  }

  test('should show which-key popup when Space is pressed in content zone', async () => {
    ctx = await launchApp();
    const { window } = ctx;

    await openKanbanBoard(window);

    // Ensure we're in NORMAL mode, content zone
    await window.keyboard.press('Escape');
    await window.keyboard.press('c'); // Focus content zone

    // Press Space to trigger leader key
    await window.keyboard.press('Space');

    // Which-key popup should appear
    await expect(window.locator('[data-testid="which-key-popup"]')).toBeVisible({ timeout: 2000 });
  });

  test('should show only content-zone actions in the popup', async () => {
    ctx = await launchApp();
    const { window } = ctx;

    await openKanbanBoard(window);

    await window.keyboard.press('Escape');
    await window.keyboard.press('c');
    await window.keyboard.press('Space');

    const popup = window.locator('[data-testid="which-key-popup"]');
    await expect(popup).toBeVisible({ timeout: 2000 });

    // Should contain content zone actions
    await expect(popup).toContainText('Next card');

    // Should NOT contain sidebar-only actions
    await expect(popup).not.toContainText('Open project');
  });

  test('should dismiss popup on Escape', async () => {
    ctx = await launchApp();
    const { window } = ctx;

    await openKanbanBoard(window);

    await window.keyboard.press('Escape');
    await window.keyboard.press('c');
    await window.keyboard.press('Space');

    await expect(window.locator('[data-testid="which-key-popup"]')).toBeVisible({ timeout: 2000 });

    // Press Escape to dismiss
    await window.keyboard.press('Escape');

    await expect(window.locator('[data-testid="which-key-popup"]')).not.toBeVisible({ timeout: 2000 });
  });

  test('should dismiss popup on second Space press', async () => {
    ctx = await launchApp();
    const { window } = ctx;

    await openKanbanBoard(window);

    await window.keyboard.press('Escape');
    await window.keyboard.press('c');
    await window.keyboard.press('Space');

    await expect(window.locator('[data-testid="which-key-popup"]')).toBeVisible({ timeout: 2000 });

    // Press Space again to toggle off
    await window.keyboard.press('Space');

    await expect(window.locator('[data-testid="which-key-popup"]')).not.toBeVisible({ timeout: 2000 });
  });

  test('should dismiss popup on Ctrl+Q', async () => {
    ctx = await launchApp();
    const { window } = ctx;

    await openKanbanBoard(window);

    await window.keyboard.press('Escape');
    await window.keyboard.press('c');
    await window.keyboard.press('Space');

    await expect(window.locator('[data-testid="which-key-popup"]')).toBeVisible({ timeout: 2000 });

    // Press Ctrl+Q to dismiss
    await window.keyboard.press('Control+q');

    await expect(window.locator('[data-testid="which-key-popup"]')).not.toBeVisible({ timeout: 2000 });
  });

  test('should execute action and dismiss when valid key is pressed', async () => {
    ctx = await launchApp();
    const { window } = ctx;

    await openKanbanBoard(window);

    await window.keyboard.press('Escape');
    await window.keyboard.press('c');
    await window.keyboard.press('Space');

    await expect(window.locator('[data-testid="which-key-popup"]')).toBeVisible({ timeout: 2000 });

    // Press 'n' for new item (content zone action)
    await window.keyboard.press('n');

    // Popup should dismiss
    await expect(window.locator('[data-testid="which-key-popup"]')).not.toBeVisible({ timeout: 2000 });
  });

  test('should show sidebar shortcuts when Space is pressed in work item dialog', async () => {
    ctx = await launchApp();
    const { window } = ctx;

    await openKanbanBoard(window);

    // Create a new item first
    await window.keyboard.press('Escape');
    await window.keyboard.press('c');
    await window.keyboard.press('n');

    // Wait for new item dialog
    const newItemDialog = window.locator('[data-testid="new-item-dialog"]');
    if (await newItemDialog.isVisible({ timeout: 2000 }).catch(() => false)) {
      // Fill in title and submit
      await window.fill('[data-testid="new-item-title"]', 'Test Item');
      await window.keyboard.press('Enter');
      // Wait for dialog to close
      await expect(newItemDialog).not.toBeVisible({ timeout: 2000 });
    }

    // Open the item detail dialog by pressing Enter on the focused card
    await window.keyboard.press('Enter');

    // The item detail dialog should be open
    const itemDialog = window.locator('[data-testid="item-detail-dialog"]');
    await expect(itemDialog).toBeVisible({ timeout: 3000 });

    // Escape to ensure NORMAL mode inside dialog
    await window.keyboard.press('Escape');

    // Switch to sidebar focus zone (Tab toggles editor/sidebar)
    await window.keyboard.press('Tab');

    // Press Space — should show dialog-sidebar shortcuts
    await window.keyboard.press('Space');

    // The which-key popup must appear with dialog-sidebar leader groups
    const popup = window.locator('[data-testid="which-key-popup"]');
    await expect(popup).toBeVisible({ timeout: 2000 });
    // Should show leader group categories for dialog-sidebar zone
    await expect(popup).toContainText('Leader');
    await expect(popup).toContainText('Agent');
  });

  test('should open full KeyboardShortcutsDialog when ? is pressed', async () => {
    ctx = await launchApp();
    const { window } = ctx;

    // Ensure NORMAL mode
    await window.keyboard.press('Escape');

    // Press ? to open shortcuts dialog
    await window.keyboard.press('?');

    // KeyboardShortcutsDialog should appear
    await expect(window.locator('[data-testid="shortcuts-dialog"]')).toBeVisible({ timeout: 3000 });
  });
});
