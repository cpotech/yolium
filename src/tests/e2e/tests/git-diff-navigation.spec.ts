import { test, expect } from '@playwright/test';
import { launchApp, closeApp, createTestRepo, cleanupTestRepo, type AppContext } from '../helpers/app';
import { selectors } from '../helpers/selectors';
import * as os from 'os';
import path from 'path';
import fs from 'fs';

test.describe('Git Diff Dialog Navigation', () => {
  let ctx: AppContext;
  let testRepoPath: string;

  test.beforeAll(async () => {
    testRepoPath = await createTestRepo(os.tmpdir());
  });

  test.afterEach(async () => {
    if (ctx) {
      await closeApp(ctx);
      ctx = undefined as unknown as AppContext;
    }
  });

  test.afterAll(async () => {
    if (testRepoPath) {
      await cleanupTestRepo(testRepoPath);
    }
  });

  async function openGitDiffDialog(): Promise<void> {
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

    await page.click(selectors.addProjectButton);
    await page.fill(selectors.pathInput, testRepoPath);
    await page.click(selectors.pathNextButton);
    await page.waitForSelector('[data-testid="kanban-view"]', { timeout: 10000 });

    const item = await page.evaluate(
      async ({ repoPath }: { repoPath: string }) => {
        return window.electronAPI.kanban.addItem(repoPath, {
          title: 'Test Diff Navigation',
          description: 'Testing j/k in git diff dialog',
          agentProvider: 'claude' as const,
          order: 0,
        });
      },
      { repoPath: testRepoPath }
    ) as { id: string };

    await page.click(selectors.kanbanRefreshButton);
    await expect(
      page.locator(selectors.kanbanColumn('backlog')).locator(selectors.kanbanCard)
    ).toBeVisible({ timeout: 5000 });

    await page.locator(selectors.kanbanColumn('backlog')).locator(selectors.kanbanCard).first().click();
    await expect(page.locator(selectors.itemDetailDialog)).toBeVisible();

    await page.keyboard.press('Tab');
    await page.keyboard.press('f');
    await expect(page.locator('[data-testid="git-diff-dialog"]')).toBeVisible({ timeout: 5000 });
  }

  test('j key should navigate to next file in diff dialog', async () => {
    const barPath = path.join(testRepoPath, 'bar.ts');
    fs.writeFileSync(barPath, 'export const bar = 2;\n');

    ctx = await launchApp();
    await openGitDiffDialog();
    const page = ctx.window;

    const firstFile = page.locator('[data-testid^="diff-file-"]').first();
    const firstFileName = await firstFile.getAttribute('data-testid');

    await page.keyboard.press('j');

    const newFirstFile = page.locator('[data-testid^="diff-file-"]').first();
    const newFileName = await newFirstFile.getAttribute('data-testid');
    expect(newFileName).not.toBe(firstFileName);
  });

  test('k key should navigate to previous file in diff dialog', async () => {
    const barPath = path.join(testRepoPath, 'bar.ts');
    fs.writeFileSync(barPath, 'export const bar = 2;\n');

    ctx = await launchApp();
    await openGitDiffDialog();
    const page = ctx.window;

    await page.keyboard.press('j');
    const afterJFile = page.locator('[data-testid^="diff-file-"]').first();
    const afterJName = await afterJFile.getAttribute('data-testid');

    await page.keyboard.press('k');
    const afterKFile = page.locator('[data-testid^="diff-file-"]').first();
    const afterKName = await afterKFile.getAttribute('data-testid');
    expect(afterKName).toBe(afterJName);
  });

  test('Ctrl+Q should close the diff dialog', async () => {
    ctx = await launchApp();
    await openGitDiffDialog();
    const page = ctx.window;

    await page.keyboard.press('Control+q');
    await expect(page.locator('[data-testid="git-diff-dialog"]')).not.toBeVisible();
  });

  test('j key should wrap from last file to first file', async () => {
    const barPath = path.join(testRepoPath, 'bar.ts');
    const bazPath = path.join(testRepoPath, 'baz.ts');
    fs.writeFileSync(barPath, 'export const bar = 2;\n');
    fs.writeFileSync(bazPath, 'export const baz = 3;\n');

    ctx = await launchApp();
    await openGitDiffDialog();
    const page = ctx.window;

    const firstFileBefore = page.locator('[data-testid^="diff-file-"]').first();
    const firstNameBefore = await firstFileBefore.getAttribute('data-testid');

    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('j');
    }

    const firstFileAfter = page.locator('[data-testid^="diff-file-"]').first();
    const firstNameAfter = await firstFileAfter.getAttribute('data-testid');
    expect(firstNameAfter).toBe(firstNameBefore);
  });
});
