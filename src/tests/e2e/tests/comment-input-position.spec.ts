import { test, expect } from '@playwright/test';
import { launchApp, closeApp, createTestRepo, cleanupTestRepo, type AppContext } from '../helpers/app';
import { selectors } from '../helpers/selectors';
import * as os from 'os';

test.describe('Comment Input Position', () => {
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

  async function openKanbanBoard(): Promise<void> {
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
    await expect(page.locator(selectors.kanbanView)).toBeVisible({ timeout: 10000 });
  }

  async function createItemAndOpenDetail(title: string): Promise<void> {
    const page = ctx.window;

    // Create item via IPC
    await page.evaluate(
      async (params: { path: string; title: string }) => {
        return window.electronAPI.kanban.addItem(params.path, {
          title: params.title,
          description: 'Test description',
          agentProvider: 'claude' as const,
          order: 0,
        });
      },
      { path: testRepoPath, title }
    );

    await page.click(selectors.kanbanRefreshButton);
    await expect(
      page.locator(selectors.kanbanColumn('backlog')).locator(selectors.kanbanCard)
    ).toBeVisible({ timeout: 5000 });

    // Click the card to open detail dialog
    await page.locator(selectors.kanbanColumn('backlog')).locator(selectors.kanbanCard).first().click();
    await expect(page.locator(selectors.itemDetailDialog)).toBeVisible({ timeout: 5000 });
  }

  test('should render the comment-input textarea before the comments list in the DOM', async () => {
    await openKanbanBoard();
    await createItemAndOpenDetail('Test item for comment position');

    const page = ctx.window;

    // Both elements should exist
    const commentInput = page.locator('[data-testid="comment-input"]');
    const commentsSection = page.locator('[data-testid="comments-section"]');
    await expect(commentInput).toBeVisible();
    await expect(commentsSection).toBeVisible();

    // Verify comment-input appears BEFORE comments-section in the DOM
    const inputBeforeComments = await page.evaluate(() => {
      const input = document.querySelector('[data-testid="comment-input"]');
      const comments = document.querySelector('[data-testid="comments-section"]');
      if (!input || !comments) return false;
      // compareDocumentPosition bit 4 = DOCUMENT_POSITION_FOLLOWING
      return (input.compareDocumentPosition(comments) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    });

    expect(inputBeforeComments).toBe(true);
  });

  test('should show a newly posted comment below the input area (newest-first order)', async () => {
    await openKanbanBoard();
    await createItemAndOpenDetail('Test item for comment order');

    const page = ctx.window;

    // Type a comment
    await page.fill('[data-testid="comment-input"]', 'First test comment');
    await page.click('[data-testid="comment-submit"]');

    // Wait for comment to appear
    await expect(page.locator('[data-testid="comments-section"]')).toContainText('First test comment', { timeout: 5000 });

    // Verify the comment appears after the input in the DOM
    const commentBelowInput = await page.evaluate(() => {
      const input = document.querySelector('[data-testid="comment-input"]');
      const commentsSection = document.querySelector('[data-testid="comments-section"]');
      if (!input || !commentsSection) return false;
      return (input.compareDocumentPosition(commentsSection) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    });

    expect(commentBelowInput).toBe(true);
  });
});
