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
    const { window } = ctx;

    await expect(window.locator(selectors.sidebar)).toBeVisible({ timeout: 30000 });
    await window.click(selectors.sidebarSchedule);

    await expect(window.locator('[data-testid="schedule-panel"]')).toBeVisible();
    await window.click('[data-testid="configure-security-monitor"]');

    await expect(window.locator('[data-testid="specialist-config-dialog"]')).toBeVisible();
    await window.click('[data-testid="specialist-config-edit"]');

    await expect(window.locator('[data-testid="add-specialist-dialog"]')).toBeVisible();
    await expect(window.locator('[data-testid="specialist-name-input"]')).toHaveValue('security-monitor');
    await expect(window.locator('[data-testid="specialist-name-input"]')).toBeDisabled();
    await expect(window.locator('[data-testid="specialist-create-btn"]')).toHaveText('Save');
  });
});
