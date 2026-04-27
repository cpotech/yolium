import { test, expect, Page } from '@playwright/test';
import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { launchApp, closeApp, createTestRepo, cleanupTestRepo, type AppContext } from '../helpers/app';
import { selectors } from '../helpers/selectors';

test.describe('Git Diff Dialog Navigation', () => {
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

  function prepareFeatureBranch(files: Array<{ relativePath: string; content: string }>): void {
    execSync('git checkout -b feature/test', { cwd: testRepoPath });
    for (const file of files) {
      fs.mkdirSync(path.dirname(path.join(testRepoPath, file.relativePath)), { recursive: true });
      fs.writeFileSync(path.join(testRepoPath, file.relativePath), file.content);
    }
    execSync('git add .', { cwd: testRepoPath });
    execSync('git commit -m "Add diff navigation fixtures"', { cwd: testRepoPath });
    execSync('git checkout main', { cwd: testRepoPath });
  }

  async function openGitDiffDialog(): Promise<Page> {
    ctx = await launchApp();
    const page = ctx.window;

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

    await page.click(selectors.openProjectButton);
    await page.fill(selectors.pathInput, testRepoPath);
    await page.click(selectors.pathNextButton);
    await page.waitForSelector('[data-testid="kanban-view"]', { timeout: 10000 });

    const item = await page.evaluate(
      async (repoPath: string) => {
        return window.electronAPI.kanban.addItem(repoPath, {
          title: 'Test Diff Navigation',
          description: 'Testing j/k in git diff dialog',
          agentProvider: 'claude' as const,
          order: 0,
        });
      },
      testRepoPath
    ) as { id: string };

    await page.evaluate(
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

    await page.click(selectors.kanbanRefreshButton);
    await expect(
      page.locator(selectors.kanbanColumn('done')).locator(selectors.kanbanCard)
    ).toBeVisible({ timeout: 5000 });

    await page.locator(selectors.kanbanColumn('done')).locator(selectors.kanbanCard).first().click();
    await expect(page.locator(selectors.itemDetailDialog)).toBeVisible();

    await page.click('[data-testid="compare-changes-button"]');
    await expect(page.locator(selectors.gitDiffDialog)).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-testid^="diff-file-"]')).toHaveCount(3, { timeout: 5000 });

    return page;
  }

  async function getFocusedFileId(page: Page): Promise<string | null> {
    return page.locator('[data-testid^="diff-file-"][class*="ring-1"]').getAttribute('data-testid');
  }

  test('j key should navigate to next file in diff dialog', async () => {
    prepareFeatureBranch([
      { relativePath: 'alpha.ts', content: 'export const alpha = 1;\n' },
      { relativePath: 'beta.ts', content: 'export const beta = 2;\n' },
      { relativePath: 'gamma.ts', content: 'export const gamma = 3;\n' },
    ]);

    const page = await openGitDiffDialog();
    const initialFocused = await getFocusedFileId(page);

    await page.keyboard.press('j');

    const nextFocused = await getFocusedFileId(page);
    expect(nextFocused).not.toBe(initialFocused);
  });

  test('k key should navigate to previous file in diff dialog', async () => {
    prepareFeatureBranch([
      { relativePath: 'alpha.ts', content: 'export const alpha = 1;\n' },
      { relativePath: 'beta.ts', content: 'export const beta = 2;\n' },
      { relativePath: 'gamma.ts', content: 'export const gamma = 3;\n' },
    ]);

    const page = await openGitDiffDialog();
    const initialFocused = await getFocusedFileId(page);

    await page.keyboard.press('j');
    await page.keyboard.press('k');

    const focusedAfterReturning = await getFocusedFileId(page);
    expect(focusedAfterReturning).toBe(initialFocused);
  });

  test('Ctrl+Q should close the diff dialog', async () => {
    prepareFeatureBranch([
      { relativePath: 'alpha.ts', content: 'export const alpha = 1;\n' },
      { relativePath: 'beta.ts', content: 'export const beta = 2;\n' },
      { relativePath: 'gamma.ts', content: 'export const gamma = 3;\n' },
    ]);

    const page = await openGitDiffDialog();

    await page.keyboard.press('Control+q');
    await expect(page.locator(selectors.gitDiffDialog)).not.toBeVisible();
  });

  test('j key should wrap from last file to first file', async () => {
    prepareFeatureBranch([
      { relativePath: 'alpha.ts', content: 'export const alpha = 1;\n' },
      { relativePath: 'beta.ts', content: 'export const beta = 2;\n' },
      { relativePath: 'gamma.ts', content: 'export const gamma = 3;\n' },
    ]);

    const page = await openGitDiffDialog();
    const initialFocused = await getFocusedFileId(page);

    await page.keyboard.press('j');
    await page.keyboard.press('j');
    await page.keyboard.press('j');

    const wrappedFocused = await getFocusedFileId(page);
    expect(wrappedFocused).toBe(initialFocused);
  });
});
