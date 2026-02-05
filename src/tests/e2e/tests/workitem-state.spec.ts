import { test, expect } from '@playwright/test';
import { launchApp, closeApp, AppContext, createTestRepo, cleanupTestRepo } from '../helpers/app';
import { selectors } from '../helpers/selectors';
import * as os from 'os';

test.describe('Work Item State Updates', () => {
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

  /**
   * Launch the app with Docker image check mocked out to prevent the
   * build-progress-overlay from blocking interactions in CI.
   */
  async function launchWithMockedDocker(): Promise<AppContext> {
    ctx = await launchApp();

    // Mock ensureImage to resolve immediately — the overlay blocks all clicks
    await ctx.app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('docker:ensure-image');
      ipcMain.handle('docker:ensure-image', () => Promise.resolve());
    });

    // Reload so the app re-mounts without the blocking overlay
    const { window } = ctx;
    await window.reload();
    await window.waitForSelector(
      '[data-testid="empty-state"], [data-testid="docker-setup-dialog"], [data-testid="tab-bar"]',
      { timeout: 30000 },
    );

    return ctx;
  }

  /**
   * Launch app, add a project to the sidebar, create a work item via IPC,
   * and return its ID so tests can manipulate it.
   */
  async function setupProjectWithItem(): Promise<{ id: string }> {
    await launchWithMockedDocker();
    const { window } = ctx;

    // Add project via sidebar
    await window.click(selectors.addProjectButton);
    await window.fill(selectors.pathInput, testRepoPath);
    await window.click(selectors.pathNextButton);
    await expect(window.locator(selectors.kanbanView)).toBeVisible({ timeout: 10000 });

    // Create a work item directly via IPC
    const item = await window.evaluate(async (repoPath: string) => {
      return window.electronAPI.kanbanAddItem(repoPath, {
        title: 'Test work item',
        description: 'E2E test item for state updates',
        agentType: 'claude' as const,
        order: 0,
      });
    }, testRepoPath) as { id: string };

    // Refresh the board so the new item renders
    await window.click(selectors.kanbanRefreshButton);
    await expect(
      window.locator(selectors.kanbanColumn('backlog')).locator('[data-testid="kanban-card"]')
    ).toBeVisible({ timeout: 5000 });

    return item;
  }

  /**
   * Update an item's state via IPC and send a board-updated notification
   * from the main process so the renderer refreshes.
   */
  async function updateItemState(itemId: string, updates: Record<string, unknown>) {
    const { window } = ctx;

    await window.evaluate(
      async (params: { path: string; id: string; updates: Record<string, unknown> }) => {
        await window.electronAPI.kanbanUpdateItem(params.path, params.id, params.updates);
      },
      { path: testRepoPath, id: itemId, updates }
    );

    // Notify the renderer that the board changed
    await ctx.app.evaluate(({ BrowserWindow }, projectPath: string) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win) {
        win.webContents.send('kanban:board-updated', projectPath);
      }
    }, testRepoPath);
  }

  test('detail dialog reflects running state after board refresh', async () => {
    const item = await setupProjectWithItem();
    const { window } = ctx;

    // Click the card to open the detail dialog
    await window.locator(selectors.kanbanColumn('backlog'))
      .locator('[data-testid="kanban-card"]').first().click();
    await expect(window.locator('[data-testid="item-detail-dialog"]')).toBeVisible();

    // Status should initially be idle
    await expect(window.locator('[data-testid="status-badge"]')).toContainText('idle');

    // Simulate agent starting: update item to running
    await updateItemState(item.id, { agentStatus: 'running', column: 'in-progress' });

    // Detail dialog should update to running without manual refresh
    await expect(window.locator('[data-testid="status-badge"]')).toContainText('running');
  });

  test('detail dialog reflects waiting state with question UI', async () => {
    const item = await setupProjectWithItem();
    const { window } = ctx;

    // Open the detail dialog
    await window.locator(selectors.kanbanColumn('backlog'))
      .locator('[data-testid="kanban-card"]').first().click();
    await expect(window.locator('[data-testid="item-detail-dialog"]')).toBeVisible();

    // Simulate agent asking a question
    await updateItemState(item.id, {
      agentStatus: 'waiting',
      agentQuestion: 'What framework should I use?',
      agentQuestionOptions: ['React', 'Vue', 'Svelte'],
      column: 'ready',
    });

    // Status badge should show waiting
    await expect(window.locator('[data-testid="status-badge"]')).toContainText('waiting');

    // Answer input should be visible
    await expect(window.locator('[data-testid="answer-input"]')).toBeVisible();
  });

  test('detail dialog reflects completed state', async () => {
    const item = await setupProjectWithItem();
    const { window } = ctx;

    // Open the detail dialog
    await window.locator(selectors.kanbanColumn('backlog'))
      .locator('[data-testid="kanban-card"]').first().click();
    await expect(window.locator('[data-testid="item-detail-dialog"]')).toBeVisible();

    // Simulate agent completion
    await updateItemState(item.id, { agentStatus: 'completed', column: 'done' });

    // Status badge should show completed
    await expect(window.locator('[data-testid="status-badge"]')).toContainText('completed');
  });

  test('detail dialog reflects failed state with retry button', async () => {
    const item = await setupProjectWithItem();
    const { window } = ctx;

    // Open the detail dialog
    await window.locator(selectors.kanbanColumn('backlog'))
      .locator('[data-testid="kanban-card"]').first().click();
    await expect(window.locator('[data-testid="item-detail-dialog"]')).toBeVisible();

    // Simulate agent failure
    await updateItemState(item.id, { agentStatus: 'failed' });

    // Status badge should show failed
    await expect(window.locator('[data-testid="status-badge"]')).toContainText('failed');

    // Retry button should be visible
    await expect(window.locator('[data-testid="retry-agent-button"]')).toBeVisible();
  });

  test('detail dialog stays open through full lifecycle', async () => {
    const item = await setupProjectWithItem();
    const { window } = ctx;

    // Open the detail dialog
    await window.locator(selectors.kanbanColumn('backlog'))
      .locator('[data-testid="kanban-card"]').first().click();
    const dialog = window.locator('[data-testid="item-detail-dialog"]');
    await expect(dialog).toBeVisible();
    await expect(window.locator('[data-testid="status-badge"]')).toContainText('idle');

    // idle → running
    await updateItemState(item.id, { agentStatus: 'running', column: 'in-progress' });
    await expect(dialog).toBeVisible();
    await expect(window.locator('[data-testid="status-badge"]')).toContainText('running');

    // running → waiting (question)
    await updateItemState(item.id, {
      agentStatus: 'waiting',
      agentQuestion: 'Which approach?',
      column: 'ready',
    });
    await expect(dialog).toBeVisible();
    await expect(window.locator('[data-testid="status-badge"]')).toContainText('waiting');

    // waiting → running (resumed)
    await updateItemState(item.id, { agentStatus: 'running', column: 'in-progress' });
    await expect(dialog).toBeVisible();
    await expect(window.locator('[data-testid="status-badge"]')).toContainText('running');

    // running → completed
    await updateItemState(item.id, { agentStatus: 'completed', column: 'done' });
    await expect(dialog).toBeVisible();
    await expect(window.locator('[data-testid="status-badge"]')).toContainText('completed');
  });

  test('kanban card moves between columns on state change', async () => {
    const item = await setupProjectWithItem();
    const { window } = ctx;

    // Card should start in backlog
    await expect(
      window.locator(selectors.kanbanColumn('backlog')).locator('[data-testid="kanban-card"]')
    ).toHaveCount(1);

    // Update to running → should move to in-progress
    await updateItemState(item.id, { agentStatus: 'running', column: 'in-progress' });

    await expect(
      window.locator(selectors.kanbanColumn('backlog')).locator('[data-testid="kanban-card"]')
    ).toHaveCount(0);
    await expect(
      window.locator(selectors.kanbanColumn('in-progress')).locator('[data-testid="kanban-card"]')
    ).toHaveCount(1);

    // Update to completed → should move to done
    await updateItemState(item.id, { agentStatus: 'completed', column: 'done' });

    await expect(
      window.locator(selectors.kanbanColumn('in-progress')).locator('[data-testid="kanban-card"]')
    ).toHaveCount(0);
    await expect(
      window.locator(selectors.kanbanColumn('done')).locator('[data-testid="kanban-card"]')
    ).toHaveCount(1);
  });

  test('card status indicator updates on board refresh', async () => {
    const item = await setupProjectWithItem();
    const { window } = ctx;

    // Idle cards should have no status indicator
    const backlogCard = window.locator(selectors.kanbanColumn('backlog'))
      .locator('[data-testid="kanban-card"]').first();
    await expect(backlogCard.locator('[data-testid="status-indicator"]')).not.toBeVisible();

    // Update to running
    await updateItemState(item.id, { agentStatus: 'running', column: 'in-progress' });

    // Card in in-progress column should show status indicator
    const runningCard = window.locator(selectors.kanbanColumn('in-progress'))
      .locator('[data-testid="kanban-card"]').first();
    await expect(runningCard.locator('[data-testid="status-indicator"]')).toBeVisible();
    await expect(runningCard.locator('[data-testid="status-indicator"]')).toContainText('Agent working');

    // Update to completed
    await updateItemState(item.id, { agentStatus: 'completed', column: 'done' });

    // Card in done column should show completed indicator
    const doneCard = window.locator(selectors.kanbanColumn('done'))
      .locator('[data-testid="kanban-card"]').first();
    await expect(doneCard.locator('[data-testid="status-indicator"]')).toBeVisible();
    await expect(doneCard.locator('[data-testid="status-indicator"]')).toContainText('Completed');
  });
});
