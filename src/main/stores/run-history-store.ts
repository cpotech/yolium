/**
 * @module src/main/stores/run-history-store
 * JSONL-based run history storage at ~/.yolium/schedules/{specialistId}/run_history.jsonl.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { ScheduledRun, RunStats } from '@shared/types/schedule';

function getHistoryDir(specialistId: string): string {
  return path.join(os.homedir(), '.yolium', 'schedules', specialistId);
}

function getHistoryPath(specialistId: string): string {
  return path.join(getHistoryDir(specialistId), 'run_history.jsonl');
}

/**
 * Parse all valid runs from a JSONL string, skipping corrupted lines.
 */
function parseJsonl(content: string): ScheduledRun[] {
  const lines = content.split('\n').filter(l => l.trim());
  const runs: ScheduledRun[] = [];
  for (const line of lines) {
    try {
      runs.push(JSON.parse(line));
    } catch {
      // Skip corrupted lines
    }
  }
  return runs;
}

/**
 * Read all runs from the history file.
 */
function readAllRuns(specialistId: string): ScheduledRun[] {
  const historyPath = getHistoryPath(specialistId);
  if (!fs.existsSync(historyPath)) return [];

  const content = fs.readFileSync(historyPath, 'utf-8');
  return parseJsonl(content);
}

/**
 * Append a run to the JSONL history file.
 */
export function appendRun(specialistId: string, run: ScheduledRun): void {
  const dir = getHistoryDir(specialistId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.appendFileSync(getHistoryPath(specialistId), JSON.stringify(run) + '\n', 'utf-8');
}

/**
 * Get the most recent N runs for a specialist.
 */
export function getRecentRuns(specialistId: string, limit: number): ScheduledRun[] {
  const allRuns = readAllRuns(specialistId);
  return allRuns.slice(-limit);
}

/**
 * Get all runs since a given date.
 */
export function getRunsSince(specialistId: string, since: Date): ScheduledRun[] {
  const allRuns = readAllRuns(specialistId);
  return allRuns.filter(r => new Date(r.startedAt) >= since);
}

/**
 * Compute run statistics from history.
 */
export function getRunStats(specialistId: string): RunStats {
  const allRuns = readAllRuns(specialistId);
  if (allRuns.length === 0) {
    return { totalRuns: 0, successRate: 0, weeklyCost: 0, averageTokensPerRun: 0, averageDurationMs: 0 };
  }

  const completedRuns = allRuns.filter(r => r.outcome === 'completed' || r.outcome === 'no_action');
  const successRate = (completedRuns.length / allRuns.length) * 100;

  const totalCost = allRuns.reduce((sum, r) => sum + r.costUsd, 0);
  const totalTokens = allRuns.reduce((sum, r) => sum + r.tokensUsed, 0);

  // Weekly cost: sum all costs from runs in the last 7 days
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recentRuns = allRuns.filter(r => new Date(r.startedAt) >= oneWeekAgo);
  const weeklyCost = recentRuns.reduce((sum, r) => sum + r.costUsd, 0);

  // Average duration
  const totalDuration = allRuns.reduce((sum, r) => {
    const start = new Date(r.startedAt).getTime();
    const end = new Date(r.completedAt).getTime();
    return sum + (end - start);
  }, 0);

  return {
    totalRuns: allRuns.length,
    successRate,
    weeklyCost,
    averageTokensPerRun: totalTokens / allRuns.length,
    averageDurationMs: totalDuration / allRuns.length,
  };
}

/**
 * Trim history to keep only the most recent maxEntries.
 */
export function trimHistory(specialistId: string, maxEntries: number): void {
  const allRuns = readAllRuns(specialistId);
  if (allRuns.length <= maxEntries) return;

  const trimmed = allRuns.slice(-maxEntries);
  const content = trimmed.map(r => JSON.stringify(r)).join('\n') + '\n';
  fs.writeFileSync(getHistoryPath(specialistId), content, 'utf-8');
}
