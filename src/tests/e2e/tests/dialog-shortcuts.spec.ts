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
    test('Ctrl+Shift+G should open git settings dialog', async () => {
      ctx = await launchApp();
      const { window, app } = ctx;

      // Trigger via IPC (Electron menu accelerators aren't captured by Playwright DOM events)
      await app.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0].webContents.send('git-settings:show');
      });

      // Git config dialog should open
      await expect(window.locator(selectors.gitConfigDialog)).toBeVisible();
    });

    test('Enter should save valid git settings form', async () => {
      ctx = await launchApp();
      const { window, app } = ctx;

      // Open git settings dialog via IPC
      await app.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0].webContents.send('git-settings:show');
      });
      await expect(window.locator(selectors.gitConfigDialog)).toBeVisible();

      // Fill in valid values
      await window.fill(selectors.gitNameInput, 'Test User');
      await window.fill(selectors.gitEmailInput, 'test@example.com');

      // Press Enter to submit
      await window.keyboard.press('Enter');

      // Dialog should close after save
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

    test('should show Ctrl+Shift+G for Git Settings', async () => {
      ctx = await launchApp();
      const { window } = ctx;

      // Open shortcuts dialog
      await window.click(selectors.shortcutsButton);
      await expect(window.locator(selectors.shortcutsDialog)).toBeVisible();

      // Should contain git settings shortcut
      const dialogText = await window.locator(selectors.shortcutsDialog).textContent();
      expect(dialogText).toContain('Ctrl+Shift+G');
      expect(dialogText).toContain('Git');
    });
  });
});
