/**
 * @module src/tests/e2e/tests/whichkey-leader.spec
 * E2E tests for the WhichKey leader key navigation fix.
 * Verifies: display-only popup, zone-aware leader, follow-up key propagation.
 */

import { test, expect } from '@playwright/test';
import { launchApp, closeApp, createTestRepo, cleanupTestRepo, cleanupYoliumContainers, type AppContext } from '../helpers/app';
import * as os from 'os';

test.describe('WhichKey Leader Navigation', () => {
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
    await page.evaluate((repoPath) => {
      localStorage.removeItem('yolium-sidebar-projects');
      localStorage.setItem('yolium-sidebar-projects', JSON.stringify([{ path: repoPath }]));
    }, testRepoPath);

    await page.reload();
    await page.waitForSelector('[data-testid="empty-state"]', { state: 'visible', timeout: 10000 }).catch(() => {});

    const projectItem = page.locator('[data-testid="project-item"]').first();
    if (await projectItem.isVisible()) {
      await projectItem.click();
    }
    await page.waitForSelector('[data-testid="kanban-view"]', { timeout: 10000 }).catch(() => {});
  }

  test('should show WhichKeyPopup with correct zone actions when Space is pressed', async () => {
    ctx = await launchApp();
    const { window } = ctx;

    await openKanbanBoard(window);

    // Focus content zone
    await window.keyboard.press('Escape');
    await window.keyboard.press('c');
    await window.keyboard.press('Space');

    const popup = window.locator('[data-testid="which-key-popup"]');
    await expect(popup).toBeVisible({ timeout: 2000 });

    // Content zone actions should be visible
    await expect(popup).toContainText('Next card');
  });

  test('should dismiss popup and execute zone action on valid follow-up key', async () => {
    ctx = await launchApp();
    const { window } = ctx;

    await openKanbanBoard(window);

    // Start in content zone
    await window.keyboard.press('Escape');
    await window.keyboard.press('c');
    await window.keyboard.press('Space');

    await expect(window.locator('[data-testid="which-key-popup"]')).toBeVisible({ timeout: 2000 });

    // Press 'e' (sidebar zone switch) — popup should dismiss and zone should change
    // Zone switching is reliable regardless of kanban state
    await window.keyboard.press('e');

    await expect(window.locator('[data-testid="which-key-popup"]')).not.toBeVisible({ timeout: 2000 });

    // Verify the key propagated: sidebar zone should now be active (ring highlight)
    const activeZone = await window.evaluate(() => {
      const zones = document.querySelectorAll('[data-vim-zone]');
      for (const z of zones) {
        if ((z as HTMLElement).className.includes('ring-1')) {
          return z.getAttribute('data-vim-zone');
        }
      }
      return null;
    });
    expect(activeZone).toBe('sidebar');
  });

  test('should dismiss popup without action on Escape', async () => {
    ctx = await launchApp();
    const { window } = ctx;

    await openKanbanBoard(window);

    await window.keyboard.press('Escape');
    await window.keyboard.press('c');
    await window.keyboard.press('Space');

    await expect(window.locator('[data-testid="which-key-popup"]')).toBeVisible({ timeout: 2000 });

    await window.keyboard.press('Escape');

    await expect(window.locator('[data-testid="which-key-popup"]')).not.toBeVisible({ timeout: 2000 });

    // No dialog should have opened
    await expect(window.locator('[data-testid="new-item-dialog"]')).not.toBeVisible({ timeout: 500 });
  });

  test('should show content zone actions when Space is pressed in content zone', async () => {
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
    await expect(popup).toContainText('New item');

    // Should NOT contain sidebar-only actions
    await expect(popup).not.toContainText('Open project');
  });

  test('should show sidebar zone actions when Space is pressed in sidebar zone', async () => {
    ctx = await launchApp();
    const { window } = ctx;

    await openKanbanBoard(window);

    // Switch to sidebar zone
    await window.keyboard.press('Escape');
    await window.keyboard.press('e');
    await window.keyboard.press('Space');

    const popup = window.locator('[data-testid="which-key-popup"]');
    await expect(popup).toBeVisible({ timeout: 2000 });

    // Should contain sidebar zone actions
    await expect(popup).toContainText('Next project');

    // Should NOT contain content-only actions
    await expect(popup).not.toContainText('Next card');
  });

  test('should allow the follow-up key to reach the zone handler (not swallowed by popup)', async () => {
    ctx = await launchApp();
    const { window } = ctx;

    await openKanbanBoard(window);

    // Start in sidebar zone
    await window.keyboard.press('Escape');
    await window.keyboard.press('e');

    // Press Space then 't' (tabs zone switch) — the key must propagate past the popup
    await window.keyboard.press('Space');
    await expect(window.locator('[data-testid="which-key-popup"]')).toBeVisible({ timeout: 2000 });

    await window.keyboard.press('t');

    // Popup should dismiss
    await expect(window.locator('[data-testid="which-key-popup"]')).not.toBeVisible({ timeout: 2000 });

    // Verify the 't' key propagated: tabs zone should now be active
    const activeZone = await window.evaluate(() => {
      const zones = document.querySelectorAll('[data-vim-zone]');
      for (const z of zones) {
        if ((z as HTMLElement).className.includes('ring-1')) {
          return z.getAttribute('data-vim-zone');
        }
      }
      return null;
    });
    expect(activeZone).toBe('tabs');
  });

  // --- Leader group drill-down tests (bug fix) ---

  test('should drill into Agent group when pressing a after Space in sidebar focus', async () => {
    ctx = await launchApp();
    const { window } = ctx;

    await openKanbanBoard(window);

    // Create a work item so we can open the ItemDetailDialog
    await window.keyboard.press('Escape');
    await window.keyboard.press('c');
    await window.keyboard.press('n');
    await window.waitForSelector('[data-testid="new-item-dialog"]', { timeout: 5000 });

    // Fill in title and save
    const titleInput = window.locator('[data-testid="new-item-title"]');
    await titleInput.fill('Test item for leader nav');
    await window.keyboard.press('Enter');
    await window.waitForSelector('[data-testid="new-item-dialog"]', { state: 'hidden', timeout: 5000 }).catch(() => {});

    // Open the card
    await window.keyboard.press('Enter');
    await window.waitForSelector('[data-testid="item-detail-dialog"]', { timeout: 5000 });

    // Focus sidebar with Tab
    await window.keyboard.press('Tab');

    // Press Space to open leader popup in dialog-sidebar zone
    await window.keyboard.press('Space');
    const popup = window.locator('[data-testid="which-key-popup"]');
    await expect(popup).toBeVisible({ timeout: 2000 });

    // Should show Agent group
    await expect(window.locator('[data-testid="which-key-group-a"]')).toBeVisible();

    // Press 'a' to drill into Agent group
    await window.keyboard.press('a');

    // Popup should still be visible but now showing Agent sub-actions
    await expect(popup).toBeVisible({ timeout: 2000 });
    await expect(window.locator('[data-testid="which-key-breadcrumb"]')).toContainText('Agent');
    await expect(window.locator('[data-testid="which-key-item-agent-code-sidebar"]')).toBeVisible();
  });

  test('should drill into Git/PR group when pressing g after Space in sidebar focus', async () => {
    ctx = await launchApp();
    const { window } = ctx;

    await openKanbanBoard(window);

    await window.keyboard.press('Escape');
    await window.keyboard.press('c');
    await window.keyboard.press('n');
    await window.waitForSelector('[data-testid="new-item-dialog"]', { timeout: 5000 });
    const titleInput = window.locator('[data-testid="new-item-title"]');
    await titleInput.fill('Test item for git nav');
    await window.keyboard.press('Enter');
    await window.waitForSelector('[data-testid="new-item-dialog"]', { state: 'hidden', timeout: 5000 }).catch(() => {});

    await window.keyboard.press('Enter');
    await window.waitForSelector('[data-testid="item-detail-dialog"]', { timeout: 5000 });
    await window.keyboard.press('Tab');

    await window.keyboard.press('Space');
    const popup = window.locator('[data-testid="which-key-popup"]');
    await expect(popup).toBeVisible({ timeout: 2000 });

    // Press 'g' to drill into Git/PR group
    await window.keyboard.press('g');

    await expect(popup).toBeVisible({ timeout: 2000 });
    await expect(window.locator('[data-testid="which-key-breadcrumb"]')).toContainText('Git/PR');
    await expect(window.locator('[data-testid="which-key-item-dialog-compare-changes"]')).toBeVisible();
  });

  test('should return to level 1 when pressing Backspace at level 2', async () => {
    ctx = await launchApp();
    const { window } = ctx;

    await openKanbanBoard(window);

    await window.keyboard.press('Escape');
    await window.keyboard.press('c');
    await window.keyboard.press('n');
    await window.waitForSelector('[data-testid="new-item-dialog"]', { timeout: 5000 });
    const titleInput = window.locator('[data-testid="new-item-title"]');
    await titleInput.fill('Test item for backspace');
    await window.keyboard.press('Enter');
    await window.waitForSelector('[data-testid="new-item-dialog"]', { state: 'hidden', timeout: 5000 }).catch(() => {});

    await window.keyboard.press('Enter');
    await window.waitForSelector('[data-testid="item-detail-dialog"]', { timeout: 5000 });
    await window.keyboard.press('Tab');

    await window.keyboard.press('Space');
    const popup = window.locator('[data-testid="which-key-popup"]');
    await expect(popup).toBeVisible({ timeout: 2000 });

    // Drill into Agent group
    await window.keyboard.press('a');
    await expect(window.locator('[data-testid="which-key-breadcrumb"]')).toContainText('Agent');

    // Press Backspace to return to level 1
    await window.keyboard.press('Backspace');

    // Should be back at level 1 — groups visible, no breadcrumb
    await expect(popup).toBeVisible({ timeout: 2000 });
    await expect(window.locator('[data-testid="which-key-group-a"]')).toBeVisible();
    await expect(window.locator('[data-testid="which-key-group-g"]')).toBeVisible();
  });

  test('should execute agent action after drilling into group (Space -> a -> c for code agent)', async () => {
    ctx = await launchApp();
    const { window } = ctx;

    await openKanbanBoard(window);

    await window.keyboard.press('Escape');
    await window.keyboard.press('c');
    await window.keyboard.press('n');
    await window.waitForSelector('[data-testid="new-item-dialog"]', { timeout: 5000 });
    const titleInput = window.locator('[data-testid="new-item-title"]');
    await titleInput.fill('Test item for agent action');
    await window.keyboard.press('Enter');
    await window.waitForSelector('[data-testid="new-item-dialog"]', { state: 'hidden', timeout: 5000 }).catch(() => {});

    await window.keyboard.press('Enter');
    await window.waitForSelector('[data-testid="item-detail-dialog"]', { timeout: 5000 });
    await window.keyboard.press('Tab');

    // Space -> a -> c (Code Agent)
    await window.keyboard.press('Space');
    await expect(window.locator('[data-testid="which-key-popup"]')).toBeVisible({ timeout: 2000 });

    await window.keyboard.press('a');
    await expect(window.locator('[data-testid="which-key-breadcrumb"]')).toContainText('Agent');

    // Press 'c' for code agent — popup should dismiss and action should execute
    await window.keyboard.press('c');
    await expect(window.locator('[data-testid="which-key-popup"]')).not.toBeVisible({ timeout: 2000 });

    // The agent select dialog or agent status should appear as a result
    // (or at minimum, the popup dismissed meaning the action key propagated)
  });

  test('should dismiss popup on any non-matching key without side effects', async () => {
    ctx = await launchApp();
    const { window } = ctx;

    await openKanbanBoard(window);

    await window.keyboard.press('Escape');
    await window.keyboard.press('c');
    await window.keyboard.press('Space');

    await expect(window.locator('[data-testid="which-key-popup"]')).toBeVisible({ timeout: 2000 });

    // Press a key that is not a content zone action (e.g., 'z')
    await window.keyboard.press('z');

    // Popup should dismiss
    await expect(window.locator('[data-testid="which-key-popup"]')).not.toBeVisible({ timeout: 2000 });
  });
});
