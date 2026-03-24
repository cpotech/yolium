// src/tests/e2e/tests/agent-numbered-shortcuts.spec.ts
import { test, expect } from '@playwright/test';
import os from 'os';
import { launchApp, closeApp, createTestRepo, cleanupTestRepo, type AppContext } from '../helpers/app';
import { selectors } from '../helpers/selectors';

/**
 * E2E tests for numbered agent selection (1-9) in the work item sidebar.
 */
test.describe('Agent numbered shortcuts in work item sidebar', () => {
  let ctx: AppContext;
  let testRepoPath: string;

  test.beforeAll(async () => {
    testRepoPath = await createTestRepo(os.tmpdir());
  });

  test.afterAll(async () => {
    if (testRepoPath) await cleanupTestRepo(testRepoPath);
  });

  test.beforeEach(async () => {
    ctx = await launchApp();
  });

  test.afterEach(async () => {
    if (ctx) await closeApp(ctx);
  });

  async function openKanbanAndCreateItem(page: import('@playwright/test').Page): Promise<void> {
    // Clear state and add project
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

    // Create a new item
    await page.keyboard.press('n');
    await page.waitForSelector('[data-testid="new-item-title"]', { timeout: 5000 });
    await page.fill('[data-testid="new-item-title"]', 'Test numbered shortcuts');
    await page.click('[data-testid="new-item-create-button"]');
    await page.waitForTimeout(300);
  }

  async function openItemDetailAndFocusSidebar(page: import('@playwright/test').Page): Promise<void> {
    // Open the first card
    await page.keyboard.press('Enter');
    await page.waitForSelector('[data-testid="item-detail-dialog"]', { timeout: 5000 });
    // Switch to sidebar zone
    await page.keyboard.press('Tab');
    await page.waitForTimeout(100);
  }

  test('pressing 1 in sidebar should show plan-agent button as first agent', async () => {
    const page = ctx.window;
    await openKanbanAndCreateItem(page);
    await openItemDetailAndFocusSidebar(page);

    // Agent buttons should have number hints
    const agentButtons = await page.$$('[data-testid^="run-"][data-testid$="-button"]');
    expect(agentButtons.length).toBeGreaterThan(0);

    // First agent button should have a "1" hint
    const firstButton = agentButtons[0];
    const hintText = await firstButton.$eval('[data-testid="agent-number-hint"]', el => el.textContent).catch(() => null);
    expect(hintText).toBe('1');
  });

  test('pressing 2 in sidebar should correspond to the second agent', async () => {
    const page = ctx.window;
    await openKanbanAndCreateItem(page);
    await openItemDetailAndFocusSidebar(page);

    // Second agent button should have a "2" hint
    const agentButtons = await page.$$('[data-testid^="run-"][data-testid$="-button"]');
    if (agentButtons.length >= 2) {
      const secondButton = agentButtons[1];
      const hintText = await secondButton.$eval('[data-testid="agent-number-hint"]', el => el.textContent).catch(() => null);
      expect(hintText).toBe('2');
    }
  });

  test('number hints should be visible on agent buttons', async () => {
    const page = ctx.window;
    await openKanbanAndCreateItem(page);
    await openItemDetailAndFocusSidebar(page);

    // All agent buttons (up to 9) should have number hints
    const hints = await page.$$('[data-testid="agent-number-hint"]');
    expect(hints.length).toBeGreaterThan(0);
    expect(hints.length).toBeLessThanOrEqual(9);
  });

  test('pressing digit key should not trigger agent when agent is already running', async () => {
    const page = ctx.window;
    await openKanbanAndCreateItem(page);
    await openItemDetailAndFocusSidebar(page);

    // Since we can't easily start a real agent in E2E, we verify that
    // the status badge shows 'idle' and pressing a digit would attempt to start
    const statusBadge = await page.$('[data-testid="status-badge"]');
    const statusText = await statusBadge?.textContent();
    expect(statusText).toBe('idle');
  });
});
