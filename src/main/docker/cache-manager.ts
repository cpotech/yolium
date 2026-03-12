/**
 * @module src/lib/docker/cache-manager
 * Project cache management and cleanup functions.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createLogger } from '@main/lib/logger';
import { loadProjectRegistry, saveProjectRegistry } from './project-registry';
import type { ProjectCacheInfo, CacheStats, CleanupResult } from '@shared/types/docker';

const logger = createLogger('cache-manager');

/**
 * Calculate the total size of a directory recursively.
 *
 * @param dirPath - Directory path to calculate size for
 * @returns Total size in bytes
 */
function getDirectorySize(dirPath: string): number {
  let totalSize = 0;
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        totalSize += getDirectorySize(entryPath);
      } else if (entry.isFile()) {
        totalSize += fs.statSync(entryPath).size;
      }
    }
  } catch {
    // Directory doesn't exist or can't be read
  }
  return totalSize;
}

/**
 * List all registered project caches with their metadata.
 * @returns Array of project cache info, sorted by last accessed (most recent first)
 */
export function listProjectCaches(): ProjectCacheInfo[] {
  const registry = loadProjectRegistry();
  const homeDir = os.homedir();
  const results: ProjectCacheInfo[] = [];

  for (const [dirName, entry] of Object.entries(registry.projects)) {
    const cacheBase = path.join(homeDir, '.cache', 'yolium', dirName);
    const historyBase = path.join(homeDir, '.yolium', 'projects', dirName);

    results.push({
      dirName,
      path: entry.path,
      folderName: entry.folderName,
      lastAccessed: entry.lastAccessed,
      createdAt: entry.createdAt,
      exists: fs.existsSync(entry.path),
      cacheSizeBytes: getDirectorySize(cacheBase),
      historySizeBytes: getDirectorySize(historyBase),
    });
  }

  // Sort by lastAccessed (most recent first)
  return results.sort((a, b) =>
    new Date(b.lastAccessed).getTime() - new Date(a.lastAccessed).getTime()
  );
}

/**
 * Get aggregate statistics about project caches.
 * @returns Cache statistics object
 */
export function getProjectCacheStats(): CacheStats {
  const caches = listProjectCaches();

  const stats: CacheStats = {
    totalProjects: caches.length,
    existingProjects: caches.filter(c => c.exists).length,
    orphanedProjects: caches.filter(c => !c.exists).length,
    totalCacheSizeBytes: caches.reduce((sum, c) => sum + c.cacheSizeBytes, 0),
    totalHistorySizeBytes: caches.reduce((sum, c) => sum + c.historySizeBytes, 0),
    oldestAccess: caches.length > 0 ? caches[caches.length - 1].lastAccessed : null,
    newestAccess: caches.length > 0 ? caches[0].lastAccessed : null,
  };

  return stats;
}

/**
 * Delete a specific project's cache directories.
 *
 * @param dirName - The project directory name to delete
 * @returns Object with deleted status and optional error
 */
export function deleteProjectCache(dirName: string): { deleted: boolean; error?: string } {
  const homeDir = os.homedir();
  const cacheBase = path.join(homeDir, '.cache', 'yolium', dirName);
  const historyBase = path.join(homeDir, '.yolium', 'projects', dirName);

  try {
    // Remove cache directory
    if (fs.existsSync(cacheBase)) {
      fs.rmSync(cacheBase, { recursive: true, force: true });
    }

    // Remove history directory
    if (fs.existsSync(historyBase)) {
      fs.rmSync(historyBase, { recursive: true, force: true });
    }

    // Remove from registry
    const registry = loadProjectRegistry();
    delete registry.projects[dirName];
    saveProjectRegistry(registry);

    logger.info('Project cache deleted', { dirName });
    return { deleted: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error('Failed to delete project cache', { dirName, error });
    return { deleted: false, error };
  }
}

/**
 * Remove caches for projects that no longer exist on disk.
 * @returns Cleanup result with count of deleted caches and freed bytes
 */
export function cleanupOrphanedCaches(): CleanupResult {
  const caches = listProjectCaches();
  const orphaned = caches.filter(c => !c.exists);

  const result: CleanupResult = {
    deletedCount: 0,
    freedBytes: 0,
    errors: [],
  };

  for (const cache of orphaned) {
    const sizeToFree = cache.cacheSizeBytes + cache.historySizeBytes;
    const deleteResult = deleteProjectCache(cache.dirName);

    if (deleteResult.deleted) {
      result.deletedCount++;
      result.freedBytes += sizeToFree;
    } else if (deleteResult.error) {
      result.errors.push(`${cache.dirName}: ${deleteResult.error}`);
    }
  }

  logger.info('Orphaned caches cleaned up', { ...result });
  return result;
}

/**
 * Remove caches for projects not accessed within the specified number of days.
 *
 * @param maxAgeDays - Maximum age in days (default: 90)
 * @returns Cleanup result with count of deleted caches and freed bytes
 */
export function cleanupStaleCaches(maxAgeDays: number = 90): CleanupResult {
  const caches = listProjectCaches();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - maxAgeDays);

  const stale = caches.filter(c => new Date(c.lastAccessed) < cutoff);

  const result: CleanupResult = {
    deletedCount: 0,
    freedBytes: 0,
    errors: [],
  };

  for (const cache of stale) {
    const sizeToFree = cache.cacheSizeBytes + cache.historySizeBytes;
    const deleteResult = deleteProjectCache(cache.dirName);

    if (deleteResult.deleted) {
      result.deletedCount++;
      result.freedBytes += sizeToFree;
    } else if (deleteResult.error) {
      result.errors.push(`${cache.dirName}: ${deleteResult.error}`);
    }
  }

  logger.info('Stale caches cleaned up', { maxAgeDays, ...result });
  return result;
}
