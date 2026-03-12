import { test, expect } from '@playwright/test';
import { AppContext, launchApp } from '../helpers/app';
import { selectors } from '../helpers/selectors';

test.describe('Scheduled Agents Edit Flow', () => {
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

  test('should open the edit definition dialog from the configure flow for an existing scheduled agent', async () => {
    ctx = await launchApp({ skipDockerWait: true });
    const page = ctx.window;

    await expect(page.locator(selectors.sidebar)).toBeVisible({ timeout: 30000 });
    await page.click(selectors.sidebarSchedule);

    await expect(page.locator('[data-testid="schedule-panel"]')).toBeVisible();
    if (await page.locator('[data-testid="configure-security-monitor"]').count() === 0) {
      await page.evaluate(async () => {
        await window.electronAPI.schedule.scaffold('security-monitor');
      });
      await page.click('[data-testid="schedule-reload-btn"]');
    }

    await expect(page.locator('[data-testid="configure-security-monitor"]')).toBeVisible();
    await page.click('[data-testid="configure-security-monitor"]');

    await expect(page.locator('[data-testid="specialist-config-dialog"]')).toBeVisible();
    await page.click('[data-testid="specialist-config-edit"]');

    await expect(page.locator('[data-testid="add-specialist-dialog"]')).toBeVisible();
    await expect(page.locator('[data-testid="specialist-name-input"]')).toHaveValue('security-monitor');
    await expect(page.locator('[data-testid="specialist-name-input"]')).toBeDisabled();
    await expect(page.locator('[data-testid="specialist-create-btn"]')).toHaveText('Save');
  });
});
