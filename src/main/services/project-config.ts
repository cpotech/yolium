/**
 * @module src/main/services/project-config
 * Loads and validates .yolium.json project configuration.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createLogger } from '@main/lib/logger';

const logger = createLogger('project-config');

export interface ProjectConfig {
  sharedDirs?: string[];
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
  } catch (err) {
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
