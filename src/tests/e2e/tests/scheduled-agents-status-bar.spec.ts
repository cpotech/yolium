import { test, expect } from '@playwright/test';
import { launchApp, AppContext } from '../helpers/app';
import { selectors } from '../helpers/selectors';

test.describe('Scheduled Agents Status Bar', () => {
  let ctx: AppContext;

  async function openScheduledAgents(): Promise<void> {
    ctx = await launchApp({ skipDockerWait: true });
    const { window } = ctx;

    await expect(window.locator(selectors.sidebar)).toBeVisible({ timeout: 30000 });
    await window.click(selectors.sidebarSchedule);
  }

  test.afterEach(async () => {
    if (ctx) {
      const electronProcess = ctx.app.process();
      if (electronProcess && !electronProcess.killed) {
        electronProcess.kill('SIGKILL');
      }
      ctx = undefined as unknown as AppContext;
    }
  });

  test('should open the Scheduled Agents tab from the sidebar and display the shared status bar', async () => {
    await openScheduledAgents();
    const { window } = ctx;

    await expect(window.locator('[data-testid="schedule-panel"]')).toBeVisible();
    await expect(window.locator(selectors.statusBar)).toBeVisible();
    await expect(window.locator('[data-testid="status-label"]')).toHaveText('Scheduled Agents');
  });

  test('should show the shared footer controls in the Scheduled Agents tab', async () => {
    await openScheduledAgents();
    const { window } = ctx;

    await expect(window.locator(selectors.statusBar)).toBeVisible();
    await expect(window.locator(selectors.settingsButton)).toBeVisible();
    await expect(window.locator(selectors.shortcutsButton)).toBeVisible();
    await expect(window.locator(selectors.themeToggle)).toBeVisible();
    await expect(window.locator(selectors.speechToTextButton)).toBeVisible();
    await expect(window.locator(selectors.speechModelSelect)).toBeVisible();
    await expect(window.locator('[data-testid="project-settings-button"]')).toHaveCount(0);
  });

  test('should open the keyboard shortcuts dialog from the Scheduled Agents status bar', async () => {
    await openScheduledAgents();
    const { window } = ctx;
    await window.click(selectors.shortcutsButton);

    await expect(window.locator(selectors.shortcutsDialog)).toBeVisible();
  });

  test('should toggle theme from the Scheduled Agents status bar', async () => {
    await openScheduledAgents();
    const { window } = ctx;
    const initialTheme = await window.locator('html').getAttribute('data-theme');

    await window.click(selectors.themeToggle);

    await expect(window.locator('html')).not.toHaveAttribute('data-theme', initialTheme ?? 'dark');
  });
});
