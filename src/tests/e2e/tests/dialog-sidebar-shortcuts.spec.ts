import { test, expect } from '@playwright/test';
import { launchApp, closeApp, createTestRepo, cleanupTestRepo, type AppContext } from '../helpers/app';
import { selectors } from '../helpers/selectors';
import * as os from 'os';

test.describe('Dialog Sidebar Shortcuts with focused form controls', () => {
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

  /**
   * Launch app, add a project, create a work item, open its detail dialog.
   */
  async function setupItemDetailDialog(itemOverrides: Record<string, unknown> = {}): Promise<{ itemId: string }> {
    ctx = await launchApp();
    const page = ctx.window;

    await ctx.app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('agent:recover');
      ipcMain.handle('agent:recover', () => []);
    });

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

    // Add project
    await page.click(selectors.addProjectButton);
    await page.fill(selectors.pathInput, testRepoPath);
    await page.click(selectors.pathNextButton);
    await expect(page.locator(selectors.kanbanView)).toBeVisible({ timeout: 10000 });

    // Create item via IPC
    const item = await page.evaluate(async (repoPath: string) => {
      return window.electronAPI.kanban.addItem(repoPath, {
        title: 'Test sidebar shortcuts item',
        description: 'E2E test for sidebar form control shortcuts',
        agentProvider: 'claude' as const,
        order: 0,
      });
    }, testRepoPath) as { id: string };

    // Apply any overrides
    if (Object.keys(itemOverrides).length > 0) {
      await page.evaluate(
        async (params: { path: string; id: string; updates: Record<string, unknown> }) => {
          await window.electronAPI.kanban.updateItem(params.path, params.id, params.updates);
        },
        { path: testRepoPath, id: item.id, updates: itemOverrides }
      );
    }

    // Refresh board and open the item detail dialog
    await page.click(selectors.kanbanRefreshButton);
    await expect(
      page.locator(selectors.kanbanColumn('backlog')).locator('[data-testid="kanban-card"]')
    ).toBeVisible({ timeout: 5000 });
    await page.locator(selectors.kanbanColumn('backlog'))
      .locator('[data-testid="kanban-card"]').first().click();
    await expect(page.locator('[data-testid="item-detail-dialog"]')).toBeVisible();

    return { itemId: item.id };
  }

  test('should fire sidebar shortcut d (delete) when a <select> element has focus in NORMAL mode', async () => {
    await setupItemDetailDialog();
    const page = ctx.window;

    // Switch to sidebar zone with Tab
    await page.keyboard.press('Tab');

    // Click on the column select to give it focus
    await page.click('[data-testid="column-select"]');
    await expect(page.locator('[data-testid="column-select"]')).toBeFocused();

    // Press 'd' for delete — should work even with select focused
    await page.keyboard.press('d');

    // Item should be deleted — dialog closes
    await expect(page.locator('[data-testid="item-detail-dialog"]')).not.toBeVisible({ timeout: 5000 });
  });

  test('should fire sidebar shortcut p (plan agent) when the verified checkbox has focus in NORMAL mode', async () => {
    await setupItemDetailDialog();
    const page = ctx.window;

    // Mock agent start to track calls
    await ctx.app.evaluate(({ ipcMain }) => {
      (globalThis as { __agentStartCalls?: unknown[] }).__agentStartCalls = [];
      ipcMain.removeHandler('agent:start');
      ipcMain.handle('agent:start', async (_event, params: Record<string, unknown>) => {
        (globalThis as { __agentStartCalls?: unknown[] }).__agentStartCalls!.push(params);
        return { sessionId: 'test-session' };
      });
    });

    // Switch to sidebar zone with Tab
    await page.keyboard.press('Tab');

    // Focus the verified checkbox
    await page.focus('[data-testid="verified-checkbox"]');
    await expect(page.locator('[data-testid="verified-checkbox"]')).toBeFocused();

    // Press 'p' for plan agent
    await page.keyboard.press('p');

    // Verify agent:start was called with plan-agent
    const calls = await ctx.app.evaluate(() => {
      return (globalThis as { __agentStartCalls?: unknown[] }).__agentStartCalls ?? [];
    });
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0]).toEqual(expect.objectContaining({ agentName: 'plan-agent' }));
  });

  test('should fire Ctrl+Shift+S (scout agent) when a <select> element has focus', async () => {
    await setupItemDetailDialog();
    const page = ctx.window;

    // Mock agent start
    await ctx.app.evaluate(({ ipcMain }) => {
      (globalThis as { __agentStartCalls?: unknown[] }).__agentStartCalls = [];
      ipcMain.removeHandler('agent:start');
      ipcMain.handle('agent:start', async (_event, params: Record<string, unknown>) => {
        (globalThis as { __agentStartCalls?: unknown[] }).__agentStartCalls!.push(params);
        return { sessionId: 'test-session' };
      });
    });

    // Click column select to focus it
    await page.click('[data-testid="column-select"]');
    await expect(page.locator('[data-testid="column-select"]')).toBeFocused();

    // Press Ctrl+Shift+S for scout agent
    await page.keyboard.press('Control+Shift+s');

    const calls = await ctx.app.evaluate(() => {
      return (globalThis as { __agentStartCalls?: unknown[] }).__agentStartCalls ?? [];
    });
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0]).toEqual(expect.objectContaining({ agentName: 'scout-agent' }));
  });

  test('should allow Escape to exit INSERT mode and restore shortcuts when answer textarea has focus', async () => {
    // Set up item in waiting state so the answer textarea appears
    await setupItemDetailDialog({
      agentStatus: 'waiting',
      agentQuestion: 'How should I proceed?',
      agentQuestionOptions: ['Ship it'],
      column: 'ready',
    });
    const page = ctx.window;

    // The answer textarea should be focused automatically when waiting
    const answerInput = page.locator('[data-testid="answer-input"]');
    await expect(answerInput).toBeVisible();

    // Click it to enter INSERT mode
    await answerInput.click();

    // Type something — should work in INSERT mode
    await page.keyboard.type('test');

    // Escape should exit INSERT mode
    await page.keyboard.press('Escape');

    // Verify the dialog is still open (Escape didn't close it)
    await expect(page.locator('[data-testid="item-detail-dialog"]')).toBeVisible();

    // Verify the shortcuts hint bar shows NORMAL mode hints
    const hintBar = page.locator('[data-testid="shortcuts-hint-bar"]');
    await expect(hintBar).toContainText('Navigate');
  });

  test('should restore shortcuts after clicking a sidebar select then pressing Escape in NORMAL mode', async () => {
    await setupItemDetailDialog();
    const page = ctx.window;

    // Switch to sidebar zone
    await page.keyboard.press('Tab');

    // Click on column select
    await page.click('[data-testid="column-select"]');

    // Press Escape — should return to editor zone from sidebar zone
    await page.keyboard.press('Escape');

    // Should be back in editor zone (editor ring visible)
    await expect(page.locator('[data-testid="editor-zone"]')).toHaveClass(/ring-1/);
    await expect(page.locator('[data-testid="item-detail-dialog"]')).toBeVisible();
  });

  test('should not block Tab zone-toggle when a sidebar select has focus in NORMAL mode', async () => {
    await setupItemDetailDialog();
    const page = ctx.window;

    // Switch to sidebar zone
    await page.keyboard.press('Tab');
    await expect(page.locator('[data-testid="sidebar-zone"]')).toHaveClass(/ring-1/);

    // Click on column select to focus it
    await page.click('[data-testid="column-select"]');
    await expect(page.locator('[data-testid="column-select"]')).toBeFocused();

    // Press Tab — should toggle back to editor zone even with select focused
    await page.keyboard.press('Tab');
    await expect(page.locator('[data-testid="editor-zone"]')).toHaveClass(/ring-1/);
  });

  test('should refocus dialog container after sidebar shortcut fires from a focused select', async () => {
    await setupItemDetailDialog();
    const page = ctx.window;

    // Mock agent start
    await ctx.app.evaluate(({ ipcMain }) => {
      (globalThis as { __agentStartCalls?: unknown[] }).__agentStartCalls = [];
      ipcMain.removeHandler('agent:start');
      ipcMain.handle('agent:start', async (_event, params: Record<string, unknown>) => {
        (globalThis as { __agentStartCalls?: unknown[] }).__agentStartCalls!.push(params);
        return { sessionId: 'test-session' };
      });
    });

    // Switch to sidebar zone
    await page.keyboard.press('Tab');

    // Click column select
    await page.click('[data-testid="column-select"]');
    await expect(page.locator('[data-testid="column-select"]')).toBeFocused();

    // Press 'p' for plan agent
    await page.keyboard.press('p');

    // After the shortcut fires, the select should no longer be focused
    // (focus should be back on the dialog container)
    await expect(page.locator('[data-testid="column-select"]')).not.toBeFocused();
  });
});
