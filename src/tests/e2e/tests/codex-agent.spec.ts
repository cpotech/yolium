import { test, expect } from '@playwright/test';
import { launchApp, closeApp, createTestRepo, cleanupTestRepo, cleanupYoliumContainers, AppContext } from '../helpers/app';
import { selectors } from '../helpers/selectors';
import os from 'os';

test.describe('Codex Agent Feature', () => {
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

  test.describe('Agent Select Dialog - Codex Option', () => {
    test('should display Codex as 3rd agent option', async () => {
      ctx = await launchApp();
      const { window } = ctx;

      // Navigate to agent dialog
      await window.click(selectors.newTabButton);
      await window.fill(selectors.pathInput, testRepoPath);
      await window.click(selectors.pathNextButton);
      await expect(window.locator(selectors.agentDialog)).toBeVisible();

      // Codex option should be visible
      const codexOption = window.locator(selectors.agentOption('codex'));
      await expect(codexOption).toBeVisible();
      await expect(codexOption).toContainText('Codex');
      await expect(codexOption).toContainText('OpenAI');
    });

    test('should show keyboard shortcut 3 for Codex', async () => {
      ctx = await launchApp();
      const { window } = ctx;

      // Navigate to agent dialog
      await window.click(selectors.newTabButton);
      await window.fill(selectors.pathInput, testRepoPath);
      await window.click(selectors.pathNextButton);
      await expect(window.locator(selectors.agentDialog)).toBeVisible();

      // Codex option should show shortcut '3'
      const codexOption = window.locator(selectors.agentOption('codex'));
      await expect(codexOption).toContainText('3');
    });

    test('should show keyboard shortcut 4 for Shell (interactive container)', async () => {
      ctx = await launchApp();
      const { window } = ctx;

      // Navigate to agent dialog
      await window.click(selectors.newTabButton);
      await window.fill(selectors.pathInput, testRepoPath);
      await window.click(selectors.pathNextButton);
      await expect(window.locator(selectors.agentDialog)).toBeVisible();

      // Shell option should show shortcut '4' (shell is still available for interactive containers)
      const shellOption = window.locator(selectors.agentOption('shell'));
      await expect(shellOption).toContainText('4');
    });

    test('pressing key 3 should select Codex agent', async () => {
      ctx = await launchApp();
      const { window } = ctx;

      // Navigate to agent dialog
      await window.click(selectors.newTabButton);
      await window.fill(selectors.pathInput, testRepoPath);
      await window.click(selectors.pathNextButton);
      await expect(window.locator(selectors.agentDialog)).toBeVisible();

      // Click the dialog overlay to ensure it has focus for key events
      await window.locator(selectors.agentDialog).click();
      await window.waitForTimeout(100);

      // Press '3' to select Codex
      await window.keyboard.press('3');

      // Codex option should be highlighted (has ring-2 class when selected)
      const codexOption = window.locator(selectors.agentOption('codex'));
      await expect(codexOption).toHaveClass(/bg-blue-600/);
    });

    test('pressing key 4 should select Shell agent', async () => {
      ctx = await launchApp();
      const { window } = ctx;

      // Navigate to agent dialog
      await window.click(selectors.newTabButton);
      await window.fill(selectors.pathInput, testRepoPath);
      await window.click(selectors.pathNextButton);
      await expect(window.locator(selectors.agentDialog)).toBeVisible();

      // Click the dialog overlay to ensure it has focus for key events
      await window.locator(selectors.agentDialog).click();
      await window.waitForTimeout(100);

      // Press '4' to select Shell
      await window.keyboard.press('4');

      // Shell option should be highlighted
      const shellOption = window.locator(selectors.agentOption('shell'));
      await expect(shellOption).toHaveClass(/bg-blue-600/);
    });

    test('clicking Codex option should select it', async () => {
      ctx = await launchApp();
      const { window } = ctx;

      // Navigate to agent dialog
      await window.click(selectors.newTabButton);
      await window.fill(selectors.pathInput, testRepoPath);
      await window.click(selectors.pathNextButton);
      await expect(window.locator(selectors.agentDialog)).toBeVisible();

      // Click Codex option
      await window.click(selectors.agentOption('codex'));

      // Codex should be selected (highlighted)
      const codexOption = window.locator(selectors.agentOption('codex'));
      await expect(codexOption).toHaveClass(/bg-blue-600/);

      // Claude should NOT be selected
      const claudeOption = window.locator(selectors.agentOption('claude'));
      await expect(claudeOption).not.toHaveClass(/bg-blue-600/);
    });

    test('all four agent options should be visible', async () => {
      ctx = await launchApp();
      const { window } = ctx;

      // Navigate to agent dialog
      await window.click(selectors.newTabButton);
      await window.fill(selectors.pathInput, testRepoPath);
      await window.click(selectors.pathNextButton);
      await expect(window.locator(selectors.agentDialog)).toBeVisible();

      // All four agents should be present
      await expect(window.locator(selectors.agentOption('claude'))).toBeVisible();
      await expect(window.locator(selectors.agentOption('opencode'))).toBeVisible();
      await expect(window.locator(selectors.agentOption('codex'))).toBeVisible();
      await expect(window.locator(selectors.agentOption('shell'))).toBeVisible();
    });

    test('GSD toggle should NOT appear when Codex is selected', async () => {
      ctx = await launchApp();
      const { window } = ctx;

      // Navigate to agent dialog
      await window.click(selectors.newTabButton);
      await window.fill(selectors.pathInput, testRepoPath);
      await window.click(selectors.pathNextButton);
      await expect(window.locator(selectors.agentDialog)).toBeVisible();

      // Select Codex
      await window.click(selectors.agentOption('codex'));

      // GSD toggle should NOT be visible (only shows for Claude)
      await expect(window.locator(selectors.gsdToggle)).not.toBeVisible();
    });
  });

});
