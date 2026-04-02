import { test, expect } from '@playwright/test';
import { launchApp, closeApp, createTestRepo, cleanupTestRepo, type AppContext } from '../helpers/app';
import * as os from 'os';

test.describe('Default Provider', () => {
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

    await page.click('[data-testid="open-project-button"]');
    await page.fill('[data-testid="path-input"]', testRepoPath);
    await page.click('[data-testid="path-next"]');
    await page.waitForSelector('[data-testid="kanban-view"]', { timeout: 10000 });
  }

  test('should set default provider in settings and see it applied in new item dialog', async () => {
    await openKanbanBoard();
    const { window, app } = ctx;

    // Open settings dialog via IPC
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].webContents.send('git-settings:show');
    });
    await window.waitForSelector('[data-testid="git-config-dialog"]');

    // Change default provider to OpenCode
    const providerSelect = window.getByTestId('default-provider-select');
    await providerSelect.selectOption('opencode');

    // Save settings
    await window.getByTestId('git-config-save').click();

    // Wait for settings to close
    await expect(window.getByTestId('git-config-dialog')).not.toBeVisible();

    // Open new item dialog
    await window.getByTestId('new-item-button').click();
    await window.waitForSelector('[data-testid="new-item-dialog"]');

    // Verify default provider is OpenCode
    const agentProviderSelect = window.getByTestId('agent-provider-select');
    await expect(agentProviderSelect).toHaveValue('opencode');
  });

  test('should persist default provider across dialog reopenings', async () => {
    await openKanbanBoard();
    const { window, app } = ctx;

    // Open settings and set default to codex
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].webContents.send('git-settings:show');
    });
    await window.waitForSelector('[data-testid="git-config-dialog"]');

    const providerSelect = window.getByTestId('default-provider-select');
    await providerSelect.selectOption('codex');
    await window.getByTestId('git-config-save').click();

    // Wait for settings to close
    await expect(window.getByTestId('git-config-dialog')).not.toBeVisible();

    // Reopen settings
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].webContents.send('git-settings:show');
    });
    await window.waitForSelector('[data-testid="git-config-dialog"]');

    // Verify it still shows codex
    await expect(window.getByTestId('default-provider-select')).toHaveValue('codex');
  });
});
