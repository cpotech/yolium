import { test, expect } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'os';
import { launchApp, closeApp, createTestRepo, cleanupTestRepo, type AppContext } from '../helpers/app';
import { selectors } from '../helpers/selectors';

/**
 * Caveman Mode E2E tests.
 *
 * Covers the Project Settings radio group: off/lite/full/ultra, persistence
 * to `.yolium.json`, round-trip on dialog reopen, and clearing back to off.
 */
test.describe('Caveman Mode', () => {
  let ctx: AppContext;
  let testRepoPath: string;

  test.beforeEach(async () => {
    testRepoPath = await createTestRepo(os.tmpdir());
  });

  test.afterEach(async () => {
    if (ctx) {
      await closeApp(ctx);
      ctx = undefined as unknown as AppContext;
    }
    if (testRepoPath) {
      await cleanupTestRepo(testRepoPath);
      testRepoPath = '';
    }
  });

  async function openKanbanBoard(): Promise<void> {
    ctx = await launchApp();
    const page = ctx.window;

    await page.evaluate(() => {
      localStorage.removeItem('yolium-sidebar-projects');
      localStorage.removeItem('yolium-open-kanban-tabs');
    });
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector(
      '[data-testid="empty-state"], [data-testid="docker-setup-dialog"], [data-testid="tab-bar"]',
      { timeout: 30000 }
    );

    await page.click(selectors.openProjectButton);
    await page.fill(selectors.pathInput, testRepoPath);
    await page.click(selectors.pathNextButton);
    await expect(page.locator(selectors.kanbanView)).toBeVisible({ timeout: 10000 });
  }

  async function openProjectSettings(): Promise<void> {
    const { window } = ctx;
    await window.click('[data-testid="project-settings-button"]');
    await expect(window.locator('[data-testid="project-config-dialog"]')).toBeVisible({ timeout: 5000 });
  }

  test('project settings dialog shows Caveman Mode section with off/lite/full/ultra radios', async () => {
    await openKanbanBoard();
    await openProjectSettings();
    const { window } = ctx;

    await expect(window.locator('[data-testid="caveman-mode-section"]')).toBeVisible();
    await expect(window.locator('[data-testid="caveman-mode-off"]')).toBeVisible();
    await expect(window.locator('[data-testid="caveman-mode-lite"]')).toBeVisible();
    await expect(window.locator('[data-testid="caveman-mode-full"]')).toBeVisible();
    await expect(window.locator('[data-testid="caveman-mode-ultra"]')).toBeVisible();

    // Default selection should be 'off' for a fresh project
    await expect(window.locator('[data-testid="caveman-mode-off"]')).toBeChecked();
  });

  test('selecting full and saving persists the choice to .yolium.json', async () => {
    await openKanbanBoard();
    await openProjectSettings();
    const { window } = ctx;

    await window.click('[data-testid="caveman-mode-full"]');
    await expect(window.locator('[data-testid="caveman-mode-full"]')).toBeChecked();

    await window.click('[data-testid="project-config-save"]');
    await expect(window.locator('[data-testid="project-config-dialog"]')).not.toBeVisible();

    const configPath = path.join(testRepoPath, '.yolium.json');
    expect(fs.existsSync(configPath)).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    expect(parsed.cavemanMode).toBe('full');
  });

  test('reopening the dialog shows the previously saved selection', async () => {
    await openKanbanBoard();
    await openProjectSettings();
    const { window } = ctx;

    await window.click('[data-testid="caveman-mode-ultra"]');
    await window.click('[data-testid="project-config-save"]');
    await expect(window.locator('[data-testid="project-config-dialog"]')).not.toBeVisible();

    await openProjectSettings();
    await expect(window.locator('[data-testid="caveman-mode-ultra"]')).toBeChecked();
  });

  test('switching back to off removes or clears the flag from .yolium.json', async () => {
    await openKanbanBoard();
    await openProjectSettings();
    const { window } = ctx;

    // First, save as full
    await window.click('[data-testid="caveman-mode-full"]');
    await window.click('[data-testid="project-config-save"]');
    await expect(window.locator('[data-testid="project-config-dialog"]')).not.toBeVisible();

    // Reopen and set back to off
    await openProjectSettings();
    await window.click('[data-testid="caveman-mode-off"]');
    await window.click('[data-testid="project-config-save"]');
    await expect(window.locator('[data-testid="project-config-dialog"]')).not.toBeVisible();

    const configPath = path.join(testRepoPath, '.yolium.json');
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    // When off is selected, the key is either absent or explicitly 'off'
    expect(parsed.cavemanMode === undefined || parsed.cavemanMode === 'off').toBe(true);
  });
});
