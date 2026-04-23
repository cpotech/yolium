/**
 * @module src/main/services/project-config
 * Loads and validates .yolium.json project configuration.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CavemanMode } from '@shared/types/kanban';
import { createLogger } from '@main/lib/logger';

const logger = createLogger('project-config');

export interface ProjectConfig {
  sharedDirs?: string[];
  cavemanMode?: CavemanMode;
}

/**
 * Load and parse .yolium.json from a project directory.
 * Returns null if the file doesn't exist or is invalid JSON.
 */
export function loadProjectConfig(projectPath: string): ProjectConfig | null {
  const configPath = path.join(projectPath, '.yolium.json');
  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      logger.warn('Invalid .yolium.json: not an object', { projectPath });
      return null;
    }
    return parsed as ProjectConfig;
  } catch (err) { /* intentionally ignored */
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      logger.warn('Failed to read .yolium.json', {
        projectPath,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return null;
  }
}

/**
 * Validate a single shared directory path.
 * Rejects absolute paths, path traversal (../), and empty strings.
 */
export function isValidSharedDir(dir: unknown): dir is string {
  if (typeof dir !== 'string') return false;
  if (dir.length === 0) return false;
  if (path.isAbsolute(dir)) return false;

  // Normalize and check for traversal
  const normalized = path.normalize(dir);
  if (normalized.startsWith('..') || normalized.includes(`${path.sep}..`)) return false;
  // Also check with forward slashes for cross-platform safety
  if (normalized.startsWith('..') || normalized.includes('/..')) return false;

  return true;
}

/**
 * Save project configuration to .yolium.json.
 * Preserves any existing keys not in the ProjectConfig interface.
 */
export function saveProjectConfig(projectPath: string, config: ProjectConfig): void {
  const configPath = path.join(projectPath, '.yolium.json');
  let existing: Record<string, unknown> = {};

  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      existing = parsed;
    }
  } catch { /* File doesn't exist or invalid — start fresh */
  }

  const merged: Record<string, unknown> = { ...existing, sharedDirs: config.sharedDirs };
  // cavemanMode: preserve existing value when caller omits the field; overwrite
  // (including to 'off') when caller provides it.
  if ('cavemanMode' in config) {
    if (config.cavemanMode === undefined) {
      delete merged.cavemanMode;
    } else {
      merged.cavemanMode = config.cavemanMode;
    }
  }
  fs.writeFileSync(configPath, JSON.stringify(merged, null, 2) + '\n', 'utf-8');
  logger.info('Saved .yolium.json', { projectPath });
}

/**
 * Check whether a shared directory path exists on disk and is a directory.
 */
export function checkSharedDirExists(projectPath: string, dir: string): boolean {
  const fullPath = path.join(projectPath, dir);
  try {
    return fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory();
  } catch { /* path may not be stat-able (e.g. broken symlink) */
    return false;
  }
}

/**
 * Get validated shared directories that exist on disk.
 * Reads .yolium.json from projectPath, validates each entry, and filters
 * to only directories that actually exist.
 */
export function getValidatedSharedDirs(projectPath: string): string[] {
  const config = loadProjectConfig(projectPath);
  if (!config?.sharedDirs || !Array.isArray(config.sharedDirs)) {
    return [];
  }

  const valid: string[] = [];
  for (const dir of config.sharedDirs) {
    if (!isValidSharedDir(dir)) {
      logger.warn('Skipping invalid sharedDir entry', { dir, projectPath });
      continue;
    }

    const fullPath = path.join(projectPath, dir);
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
      valid.push(dir);
    } else {
      logger.warn('Skipping non-existent sharedDir', { dir, fullPath });
    }
  }

  return valid;
}
