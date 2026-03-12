/**
 * @module src/main/services/tools-resolver
 * Resolve tool directories for mounting into agent containers at runtime.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Get the base directory containing tool subdirectories.
 * In dev: src/tools/
 * In prod: resources/tools/
 */
export function getToolsDir(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { app } = require('electron');
    const appPath = app.getAppPath();
    const devPath = path.join(appPath, 'src', 'tools');
    if (fs.existsSync(devPath)) {
      return devPath;
    }
  } catch {
    // Electron not available (test environment)
  }

  if (process.resourcesPath) {
    const prodPath = path.join(process.resourcesPath, 'tools');
    if (fs.existsSync(prodPath)) {
      return prodPath;
    }
  }

  // Fallback for test environment
  return path.join(__dirname, '..', 'tools');
}

/**
 * Resolve a tool directory by name.
 * Returns the absolute path to tools/{name} if it exists, null otherwise.
 */
export function resolveToolDir(name: string): string | null {
  // Try production path first if available
  if (process.resourcesPath) {
    const prodPath = path.join(process.resourcesPath, 'tools', name);
    if (fs.existsSync(prodPath)) {
      return prodPath;
    }
  }

  // Try dev/fallback path
  const baseDir = getToolsDir();
  const toolPath = path.join(baseDir, name);
  if (fs.existsSync(toolPath)) {
    return toolPath;
  }

  return null;
}
