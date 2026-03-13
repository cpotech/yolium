import { test, expect } from '@playwright/test';
import Database from 'better-sqlite3';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { launchApp, AppContext } from '../helpers/app';
import { selectors } from '../helpers/selectors';

test.describe('Scheduled Agents Status Bar', () => {
  let ctx: AppContext;
  let seededRunId: string | null = null;
  let seededLogPath: string | null = null;

  async function seedRunHistory(): Promise<void> {
    const specialistDir = path.join(os.homedir(), '.yolium', 'schedules', 'twitter-growth');
    const dbPath = path.join(os.homedir(), '.yolium', 'schedules.db');
    const runId = `status-bar-layout-${Date.now()}`;
    const completedAt = new Date().toISOString();
    const startedAt = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const summary = `Status bar layout regression ${runId}`;
    const run = {
      id: runId,
      specialistId: 'twitter-growth',
      scheduleType: 'daily',
      startedAt,
      completedAt,
      status: 'completed',
      tokensUsed: 1500,
      costUsd: 0.015,
      summary,
      outcome: 'completed',
    };

    await fs.mkdir(path.dirname(dbPath), { recursive: true });
    await fs.mkdir(path.join(specialistDir, 'runs'), { recursive: true });
    const db = new Database(dbPath);
    db.exec(`
      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY,
        specialist_id TEXT NOT NULL,
        schedule_type TEXT NOT NULL,
        started_at TEXT NOT NULL,
        completed_at TEXT NOT NULL,
        status TEXT NOT NULL,
        tokens_used INTEGER NOT NULL DEFAULT 0,
        cost_usd REAL NOT NULL DEFAULT 0,
        summary TEXT NOT NULL DEFAULT '',
        outcome TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_runs_specialist ON runs(specialist_id, started_at);
    `);
    db.prepare(`
      INSERT OR REPLACE INTO runs (id, specialist_id, schedule_type, started_at, completed_at, status, tokens_used, cost_usd, summary, outcome)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      run.id,
      run.specialistId,
      run.scheduleType,
      run.startedAt,
      run.completedAt,
      run.status,
      run.tokensUsed,
      run.costUsd,
      run.summary,
      run.outcome,
    );
    db.close();

    seededRunId = runId;
    seededLogPath = path.join(specialistDir, 'runs', `${runId}.log`);
    await fs.writeFile(
      seededLogPath,
      Array.from({ length: 120 }, (_, index) => `[${completedAt}] Log line ${index + 1}`).join('\n'),
      'utf-8',
    );
  }

  async function openScheduledAgents(): Promise<void> {
    ctx = await launchApp({ skipDockerWait: true });
    const { window } = ctx;

    await window.evaluate(() => {
      localStorage.removeItem('yolium-session');
      localStorage.removeItem('yolium-sidebar-projects');
      localStorage.removeItem('yolium-open-kanban-tabs');
    });
    await window.reload();
    await window.waitForLoadState('domcontentloaded');
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
    if (seededRunId) {
      const dbPath = path.join(os.homedir(), '.yolium', 'schedules.db');
      if (await fs.stat(dbPath).then(() => true).catch(() => false)) {
        const db = new Database(dbPath);
        db.prepare('DELETE FROM runs WHERE id = ?').run(seededRunId);
        db.close();
      }
      seededRunId = null;
    }
    if (seededLogPath) {
      await fs.rm(seededLogPath, { force: true });
      seededLogPath = null;
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

  test('should keep scheduled run history detail above the shared status bar', async () => {
    await seedRunHistory();
    await openScheduledAgents();

    const { window } = ctx;
    expect(seededRunId).not.toBeNull();

    await window.click('[data-testid="history-twitter-growth"]');
    await expect(window.locator('[data-testid="schedule-panel-history"]')).toBeVisible();
    await window.click(`[data-testid="run-row-${seededRunId!}"]`);
    await expect(window.locator('[data-testid="run-detail-view"]')).toBeVisible();

    const detailBox = await window.locator('[data-testid="run-detail-view"]').boundingBox();
    const logBox = await window.locator('[data-testid="run-detail-log"]').boundingBox();
    const statusBarBox = await window.locator(selectors.statusBar).boundingBox();

    expect(detailBox).not.toBeNull();
    expect(logBox).not.toBeNull();
    expect(statusBarBox).not.toBeNull();
    expect(detailBox!.y + detailBox!.height).toBeLessThanOrEqual(statusBarBox!.y + 1);
    expect(logBox!.y + logBox!.height).toBeLessThanOrEqual(statusBarBox!.y + 1);
  });
});
