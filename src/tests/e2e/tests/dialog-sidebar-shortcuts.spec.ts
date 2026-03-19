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
    await page.click(selectors.openProjectButton);
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

  test('should cycle agent provider select when pressing 1 in sidebar zone', async () => {
    await setupItemDetailDialog();
    const page = ctx.window;

    // Switch to sidebar zone with Tab
    await page.keyboard.press('Tab');

    // Verify initial provider is claude
    const providerSelect = page.locator('[data-testid="agent-provider-select"]');
    await expect(providerSelect).toHaveValue('claude');

    // Press 1 to cycle to opencode
    await page.keyboard.press('1');
    await expect(providerSelect).toHaveValue('opencode');

    // Press 1 again to cycle to codex
    await page.keyboard.press('1');
    await expect(providerSelect).toHaveValue('codex');

    // Press 1 again to wrap back to claude
    await page.keyboard.press('1');
    await expect(providerSelect).toHaveValue('claude');
  });

  test('should cycle column select when pressing 3 in sidebar zone', async () => {
    await setupItemDetailDialog();
    const page = ctx.window;

    // Switch to sidebar zone with Tab
    await page.keyboard.press('Tab');

    // Verify initial column is backlog
    const columnSelect = page.locator('[data-testid="column-select"]');
    await expect(columnSelect).toHaveValue('backlog');

    // Press 3 to cycle to ready
    await page.keyboard.press('3');
    await expect(columnSelect).toHaveValue('ready');

    // Press 3 to cycle to done (skipping in-progress and verify)
    await page.keyboard.press('3');
    await expect(columnSelect).toHaveValue('done');

    // Press 3 to wrap back to backlog
    await page.keyboard.press('3');
    await expect(columnSelect).toHaveValue('backlog');
  });

  test('should toggle verified checkbox when pressing V in sidebar zone', async () => {
    await setupItemDetailDialog();
    const page = ctx.window;

    // Switch to sidebar zone with Tab
    await page.keyboard.press('Tab');

    const checkbox = page.locator('[data-testid="verified-checkbox"]');
    await expect(checkbox).not.toBeChecked();

    // Press Shift+V to toggle verified on
    await page.keyboard.press('Shift+v');
    await expect(checkbox).toBeChecked();

    // Press Shift+V again to toggle verified off
    await page.keyboard.press('Shift+v');
    await expect(checkbox).not.toBeChecked();
  });

  test('should show shortcut hint badges on dropdown controls when sidebar is focused', async () => {
    await setupItemDetailDialog();
    const page = ctx.window;

    // Switch to sidebar zone with Tab
    await page.keyboard.press('Tab');

    // Verify kbd hints are visible for dropdown controls
    const sidebarZone = page.locator('[data-testid="sidebar-zone"]');
    await expect(sidebarZone.locator('kbd:text-is("1")')).toBeVisible();
    await expect(sidebarZone.locator('kbd:text-is("2")')).toBeVisible();
    await expect(sidebarZone.locator('kbd:text-is("3")')).toBeVisible();
    await expect(sidebarZone.locator('kbd:text-is("V")')).toBeVisible();
  });

  test('should trigger fix-conflicts (run agent) when pressing k in sidebar zone with mergeStatus conflict', async () => {
    await setupItemDetailDialog({
      mergeStatus: 'conflict',
      branch: 'test-branch',
      worktreePath: '/tmp/test-worktree',
      agentStatus: 'idle',
    });
    const page = ctx.window;

    // Mock agent start and fix-conflicts
    await ctx.app.evaluate(({ ipcMain }) => {
      (globalThis as { __agentStartCalls?: unknown[] }).__agentStartCalls = [];
      ipcMain.removeHandler('agent:start');
      ipcMain.handle('agent:start', async (_event, params: Record<string, unknown>) => {
        (globalThis as { __agentStartCalls?: unknown[] }).__agentStartCalls!.push(params);
        return { sessionId: 'test-session' };
      });
      // Mock fix-conflicts IPC
      ipcMain.removeHandler('kanban:fix-conflicts');
      ipcMain.handle('kanban:fix-conflicts', async () => ({ success: true }));
    });

    // Switch to sidebar zone
    await page.keyboard.press('Tab');

    // Press 'k' — should trigger fix conflicts (run agent), not check conflicts
    await page.keyboard.press('k');

    // Verify agent:start was called (fix conflicts runs an agent)
    const calls = await ctx.app.evaluate(() => {
      return (globalThis as { __agentStartCalls?: unknown[] }).__agentStartCalls ?? [];
    });
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0]).toEqual(expect.objectContaining({ agentName: 'code-agent' }));
  });

  test('should trigger check-conflicts when pressing K (Shift+K) in sidebar zone with mergeStatus unmerged', async () => {
    await setupItemDetailDialog({
      mergeStatus: 'unmerged',
      branch: 'test-branch',
      worktreePath: '/tmp/test-worktree',
      agentStatus: 'idle',
    });
    const page = ctx.window;

    // Mock check-conflicts IPC
    await ctx.app.evaluate(({ ipcMain }) => {
      (globalThis as { __checkConflictsCalls?: number }).__checkConflictsCalls = 0;
      ipcMain.removeHandler('kanban:check-conflicts');
      ipcMain.handle('kanban:check-conflicts', async () => {
        (globalThis as { __checkConflictsCalls?: number }).__checkConflictsCalls!++;
        return { clean: true, conflictingFiles: [] };
      });
    });

    // Switch to sidebar zone
    await page.keyboard.press('Tab');

    // Press Shift+K — should trigger check conflicts
    await page.keyboard.press('Shift+k');

    // Verify check-conflicts was called
    const callCount = await ctx.app.evaluate(() => {
      return (globalThis as { __checkConflictsCalls?: number }).__checkConflictsCalls ?? 0;
    });
    expect(callCount).toBeGreaterThan(0);
  });

  test('should scroll agent log up with k when in log-focus mode even if item has mergeStatus', async () => {
    await setupItemDetailDialog({
      mergeStatus: 'unmerged',
      branch: 'test-branch',
      worktreePath: '/tmp/test-worktree',
      agentStatus: 'completed',
      activeAgentName: 'code-agent',
    });
    const page = ctx.window;

    // Mock check-conflicts so we can detect if it fires
    await ctx.app.evaluate(({ ipcMain }) => {
      (globalThis as { __checkConflictsCalls?: number }).__checkConflictsCalls = 0;
      ipcMain.removeHandler('kanban:check-conflicts');
      ipcMain.handle('kanban:check-conflicts', async () => {
        (globalThis as { __checkConflictsCalls?: number }).__checkConflictsCalls!++;
        return { clean: true, conflictingFiles: [] };
      });
    });

    // Switch to sidebar zone
    await page.keyboard.press('Tab');

    // Open the log panel with 'l'
    await page.keyboard.press('l');

    // Press 'j' to enter log-focus mode and scroll down
    await page.keyboard.press('j');

    // Now press 'k' — should scroll log, NOT trigger check/fix conflicts
    await page.keyboard.press('k');

    // Verify check-conflicts was NOT called
    const callCount = await ctx.app.evaluate(() => {
      return (globalThis as { __checkConflictsCalls?: number }).__checkConflictsCalls ?? 0;
    });
    expect(callCount).toBe(0);

    // Verify hint bar shows log-focus mode hints
    const hintBar = page.locator('[data-testid="shortcuts-hint-bar"]');
    await expect(hintBar).toContainText('Back');
  });

  test('should enter log-focus mode with j/k when agent log is open and not trigger sidebar actions', async () => {
    await setupItemDetailDialog({
      mergeStatus: 'unmerged',
      branch: 'test-branch',
      worktreePath: '/tmp/test-worktree',
      agentStatus: 'completed',
      activeAgentName: 'code-agent',
    });
    const page = ctx.window;

    // Switch to sidebar zone
    await page.keyboard.press('Tab');

    // Open the log panel with 'l'
    await page.keyboard.press('l');

    // Press 'j' to enter log-focus mode
    await page.keyboard.press('j');

    // Verify hint bar shows log-focus hints (Navigate + Back)
    const hintBar = page.locator('[data-testid="shortcuts-hint-bar"]');
    await expect(hintBar).toContainText('Navigate');
    await expect(hintBar).toContainText('Back');
  });

  test('should show K kbd hint on Check Conflicts button when sidebar is focused', async () => {
    await setupItemDetailDialog({
      mergeStatus: 'unmerged',
      branch: 'test-branch',
      worktreePath: '/tmp/test-worktree',
      agentStatus: 'idle',
    });
    const page = ctx.window;

    // Switch to sidebar zone
    await page.keyboard.press('Tab');

    // Check Conflicts button should show 'K' kbd hint
    const checkConflictsButton = page.locator('[data-testid="check-conflicts-button"]');
    await expect(checkConflictsButton).toBeVisible();
    await expect(checkConflictsButton.locator('kbd')).toContainText('K');
  });

  test('should show k kbd hint on Fix Conflicts button when sidebar is focused', async () => {
    await setupItemDetailDialog({
      mergeStatus: 'conflict',
      branch: 'test-branch',
      worktreePath: '/tmp/test-worktree',
      agentStatus: 'idle',
    });
    const page = ctx.window;

    // Switch to sidebar zone
    await page.keyboard.press('Tab');

    // Fix Conflicts button should show 'k' kbd hint
    const fixConflictsButton = page.locator('[data-testid="fix-conflicts-button"]');
    await expect(fixConflictsButton).toBeVisible();
    await expect(fixConflictsButton.locator('kbd')).toContainText('k');
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
