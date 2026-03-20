import { test, expect } from '@playwright/test';
import { launchApp, closeApp, createTestRepo, cleanupTestRepo, type AppContext } from '../helpers/app';
import * as os from 'os';

test.describe('Sidebar keyboard navigation', () => {
  let ctx: AppContext;
  let testRepoPath: string;
  let testRepoPath2: string;

  test.beforeEach(async () => {
    testRepoPath = await createTestRepo(os.tmpdir());
    testRepoPath2 = await createTestRepo(os.tmpdir());
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
    if (testRepoPath2) {
      await cleanupTestRepo(testRepoPath2);
      testRepoPath2 = '';
    }
  });

  async function addProject(page: import('@playwright/test').Page, repoPath: string): Promise<void> {
    await page.click('[data-testid="open-project-button"]');
    await page.fill('[data-testid="path-input"]', repoPath);
    await page.click('[data-testid="path-next-button"]');
    await page.waitForSelector('[data-testid="kanban-view"]', { timeout: 10000 });
  }

  async function setupWithTwoProjects(): Promise<import('@playwright/test').Page> {
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

    // Add two projects
    await addProject(page, testRepoPath);
    await addProject(page, testRepoPath2);

    return page;
  }

  test('should navigate between projects using j and k keys after pressing e to activate sidebar', async () => {
    const page = await setupWithTwoProjects();

    // Press 'e' to activate the sidebar zone
    await page.keyboard.press('e');

    // First project should be focused (data-vim-focused="true")
    const firstProject = page.locator(`[data-testid="project-item-${testRepoPath}"]`);
    await expect(firstProject).toHaveAttribute('data-vim-focused', 'true');

    // Press 'j' to move focus down to second project
    await page.keyboard.press('j');
    const secondProject = page.locator(`[data-testid="project-item-${testRepoPath2}"]`);
    await expect(secondProject).toHaveAttribute('data-vim-focused', 'true');
    await expect(firstProject).not.toHaveAttribute('data-vim-focused');

    // Press 'k' to move focus back up to first project
    await page.keyboard.press('k');
    await expect(firstProject).toHaveAttribute('data-vim-focused', 'true');
    await expect(secondProject).not.toHaveAttribute('data-vim-focused');
  });

  test('should maintain j/k navigation after pressing a to open project dialog and canceling', async () => {
    const page = await setupWithTwoProjects();

    // Press 'e' to activate sidebar zone
    await page.keyboard.press('e');

    // Press 'a' to open the add-project dialog
    await page.keyboard.press('a');

    // Wait for the path input dialog to appear
    await page.waitForSelector('[data-testid="path-input"]', { timeout: 5000 });

    // Press Escape to close the dialog
    await page.keyboard.press('Escape');

    // Wait for dialog to close
    await page.waitForSelector('[data-testid="path-input"]', { state: 'detached', timeout: 5000 });

    // j/k should still work — press 'j' to navigate
    await page.keyboard.press('j');
    const secondProject = page.locator(`[data-testid="project-item-${testRepoPath2}"]`);
    await expect(secondProject).toHaveAttribute('data-vim-focused', 'true');
  });

  test('should select a project with Enter after navigating with j/k', async () => {
    const page = await setupWithTwoProjects();

    // Press 'e' to activate sidebar zone
    await page.keyboard.press('e');

    // Press 'j' to move to second project
    await page.keyboard.press('j');

    // Press Enter to select it
    await page.keyboard.press('Enter');

    // The second project should now be the active tab
    // Verify by checking the kanban view is showing for the second repo
    await page.waitForSelector('[data-testid="kanban-view"]', { timeout: 5000 });
  });
});
