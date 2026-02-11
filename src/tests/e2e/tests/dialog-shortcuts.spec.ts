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
    test('Escape in agent dialog should go back to path dialog', async () => {
      ctx = await launchApp();
      const { window } = ctx;

      // Navigate to agent dialog
      await window.click(selectors.newTabButton);
      await window.fill(selectors.pathInput, testRepoPath);
      await window.click(selectors.pathNextButton);
      await expect(window.locator(selectors.agentDialog)).toBeVisible();

      // Press Escape - should go back to path dialog, not cancel
      await window.keyboard.press('Escape');

      // Agent dialog should close
      await expect(window.locator(selectors.agentDialog)).not.toBeVisible();

      // Path dialog should reopen (not cancelled)
      await expect(window.locator(selectors.pathDialog)).toBeVisible();
    });

    test('Back button should show Esc shortcut hint, not backspace', async () => {
      ctx = await launchApp();
      const { window } = ctx;

      // Navigate to agent dialog
      await window.click(selectors.newTabButton);
      await window.fill(selectors.pathInput, testRepoPath);
      await window.click(selectors.pathNextButton);
      await expect(window.locator(selectors.agentDialog)).toBeVisible();

      // Back button should show Esc hint
      const backButton = window.locator(selectors.agentBackButton);
      await expect(backButton).toBeVisible();
      // Should contain "Esc" not backspace symbol
      await expect(backButton).toContainText('Esc');
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

      const viewport = window.viewportSize();
      expect(viewport).not.toBeNull();

      const dialogBox = await dialog.boundingBox();
      expect(dialogBox).not.toBeNull();
      expect(Math.abs((dialogBox?.width ?? 0) - (viewport?.width ?? 0))).toBeLessThanOrEqual(2);
      expect(Math.abs((dialogBox?.height ?? 0) - (viewport?.height ?? 0))).toBeLessThanOrEqual(2);
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

      const overflowY = await body.evaluate((el) => window.getComputedStyle(el).overflowY);
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

    test('Escape should close git settings dialog', async () => {
      ctx = await launchApp();
      const { window, app } = ctx;

      // Open git settings dialog via IPC
      await app.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0].webContents.send('git-settings:show');
      });
      await expect(window.locator(selectors.gitConfigDialog)).toBeVisible();

      // Press Escape
      await window.keyboard.press('Escape');

      // Dialog should close
      await expect(window.locator(selectors.gitConfigDialog)).not.toBeVisible();
    });
  });

  test.describe('Keyboard Shortcuts Dialog', () => {
    test('should not show Ctrl+Q quit shortcut', async () => {
      ctx = await launchApp();
      const { window } = ctx;

      // Open shortcuts dialog
      await window.click(selectors.shortcutsButton);
      await expect(window.locator(selectors.shortcutsDialog)).toBeVisible();

      // Should not contain quit shortcut
      const dialogText = await window.locator(selectors.shortcutsDialog).textContent();
      expect(dialogText).not.toContain('Ctrl+Q');
      expect(dialogText).not.toContain('Ctrl+Alt+Shift+Q');
      expect(dialogText).not.toContain('Quit');
    });

    test('should show Ctrl+Shift+S for Settings and Ctrl+Shift+P for New Project', async () => {
      ctx = await launchApp();
      const { window } = ctx;

      // Open shortcuts dialog
      await window.click(selectors.shortcutsButton);
      await expect(window.locator(selectors.shortcutsDialog)).toBeVisible();

      // Should contain settings and new project shortcuts
      const dialogText = await window.locator(selectors.shortcutsDialog).textContent();
      expect(dialogText).toContain('Ctrl+Shift+S');
      expect(dialogText).toContain('Settings');
      expect(dialogText).toContain('Ctrl+Shift+P');
      expect(dialogText).toContain('New project');
    });
  });
});
