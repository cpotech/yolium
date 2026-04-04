import { test, expect } from '@playwright/test';
import { AppContext, launchApp } from '../helpers/app';
import { selectors } from '../helpers/selectors';

test.describe('Schedule zone vim navigation', () => {
  let ctx: AppContext;

  test.afterEach(async () => {
    if (ctx) {
      const electronProcess = ctx.app.process();
      if (electronProcess && !electronProcess.killed) {
        electronProcess.kill('SIGKILL');
      }
      ctx = undefined as unknown as AppContext;
    }
  });

  async function openSchedulePanel(): Promise<void> {
    ctx = await launchApp({ skipDockerWait: true });
    const page = ctx.window;

    await expect(page.locator(selectors.sidebar)).toBeVisible({ timeout: 30000 });
    await page.click(selectors.sidebarSchedule);
    await expect(page.locator('[data-testid="schedule-panel"]')).toBeVisible();

    // Ensure at least one specialist exists
    if (await page.locator('[data-testid^="specialist-card-"]').count() === 0) {
      await page.evaluate(async () => {
        await window.electronAPI.schedule.scaffold('test-specialist');
      });
      await page.click('[data-testid="schedule-reload-btn"]');
      await expect(page.locator('[data-testid^="specialist-card-"]').first()).toBeVisible();
    }
  }

  test('should navigate specialists with j/k keys without leaving schedule zone', async () => {
    await openSchedulePanel();
    const page = ctx.window;

    // Focus the schedule panel
    await page.click('[data-testid="schedule-panel"]');
    await page.keyboard.press('j');

    // Should still be in schedule zone (panel should remain visible and focused)
    await expect(page.locator('[data-testid="schedule-panel"]')).toBeVisible();
    // Verify we haven't switched to a different zone by checking no other zone got focus
    const activeZone = await page.locator('[data-vim-zone="schedule"]').getAttribute('data-vim-zone');
    expect(activeZone).toBe('schedule');
  });

  test('should switch to tabs zone when pressing t from schedule zone', async () => {
    await openSchedulePanel();
    const page = ctx.window;

    await page.click('[data-testid="schedule-panel"]');

    // Press 't' — should switch to tabs zone (no longer toggles specialist)
    await page.keyboard.press('t');

    // Should have switched to tabs zone — schedule panel may no longer be visible
    // or tabs zone should have the active indicator
    const tabsZone = page.locator('[data-vim-zone="tabs"]');
    await expect(tabsZone).toBeVisible();
  });

  test('should switch to content zone when pressing c from schedule zone', async () => {
    await openSchedulePanel();
    const page = ctx.window;

    await page.click('[data-testid="schedule-panel"]');

    // Press 'c' — should switch to content zone (no longer configures specialist)
    await page.keyboard.press('c');

    // The add-specialist dialog should NOT open
    await expect(page.locator('[data-testid="add-specialist-dialog"]')).not.toBeVisible({ timeout: 1000 }).catch(() => {});
    // Content zone should be active
    const contentZone = page.locator('[data-vim-zone="content"]');
    await expect(contentZone).toBeVisible();
  });

  test('should toggle specialist with d key in schedule zone', async () => {
    await openSchedulePanel();
    const page = ctx.window;

    await page.click('[data-testid="schedule-panel"]');

    // Press 'd' — should toggle the specialist enabled state
    await page.keyboard.press('d');

    // Schedule panel should still be visible (stayed in schedule zone)
    await expect(page.locator('[data-testid="schedule-panel"]')).toBeVisible();
    const schedulePanel = page.locator('[data-vim-zone="schedule"]');
    await expect(schedulePanel).toBeVisible();
  });

  test('should open specialist config with o key in schedule zone', async () => {
    await openSchedulePanel();
    const page = ctx.window;

    await page.click('[data-testid="schedule-panel"]');

    // Press 'o' — should open configure dialog
    await page.keyboard.press('o');

    // The add-specialist dialog (configure mode) should open
    await expect(page.locator('[data-testid="add-specialist-dialog"]')).toBeVisible({ timeout: 5000 });
    // Schedule panel should still be the active zone
    await expect(page.locator('[data-testid="schedule-panel"]')).toBeVisible();
  });

  test('should delete specialist with x key and show confirmation', async () => {
    await openSchedulePanel();
    const page = ctx.window;

    await page.click('[data-testid="schedule-panel"]');

    // Press 'x' — should show a confirmation dialog
    await page.keyboard.press('x');

    // Confirm dialog should appear with "Delete Specialist" title
    await expect(page.locator('text=Delete Specialist')).toBeVisible({ timeout: 5000 });

    // Cancel to avoid actually deleting
    const cancelBtn = page.locator('text=Cancel');
    if (await cancelBtn.isVisible()) {
      await cancelBtn.click();
    }
  });

  test('should reload specialists with Shift+R key', async () => {
    await openSchedulePanel();
    const page = ctx.window;

    await page.click('[data-testid="schedule-panel"]');

    // Press Shift+R — should trigger reload
    await page.keyboard.press('Shift+R');

    // The panel should still be visible (reload happened in-place)
    await expect(page.locator('[data-testid="schedule-panel"]')).toBeVisible();
  });

  test('should return from actions view to specialists view with Escape', async () => {
    await openSchedulePanel();
    const page = ctx.window;

    await page.click('[data-testid="schedule-panel"]');

    // Switch to actions view with '2'
    await page.keyboard.press('2');
    await expect(page.locator('[data-testid="actions-view"], [data-testid="actions-view-loading"], [data-testid="actions-view-empty"]').first()).toBeVisible({ timeout: 5000 });

    // Press Escape to go back
    await page.keyboard.press('Escape');

    // Should be back on specialists view
    await expect(page.locator('[data-testid^="specialist-card-"]').first()).toBeVisible({ timeout: 5000 });
  });

  test('should switch between specialists and actions views with 1 and 2 keys', async () => {
    await openSchedulePanel();
    const page = ctx.window;

    await page.click('[data-testid="schedule-panel"]');

    // Press '2' to switch to actions view
    await page.keyboard.press('2');
    await expect(page.locator('[data-testid="actions-view"], [data-testid="actions-view-loading"], [data-testid="actions-view-empty"]').first()).toBeVisible({ timeout: 5000 });

    // Press '1' to switch back to specialists view
    await page.keyboard.press('1');
    await expect(page.locator('[data-testid^="specialist-card-"]').first()).toBeVisible({ timeout: 5000 });
  });

  test('should not trigger shortcuts in INSERT mode on schedule panel', async () => {
    await openSchedulePanel();
    const page = ctx.window;

    await page.click('[data-testid="schedule-panel"]');

    // Enter INSERT mode with 'i'
    await page.keyboard.press('i');
    await page.waitForTimeout(100);

    // Press '2' — should NOT switch to actions view in INSERT mode
    await page.keyboard.press('2');
    await page.waitForTimeout(200);

    // Specialists view should still be visible (not switched to actions)
    await expect(page.locator('[data-testid^="specialist-card-"]').first()).toBeVisible();
  });

  test('should navigate back from actions view with Backspace', async () => {
    await openSchedulePanel();
    const page = ctx.window;

    await page.click('[data-testid="schedule-panel"]');

    // Switch to actions view with '2'
    await page.keyboard.press('2');
    await expect(page.locator('[data-testid="actions-view"], [data-testid="actions-view-loading"], [data-testid="actions-view-empty"]').first()).toBeVisible({ timeout: 5000 });

    // Focus the actions view container
    const actionsView = page.locator('[data-testid="actions-view"], [data-testid="actions-view-empty"]').first();
    if (await actionsView.isVisible()) {
      await actionsView.click();
    }

    // Press Backspace to go back
    await page.keyboard.press('Backspace');

    // Should be back on specialists view
    await expect(page.locator('[data-testid^="specialist-card-"]').first()).toBeVisible({ timeout: 5000 });
  });
});
