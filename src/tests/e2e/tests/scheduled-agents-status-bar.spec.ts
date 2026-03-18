import { test, expect } from '@playwright/test';
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

    seededRunId = runId;
    seededLogPath = path.join(specialistDir, 'runs', `${runId}.log`);

    await ctx.app.evaluate((_electron, seededRun) => {
      const moduleApi = process.getBuiltinModule('node:module');
      const fs = process.getBuiltinModule('node:fs');
      const os = process.getBuiltinModule('node:os');
      const path = process.getBuiltinModule('node:path');
      if (!moduleApi || !fs || !os || !path) {
        throw new Error('Required Node builtins are unavailable in Electron evaluate context');
      }
      const require = moduleApi.createRequire(path.join(process.cwd(), 'package.json'));
      const Database = require('better-sqlite3');

      const dbPath = path.join(os.homedir(), '.yolium', 'yolium.db');
      const runDir = path.join(os.homedir(), '.yolium', 'schedules', seededRun.specialistId, 'runs');
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
      fs.mkdirSync(runDir, { recursive: true });

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
        seededRun.id,
        seededRun.specialistId,
        seededRun.scheduleType,
        seededRun.startedAt,
        seededRun.completedAt,
        seededRun.status,
        seededRun.tokensUsed,
        seededRun.costUsd,
        seededRun.summary,
        seededRun.outcome,
      );

      const stateRow = db.prepare('SELECT value FROM schedule_state WHERE key = ?').get('state');
      const state = stateRow?.value
        ? JSON.parse(stateRow.value)
        : { specialists: {}, globalEnabled: false };
      const existingStatus = state.specialists[seededRun.specialistId] ?? {
        id: seededRun.specialistId,
        enabled: true,
        consecutiveNoAction: 0,
        consecutiveFailures: 0,
        totalRuns: 0,
        successRate: 0,
        weeklyCost: 0,
      };
      state.specialists[seededRun.specialistId] = {
        ...existingStatus,
        totalRuns: Math.max(existingStatus.totalRuns, 1),
        successRate: 100,
        weeklyCost: Math.max(existingStatus.weeklyCost, seededRun.costUsd),
      };
      db.prepare('INSERT OR REPLACE INTO schedule_state (key, value) VALUES (?, ?)').run('state', JSON.stringify(state));
      db.close();
    }, run);

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
      if (ctx) {
        await ctx.app.evaluate((_electron, runId: string) => {
          const moduleApi = process.getBuiltinModule('node:module');
          const os = process.getBuiltinModule('node:os');
          const path = process.getBuiltinModule('node:path');
          if (!moduleApi || !os || !path) {
            throw new Error('Required Node builtins are unavailable in Electron evaluate context');
          }
          const require = moduleApi.createRequire(path.join(process.cwd(), 'package.json'));
          const Database = require('better-sqlite3');

          const dbPath = path.join(os.homedir(), '.yolium', 'yolium.db');
          const db = new Database(dbPath);
          db.prepare('DELETE FROM runs WHERE id = ?').run(runId);
          const stateRow = db.prepare('SELECT value FROM schedule_state WHERE key = ?').get('state');
          if (stateRow?.value) {
            const state = JSON.parse(stateRow.value);
            const status = state.specialists?.['twitter-growth'];
            if (status) {
              state.specialists['twitter-growth'] = {
                ...status,
                totalRuns: 0,
                successRate: 0,
                weeklyCost: 0,
              };
              db.prepare('INSERT OR REPLACE INTO schedule_state (key, value) VALUES (?, ?)').run('state', JSON.stringify(state));
            }
          }
          db.close();
        }, seededRunId);
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
    await openScheduledAgents();
    await seedRunHistory();

    const { window } = ctx;
    expect(seededRunId).not.toBeNull();

    await window.click('[data-testid="schedule-reload-btn"]');
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
