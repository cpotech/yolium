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
