import { test, expect } from '@playwright/test';
import { launchApp, closeApp, createTestRepo, cleanupTestRepo, cleanupYoliumContainers, AppContext } from '../helpers/app';
import { selectors } from '../helpers/selectors';
import os from 'os';

test.describe('GitDiffDialog Keyboard Shortcuts', () => {
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

  async function openGitDiffDialog(): Promise<void> {
    ctx = await launchApp();
    const { window } = ctx;

    await window.evaluate(() => {
      localStorage.removeItem('yolium-sidebar-projects');
      localStorage.removeItem('yolium-open-kanban-tabs');
    });
    await window.reload();
    await window.waitForLoadState('domcontentloaded');
    await window.waitForSelector(
      '[data-testid="empty-state"], [data-testid="docker-setup-dialog"], [data-testid="tab-bar"]',
      { timeout: 30000 }
    );

    await window.click(selectors.addProjectButton);
    await window.fill(selectors.pathInput, testRepoPath);
    await window.click(selectors.pathNextButton);
    await window.waitForSelector('[data-testid="kanban-view"]', { timeout: 10000 });

    const item = await window.evaluate(
      async (params: { path: string }) => {
        return window.electronAPI.kanban.addItem(params.path, {
          title: 'Test Diff Item',
          description: 'Test description',
          agentProvider: 'claude' as 'claude' | 'codex' | 'opencode',
          order: 0,
        });
      },
      { path: testRepoPath }
    ) as { id: string };

    await window.click(selectors.kanbanRefreshButton);
    await expect(
      window.locator(selectors.kanbanColumn('backlog')).locator(selectors.kanbanCard)
    ).toBeVisible({ timeout: 5000 });

    // Open item detail dialog
    await window.locator(selectors.kanbanColumn('backlog')).locator(selectors.kanbanCard).first().click();
    await expect(window.locator(selectors.itemDetailDialog)).toBeVisible();

    // Trigger git diff dialog via IPC
    await window.evaluate(
      async (params: { itemId: string }) => {
        window.electronAPI.kanban.updateItem(params.itemId, {
          agentStatus: 'completed' as 'completed',
          branchName: 'feature/test',
        });
        window.electronAPI.tab.openGitDiff({
          itemId: params.itemId,
          branchName: 'feature/test',
          baseBranch: 'main',
          projectPath: testRepoPath,
        });
      },
      { itemId: item.id }
    );

    // Wait for git diff dialog to open
    await expect(window.locator(selectors.gitDiffDialog)).toBeVisible({ timeout: 5000 });
  }

  test('should close when pressing lowercase q', async () => {
    await openGitDiffDialog();
    const { window } = ctx;

    await window.keyboard.press('q');

    await expect(window.locator(selectors.gitDiffDialog)).not.toBeVisible();
  });

  test('should close when pressing uppercase Q', async () => {
    await openGitDiffDialog();
    const { window } = ctx;

    await window.keyboard.press('Q');

    await expect(window.locator(selectors.gitDiffDialog)).not.toBeVisible();
  });

  test('should close when pressing Ctrl+Q', async () => {
    await openGitDiffDialog();
    const { window } = ctx;

    await window.keyboard.press('Control+q');

    await expect(window.locator(selectors.gitDiffDialog)).not.toBeVisible();
  });

  test('should show q shortcut hint in header', async () => {
    await openGitDiffDialog();
    const { window } = ctx;

    const dialogText = await window.locator(selectors.gitDiffDialog).textContent();
    expect(dialogText).toContain('q');
  });

  test('close button should still work', async () => {
    await openGitDiffDialog();
    const { window } = ctx;

    await window.click(selectors.diffDialogClose);

    await expect(window.locator(selectors.gitDiffDialog)).not.toBeVisible();
  });
});
