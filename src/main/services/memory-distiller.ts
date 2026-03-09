/**
 * @module src/main/services/memory-distiller
 * Distill daily and weekly summaries from specialist run history.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { getRunsSince } from '@main/stores/run-history-store';
import type { ScheduledRun } from '@shared/types/schedule';

/** Maximum summary length (chars) */
const MAX_SUMMARY_LENGTH = 5000;

function getDigestPath(specialistId: string): string {
  return path.join(os.homedir(), '.yolium', 'schedules', specialistId, 'digest.md');
}

/**
 * Format runs into a text summary.
 */
function formatRunsSummary(runs: ScheduledRun[]): string {
  if (runs.length === 0) return '';

  const lines: string[] = [];
  for (const run of runs) {
    const ts = new Date(run.startedAt).toISOString().slice(0, 16).replace('T', ' ');
    const summaryTrimmed = run.summary.length > 200 ? run.summary.slice(0, 200) + '...' : run.summary;
    lines.push(`- [${ts}] ${run.outcome}: ${summaryTrimmed} (${run.tokensUsed} tokens, $${run.costUsd.toFixed(4)})`);
  }

  const result = lines.join('\n');
  if (result.length > MAX_SUMMARY_LENGTH) {
    return result.slice(0, MAX_SUMMARY_LENGTH) + '\n... (truncated)';
  }
  return result;
}

/**
 * Produce a daily summary from today's run entries.
 */
export function distillDaily(specialistId: string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const runs = getRunsSince(specialistId, today);
  return formatRunsSummary(runs);
}

/**
 * Produce a weekly digest from the last 7 days of runs.
 */
export function distillWeekly(specialistId: string): string {
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const runs = getRunsSince(specialistId, oneWeekAgo);
  if (runs.length === 0) return '';

  const header = `# Weekly Digest — ${specialistId}\n\nPeriod: ${oneWeekAgo.toISOString().slice(0, 10)} to ${new Date().toISOString().slice(0, 10)}\nTotal runs: ${runs.length}\n\n`;
  return header + formatRunsSummary(runs);
}

/**
 * Write digest to specialist's digest file.
 */
export function writeDigest(specialistId: string, content: string): void {
  const digestPath = getDigestPath(specialistId);
  const dir = path.dirname(digestPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(digestPath, content, 'utf-8');
}

/**
 * Read existing digest from disk.
 */
export function readDigest(specialistId: string): string {
  const digestPath = getDigestPath(specialistId);
  if (!fs.existsSync(digestPath)) return '';
  return fs.readFileSync(digestPath, 'utf-8');
}
