import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { ActionLogEntry, ActionStats } from '@shared/types/schedule';

function getActionDir(specialistId: string): string {
  return path.join(os.homedir(), '.yolium', 'schedules', specialistId);
}

function getActionPath(specialistId: string): string {
  return path.join(getActionDir(specialistId), 'actions.jsonl');
}

function parseJsonl(content: string): ActionLogEntry[] {
  const actions: ActionLogEntry[] = [];

  for (const line of content.split('\n').filter(entry => entry.trim())) {
    try {
      actions.push(JSON.parse(line));
    } catch {
      // Skip corrupted lines to match run history behavior.
    }
  }

  return actions;
}

function readAllActions(specialistId: string): ActionLogEntry[] {
  const actionPath = getActionPath(specialistId);
  if (!fs.existsSync(actionPath)) return [];

  return parseJsonl(fs.readFileSync(actionPath, 'utf-8'));
}

export function appendAction(specialistId: string, entry: ActionLogEntry): void {
  const dir = getActionDir(specialistId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.appendFileSync(getActionPath(specialistId), `${JSON.stringify(entry)}\n`, 'utf-8');
}

export function getRecentActions(specialistId: string, limit: number): ActionLogEntry[] {
  return readAllActions(specialistId).slice(-limit);
}

export function getActionsByRun(specialistId: string, runId: string): ActionLogEntry[] {
  return readAllActions(specialistId).filter(entry => entry.runId === runId);
}

export function getAllRecentActions(specialistIds: string[], limit: number): ActionLogEntry[] {
  const allActions: ActionLogEntry[] = [];
  for (const id of specialistIds) {
    allActions.push(...readAllActions(id));
  }
  allActions.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return allActions.slice(0, limit);
}

export function getActionStats(specialistId: string): ActionStats {
  const entries = readAllActions(specialistId);
  const actionCounts = entries.reduce<Record<string, number>>((counts, entry) => {
    counts[entry.action] = (counts[entry.action] || 0) + 1;
    return counts;
  }, {});

  return {
    totalActions: entries.length,
    actionCounts,
  };
}
