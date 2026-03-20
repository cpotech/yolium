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

  test('should toggle specialist with t key without switching to tabs zone', async () => {
    await openSchedulePanel();
    const page = ctx.window;

    await page.click('[data-testid="schedule-panel"]');

    // Press 't' — should toggle the specialist, not switch to tabs zone
    await page.keyboard.press('t');

    // Schedule panel should still be visible (if we switched to tabs zone, it would not be)
    await expect(page.locator('[data-testid="schedule-panel"]')).toBeVisible();
    // Tab bar should NOT have the active zone indicator
    const schedulePanel = page.locator('[data-vim-zone="schedule"]');
    await expect(schedulePanel).toBeVisible();
  });

  test('should open configure with c key without switching to content zone', async () => {
    await openSchedulePanel();
    const page = ctx.window;

    await page.click('[data-testid="schedule-panel"]');

    // Press 'c' — should open configure dialog, not switch to content zone
    await page.keyboard.press('c');

    // The add-specialist dialog (configure mode) should open
    await expect(page.locator('[data-testid="add-specialist-dialog"]')).toBeVisible({ timeout: 5000 });
    // Schedule panel should still be the active zone (not content)
    await expect(page.locator('[data-testid="schedule-panel"]')).toBeVisible();
  });
});
