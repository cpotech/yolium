/**
 * @module src/renderer/lib/path-utils
 * Shared path utilities for the renderer process.
 */

/**
 * Extract folder name from a full path (handles both / and \ separators).
 */
export function getFolderName(path: string): string {
  return path.split(/[/\\]/).filter(Boolean).pop() || path;
}
