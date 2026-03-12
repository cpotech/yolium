import { test, expect } from '@playwright/test';
import { launchApp, closeApp, cleanupYoliumContainers, AppContext } from '../helpers/app';
import { selectors } from '../helpers/selectors';

test.describe('Speech-to-Text', () => {
  let ctx: AppContext;

  async function launchCleanApp(): Promise<void> {
    ctx = await launchApp();
    const { window } = ctx;
    await window.evaluate(() => {
      localStorage.removeItem('yolium-session');
      localStorage.removeItem('yolium-sidebar-projects');
      localStorage.removeItem('yolium-open-kanban-tabs');
    });
    await window.reload();
    await window.waitForLoadState('domcontentloaded');
    await window.waitForSelector('[data-testid="empty-state"], [data-testid="docker-setup-dialog"], [data-testid="tab-bar"]', {
      timeout: 30000,
    });
  }

  test.beforeEach(async () => {
    await cleanupYoliumContainers();
  });

  test.afterEach(async () => {
    if (ctx) {
      await closeApp(ctx);
    }
  });

  test.describe('Empty State Status Bar', () => {
    test('should show speech-to-text button with shortcut hint', async () => {
      await launchCleanApp();
      const { window } = ctx;

      await expect(window.locator(selectors.emptyState)).toBeVisible();
      const sttButton = window.locator(selectors.speechToTextButton);
      await expect(sttButton).toBeVisible();
      await expect(sttButton).toContainText('Ctrl+Shift+R');
    });

    test('should show model selector next to mic button', async () => {
      await launchCleanApp();
      const { window } = ctx;

      await expect(window.locator(selectors.emptyState)).toBeVisible();
      const modelSelect = window.locator(selectors.speechModelSelect);
      await expect(modelSelect).toBeVisible();
      // Default model is Small
      await expect(modelSelect).toContainText('Small');
    });

    test('should open model dialog from empty state status bar', async () => {
      await launchCleanApp();
      const { window } = ctx;

      await expect(window.locator(selectors.emptyState)).toBeVisible();
      await window.click(selectors.speechModelSelect);
      await expect(window.locator(selectors.whisperModelDialog)).toBeVisible();

      // Should show all three model options
      await expect(window.locator(selectors.whisperModel('small'))).toBeVisible();
      await expect(window.locator(selectors.whisperModel('medium'))).toBeVisible();
      await expect(window.locator(selectors.whisperModel('large'))).toBeVisible();
    });

    test('should not show speech-to-text elements in the main empty state content', async () => {
      await launchCleanApp();
      const { window } = ctx;

      await expect(window.locator(selectors.emptyState)).toBeVisible();
      // The empty state content area should not have a mic button (it moved to status bar)
      const emptyStateContent = window.locator(selectors.emptyState);
      await expect(emptyStateContent.locator('[data-testid="empty-state-mic"]')).not.toBeVisible();
    });
  });

  test.describe('Keyboard Shortcuts Dialog', () => {
    test('should list Ctrl+Shift+R for Toggle recording', async () => {
      ctx = await launchApp();
      const { window } = ctx;

      await window.locator(selectors.shortcutsButton).click();
      await expect(window.locator(selectors.shortcutsDialog)).toBeVisible();

      const dialogContent = await window.locator(selectors.shortcutsDialog).textContent();
      expect(dialogContent).toContain('Toggle recording');
      expect(dialogContent).toContain('Ctrl+Shift+R');
    });

    test('should not list Ctrl+R reload shortcut', async () => {
      ctx = await launchApp();
      const { window } = ctx;

      await window.locator(selectors.shortcutsButton).click();
      await expect(window.locator(selectors.shortcutsDialog)).toBeVisible();

      const dialogContent = await window.locator(selectors.shortcutsDialog).textContent();
      expect(dialogContent).not.toContain('Reload');
    });
  });

  test.describe('Whisper Model Dialog', () => {
    test('should open model dialog from status bar and close with Escape', async () => {
      test.skip(!!process.env.CI || process.env.YOLIUM_E2E_SKIP_DOCKER_TESTS === '1', 'Skipped in CI - requires Docker container');
      ctx = await launchApp();
      const { window } = ctx;

      // Open a tab first to get the terminal status bar
      await window.click(selectors.newTabButton);
      await window.fill(selectors.pathInput, '~/');
      await window.click(selectors.pathNextButton);
      await expect(window.locator(selectors.agentDialog)).toBeVisible();
      await window.locator(selectors.agentOption('shell')).click();
      await window.keyboard.press('Enter');

      // Wait for status bar to appear with speech button
      await expect(window.locator(selectors.speechModelSelect)).toBeVisible({ timeout: 15000 });

      // Click model selector to open dialog
      await window.click(selectors.speechModelSelect);
      await expect(window.locator(selectors.whisperModelDialog)).toBeVisible();

      // Should show all three model options
      await expect(window.locator(selectors.whisperModel('small'))).toBeVisible();
      await expect(window.locator(selectors.whisperModel('medium'))).toBeVisible();
      await expect(window.locator(selectors.whisperModel('large'))).toBeVisible();

      // Click the dialog to ensure focus, then close with Escape
      await window.locator(selectors.whisperModelDialog).click();
      await window.keyboard.press('Escape');
      await expect(window.locator(selectors.whisperModelDialog)).not.toBeVisible({ timeout: 3000 });
    });

    test('should open model dialog and close with Close button', async () => {
      test.skip(!!process.env.CI || process.env.YOLIUM_E2E_SKIP_DOCKER_TESTS === '1', 'Skipped in CI - requires Docker container');
      ctx = await launchApp();
      const { window } = ctx;

      // Open a tab to get the terminal status bar
      await window.click(selectors.newTabButton);
      await window.fill(selectors.pathInput, '~/');
      await window.click(selectors.pathNextButton);
      await expect(window.locator(selectors.agentDialog)).toBeVisible();
      await window.locator(selectors.agentOption('shell')).click();
      await window.keyboard.press('Enter');

      await expect(window.locator(selectors.speechModelSelect)).toBeVisible({ timeout: 15000 });

      // Open dialog
      await window.click(selectors.speechModelSelect);
      await expect(window.locator(selectors.whisperModelDialog)).toBeVisible();

      // Close with button
      await window.click(selectors.whisperModelClose);
      await expect(window.locator(selectors.whisperModelDialog)).not.toBeVisible();
    });

    test('should show model descriptions and sizes', async () => {
      await launchCleanApp();
      const { window } = ctx;

      // Open dialog from empty state status bar
      await expect(window.locator(selectors.emptyState)).toBeVisible();
      await window.click(selectors.speechModelSelect);
      await expect(window.locator(selectors.whisperModelDialog)).toBeVisible();

      // Check each model card has description text
      const smallCard = window.locator(selectors.whisperModel('small'));
      await expect(smallCard).toContainText('Fast');
      await expect(smallCard).toContainText('MB');

      const mediumCard = window.locator(selectors.whisperModel('medium'));
      await expect(mediumCard).toContainText('Balanced');

      const largeCard = window.locator(selectors.whisperModel('large'));
      await expect(largeCard).toContainText('Best accuracy');
    });

    test('should show Escape hint on Close button', async () => {
      await launchCleanApp();
      const { window } = ctx;

      await expect(window.locator(selectors.emptyState)).toBeVisible();
      await window.click(selectors.speechModelSelect);
      await expect(window.locator(selectors.whisperModelDialog)).toBeVisible();

      const closeButton = window.locator(selectors.whisperModelClose);
      await expect(closeButton).toContainText('Close');
      await expect(closeButton).toContainText('Esc');
    });

    test('should reopen model dialog after closing', async () => {
      await launchCleanApp();
      const { window } = ctx;

      await expect(window.locator(selectors.emptyState)).toBeVisible();

      // Open, close, reopen
      await window.click(selectors.speechModelSelect);
      await expect(window.locator(selectors.whisperModelDialog)).toBeVisible();
      await window.click(selectors.whisperModelClose);
      await expect(window.locator(selectors.whisperModelDialog)).not.toBeVisible();

      await window.click(selectors.speechModelSelect);
      await expect(window.locator(selectors.whisperModelDialog)).toBeVisible();
      await expect(window.locator(selectors.whisperModel('small'))).toBeVisible();
    });
  });

  test.describe('Speech-to-Text Button in Terminal Status Bar', () => {
    test('should show mic button and model selector', async () => {
      test.skip(!!process.env.CI || process.env.YOLIUM_E2E_SKIP_DOCKER_TESTS === '1', 'Skipped in CI - requires Docker container');
      ctx = await launchApp();
      const { window } = ctx;

      // Open a tab
      await window.click(selectors.newTabButton);
      await window.fill(selectors.pathInput, '~/');
      await window.click(selectors.pathNextButton);
      await expect(window.locator(selectors.agentDialog)).toBeVisible();
      await window.locator(selectors.agentOption('shell')).click();
      await window.keyboard.press('Enter');

      // Wait for status bar
      await expect(window.locator(selectors.statusBar)).toBeVisible({ timeout: 15000 });

      // Both the mic button and model selector should be visible
      await expect(window.locator(selectors.speechToTextButton)).toBeVisible();
      await expect(window.locator(selectors.speechModelSelect)).toBeVisible();
    });

    test('should show shortcut hint on mic button', async () => {
      test.skip(!!process.env.CI || process.env.YOLIUM_E2E_SKIP_DOCKER_TESTS === '1', 'Skipped in CI - requires Docker container');
      ctx = await launchApp();
      const { window } = ctx;

      await window.click(selectors.newTabButton);
      await window.fill(selectors.pathInput, '~/');
      await window.click(selectors.pathNextButton);
      await expect(window.locator(selectors.agentDialog)).toBeVisible();
      await window.locator(selectors.agentOption('shell')).click();
      await window.keyboard.press('Enter');

      await expect(window.locator(selectors.speechToTextButton)).toBeVisible({ timeout: 15000 });
      await expect(window.locator(selectors.speechToTextButton)).toContainText('Ctrl+Shift+R');
    });

    test('should show default model name in selector', async () => {
      test.skip(!!process.env.CI || process.env.YOLIUM_E2E_SKIP_DOCKER_TESTS === '1', 'Skipped in CI - requires Docker container');
      ctx = await launchApp();
      const { window } = ctx;

      await window.click(selectors.newTabButton);
      await window.fill(selectors.pathInput, '~/');
      await window.click(selectors.pathNextButton);
      await expect(window.locator(selectors.agentDialog)).toBeVisible();
      await window.locator(selectors.agentOption('shell')).click();
      await window.keyboard.press('Enter');

      await expect(window.locator(selectors.speechModelSelect)).toBeVisible({ timeout: 15000 });
      // Default model is Small
      await expect(window.locator(selectors.speechModelSelect)).toContainText('Small');
    });

    test('should open model dialog from terminal status bar model selector', async () => {
      test.skip(!!process.env.CI || process.env.YOLIUM_E2E_SKIP_DOCKER_TESTS === '1', 'Skipped in CI - requires Docker container');
      ctx = await launchApp();
      const { window } = ctx;

      await window.click(selectors.newTabButton);
      await window.fill(selectors.pathInput, '~/');
      await window.click(selectors.pathNextButton);
      await expect(window.locator(selectors.agentDialog)).toBeVisible();
      await window.locator(selectors.agentOption('shell')).click();
      await window.keyboard.press('Enter');

      await expect(window.locator(selectors.speechModelSelect)).toBeVisible({ timeout: 15000 });

      await window.click(selectors.speechModelSelect);
      await expect(window.locator(selectors.whisperModelDialog)).toBeVisible();

      // Verify dialog title
      const dialogText = await window.locator(selectors.whisperModelDialog).textContent();
      expect(dialogText).toContain('Speech-to-Text Models');
    });
  });
});
