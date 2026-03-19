/**
 * @module src/main/stores/schedule-db
 * Schedule state, run history, and per-run log file operations.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  ScheduleState,
  SpecialistStatus,
  ScheduledRun,
  RunStats,
} from '@shared/types/schedule';
import { getDb, generateId, getSchedulesDir } from './db-connection';

// ─── Schedule State ───────────────────────────────────────────────────────

function createDefaultState(): ScheduleState {
  return { specialists: {}, globalEnabled: false };
}

export function getScheduleState(): ScheduleState {
  const database = getDb();
  const row = database.prepare('SELECT value FROM schedule_state WHERE key = ?').get('state') as { value: string } | undefined;
  if (!row) return createDefaultState();

  try {
    return JSON.parse(row.value) as ScheduleState;
  } catch { /* invalid JSON — use default */
    return createDefaultState();
  }
}

export function saveScheduleState(state: ScheduleState): void {
  const database = getDb();
  database.prepare('INSERT OR REPLACE INTO schedule_state (key, value) VALUES (?, ?)').run('state', JSON.stringify(state));
}

export function updateSpecialistStatus(
  state: ScheduleState,
  id: string,
  updates: Partial<SpecialistStatus>
): ScheduleState {
  const existing = state.specialists[id];
  if (!existing) return state;

  return {
    ...state,
    specialists: {
      ...state.specialists,
      [id]: { ...existing, ...updates },
    },
  };
}

export function toggleSpecialist(
  state: ScheduleState,
  id: string,
  enabled: boolean
): ScheduleState {
  return updateSpecialistStatus(state, id, { enabled });
}

export function toggleGlobal(
  state: ScheduleState,
  enabled: boolean
): ScheduleState {
  return { ...state, globalEnabled: enabled };
}

// ─── Reset ────────────────────────────────────────────────────────────────

export function resetSpecialist(
  state: ScheduleState,
  specialistId: string,
): ScheduleState {
  const database = getDb();

  database.prepare('DELETE FROM runs WHERE specialist_id = ?').run(specialistId);
  database.prepare('DELETE FROM actions WHERE specialist_id = ?').run(specialistId);

  const runsDir = path.join(getSchedulesDir(), specialistId, 'runs');
  if (fs.existsSync(runsDir)) {
    fs.rmSync(runsDir, { recursive: true, force: true });
  }

  const digestPath = path.join(getSchedulesDir(), specialistId, 'digest.md');
  if (fs.existsSync(digestPath)) {
    fs.rmSync(digestPath);
  }

  const workspaceDir = path.join(getSchedulesDir(), specialistId, 'workspace');
  if (fs.existsSync(workspaceDir)) {
    fs.rmSync(workspaceDir, { recursive: true, force: true });
  }

  const existing = state.specialists[specialistId];
  if (!existing) return state;

  const { skipEveryN: _, ...rest } = existing;
  return {
    ...state,
    specialists: {
      ...state.specialists,
      [specialistId]: {
        ...rest,
        consecutiveNoAction: 0,
        consecutiveFailures: 0,
        totalRuns: 0,
        successRate: 0,
        weeklyCost: 0,
      },
    },
  };
}

// ─── Run History ──────────────────────────────────────────────────────────

export function appendRun(specialistId: string, run: ScheduledRun): void {
  const database = getDb();
  database.prepare(`
    INSERT OR REPLACE INTO runs (id, specialist_id, schedule_type, started_at, completed_at, status, tokens_used, cost_usd, summary, outcome)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    run.id, run.specialistId, run.scheduleType,
    run.startedAt, run.completedAt, run.status,
    run.tokensUsed, run.costUsd, run.summary, run.outcome
  );
}

function rowToRun(row: any): ScheduledRun {
  return {
    id: row.id,
    specialistId: row.specialist_id,
    scheduleType: row.schedule_type,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    status: row.status,
    tokensUsed: row.tokens_used,
    costUsd: row.cost_usd,
    summary: row.summary,
    outcome: row.outcome,
  };
}

export function getRecentRuns(specialistId: string, limit: number): ScheduledRun[] {
  const database = getDb();
  const rows = database.prepare(`
    SELECT * FROM (
      SELECT id, specialist_id, schedule_type, started_at, completed_at, status, tokens_used, cost_usd, summary, outcome
      FROM runs WHERE specialist_id = ?
      ORDER BY started_at DESC LIMIT ?
    ) sub ORDER BY started_at ASC
  `).all(specialistId, limit) as any[];

  return rows.map(rowToRun);
}

export function getRunsSince(specialistId: string, since: Date): ScheduledRun[] {
  const database = getDb();
  const rows = database.prepare(`
    SELECT id, specialist_id, schedule_type, started_at, completed_at, status, tokens_used, cost_usd, summary, outcome
    FROM runs WHERE specialist_id = ? AND started_at >= ?
    ORDER BY started_at ASC
  `).all(specialistId, since.toISOString()) as any[];

  return rows.map(rowToRun);
}

export function getRunStats(specialistId: string): RunStats {
  const database = getDb();

  const statsRow = database.prepare(`
    SELECT
      COUNT(*) as total_runs,
      SUM(CASE WHEN outcome IN ('completed', 'no_action') THEN 1 ELSE 0 END) as success_count,
      SUM(tokens_used) as total_tokens,
      SUM(
        (julianday(completed_at) - julianday(started_at)) * 86400000
      ) as total_duration_ms
    FROM runs WHERE specialist_id = ?
  `).get(specialistId) as any;

  if (!statsRow || statsRow.total_runs === 0) {
    return { totalRuns: 0, successRate: 0, weeklyCost: 0, averageTokensPerRun: 0, averageDurationMs: 0 };
  }

  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const costRow = database.prepare(`
    SELECT COALESCE(SUM(cost_usd), 0) as weekly_cost
    FROM runs WHERE specialist_id = ? AND started_at >= ?
  `).get(specialistId, oneWeekAgo) as any;

  return {
    totalRuns: statsRow.total_runs,
    successRate: (statsRow.success_count / statsRow.total_runs) * 100,
    weeklyCost: costRow.weekly_cost,
    averageTokensPerRun: statsRow.total_tokens / statsRow.total_runs,
    averageDurationMs: statsRow.total_duration_ms / statsRow.total_runs,
  };
}

export function trimHistory(specialistId: string, maxEntries: number): void {
  const database = getDb();
  database.prepare(`
    DELETE FROM runs WHERE specialist_id = ? AND id NOT IN (
      SELECT id FROM runs WHERE specialist_id = ?
      ORDER BY started_at DESC LIMIT ?
    )
  `).run(specialistId, specialistId, maxEntries);
}

// ─── Per-Run Log Files (stay as files, not SQLite) ────────────────────────

function getRunLogDir(specialistId: string): string {
  return path.join(getSchedulesDir(), specialistId, 'runs');
}

function getRunLogPath(specialistId: string, runId: string): string {
  return path.join(getRunLogDir(specialistId), `${runId}.log`);
}

export function appendRunLog(specialistId: string, runId: string, data: string): void {
  const dir = getRunLogDir(specialistId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const timestamp = new Date().toISOString();
  fs.appendFileSync(getRunLogPath(specialistId, runId), `[${timestamp}] ${data}\n`, 'utf-8');
}

export function getRunLog(specialistId: string, runId: string): string {
  const logPath = getRunLogPath(specialistId, runId);
  if (!fs.existsSync(logPath)) return '';
  return fs.readFileSync(logPath, 'utf-8');
}
