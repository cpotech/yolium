/**
 * Cross-platform path utilities for handling Windows and Unix paths
 * in the UI consistently using forward slashes as the standard separator.
 */

/** Standard path separator used in the UI (always forward slash for consistency) */
export const PATH_SEP = '/';

/**
 * Normalize a path to use forward slashes consistently.
 * Converts all backslashes to forward slashes and collapses multiple separators.
 * Preserves UNC paths (\\server\share -> //server/share).
 */
export function normalizePath(inputPath: string): string {
  if (!inputPath) return '';

  // Check for UNC path (starts with \\ - Windows network path)
  // Only backslash-prefixed paths are considered UNC, not // which is just double slashes
  const isUNC = inputPath.startsWith('\\\\');

  // Convert all backslashes to forward slashes
  let normalized = inputPath.replace(/\\/g, '/');

  // Collapse multiple slashes (but preserve // at start for UNC)
  if (isUNC) {
    // For UNC, preserve the leading // and collapse the rest
    normalized = '//' + normalized.slice(2).replace(/\/+/g, '/');
  } else {
    normalized = normalized.replace(/\/+/g, '/');
  }

  return normalized;
}

/**
 * Get the parent directory of a path.
 * Always returns a normalized path with trailing separator.
 */
export function getParentDirectory(inputPath: string): string {
  const normalized = normalizePath(inputPath);

  // Remove trailing separator for processing
  const withoutTrailing = normalized.replace(/\/$/, '');

  if (!withoutTrailing) return '/';

  // Handle tilde home directory
  if (withoutTrailing === '~') return '~/';

  // Handle Windows drive root (e.g., C:)
  if (/^[A-Za-z]:$/.test(withoutTrailing)) {
    return withoutTrailing + '/';
  }

  // Handle Unix root
  if (withoutTrailing === '') return '/';

  // Find the last separator
  const lastSep = withoutTrailing.lastIndexOf('/');

  if (lastSep < 0) {
    // No separator found, return root
    return '/';
  }

  // Handle Windows drive (C:/something -> C:/)
  if (lastSep === 2 && /^[A-Za-z]:/.test(withoutTrailing)) {
    return withoutTrailing.substring(0, 3);
  }

  // Handle Unix root (/something -> /)
  if (lastSep === 0) {
    return '/';
  }

  // Handle tilde (~/something -> ~/)
  if (withoutTrailing.startsWith('~/') && lastSep === 1) {
    return '~/';
  }

  return withoutTrailing.substring(0, lastSep + 1);
}

/**
 * Ensure a path has a trailing separator.
 * Also normalizes the path.
 */
export function ensureTrailingSeparator(inputPath: string): string {
  const normalized = normalizePath(inputPath);

  if (!normalized) return '/';

  if (normalized.endsWith('/')) {
    return normalized;
  }

  return normalized + '/';
}

/**
 * Check if a path has a trailing separator (forward or back slash).
 */
export function hasTrailingSeparator(inputPath: string): boolean {
  if (!inputPath) return false;
  return inputPath.endsWith('/') || inputPath.endsWith('\\');
}

/**
 * Get the basename (last component) of a path.
 * Returns empty string for root paths.
 */
export function getBasename(inputPath: string): string {
  const normalized = normalizePath(inputPath);

  // Remove trailing separator
  const withoutTrailing = normalized.replace(/\/$/, '');

  if (!withoutTrailing) return '';

  // Handle Windows drive root
  if (/^[A-Za-z]:$/.test(withoutTrailing)) {
    return '';
  }

  const lastSep = withoutTrailing.lastIndexOf('/');

  if (lastSep < 0) {
    return withoutTrailing;
  }

  return withoutTrailing.substring(lastSep + 1);
}

/**
 * Check if a path matches a separator (forward or back slash).
 * Useful for keyboard event handling where user might type either.
 */
export function isSeparator(char: string): boolean {
  return char === '/' || char === '\\';
}

/**
 * Find the last separator index in a path (either / or \).
 */
export function lastSeparatorIndex(inputPath: string): number {
  const lastForward = inputPath.lastIndexOf('/');
  const lastBack = inputPath.lastIndexOf('\\');
  return Math.max(lastForward, lastBack);
}
