/**
 * @module src/main/lib/error-utils
 * Shared utilities for error handling, path validation, and folder name extraction.
 */

import * as path from 'node:path';

/**
 * Extract a human-readable error message from an unknown thrown value.
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * Check if a resolved file path is within an allowed base directory.
 * Uses path.resolve() for canonical resolution — safe against traversal via `..` segments.
 */
export function isPathWithinBase(filePath: string, baseDir: string): boolean {
  const resolvedPath = path.resolve(filePath);
  const resolvedBase = path.resolve(baseDir);
  // Ensure the resolved path starts with the base directory followed by a separator
  // (or is exactly the base directory)
  return resolvedPath === resolvedBase || resolvedPath.startsWith(resolvedBase + path.sep);
}

/**
 * Extract folder name from a full path (handles both / and \ separators).
 */
export function getFolderName(inputPath: string): string {
  return inputPath.split(/[/\\]/).filter(Boolean).pop() || inputPath;
}
