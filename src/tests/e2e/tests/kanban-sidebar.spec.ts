import { test, expect } from '@playwright/test';
import { launchApp, closeApp, AppContext, createTestRepo, cleanupTestRepo } from '../helpers/app';
import { selectors } from '../helpers/selectors';
import * as path from 'path';
import * as os from 'os';

test.describe('Kanban Sidebar Integration', () => {
  let ctx: AppContext;
  let testRepoPath: string;

  test.beforeEach(async () => {
    // Each test gets a unique repo to avoid board state leakage
    const tmpDir = os.tmpdir();
    testRepoPath = await createTestRepo(tmpDir);
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

  /**
   * Launch app with clean localStorage to prevent duplicate kanban views.
   */
  async function launchCleanApp(): Promise<void> {
    ctx = await launchApp();
    const { window } = ctx;

    await window.evaluate(() => {
      localStorage.removeItem('yolium-session');
      localStorage.removeItem('yolium-sidebar-projects');
      localStorage.removeItem('yolium-open-kanban-tabs');
    });
    await window.reload();
    await window.waitForLoadState('domcontentloaded');
    await window.waitForSelector(
      '[data-testid="empty-state"], [data-testid="docker-setup-dialog"], [data-testid="tab-bar"]',
      { timeout: 30000 }
    );
  }

  /**
   * Add a project to the sidebar via path dialog.
   */
  async function addProject(): Promise<void> {
    const { window } = ctx;
    await window.click(selectors.openProjectButton);
    await window.fill(selectors.pathInput, testRepoPath);
    await window.click(selectors.pathNextButton);
    await expect(window.locator(selectors.kanbanView)).toBeVisible({ timeout: 10000 });
  }

  async function notifyBoardUpdated(): Promise<void> {
    const normalizedPath = testRepoPath.replace(/\\/g, '/');
    await ctx.app.evaluate(({ BrowserWindow }, projectPath: string) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win) {
        win.webContents.send('kanban:board-updated', projectPath);
      }
    }, normalizedPath);
  }

  async function updateItemState(itemId: string, updates: Record<string, unknown>): Promise<void> {
    const { window } = ctx;

    await window.evaluate(
      async (params: { path: string; id: string; updates: Record<string, unknown> }) => {
        await window.electronAPI.kanban.updateItem(params.path, params.id, params.updates);
      },
      { path: testRepoPath, id: itemId, updates }
    );

    await notifyBoardUpdated();
  }

  async function expandSidebar(): Promise<void> {
    const { window } = ctx;
    await window.click(selectors.sidebarCollapseToggle);
    await window.waitForTimeout(300);
  }

  async function setupWaitingSidebarItem(): Promise<{ itemId: string }> {
    await launchCleanApp();

    await ctx.app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('agent:recover');
      ipcMain.handle('agent:recover', () => []);
    });

    await addProject();
    await expandSidebar();

    const { window } = ctx;
    const item = await window.evaluate(async (repoPath: string) => {
      return window.electronAPI.kanban.addItem(repoPath, {
        title: 'Sidebar waiting item',
        description: 'E2E test item for sidebar waiting popovers',
        agentProvider: 'claude' as const,
        order: 0,
      });
    }, testRepoPath) as { id: string };

    await updateItemState(item.id, {
      agentStatus: 'waiting',
      activeAgentName: 'code-agent',
      lastAgentName: 'code-agent',
      agentQuestion: 'How should I proceed?',
      agentQuestionOptions: ['Ship it', 'Revise it'],
      column: 'ready',
    });

    await expect(window.locator(selectors.statusDot(item.id))).toBeVisible({ timeout: 5000 });

    return { itemId: item.id };
  }

  async function mockSidebarResumeFlow(): Promise<void> {
    await ctx.app.evaluate(({ ipcMain }) => {
      (globalThis as { __sidebarAgentCalls?: unknown[] }).__sidebarAgentCalls = [];

      ipcMain.removeHandler('agent:answer');
      ipcMain.handle('agent:answer', async (_event, projectPath: string, itemId: string, answer: string) => {
        (globalThis as { __sidebarAgentCalls: unknown[] }).__sidebarAgentCalls.push({
          type: 'answer',
          projectPath,
          itemId,
          answer,
        });
      });

      ipcMain.removeHandler('agent:resume');
      ipcMain.handle('agent:resume', async (_event, params: Record<string, unknown>) => {
        (globalThis as { __sidebarAgentCalls: unknown[] }).__sidebarAgentCalls.push({
          type: 'resume',
          params,
        });
        return { sessionId: 'sidebar-test-session' };
      });
    });
  }

  test('should show sidebar with collapse toggle', async () => {
    await launchCleanApp();
    const { window } = ctx;

    await expect(window.locator(selectors.sidebar)).toBeVisible();
    await expect(window.locator(selectors.sidebarCollapseToggle)).toBeVisible();
  });

  test('should show add project button in sidebar', async () => {
    await launchCleanApp();
    const { window } = ctx;

    await expect(window.locator(selectors.openProjectButton)).toBeVisible();
  });

  test('should toggle sidebar collapse', async () => {
    await launchCleanApp();
    const { window } = ctx;

    const sidebar = window.locator(selectors.sidebar);
    await expect(sidebar).toBeVisible();

    // Check initial collapsed state (w-10 = 40px)
    const initialWidth = await sidebar.evaluate(el => el.classList.contains('w-10'));
    expect(initialWidth).toBe(true);

    // Click collapse toggle to expand
    await window.click(selectors.sidebarCollapseToggle);
    await window.waitForTimeout(300);

    // Should now have expanded width (w-48 = 192px)
    const expandedWidth = await sidebar.evaluate(el => el.classList.contains('w-48'));
    expect(expandedWidth).toBe(true);

    // Click again to collapse
    await window.click(selectors.sidebarCollapseToggle);
    await window.waitForTimeout(300);

    const collapsedAgain = await sidebar.evaluate(el => el.classList.contains('w-10'));
    expect(collapsedAgain).toBe(true);
  });

  test('should open path dialog when clicking add project', async () => {
    await launchCleanApp();
    const { window } = ctx;

    await window.click(selectors.openProjectButton);
    await expect(window.locator(selectors.pathDialog)).toBeVisible();
  });

  test('should add project to sidebar and open kanban tab', async () => {
    await launchCleanApp();
    const { window } = ctx;

    await window.click(selectors.openProjectButton);
    await expect(window.locator(selectors.pathDialog)).toBeVisible();

    await window.fill(selectors.pathInput, testRepoPath);
    await window.click(selectors.pathNextButton);

    await expect(window.locator(selectors.pathDialog)).not.toBeVisible({ timeout: 5000 });
    await expect(window.locator(selectors.kanbanView)).toBeVisible({ timeout: 5000 });

    const projectName = path.basename(testRepoPath);
    await expect(window.locator(selectors.projectPathDisplay)).toContainText(projectName);
  });

  test('should show project in sidebar after adding', async () => {
    await launchCleanApp();
    const { window } = ctx;

    // Expand sidebar first
    await window.click(selectors.sidebarCollapseToggle);
    await window.waitForTimeout(300);

    await addProject();

    // Project should appear in sidebar
    // The sidebar uses normalized paths, so match by folder name
    const projectName = path.basename(testRepoPath);
    const sidebarText = await window.locator(selectors.sidebar).textContent();
    expect(sidebarText).toContain(projectName);
  });

  test('should focus existing kanban tab when clicking project in sidebar', async () => {
    await launchCleanApp();
    const { window } = ctx;

    // Add a project
    await addProject();

    // Expand sidebar
    await window.click(selectors.sidebarCollapseToggle);
    await window.waitForTimeout(300);

    // Add a new tab
    await window.click(selectors.newTabButton);
    await expect(window.locator(selectors.pathDialog)).toBeVisible();
    await window.click(selectors.pathCancelButton);

    // Click the project in sidebar to focus its kanban tab
    // Use the sidebar text to find the project
    const projectName = path.basename(testRepoPath);
    await window.locator(selectors.sidebar).locator(`text=${projectName}`).click();

    await expect(window.locator(selectors.kanbanView)).toBeVisible();
  });

  test('should show kanban columns when board loads', async () => {
    await launchCleanApp();
    const { window } = ctx;

    await addProject();

    await expect(window.locator(selectors.kanbanColumnsContainer)).toBeVisible();
    await expect(window.locator('[data-testid^="kanban-column-"]')).toHaveCount(5);
  });

  test('should show new item button in kanban toolbar', async () => {
    await launchCleanApp();
    const { window } = ctx;

    await addProject();

    await expect(window.locator(selectors.kanbanNewItemButton)).toBeVisible();
  });

  test('should show refresh button in kanban toolbar', async () => {
    await launchCleanApp();
    const { window } = ctx;

    await addProject();

    await expect(window.locator(selectors.kanbanRefreshButton)).toBeVisible();
  });

  test('should display kanban tab in tab bar', async () => {
    await launchCleanApp();
    const { window } = ctx;

    await addProject();

    const projectName = path.basename(testRepoPath);
    await expect(window.locator(selectors.tabBar)).toContainText(projectName);
  });

  test('should close kanban tab when close button clicked', async () => {
    await launchCleanApp();
    const { window } = ctx;

    await addProject();

    // Find the close button on the tab
    const tabCloseButtons = window.locator('[data-testid^="tab-close-"]');
    await expect(tabCloseButtons).toHaveCount(1);

    await tabCloseButtons.first().click();

    await expect(window.locator(selectors.kanbanView)).not.toBeVisible();
    await expect(window.locator(selectors.emptyState)).toBeVisible();
  });

  test('should open and dismiss the waiting status popover from the sidebar', async () => {
    const { itemId } = await setupWaitingSidebarItem();
    const { window } = ctx;

    await expect(window.locator(selectors.statusDot(itemId))).toHaveAttribute('data-status', 'waiting');

    await window.click(selectors.statusDot(itemId));
    await expect(window.locator(selectors.statusPopover(itemId))).toBeVisible();
    await expect(window.locator(selectors.statusPopoverQuestion(itemId))).toHaveText('How should I proceed?');
    await expect(window.locator(selectors.statusPopoverOption(itemId, 0))).toHaveText('Ship it');
    await expect(window.locator(selectors.statusPopoverOption(itemId, 1))).toHaveText('Revise it');

    await window.click(selectors.projectPathDisplay);
    await expect(window.locator(selectors.statusPopover(itemId))).not.toBeVisible();
  });

  test('should close the waiting status popover with Escape', async () => {
    const { itemId } = await setupWaitingSidebarItem();
    const { window } = ctx;

    await window.click(selectors.statusDot(itemId));
    await expect(window.locator(selectors.statusPopover(itemId))).toBeVisible();

    await window.keyboard.press('Escape');

    await expect(window.locator(selectors.statusPopover(itemId))).not.toBeVisible();
  });

  test('should answer and resume a waiting item from the sidebar popover', async () => {
    const { itemId } = await setupWaitingSidebarItem();
    const { window } = ctx;

    await mockSidebarResumeFlow();
    await window.click(selectors.statusDot(itemId));
    await window.click(selectors.statusPopoverOption(itemId, 0));

    await expect(window.locator(selectors.statusPopover(itemId))).not.toBeVisible();

    const calls = await ctx.app.evaluate(() => {
      return (globalThis as { __sidebarAgentCalls?: unknown[] }).__sidebarAgentCalls ?? [];
    });

    expect(calls).toEqual([
      {
        type: 'answer',
        projectPath: testRepoPath,
        itemId,
        answer: 'Ship it',
      },
      {
        type: 'resume',
        params: {
          agentName: 'code-agent',
          projectPath: testRepoPath,
          itemId,
          goal: 'E2E test item for sidebar waiting popovers',
        },
      },
    ]);
  });
});
