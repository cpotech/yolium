/**
 * @module src/main/stores/actions-db
 * Action log query operations.
 */

import type { ActionLogEntry, ActionStats } from '@shared/types/schedule';
import { getDb, generateId, safeJsonParse } from './db-connection';

function rowToAction(row: any): ActionLogEntry {
  return {
    id: row.id,
    runId: row.run_id,
    specialistId: row.specialist_id,
    action: row.action,
    data: safeJsonParse(row.data, {}),
    timestamp: row.timestamp,
  };
}

export function appendAction(specialistId: string, entry: ActionLogEntry): void {
  const database = getDb();
  database.prepare(`
    INSERT OR REPLACE INTO actions (id, run_id, specialist_id, action, data, timestamp)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(entry.id, entry.runId, entry.specialistId, entry.action, JSON.stringify(entry.data), entry.timestamp);
}

export function getRecentActions(specialistId: string, limit: number): ActionLogEntry[] {
  const database = getDb();
  const rows = database.prepare(`
    SELECT * FROM (
      SELECT id, run_id, specialist_id, action, data, timestamp
      FROM actions WHERE specialist_id = ?
      ORDER BY timestamp DESC LIMIT ?
    ) sub ORDER BY timestamp ASC
  `).all(specialistId, limit) as any[];

  return rows.map(rowToAction);
}

export function getActionsByRun(specialistId: string, runId: string): ActionLogEntry[] {
  const database = getDb();
  const rows = database.prepare(`
    SELECT id, run_id, specialist_id, action, data, timestamp
    FROM actions WHERE specialist_id = ? AND run_id = ?
    ORDER BY timestamp ASC
  `).all(specialistId, runId) as any[];

  return rows.map(rowToAction);
}

export function getAllRecentActions(specialistIds: string[], limit: number): ActionLogEntry[] {
  if (specialistIds.length === 0) return [];

  const database = getDb();
  const placeholders = specialistIds.map(() => '?').join(', ');
  const rows = database.prepare(`
    SELECT id, run_id, specialist_id, action, data, timestamp
    FROM actions WHERE specialist_id IN (${placeholders})
    ORDER BY timestamp DESC LIMIT ?
  `).all(...specialistIds, limit) as any[];

  return rows.map(rowToAction);
}

export function getActionStats(specialistId: string): ActionStats {
  const database = getDb();

  const totalRow = database.prepare(
    'SELECT COUNT(*) as total FROM actions WHERE specialist_id = ?'
  ).get(specialistId) as any;

  const countRows = database.prepare(
    'SELECT action, COUNT(*) as cnt FROM actions WHERE specialist_id = ? GROUP BY action'
  ).all(specialistId) as any[];

  const actionCounts: Record<string, number> = {};
  for (const row of countRows) {
    actionCounts[row.action] = row.cnt;
  }

  return {
    totalActions: totalRow?.total || 0,
    actionCounts,
  };
}
