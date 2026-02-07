import { test, expect } from '@playwright/test';
import { launchApp, closeApp, createTestRepo, cleanupTestRepo, type AppContext } from '../helpers/app';
import { selectors } from '../helpers/selectors';
import * as os from 'os';

/**
 * Comprehensive kanban board E2E tests.
 *
 * Tests cover:
 * - Creating items via NewItemDialog
 * - Editing items via ItemDetailDialog
 * - Deleting items
 * - Form validation
 * - Column management (moving items)
 * - Multiple items
 * - Dialog interactions (click-outside, escape)
 * - Accessibility (keyboard navigation)
 */
test.describe('Kanban Board', () => {
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

  /**
   * Launch app, clear stale state, add project to sidebar, wait for kanban view.
   */
  async function openKanbanBoard(): Promise<void> {
    ctx = await launchApp();
    const { window } = ctx;

    // Clear stale localStorage from previous launches
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

    // Add project via sidebar
    await window.click(selectors.addProjectButton);
    await window.fill(selectors.pathInput, testRepoPath);
    await window.click(selectors.pathNextButton);
    await expect(window.locator(selectors.kanbanView)).toBeVisible({ timeout: 10000 });
  }

  /**
   * Create an item via IPC and refresh the board.
   */
  async function createItemViaIPC(title: string, description: string, opts?: { branch?: string; agentProvider?: 'claude' | 'codex' | 'opencode' }): Promise<{ id: string }> {
    const { window } = ctx;
    const item = await window.evaluate(
      async (params: { path: string; title: string; desc: string; branch?: string; agentProvider?: string }) => {
        return window.electronAPI.kanban.addItem(params.path, {
          title: params.title,
          description: params.desc,
          branch: params.branch,
          agentProvider: (params.agentProvider || 'claude') as 'claude' | 'codex' | 'opencode',
          order: 0,
        });
      },
      { path: testRepoPath, title, desc: description, branch: opts?.branch, agentProvider: opts?.agentProvider }
    ) as { id: string };

    await window.click(selectors.kanbanRefreshButton);
    await expect(
      window.locator(selectors.kanbanColumn('backlog')).locator(selectors.kanbanCard)
    ).toBeVisible({ timeout: 5000 });

    return item;
  }

  // ─── New Item Dialog ─────────────────────────────────────────

  test('should open new item dialog when clicking New Item button', async () => {
    await openKanbanBoard();
    const { window } = ctx;

    await window.click(selectors.kanbanNewItemButton);
    await expect(window.locator(selectors.newItemDialog)).toBeVisible();
  });

  test('should create a new item via dialog', async () => {
    await openKanbanBoard();
    const { window } = ctx;

    // Open new item dialog
    await window.click(selectors.kanbanNewItemButton);
    await expect(window.locator(selectors.newItemDialog)).toBeVisible();

    // Fill form
    await window.fill('[data-testid="new-item-dialog"] [data-testid="title-input"]', 'Fix login bug');
    await window.fill('[data-testid="new-item-dialog"] [data-testid="description-input"]', 'Users cannot log in with SSO');
    await window.fill('[data-testid="new-item-dialog"] [data-testid="branch-input"]', 'fix/login-sso');

    // Submit
    await window.click(selectors.newItemCreate);

    // Dialog should close
    await expect(window.locator(selectors.newItemDialog)).not.toBeVisible();

    // Card should appear in backlog
    const backlogCards = window.locator(selectors.kanbanColumn('backlog')).locator(selectors.kanbanCard);
    await expect(backlogCards).toHaveCount(1);
    await expect(backlogCards.first()).toContainText('Fix login bug');
  });

  test('should not submit with empty title', async () => {
    await openKanbanBoard();
    const { window } = ctx;

    await window.click(selectors.kanbanNewItemButton);
    await expect(window.locator(selectors.newItemDialog)).toBeVisible();

    // Only fill description, leave title empty
    await window.fill('[data-testid="new-item-dialog"] [data-testid="description-input"]', 'Some description');

    // Create button should be disabled
    const createBtn = window.locator(selectors.newItemCreate);
    await expect(createBtn).toBeDisabled();
  });

  test('should not submit with empty description', async () => {
    await openKanbanBoard();
    const { window } = ctx;

    await window.click(selectors.kanbanNewItemButton);

    // Only fill title, leave description empty
    await window.fill('[data-testid="new-item-dialog"] [data-testid="title-input"]', 'Some title');

    const createBtn = window.locator(selectors.newItemCreate);
    await expect(createBtn).toBeDisabled();
  });

  test('should close new item dialog with Escape', async () => {
    await openKanbanBoard();
    const { window } = ctx;

    await window.click(selectors.kanbanNewItemButton);
    await expect(window.locator(selectors.newItemDialog)).toBeVisible();

    await window.keyboard.press('Escape');
    await expect(window.locator(selectors.newItemDialog)).not.toBeVisible();
  });

  test('should close new item dialog with Cancel button', async () => {
    await openKanbanBoard();
    const { window } = ctx;

    await window.click(selectors.kanbanNewItemButton);
    await expect(window.locator(selectors.newItemDialog)).toBeVisible();

    await window.click(selectors.newItemCancel);
    await expect(window.locator(selectors.newItemDialog)).not.toBeVisible();
  });

  test('should close new item dialog with close button (X)', async () => {
    await openKanbanBoard();
    const { window } = ctx;

    await window.click(selectors.kanbanNewItemButton);
    await expect(window.locator(selectors.newItemDialog)).toBeVisible();

    // Full-screen dialogs close via Escape, Cancel, or close button (no overlay click)
    await window.click('[data-testid="new-item-dialog"] [data-testid="close-button"]');
    await expect(window.locator(selectors.newItemDialog)).not.toBeVisible();
  });

  test('should reset form when reopening dialog', async () => {
    await openKanbanBoard();
    const { window } = ctx;

    // Open and fill form
    await window.click(selectors.kanbanNewItemButton);
    await window.fill('[data-testid="new-item-dialog"] [data-testid="title-input"]', 'temp title');
    await window.keyboard.press('Escape');

    // Reopen - form should be empty
    await window.click(selectors.kanbanNewItemButton);
    await expect(window.locator('[data-testid="new-item-dialog"] [data-testid="title-input"]')).toHaveValue('');
  });

  // ─── Item Detail Dialog ──────────────────────────────────────

  test('should open item detail dialog when clicking a card', async () => {
    await openKanbanBoard();
    await createItemViaIPC('Test Item', 'Test description');
    const { window } = ctx;

    // Click the card
    await window.locator(selectors.kanbanColumn('backlog')).locator(selectors.kanbanCard).first().click();

    // Detail dialog should open
    await expect(window.locator(selectors.itemDetailDialog)).toBeVisible();
    await expect(window.locator(selectors.detailTitle)).toHaveValue('Test Item');
  });

  test('should show correct item details in dialog', async () => {
    await openKanbanBoard();
    await createItemViaIPC('My Task', 'Do the thing', { branch: 'feat/thing', agentProvider: 'codex' });
    const { window } = ctx;

    await window.locator(selectors.kanbanColumn('backlog')).locator(selectors.kanbanCard).first().click();
    await expect(window.locator(selectors.itemDetailDialog)).toBeVisible();

    // Check all fields
    await expect(window.locator(selectors.detailTitle)).toHaveValue('My Task');
    await expect(window.locator(selectors.detailDescription)).toHaveValue('Do the thing');
    await expect(window.locator(selectors.detailStatusBadge)).toContainText('idle');
    await expect(window.locator(selectors.detailAgentProviderSelect)).toHaveValue('codex');
    await expect(window.locator(selectors.detailBranchDisplay)).toContainText('feat/thing');
    await expect(window.locator(selectors.detailNoComments)).toBeVisible();
  });

  test('should edit and save item title', async () => {
    await openKanbanBoard();
    await createItemViaIPC('Original Title', 'Some description');
    const { window } = ctx;

    // Open dialog
    await window.locator(selectors.kanbanColumn('backlog')).locator(selectors.kanbanCard).first().click();
    await expect(window.locator(selectors.itemDetailDialog)).toBeVisible();

    // Edit title
    await window.locator(selectors.detailTitle).fill('Updated Title');
    await window.click(selectors.detailSaveButton);

    // Close dialog
    await window.click(selectors.detailCloseButton);
    await expect(window.locator(selectors.itemDetailDialog)).not.toBeVisible();

    // Card should show updated title
    await expect(
      window.locator(selectors.kanbanColumn('backlog')).locator(selectors.kanbanCard).first()
    ).toContainText('Updated Title');
  });

  test('should move item between columns via select', async () => {
    await openKanbanBoard();
    await createItemViaIPC('Move Me', 'Item to move');
    const { window } = ctx;

    // Open dialog
    await window.locator(selectors.kanbanColumn('backlog')).locator(selectors.kanbanCard).first().click();
    await expect(window.locator(selectors.itemDetailDialog)).toBeVisible();

    // Change column to 'ready'
    await window.locator(selectors.detailColumnSelect).selectOption('ready');
    await window.click(selectors.detailSaveButton);
    await window.click(selectors.detailCloseButton);

    // Item should now be in Ready column
    await expect(
      window.locator(selectors.kanbanColumn('backlog')).locator(selectors.kanbanCard)
    ).toHaveCount(0);
    await expect(
      window.locator(selectors.kanbanColumn('ready')).locator(selectors.kanbanCard)
    ).toHaveCount(1);
    await expect(
      window.locator(selectors.kanbanColumn('ready')).locator(selectors.kanbanCard).first()
    ).toContainText('Move Me');
  });

  test('should delete item via dialog', async () => {
    await openKanbanBoard();
    await createItemViaIPC('Delete Me', 'Item to delete');
    const { window } = ctx;

    // Mock the native confirmation dialog to return true
    await ctx.app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('dialog:confirm-ok-cancel');
      ipcMain.handle('dialog:confirm-ok-cancel', () => true);
    });

    // Open dialog and delete
    await window.locator(selectors.kanbanColumn('backlog')).locator(selectors.kanbanCard).first().click();
    await expect(window.locator(selectors.itemDetailDialog)).toBeVisible();

    await window.click(selectors.detailDeleteButton);

    // Dialog should close and card should be gone
    await expect(window.locator(selectors.itemDetailDialog)).not.toBeVisible();
    await expect(
      window.locator(selectors.kanbanColumn('backlog')).locator(selectors.kanbanCard)
    ).toHaveCount(0);
  });

  test('should not delete when confirmation is cancelled', async () => {
    await openKanbanBoard();
    await createItemViaIPC('Keep Me', 'Item to keep');
    const { window } = ctx;

    // Mock dialog to return false (user cancels)
    await ctx.app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('dialog:confirm-ok-cancel');
      ipcMain.handle('dialog:confirm-ok-cancel', () => false);
    });

    // Open dialog and try to delete
    await window.locator(selectors.kanbanColumn('backlog')).locator(selectors.kanbanCard).first().click();
    await window.click(selectors.detailDeleteButton);

    // Dialog should remain open and card should still exist
    await expect(window.locator(selectors.itemDetailDialog)).toBeVisible();
    await window.click(selectors.detailCloseButton);

    await expect(
      window.locator(selectors.kanbanColumn('backlog')).locator(selectors.kanbanCard)
    ).toHaveCount(1);
  });

  test('should close detail dialog with Escape', async () => {
    await openKanbanBoard();
    await createItemViaIPC('Escape Test', 'Test');
    const { window } = ctx;

    await window.locator(selectors.kanbanColumn('backlog')).locator(selectors.kanbanCard).first().click();
    await expect(window.locator(selectors.itemDetailDialog)).toBeVisible();

    // Click the dialog header first to ensure focus is on the dialog overlay (not in an input)
    await window.locator(selectors.detailCloseButton).focus();
    await window.keyboard.press('Escape');
    await expect(window.locator(selectors.itemDetailDialog)).not.toBeVisible();
  });

  test('should close detail dialog with close button (X)', async () => {
    await openKanbanBoard();
    await createItemViaIPC('Close Button Test', 'Test');
    const { window } = ctx;

    await window.locator(selectors.kanbanColumn('backlog')).locator(selectors.kanbanCard).first().click();
    await expect(window.locator(selectors.itemDetailDialog)).toBeVisible();

    // Full-screen dialogs close via Escape or close button (no overlay click)
    await window.click(selectors.detailCloseButton);
    await expect(window.locator(selectors.itemDetailDialog)).not.toBeVisible();
  });

  // ─── Multiple Items ──────────────────────────────────────────

  test('should display multiple items in correct columns', async () => {
    await openKanbanBoard();
    const { window } = ctx;

    // Create multiple items via IPC
    await window.evaluate(async (repoPath: string) => {
      await window.electronAPI.kanban.addItem(repoPath, {
        title: 'Backlog Item 1', description: 'Desc 1',
        agentProvider: 'claude', order: 0,
      });
      await window.electronAPI.kanban.addItem(repoPath, {
        title: 'Backlog Item 2', description: 'Desc 2',
        agentProvider: 'claude', order: 1,
      });
    }, testRepoPath);

    await window.click(selectors.kanbanRefreshButton);

    // Should have 2 items in backlog
    await expect(
      window.locator(selectors.kanbanColumn('backlog')).locator(selectors.kanbanCard)
    ).toHaveCount(2);

    // Move one to ready via IPC
    const board = await window.evaluate(async (repoPath: string) => {
      return window.electronAPI.kanban.getBoard(repoPath);
    }, testRepoPath);

    const firstItem = (board as { items: Array<{ id: string }> }).items[0];
    await window.evaluate(
      async (params: { path: string; id: string }) => {
        await window.electronAPI.kanban.updateItem(params.path, params.id, { column: 'ready' });
      },
      { path: testRepoPath, id: firstItem.id }
    );

    // Click refresh to trigger board reload
    await window.click(selectors.kanbanRefreshButton);

    // Verify columns
    await expect(
      window.locator(selectors.kanbanColumn('backlog')).locator(selectors.kanbanCard)
    ).toHaveCount(1);
    await expect(
      window.locator(selectors.kanbanColumn('ready')).locator(selectors.kanbanCard)
    ).toHaveCount(1);
  });

  test('should show correct item counts per column', async () => {
    await openKanbanBoard();
    const { window } = ctx;

    // Create 3 items
    await window.evaluate(async (repoPath: string) => {
      await window.electronAPI.kanban.addItem(repoPath, {
        title: 'Item 1', description: 'D', agentProvider: 'claude', order: 0,
      });
      await window.electronAPI.kanban.addItem(repoPath, {
        title: 'Item 2', description: 'D', agentProvider: 'claude', order: 1,
      });
      await window.electronAPI.kanban.addItem(repoPath, {
        title: 'Item 3', description: 'D', agentProvider: 'claude', order: 2,
      });
    }, testRepoPath);

    await window.click(selectors.kanbanRefreshButton);

    // Backlog column count should be 3
    const backlogCount = window.locator(selectors.kanbanColumn('backlog')).locator('[data-testid="item-count"]');
    await expect(backlogCount).toContainText('3');

    // Other columns should be 0
    const readyCount = window.locator(selectors.kanbanColumn('ready')).locator('[data-testid="item-count"]');
    await expect(readyCount).toContainText('0');
  });

  // ─── Card Display ────────────────────────────────────────────

  test('should display agent type badge on card', async () => {
    await openKanbanBoard();
    await createItemViaIPC('Codex Task', 'Use codex', { agentProvider: 'codex' });
    const { window } = ctx;

    const card = window.locator(selectors.kanbanColumn('backlog')).locator(selectors.kanbanCard).first();
    await expect(card.locator('[data-testid="agent-type-badge"]')).toContainText('Codex');
  });

  test('should display branch info on card when branch is set', async () => {
    await openKanbanBoard();
    await createItemViaIPC('Branch Task', 'Has branch', { branch: 'feat/awesome' });
    const { window } = ctx;

    const card = window.locator(selectors.kanbanColumn('backlog')).locator(selectors.kanbanCard).first();
    await expect(card.locator('[data-testid="branch-info"]')).toContainText('feat/awesome');
  });

  test('should not display branch info when no branch', async () => {
    await openKanbanBoard();
    await createItemViaIPC('No Branch', 'No branch set');
    const { window } = ctx;

    const card = window.locator(selectors.kanbanColumn('backlog')).locator(selectors.kanbanCard).first();
    await expect(card.locator('[data-testid="branch-info"]')).not.toBeVisible();
  });

  // ─── Empty States ────────────────────────────────────────────

  test('should show empty state for columns with no items', async () => {
    await openKanbanBoard();
    const { window } = ctx;

    // All columns should show empty state
    for (const col of ['backlog', 'ready', 'in-progress', 'done']) {
      await expect(
        window.locator(selectors.kanbanColumn(col)).locator('[data-testid="column-empty-state"]')
      ).toBeVisible();
    }
  });

  test('should show kanban empty state when no project selected', async () => {
    ctx = await launchApp();
    const { window } = ctx;

    // Clear state
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

    // Should show the app-level empty state (no project)
    await expect(window.locator('[data-testid="empty-state"]')).toBeVisible();
  });

  // ─── Toolbar ─────────────────────────────────────────────────

  test('should display project folder name in toolbar with full path tooltip', async () => {
    await openKanbanBoard();
    const { window } = ctx;

    // Toolbar shows folder name only (not full path)
    const folderName = testRepoPath.replace(/\\/g, '/').split('/').filter(Boolean).pop()!;
    await expect(window.locator(selectors.projectPathDisplay)).toContainText(folderName);

    // Full path is available via title attribute
    const title = await window.locator(selectors.projectPathDisplay).getAttribute('title');
    expect(title).toBeTruthy();
  });

  test('should refresh board when clicking refresh button', async () => {
    await openKanbanBoard();
    const { window } = ctx;

    // Create an item - with board-updated events now firing from IPC handlers,
    // the board auto-refreshes. Verify the item appears.
    await createItemViaIPC('Refresh Test Item', 'Testing refresh');

    // Card should be visible after IPC-driven refresh
    await expect(
      window.locator(selectors.kanbanColumn('backlog')).locator(selectors.kanbanCard)
    ).toHaveCount(1);

    // Click refresh to verify manual refresh still works
    await window.click(selectors.kanbanRefreshButton);

    // Card should still be there
    await expect(
      window.locator(selectors.kanbanColumn('backlog')).locator(selectors.kanbanCard)
    ).toHaveCount(1);
  });

  // ─── Card Accessibility ──────────────────────────────────────

  test('cards should have role=button and be keyboard accessible', async () => {
    await openKanbanBoard();
    await createItemViaIPC('A11y Card', 'Accessible card');
    const { window } = ctx;

    const card = window.locator(selectors.kanbanColumn('backlog')).locator(selectors.kanbanCard).first();

    // Should have button role
    await expect(card).toHaveAttribute('role', 'button');

    // Should have tabindex
    await expect(card).toHaveAttribute('tabindex', '0');

    // Should have aria-label
    const ariaLabel = await card.getAttribute('aria-label');
    expect(ariaLabel).toContain('A11y Card');
  });

  // ─── Dialog Accessibility ────────────────────────────────────

  test('new item dialog should have aria-modal and role', async () => {
    await openKanbanBoard();
    const { window } = ctx;

    await window.click(selectors.kanbanNewItemButton);
    const dialog = window.locator(selectors.newItemDialog);

    await expect(dialog).toHaveAttribute('role', 'dialog');
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  test('should open new item dialog with N keyboard shortcut', async () => {
    await openKanbanBoard();
    const { window } = ctx;

    // Press N to open new item dialog
    await window.locator(selectors.kanbanView).press('n');
    await expect(window.locator(selectors.newItemDialog)).toBeVisible();
  });

  test('should show unsaved changes indicator in item detail dialog', async () => {
    await openKanbanBoard();
    await createItemViaIPC('Unsaved Test', 'Original description');
    const { window } = ctx;

    // Open detail dialog
    await window.locator(selectors.kanbanColumn('backlog')).locator(selectors.kanbanCard).first().click();
    await expect(window.locator(selectors.itemDetailDialog)).toBeVisible();

    // No unsaved indicator initially
    await expect(window.locator('[data-testid="unsaved-indicator"]')).not.toBeVisible();

    // Edit the title
    await window.locator('[data-testid="title-input"]').fill('Modified Title');

    // Unsaved indicator should appear
    await expect(window.locator('[data-testid="unsaved-indicator"]')).toBeVisible();
  });

  test('should show board summary count in toolbar', async () => {
    await openKanbanBoard();
    await createItemViaIPC('Summary Test Item', 'Testing summary');
    const { window } = ctx;

    // Toolbar should show item count
    await expect(window.locator('[data-testid="board-summary"]')).toContainText('1 item');
  });

  test('item detail dialog should have aria-modal and role', async () => {
    await openKanbanBoard();
    await createItemViaIPC('Dialog A11y', 'Test');
    const { window } = ctx;

    await window.locator(selectors.kanbanColumn('backlog')).locator(selectors.kanbanCard).first().click();
    const dialog = window.locator(selectors.itemDetailDialog);

    await expect(dialog).toHaveAttribute('role', 'dialog');
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
  });
});
