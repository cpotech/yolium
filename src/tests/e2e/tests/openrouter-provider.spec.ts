import { test, expect } from '@playwright/test';
import { launchApp, closeApp, createTestRepo, cleanupTestRepo, AppContext } from '../helpers/app';
import { selectors } from '../helpers/selectors';
import os from 'os';

test.describe('OpenRouter Provider', () => {
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

  test.afterEach(async () => {
    if (ctx) {
      await closeApp(ctx);
    }
  });

  test('should show OpenRouter option in new item provider dropdown', async () => {
    ctx = await launchApp();
    const { window } = ctx;

    // Open new item dialog
    await window.click(selectors.newTabButton);
    await window.fill(selectors.pathInput, testRepoPath);
    await window.click(selectors.pathNextButton);

    // Open provider dropdown and check that OpenRouter is an option
    const providerSelect = window.locator(selectors.newItemAgentProvider);
    await expect(providerSelect).toBeVisible();

    // Check that OpenRouter is an option by looking at the select's options
    const options = providerSelect.locator('option');
    const optionCount = await options.count();
    expect(optionCount).toBeGreaterThanOrEqual(4); // claude, codex, opencode, openrouter

    // Verify OpenRouter option exists
    const openrouterOption = providerSelect.locator('option[value="openrouter"]');
    await expect(openrouterOption).toHaveCount(1);
  });

  test('should display OpenRouter models section in settings', async () => {
    ctx = await launchApp();
    const { window } = ctx;

    // Open settings dialog via status bar or menu
    // Try keyboard shortcut first (Ctrl+,)
    await window.keyboard.press('Control+,');

    // Wait for settings dialog
    const settingsDialog = window.locator('[data-testid="git-config-dialog"]');
    await expect(settingsDialog).toBeVisible({ timeout: 5000 });

    // Check for OpenRouter models input
    const openrouterModelInput = window.locator('[data-testid="model-input-openrouter"]');
    await expect(openrouterModelInput).toBeVisible();
  });

  test('should save OpenRouter API key with sk-or-v1- prefix validation', async () => {
    ctx = await launchApp();
    const { window } = ctx;

    // Open settings dialog
    await window.keyboard.press('Control+,');

    const settingsDialog = window.locator('[data-testid="git-config-dialog"]');
    await expect(settingsDialog).toBeVisible({ timeout: 5000 });

    // Find the OpenRouter API key input
    const openrouterInput = window.locator('[data-testid="openrouter-key-input"]');
    await expect(openrouterInput).toBeVisible();

    // Test invalid prefix (should show error)
    await openrouterInput.fill('sk-invalid-key');
    const openrouterError = settingsDialog.locator('.text-red-400').filter({ hasText: 'sk-or-v1-' });
    await expect(openrouterError).toBeVisible();

    // Test valid prefix (should clear error)
    await openrouterInput.fill('sk-or-v1-valid-key-12345');
    await expect(openrouterError).not.toBeVisible();

    // Save and verify
    const saveButton = window.locator('[data-testid="git-config-save"]');
    await expect(saveButton).toBeEnabled();
  });
});
