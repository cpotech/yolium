// src/main/stores/workitem-log-store.ts
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';

const YOLIUM_DIR = path.join(os.homedir(), '.yolium');
const LOGS_DIR = path.join(YOLIUM_DIR, 'logs');

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Hash project path to get a stable directory name for logs.
 * Uses the same normalization as kanban-store.
 */
export function projectHash(projectPath: string): string {
  let normalized = path.resolve(projectPath).replace(/\\/g, '/');
  if (normalized.endsWith('/') && normalized.length > 1) {
    normalized = normalized.slice(0, -1);
  }
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 12);
}

function getLogDir(projectPath: string): string {
  return path.join(LOGS_DIR, projectHash(projectPath));
}

function getLogPath(projectPath: string, itemId: string): string {
  return path.join(getLogDir(projectPath), `${itemId}.log`);
}

/**
 * Append output lines to a work item's persistent log file.
 * Creates the file and directories if they don't exist.
 */
export function appendLog(projectPath: string, itemId: string, data: string): void {
  const logPath = getLogPath(projectPath, itemId);
  ensureDir(path.dirname(logPath));
  fs.appendFileSync(logPath, data);
}

/**
 * Read the full log for a work item.
 * Returns an empty string if no log file exists.
 */
export function readLog(projectPath: string, itemId: string): string {
  const logPath = getLogPath(projectPath, itemId);
  if (!fs.existsSync(logPath)) {
    return '';
  }
  try {
    return fs.readFileSync(logPath, 'utf-8');
  } catch {
    return '';
  }
}

/**
 * Delete the log file for a work item.
 * Returns true if a file was deleted, false if none existed.
 */
export function deleteLog(projectPath: string, itemId: string): boolean {
  const logPath = getLogPath(projectPath, itemId);
  if (fs.existsSync(logPath)) {
    fs.unlinkSync(logPath);
    return true;
  }
  return false;
}

/**
 * Append a session separator to the log, marking the start of a new agent session.
 */
export function appendSessionHeader(
  projectPath: string,
  itemId: string,
  agentName: string
): void {
  const timestamp = new Date().toISOString();
  const separator = `\n--- ${agentName} session started at ${timestamp} ---\n`;
  appendLog(projectPath, itemId, separator);
}
