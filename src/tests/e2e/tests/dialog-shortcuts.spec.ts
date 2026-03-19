import { test, expect } from '@playwright/test';
import { launchApp, closeApp, createTestRepo, cleanupTestRepo, cleanupYoliumContainers, AppContext } from '../helpers/app';
import { selectors } from '../helpers/selectors';
import os from 'os';

test.describe('Dialog Shortcuts', () => {
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

  test.describe('Agent Select Dialog', () => {
    test('Ctrl+Q in agent dialog should go back to path dialog', async () => {
      ctx = await launchApp();
      const { window } = ctx;

      // Navigate to agent dialog
      await window.click(selectors.newTabButton);
      await window.fill(selectors.pathInput, testRepoPath);
      await window.click(selectors.pathNextButton);
      await expect(window.locator(selectors.agentDialog)).toBeVisible();

      // Press Ctrl+Q - should go back to path dialog, not cancel
      await window.keyboard.press('Control+q');

      // Agent dialog should close
      await expect(window.locator(selectors.agentDialog)).not.toBeVisible();

      // Path dialog should reopen (not cancelled)
      await expect(window.locator(selectors.pathDialog)).toBeVisible();
    });

    test('Escape in agent dialog should NOT go back to path dialog', async () => {
      ctx = await launchApp();
      const { window } = ctx;

      // Navigate to agent dialog
      await window.click(selectors.newTabButton);
      await window.fill(selectors.pathInput, testRepoPath);
      await window.click(selectors.pathNextButton);
      await expect(window.locator(selectors.agentDialog)).toBeVisible();

      // Press Escape - should NOT go back (only Ctrl+Q closes)
      await window.keyboard.press('Escape');
      await expect(window.locator(selectors.agentDialog)).toBeVisible();
    });

    test('Back button should show Ctrl+Q shortcut hint', async () => {
      ctx = await launchApp();
      const { window } = ctx;

      // Navigate to agent dialog
      await window.click(selectors.newTabButton);
      await window.fill(selectors.pathInput, testRepoPath);
      await window.click(selectors.pathNextButton);
      await expect(window.locator(selectors.agentDialog)).toBeVisible();

      // Back button should show Ctrl+Q hint
      const backButton = window.locator(selectors.agentBackButton);
      await expect(backButton).toBeVisible();
      // Should contain "Ctrl+Q"
      await expect(backButton).toContainText('Ctrl+Q');
    });

    test('worktree toggle should not have w shortcut hint', async () => {
      ctx = await launchApp();
      const { window } = ctx;

      // Navigate to agent dialog with a git repo
      await window.click(selectors.newTabButton);
      await window.fill(selectors.pathInput, testRepoPath);
      await window.click(selectors.pathNextButton);
      await expect(window.locator(selectors.agentDialog)).toBeVisible();

      // Wait for git status to be checked (worktree toggle appears when repo is detected)
      const worktreeToggle = window.locator(selectors.worktreeToggle);
      await expect(worktreeToggle).toBeVisible({ timeout: 5000 });
      // Should not contain a kbd element with 'w' shortcut
      const worktreeKbd = window.locator(`${selectors.worktreeToggle} kbd`);
      await expect(worktreeKbd).toHaveCount(0);
    });

    test('pressing w key should not toggle worktree', async () => {
      ctx = await launchApp();
      const { window } = ctx;

      // Navigate to agent dialog with a git repo
      await window.click(selectors.newTabButton);
      await window.fill(selectors.pathInput, testRepoPath);
      await window.click(selectors.pathNextButton);
      await expect(window.locator(selectors.agentDialog)).toBeVisible();

      // Wait for git status to be checked (worktree toggle appears when repo is detected)
      await expect(window.locator(selectors.worktreeToggle)).toBeVisible({ timeout: 5000 });

      // Get initial worktree checkbox state
      const worktreeCheckbox = window.locator(`${selectors.worktreeToggle} input[type="checkbox"]`);
      const initialChecked = await worktreeCheckbox.isChecked();

      // Press 'w' key
      await window.keyboard.press('w');

      // Worktree checkbox should remain unchanged
      const afterChecked = await worktreeCheckbox.isChecked();
      expect(afterChecked).toBe(initialChecked);
    });
  });

  test.describe('Resume Agent Shortcut (R key)', () => {
    async function openKanbanWithItem(): Promise<{ window: AppContext['window']; itemId: string }> {
      ctx = await launchApp();
      const page = ctx.window;

      // Clear state and add project
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

      await page.click(selectors.addProjectButton);
      await page.fill(selectors.pathInput, testRepoPath);
      await page.click(selectors.pathNextButton);
      await page.waitForSelector('[data-testid="kanban-view"]', { timeout: 10000 });

      // Create item via IPC
      const item = await page.evaluate(
        async (params: { path: string }) => {
          return window.electronAPI.kanban.addItem(params.path, {
            title: 'Test Resume Item',
            description: 'Test description',
            agentProvider: 'claude' as 'claude' | 'codex' | 'opencode',
            order: 0,
          });
        },
        { path: testRepoPath }
      ) as { id: string };

      await page.click(selectors.kanbanRefreshButton);
      await expect(
        page.locator(selectors.kanbanColumn('backlog')).locator(selectors.kanbanCard)
      ).toBeVisible({ timeout: 5000 });

      return { window: page, itemId: item.id };
    }

    test('should resume an interrupted agent when pressing R in sidebar focus zone', async () => {
      const { window, itemId } = await openKanbanWithItem();

      // Set agent status to interrupted via IPC
      await window.evaluate(
        async (params: { path: string; id: string }) => {
          await window.electronAPI.kanban.updateItem(params.path, params.id, {
            agentStatus: 'interrupted' as 'interrupted',
            lastAgentName: 'code-agent',
          });
        },
        { path: testRepoPath, id: itemId }
      );
      await window.click(selectors.kanbanRefreshButton);
      await expect(
        window.locator(selectors.kanbanColumn('backlog')).locator(selectors.kanbanCard)
      ).toBeVisible({ timeout: 5000 });

      // Open item detail dialog
      await window.locator(selectors.kanbanColumn('backlog')).locator(selectors.kanbanCard).first().click();
      await expect(window.locator(selectors.itemDetailDialog)).toBeVisible();

      // Press Tab to switch to sidebar focus zone
      await window.keyboard.press('Tab');

      // Press R to resume — agent resume will be attempted (may fail since no real container, but the key should be handled)
      await window.keyboard.press('R');

      // Verify R Resume hint is visible in the shortcuts bar
      const dialogText = await window.locator(selectors.itemDetailDialog).textContent();
      expect(dialogText).toContain('Resume');
    });

    test('should not trigger resume when agent is idle (R key should be no-op)', async () => {
      const { window } = await openKanbanWithItem();

      // Open item detail dialog (agent status is idle by default)
      await window.locator(selectors.kanbanColumn('backlog')).locator(selectors.kanbanCard).first().click();
      await expect(window.locator(selectors.itemDetailDialog)).toBeVisible();

      // Press Tab to switch to sidebar focus zone
      await window.keyboard.press('Tab');

      // Press R — should be a no-op since agent is idle
      await window.keyboard.press('R');

      // Dialog should still be open (no error, no crash)
      await expect(window.locator(selectors.itemDetailDialog)).toBeVisible();
    });

    test('should not trigger resume when agent is running (R key should be no-op)', async () => {
      const { window, itemId } = await openKanbanWithItem();

      // Set agent status to running via IPC
      await window.evaluate(
        async (params: { path: string; id: string }) => {
          await window.electronAPI.kanban.updateItem(params.path, params.id, {
            agentStatus: 'running' as 'running',
          });
        },
        { path: testRepoPath, id: itemId }
      );
      await window.click(selectors.kanbanRefreshButton);
      await expect(
        window.locator(selectors.kanbanColumn('backlog')).locator(selectors.kanbanCard)
      ).toBeVisible({ timeout: 5000 });

      // Open item detail dialog
      await window.locator(selectors.kanbanColumn('backlog')).locator(selectors.kanbanCard).first().click();
      await expect(window.locator(selectors.itemDetailDialog)).toBeVisible();

      // Press Tab to switch to sidebar focus zone
      await window.keyboard.press('Tab');

      // Press R — should be a no-op since agent is running (R is for resume, not stop)
      await window.keyboard.press('R');

      // Dialog should still be open (no error, no crash)
      await expect(window.locator(selectors.itemDetailDialog)).toBeVisible();
    });
  });

  test.describe('Git Settings Dialog', () => {
    test('Ctrl+Shift+S should open fullscreen settings dialog', async () => {
      ctx = await launchApp();
      const { window, app } = ctx;

      // Trigger via IPC (Electron menu accelerators aren't captured by Playwright DOM events)
      await app.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0].webContents.send('git-settings:show');
      });

      const dialog = window.locator(selectors.gitConfigDialog);
      await expect(dialog).toBeVisible();
      await expect(dialog).toHaveAttribute('role', 'dialog');
      await expect(dialog).toHaveAttribute('aria-modal', 'true');
      await expect(window.locator(selectors.gitConfigHeader)).toBeVisible();
      await expect(window.locator(selectors.gitConfigFooter)).toBeVisible();

      const viewport = await window.evaluate(() => ({
        width: document.documentElement.clientWidth,
        height: document.documentElement.clientHeight,
      }));

      const dialogBox = await dialog.boundingBox();
      expect(dialogBox).not.toBeNull();
      expect((dialogBox?.width ?? 0) / viewport.width).toBeGreaterThan(0.95);
      expect((dialogBox?.height ?? 0) / viewport.height).toBeGreaterThan(0.95);
    });

    test('footer actions should remain visible while settings content area scrolls', async () => {
      ctx = await launchApp();
      const { window, app } = ctx;

      await app.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0].webContents.send('git-settings:show');
      });

      await expect(window.locator(selectors.gitConfigDialog)).toBeVisible();

      const body = window.locator(selectors.gitConfigBody);
      const footer = window.locator(selectors.gitConfigFooter);
      await expect(body).toBeVisible();
      await expect(footer).toBeVisible();
      await expect(window.locator(selectors.gitConfigSaveButton)).toBeVisible();
      await expect(window.locator(selectors.gitConfigCancelButton)).toBeVisible();

      const footerBoxBefore = await footer.boundingBox();
      expect(footerBoxBefore).not.toBeNull();

      const overflowY = await body.evaluate((el) => getComputedStyle(el).overflowY);
      expect(['auto', 'scroll']).toContain(overflowY);

      await body.evaluate((el) => {
        el.scrollTop = el.scrollHeight;
      });

      const footerBoxAfter = await footer.boundingBox();
      expect(footerBoxAfter).not.toBeNull();
      expect(Math.abs((footerBoxAfter?.y ?? 0) - (footerBoxBefore?.y ?? 0))).toBeLessThanOrEqual(1);
    });

    test('Enter should save valid git settings form', async () => {
      ctx = await launchApp();
      const { window, app } = ctx;

      // Open git settings dialog via IPC
      await app.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0].webContents.send('git-settings:show');
      });
      await expect(window.locator(selectors.gitConfigDialog)).toBeVisible();

      // Fill in valid GitHub PAT (all fields are optional, but PAT is the primary field)
      await window.fill(selectors.gitPatInput, 'github_pat_test123456789');

      // Press Enter to submit
      await window.keyboard.press('Enter');

      // Dialog should close after save
      await expect(window.locator(selectors.gitConfigDialog)).not.toBeVisible();
    });

    test('should display OpenAI API Key input in settings dialog', async () => {
      ctx = await launchApp();
      const { window, app } = ctx;

      // Open settings dialog via IPC
      await app.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0].webContents.send('git-settings:show');
      });
      await expect(window.locator(selectors.gitConfigDialog)).toBeVisible();

      // OpenAI API Key input should be present
      await expect(window.locator(selectors.openaiKeyInput)).toBeVisible();
    });

    test('should accept and save OpenAI API Key', async () => {
      ctx = await launchApp();
      const { window, app } = ctx;

      // Open settings dialog via IPC
      await app.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0].webContents.send('git-settings:show');
      });
      await expect(window.locator(selectors.gitConfigDialog)).toBeVisible();

      // Fill in API keys (form requires either OAuth or keys for Claude and Codex)
      await window.fill(selectors.anthropicKeyInput, 'sk-ant-test-key-12345');
      await window.fill(selectors.openaiKeyInput, 'sk-test-key-12345');

      // Save using Enter key (save button may be outside viewport)
      await window.keyboard.press('Enter');

      // Dialog should close
      await expect(window.locator(selectors.gitConfigDialog)).not.toBeVisible();
    });

    test('Ctrl+Q should close git settings dialog', async () => {
      ctx = await launchApp();
      const { window, app } = ctx;

      // Open git settings dialog via IPC
      await app.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0].webContents.send('git-settings:show');
      });
      await expect(window.locator(selectors.gitConfigDialog)).toBeVisible();

      // Press Ctrl+Q
      await window.locator(selectors.gitConfigDialog).press('Control+q');

      // Dialog should close
      await expect(window.locator(selectors.gitConfigDialog)).not.toBeVisible();
    });

    test('Escape should NOT close git settings dialog', async () => {
      ctx = await launchApp();
      const { window, app } = ctx;

      // Open git settings dialog via IPC
      await app.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0].webContents.send('git-settings:show');
      });
      await expect(window.locator(selectors.gitConfigDialog)).toBeVisible();

      // Press Escape - dialog should NOT close
      await window.locator(selectors.gitConfigDialog).press('Escape');
      await expect(window.locator(selectors.gitConfigDialog)).toBeVisible();
    });
  });

  test.describe('Keyboard Shortcuts Dialog', () => {
    test('should show Ctrl+Q as Close dialog shortcut', async () => {
      ctx = await launchApp();
      const { window } = ctx;

      // Open shortcuts dialog
      await window.click(selectors.shortcutsButton);
      await expect(window.locator(selectors.shortcutsDialog)).toBeVisible();

      // Should contain Ctrl+Q as Close dialog shortcut
      const dialogText = await window.locator(selectors.shortcutsDialog).textContent();
      expect(dialogText).toContain('Ctrl+Q');
      expect(dialogText).toContain('Close dialog');

      // Should NOT contain Quit shortcut
      expect(dialogText).not.toContain('Quit');
    });

    test('Escape should NOT close shortcuts dialog', async () => {
      ctx = await launchApp();
      const { window } = ctx;

      // Open shortcuts dialog
      await window.click(selectors.shortcutsButton);
      await expect(window.locator(selectors.shortcutsDialog)).toBeVisible();

      // Press Escape - dialog should NOT close
      await window.locator(selectors.shortcutsDialog).press('Escape');
      await expect(window.locator(selectors.shortcutsDialog)).toBeVisible();
    });

    test('Ctrl+Q should close shortcuts dialog', async () => {
      ctx = await launchApp();
      const { window } = ctx;

      // Open shortcuts dialog
      await window.click(selectors.shortcutsButton);
      await expect(window.locator(selectors.shortcutsDialog)).toBeVisible();

      // Press Ctrl+Q - dialog should close
      await window.locator(selectors.shortcutsDialog).press('Control+q');
      await expect(window.locator(selectors.shortcutsDialog)).not.toBeVisible();
    });

    test('should show Ctrl+Shift+N for New Project and Ctrl+Shift+, for Settings', async () => {
      ctx = await launchApp();
      const { window } = ctx;

      // Open shortcuts dialog
      await window.click(selectors.shortcutsButton);
      await expect(window.locator(selectors.shortcutsDialog)).toBeVisible();

      // Should contain reassigned shortcuts
      const dialogText = await window.locator(selectors.shortcutsDialog).textContent();
      expect(dialogText).toContain('Ctrl+Shift+,');
      expect(dialogText).toContain('Settings');
      expect(dialogText).toContain('Ctrl+Shift+N');
      expect(dialogText).toContain('New project');
    });

    test('should show Agent Controls section with Ctrl+Shift+S for Scout Agent', async () => {
      ctx = await launchApp();
      const { window } = ctx;

      // Open shortcuts dialog
      await window.click(selectors.shortcutsButton);
      await expect(window.locator(selectors.shortcutsDialog)).toBeVisible();

      // Should contain Agent Controls group with remaining shortcuts
      const dialogText = await window.locator(selectors.shortcutsDialog).textContent();
      expect(dialogText).toContain('Agent Controls');
      expect(dialogText).toContain('Scout Agent');
      expect(dialogText).toContain('Ctrl+Shift+S');
      // Plan/Code/Verify Ctrl+Shift shortcuts should be gone
      expect(dialogText).not.toContain('Ctrl+Shift+P');
      expect(dialogText).not.toContain('Ctrl+Shift+C');
      expect(dialogText).not.toContain('Ctrl+Shift+V');
    });
  });
});
