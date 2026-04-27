import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { launchApp, closeApp, createTestRepo, cleanupTestRepo, cleanupYoliumContainers, AppContext } from '../helpers/app';
import { selectors } from '../helpers/selectors';

test.describe('GitDiffDialog Keyboard Shortcuts', () => {
  let ctx: AppContext;
  let testRepoPath: string;

  test.beforeEach(async () => {
    testRepoPath = await createTestRepo(os.tmpdir());
    await cleanupYoliumContainers();
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

  function prepareFeatureBranch(files: Array<{ relativePath: string; content: string }>): void {
    execSync('git checkout -b feature/test', { cwd: testRepoPath });
    for (const file of files) {
      fs.mkdirSync(path.dirname(path.join(testRepoPath, file.relativePath)), { recursive: true });
      fs.writeFileSync(path.join(testRepoPath, file.relativePath), file.content);
    }
    execSync('git add .', { cwd: testRepoPath });
    execSync('git commit -m "Add diff fixtures"', { cwd: testRepoPath });
    execSync('git checkout main', { cwd: testRepoPath });
  }

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

    await window.click(selectors.openProjectButton);
    await window.fill(selectors.pathInput, testRepoPath);
    await window.click(selectors.pathNextButton);
    await window.waitForSelector('[data-testid="kanban-view"]', { timeout: 10000 });

    const item = await window.evaluate(
      async (repoPath: string) => {
        return window.electronAPI.kanban.addItem(repoPath, {
          title: 'Test Diff Item',
          description: 'Test description',
          agentProvider: 'claude' as const,
          order: 0,
        });
      },
      testRepoPath
    ) as { id: string };

    await window.evaluate(
      async (params: { path: string; id: string }) => {
        await window.electronAPI.kanban.updateItem(params.path, params.id, {
          agentStatus: 'completed',
          column: 'done',
          branch: 'feature/test',
          mergeStatus: 'unmerged',
          worktreePath: '/tmp/fake-worktree',
        });
      },
      { path: testRepoPath, id: item.id }
    );

    await window.click(selectors.kanbanRefreshButton);
    await expect(
      window.locator(selectors.kanbanColumn('done')).locator(selectors.kanbanCard)
    ).toBeVisible({ timeout: 5000 });

    await window.locator(selectors.kanbanColumn('done')).locator(selectors.kanbanCard).first().click();
    await expect(window.locator(selectors.itemDetailDialog)).toBeVisible();

    await window.click('[data-testid="compare-changes-button"]');
    await expect(window.locator(selectors.gitDiffDialog)).toBeVisible({ timeout: 5000 });
    await expect(window.locator('[data-testid^="diff-file-"]')).toHaveCount(1, { timeout: 5000 });
  }

  test('should close when pressing lowercase q', async () => {
    prepareFeatureBranch([{ relativePath: 'src/foo.ts', content: 'export const foo = 1;\n' }]);
    await openGitDiffDialog();
    const { window } = ctx;

    await window.keyboard.press('q');

    await expect(window.locator(selectors.gitDiffDialog)).not.toBeVisible();
  });

  test('should close when pressing uppercase Q', async () => {
    prepareFeatureBranch([{ relativePath: 'src/foo.ts', content: 'export const foo = 1;\n' }]);
    await openGitDiffDialog();
    const { window } = ctx;

    await window.keyboard.press('Q');

    await expect(window.locator(selectors.gitDiffDialog)).not.toBeVisible();
  });

  test('should close when pressing Ctrl+Q', async () => {
    prepareFeatureBranch([{ relativePath: 'src/foo.ts', content: 'export const foo = 1;\n' }]);
    await openGitDiffDialog();
    const { window } = ctx;

    await window.keyboard.press('Control+q');

    await expect(window.locator(selectors.gitDiffDialog)).not.toBeVisible();
  });

  test('should show q shortcut hint in header', async () => {
    prepareFeatureBranch([{ relativePath: 'src/foo.ts', content: 'export const foo = 1;\n' }]);
    await openGitDiffDialog();
    const { window } = ctx;

    const dialogText = await window.locator(selectors.gitDiffDialog).textContent();
    expect(dialogText).toContain('q');
  });

  test('close button should still work', async () => {
    prepareFeatureBranch([{ relativePath: 'src/foo.ts', content: 'export const foo = 1;\n' }]);
    await openGitDiffDialog();
    const { window } = ctx;

    await window.click(selectors.diffDialogClose);

    await expect(window.locator(selectors.gitDiffDialog)).not.toBeVisible();
  });
});
