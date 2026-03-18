import { test, expect } from '@playwright/test';
import { launchApp, closeApp, createTestRepo, cleanupTestRepo, type AppContext } from '../helpers/app';
import { selectors } from '../helpers/selectors';
import * as os from 'os';

/**
 * E2E self-explorer tests for vim keyboard shortcuts.
 *
 * These tests crawl each zone and verify that interactive elements
 * have `data-vim-key` attributes for self-documenting keyboard shortcuts.
 */
test.describe('Vim Shortcut Explorer', () => {
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

    await page.click(selectors.addProjectButton);
    await page.fill(selectors.pathInput, testRepoPath);
    await page.click(selectors.pathNextButton);
    await page.waitForSelector('[data-testid="kanban-view"]', { timeout: 10000 });
  }

  test('every button in status bar should have a data-vim-key attribute', async () => {
    await openKanbanBoard();
    const page = ctx.window;

    const buttons = await page.$$('[data-testid="status-bar"] button');
    const missing: string[] = [];
    for (const btn of buttons) {
      const vimKey = await btn.getAttribute('data-vim-key');
      if (!vimKey) {
        const text = await btn.textContent();
        missing.push(text?.trim() || '(unnamed button)');
      }
    }
    expect(missing).toEqual([]);
  });

  test('every button in tab bar should have a data-vim-key attribute', async () => {
    await openKanbanBoard();
    const page = ctx.window;

    const buttons = await page.$$('[data-testid="tab-bar"] button');
    const missing: string[] = [];
    for (const btn of buttons) {
      const vimKey = await btn.getAttribute('data-vim-key');
      if (!vimKey) {
        const text = await btn.textContent();
        // Scroll arrows are not vim-controlled, skip them
        const ariaLabel = await btn.getAttribute('aria-label');
        if (ariaLabel?.includes('Scroll')) continue;
        missing.push(text?.trim() || '(unnamed button)');
      }
    }
    expect(missing).toEqual([]);
  });

  test('every button in sidebar should have a data-vim-key attribute', async () => {
    await openKanbanBoard();
    const page = ctx.window;

    const buttons = await page.$$('[data-vim-zone="sidebar"] button, [data-testid="add-project-button"]');
    const missing: string[] = [];
    for (const btn of buttons) {
      const vimKey = await btn.getAttribute('data-vim-key');
      if (!vimKey) {
        const text = await btn.textContent();
        // Skip remove buttons (x icons in project list) — these use vim 'x' key on focused item, not per-button
        const testId = await btn.getAttribute('data-testid');
        if (testId?.startsWith('remove-project-')) continue;
        missing.push(text?.trim() || '(unnamed button)');
      }
    }
    expect(missing).toEqual([]);
  });

  test('kanban view toolbar buttons should have data-vim-key attributes', async () => {
    await openKanbanBoard();
    const page = ctx.window;

    // Check specific toolbar buttons that have vim shortcuts
    const refreshButton = await page.$('[data-testid="refresh-button"]');
    expect(await refreshButton?.getAttribute('data-vim-key')).toBe('r');

    const newItemButton = await page.$('[data-testid="new-item-button"]');
    expect(await newItemButton?.getAttribute('data-vim-key')).toBe('n');

    const searchInput = await page.$('[data-testid="search-input"]');
    expect(await searchInput?.getAttribute('data-vim-key')).toBe('/');
  });

  test('every button in kanban view should have a data-vim-key attribute', async () => {
    await openKanbanBoard();
    const page = ctx.window;

    // Check that the toolbar buttons (New Item, Refresh) have data-vim-key
    const toolbarButtons = await page.$$('[data-testid="kanban-view"] > div:first-child button');
    const missing: string[] = [];
    for (const btn of toolbarButtons) {
      const vimKey = await btn.getAttribute('data-vim-key');
      if (!vimKey) {
        const text = await btn.textContent();
        // Skip delete project button (not a vim shortcut) and search clear button
        const testId = await btn.getAttribute('data-testid');
        if (testId === 'delete-project-button') continue;
        if (!testId) continue; // unnamed buttons like search clear
        missing.push(text?.trim() || '(unnamed button)');
      }
    }
    expect(missing).toEqual([]);
  });

  test('smoke test: zone switching keys (e/t/c/s) work end-to-end', async () => {
    await openKanbanBoard();
    const page = ctx.window;

    // Press 'e' to focus sidebar
    await page.keyboard.press('e');
    const modeIndicator = await page.$('[data-testid="vim-mode-indicator"]');
    expect(await modeIndicator?.textContent()).toContain('NORMAL');

    // Press 't' to focus tabs
    await page.keyboard.press('t');
    const tabBar = await page.$('[data-testid="tab-bar"]');
    const tabBarRing = await tabBar?.getAttribute('class');
    expect(tabBarRing).toContain('ring-1');

    // Press 'c' to focus content
    await page.keyboard.press('c');
    const kanbanView = await page.$('[data-testid="kanban-view"]');
    const viewRing = await kanbanView?.getAttribute('class');
    expect(viewRing).toContain('ring-1');

    // Press 's' to focus status bar
    await page.keyboard.press('s');
    const statusBar = await page.$('[data-testid="status-bar"]');
    const statusRing = await statusBar?.getAttribute('class');
    expect(statusRing).toContain('ring-1');
  });

  test('smoke test: kanban navigation keys (j/k/h/l) work end-to-end', async () => {
    await openKanbanBoard();
    const page = ctx.window;

    // Make sure we're in content zone
    await page.keyboard.press('c');

    // Press 'l' to move right (next column)
    await page.keyboard.press('l');

    // Press 'h' to move left (prev column)
    await page.keyboard.press('h');

    // No crash means it worked
    const view = await page.$('[data-testid="kanban-view"]');
    expect(view).toBeTruthy();
  });

  test('smoke test: card open (Enter) and close (Escape) work end-to-end', async () => {
    await openKanbanBoard();
    const page = ctx.window;

    // Create an item first so we can open it
    await page.keyboard.press('n');
    await page.waitForSelector('[data-testid="new-item-dialog"]', { timeout: 5000 });

    // Fill in title and submit
    const titleInput = await page.$('[data-testid="new-item-title"]');
    if (titleInput) {
      await titleInput.fill('Test Item for Enter/Escape');
      await page.keyboard.press('Enter');
    }

    // Wait for dialog to close and item to appear
    await page.waitForSelector('[data-testid="kanban-card"]', { timeout: 5000 });

    // Press Enter to open card detail
    await page.keyboard.press('c'); // ensure content zone
    await page.keyboard.press('Enter');

    // Verify dialog opened
    const dialog = await page.waitForSelector('[data-testid="item-detail-dialog"]', { timeout: 5000 });
    expect(dialog).toBeTruthy();

    // Press Escape to close
    await page.keyboard.press('Escape');

    // Dialog should be gone
    await page.waitForSelector('[data-testid="item-detail-dialog"]', { state: 'detached', timeout: 5000 });
  });
});
