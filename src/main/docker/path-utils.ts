/**
 * @module src/lib/docker/path-utils
 * Path conversion utilities for Docker bind mounts and container paths.
 */

import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { isWindows, CONTAINER_WORKSPACE } from './shared';

/**
 * Normalize a host path for use in Docker bind mount strings.
 * On Windows, converts backslashes to forward slashes (Docker requirement).
 * On Linux/macOS, returns the path unchanged.
 *
 * Docker bind mounts require forward slashes even on Windows:
 * - Valid:   C:/Users/name/project:/workspace:rw
 * - Invalid: C:\Users\name\project:/workspace:rw
 *
 * @param hostPath - The host filesystem path
 * @returns Path with forward slashes for Docker
 */
export function toDockerPath(hostPath: string): string {
  if (!isWindows) return hostPath;
  return hostPath.replace(/\\/g, '/');
}

/**
 * Get the container-side path for the project directory.
 * On Windows, returns /workspace (since Windows paths don't work in Linux containers).
 * On Linux/macOS, returns the same path for symlink compatibility.
 *
 * @param hostPath - The host filesystem path
 * @returns Container-side path for the project
 */
export function getContainerProjectPath(hostPath: string): string {
  return isWindows ? CONTAINER_WORKSPACE : hostPath;
}

/**
 * Convert a Windows home path to a Linux-compatible absolute path for use
 * inside the container. This allows symlink creation to work correctly.
 *
 * On Windows, converts C:\Users\name to /c/Users/name so it's an absolute
 * path in the Linux container. Without this, ln -sf would create the symlink
 * in the current directory instead of at the intended location.
 *
 * On Linux/macOS, returns the path unchanged.
 *
 * @param hostHome - The host home directory path
 * @returns Linux-style absolute path for use in container
 */
export function toContainerHomePath(hostHome: string): string {
  if (!isWindows) return hostHome;
  // Convert backslashes to forward slashes
  const dockerPath = hostHome.replace(/\\/g, '/');
  // Convert C:/Users/name to /c/Users/name (lowercase drive letter, absolute path)
  if (/^[A-Za-z]:/.test(dockerPath)) {
    const driveLetter = dockerPath[0].toLowerCase();
    return `/${driveLetter}${dockerPath.slice(2)}`;
  }
  return dockerPath;
}

/**
 * Generate a 12-character SHA256 hash of the absolute project path.
 * Used to create unique, isolated directories per project.
 *
 * @param projectPath - The project path to hash
 * @returns 12-character hash string
 */
export function hashProjectPath(projectPath: string): string {
  const absolutePath = path.resolve(projectPath);
  return createHash('sha256')
    .update(absolutePath)
    .digest('hex')
    .substring(0, 12);
}

/**
 * Sanitize a folder name for use in directory names.
 * Removes/replaces characters that could cause issues in paths.
 *
 * @param folderPath - The folder path to sanitize
 * @returns Sanitized folder name (lowercase, alphanumeric with hyphens)
 */
export function sanitizeFolderName(folderPath: string): string {
  const folderName = path.basename(folderPath);
  return folderName
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '-')  // Replace non-alphanumeric with hyphens
    .replace(/-+/g, '-')           // Collapse multiple hyphens
    .replace(/^-|-$/g, '')         // Trim leading/trailing hyphens
    .substring(0, 30);             // Limit length
}

/**
 * Generate a project directory name combining folder name and hash.
 * Format: <sanitized-folder-name>-<hash> (e.g., "my-project-a1b2c3d4e5f6")
 *
 * @param projectPath - The project path
 * @returns Directory name for the project
 */
export function getProjectDirName(projectPath: string): string {
  const sanitizedName = sanitizeFolderName(projectPath);
  const hash = hashProjectPath(projectPath);
  return sanitizedName ? `${sanitizedName}-${hash}` : `project-${hash}`;
}
