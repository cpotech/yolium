/**
 * @module src/lib/docker/project-registry
 * Project registry for tracking hash→path mappings and persistent storage management.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { app } from 'electron';
import { createLogger } from '@main/lib/logger';
import { loadGitConfig, generateGitCredentials, getHostClaudeCredentialsPath, getHostCodexCredentialsPath } from '@main/git/git-config';
import { getValidatedSharedDirs } from '@main/services/project-config';
import { getProjectDirName, toDockerPath, getContainerProjectPath, toContainerHomePath } from './path-utils';

const logger = createLogger('project-registry');

interface ProjectEntry {
  path: string;
  folderName: string;
  lastAccessed: string;  // ISO timestamp
  createdAt: string;     // ISO timestamp
}

interface ProjectRegistry {
  version: 1;
  projects: Record<string, ProjectEntry>;  // dirName → entry
}

/**
 * Get the path to the project registry file.
 * @returns Path to project-registry.json
 */
function getProjectRegistryPath(): string {
  return path.join(os.homedir(), '.yolium', 'project-registry.json');
}

/**
 * Load the project registry from disk.
 * @returns Parsed registry or empty registry if file doesn't exist
 */
export function loadProjectRegistry(): ProjectRegistry {
  const registryPath = getProjectRegistryPath();
  try {
    const data = fs.readFileSync(registryPath, 'utf-8');
    return JSON.parse(data);
  } catch {
    return { version: 1, projects: {} };
  }
}

/**
 * Save the project registry to disk.
 * @param registry - The registry to save
 */
export function saveProjectRegistry(registry: ProjectRegistry): void {
  const registryPath = getProjectRegistryPath();
  fs.mkdirSync(path.dirname(registryPath), { recursive: true });
  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2));
}

/**
 * Register a project path, updating its last-accessed timestamp.
 * Called whenever a container is created for a project.
 *
 * @param projectPath - The project path to register
 */
export function registerProject(projectPath: string): void {
  const absolutePath = path.resolve(projectPath);
  const dirName = getProjectDirName(absolutePath);
  const now = new Date().toISOString();

  const registry = loadProjectRegistry();
  const existing = registry.projects[dirName];

  registry.projects[dirName] = {
    path: absolutePath,
    folderName: path.basename(absolutePath),
    lastAccessed: now,
    createdAt: existing?.createdAt || now,
  };

  saveProjectRegistry(registry);
  logger.debug('Project registered', { dirName, path: absolutePath });
}

/**
 * Get all persistent directory paths for a project.
 * Uses hash-based isolation to prevent conflicts between projects.
 * Directory names include the folder name for easier identification.
 *
 * @param projectPath - The project path
 * @returns Object containing all persistent directory paths
 */
export function getPersistentPaths(projectPath: string) {
  const homeDir = os.homedir();
  const projectDirName = getProjectDirName(projectPath);
  const cacheBase = path.join(homeDir, '.cache', 'yolium', projectDirName);
  const historyBase = path.join(homeDir, '.yolium', 'projects', projectDirName);

  return {
    cache: {
      npm: path.join(cacheBase, 'npm'),
      pip: path.join(cacheBase, 'pip'),
      maven: path.join(cacheBase, 'maven'),
      gradle: path.join(cacheBase, 'gradle'),
      nuget: path.join(cacheBase, 'nuget'),
    },
    history: path.join(historyBase, 'history'),
  };
}

/**
 * Ensure all persistent directories exist before mounting.
 * Uses recursive mkdir which is idempotent (safe to call every time).
 * Also registers the project in the registry for cache tracking.
 *
 * @param paths - Persistent paths object from getPersistentPaths
 * @param projectPath - The project path (for registry)
 */
export function ensurePersistentDirs(paths: ReturnType<typeof getPersistentPaths>, projectPath: string): void {
  // Register project for cache auditing/cleanup
  registerProject(projectPath);

  // Create cache directories
  fs.mkdirSync(paths.cache.npm, { recursive: true });
  fs.mkdirSync(paths.cache.pip, { recursive: true });
  fs.mkdirSync(paths.cache.maven, { recursive: true });
  fs.mkdirSync(paths.cache.gradle, { recursive: true });
  fs.mkdirSync(paths.cache.nuget, { recursive: true });

  // Create history directory
  fs.mkdirSync(paths.history, { recursive: true });
}

/**
 * Build bind mount array for persistent storage.
 * Creates directories if they don't exist and returns mount strings.
 *
 * @param mountPath - The path to mount as the project directory (may be a worktree)
 * @param agent - The agent name (for selective mounts)
 * @param cacheKeyPath - Optional path to use for cache directory isolation (defaults to mountPath)
 * @param originalRepoPath - Optional path to the original repo (for worktree .git access)
 * @returns Array of bind mount strings
 */
export function buildPersistentBindMounts(mountPath: string, agent: string, cacheKeyPath?: string, originalRepoPath?: string): string[] {
  // Use cacheKeyPath for persistent directories (so worktrees share cache with original project)
  const effectivePath = cacheKeyPath || mountPath;
  const paths = getPersistentPaths(effectivePath);
  ensurePersistentDirs(paths, effectivePath);
  const containerPath = getContainerProjectPath(mountPath);

  const binds = [
    // Project directory (on Linux: same path for symlink compatibility, on Windows: /workspace)
    // Use toDockerPath() to convert Windows backslashes to forward slashes
    `${toDockerPath(mountPath)}:${containerPath}:rw`,

    // Package caches
    `${toDockerPath(paths.cache.npm)}:/home/agent/.npm:rw`,
    `${toDockerPath(paths.cache.pip)}:/home/agent/.cache/pip:rw`,
    `${toDockerPath(paths.cache.maven)}:/home/agent/.m2:rw`,
    `${toDockerPath(paths.cache.gradle)}:/home/agent/.gradle:rw`,
    `${toDockerPath(paths.cache.nuget)}:/home/agent/.nuget:rw`,

    // Shell history
    `${toDockerPath(paths.history)}:/home/agent/.yolium_history:rw`,
  ];

  // For worktrees, mount the original repo's .git directory so git commands work
  // The worktree's .git file points to the main repo's .git/worktrees/<name> directory
  if (originalRepoPath && originalRepoPath !== mountPath) {
    const mainGitDir = path.join(originalRepoPath, '.git');
    if (fs.existsSync(mainGitDir) && fs.statSync(mainGitDir).isDirectory()) {
      // Mount the main repo's .git at its original path (needed for worktree references)
      // On Windows: host path is C:/Users/..., container path is /c/Users/... (Linux-style)
      const dockerGitDir = toDockerPath(mainGitDir);
      const containerGitDir = toContainerHomePath(mainGitDir);
      binds.push(`${dockerGitDir}:${containerGitDir}:rw`);
    }

    // Mount shared directories from the original repo into the worktree container (read-only)
    const sharedDirs = getValidatedSharedDirs(originalRepoPath);
    for (const dir of sharedDirs) {
      const hostDir = path.join(originalRepoPath, dir);
      const containerDir = `${containerPath}/${dir}`;
      binds.push(`${toDockerPath(hostDir)}:${containerDir}:ro`);
    }
  }

  return binds;
}

/**
 * Get git-credentials bind mount if PAT is configured.
 * Generates the credentials file from settings.json and returns the mount string.
 *
 * @returns Bind mount string or null if no PAT configured
 */
export function getGitCredentialsBind(): string | null {
  const gitConfig = loadGitConfig();
  logger.debug('Loading git config for credentials', { hasPat: !!gitConfig?.githubPat });
  const credPath = generateGitCredentials(gitConfig);
  if (!credPath) {
    logger.debug('No git credentials to mount (no PAT configured)');
    return null;
  }
  logger.info('Git credentials file generated', { credPath });
  return `${toDockerPath(credPath)}:/home/agent/.git-credentials-mounted:ro`;
}

/**
 * Get Claude OAuth credentials file bind mount if OAuth is enabled.
 * Mounts only ~/.claude/.credentials.json (not the entire ~/.claude directory).
 *
 * @returns Bind mount string or null if OAuth not configured
 */
export function getClaudeOAuthBind(): string | null {
  const gitConfig = loadGitConfig();
  if (!gitConfig?.useClaudeOAuth) {
    return null;
  }
  const credPath = getHostClaudeCredentialsPath();
  if (!credPath) {
    logger.debug('No Claude OAuth credentials to mount (~/.claude/.credentials.json not found)');
    return null;
  }
  logger.info('Claude OAuth credentials file found for mounting', { credPath });
  return `${toDockerPath(credPath)}:/home/agent/.claude-credentials.json:ro`;
}

/**
 * Get Codex OAuth credentials file bind mount if OAuth is enabled.
 * Mounts only ~/.codex/auth.json (not the entire ~/.codex directory).
 *
 * @returns Bind mount string or null if OAuth not configured
 */
export function getCodexOAuthBind(): string | null {
  const gitConfig = loadGitConfig();
  if (!gitConfig?.useCodexOAuth) {
    return null;
  }
  const authPath = getHostCodexCredentialsPath();
  if (!authPath) {
    logger.debug('No Codex OAuth credentials to mount (~/.codex/auth.json not found)');
    return null;
  }
  logger.info('Codex OAuth credentials file found for mounting', { authPath });
  return `${toDockerPath(authPath)}:/home/agent/.codex-auth.json:ro`;
}
