/**
 * @module src/lib/docker/project-registry
 * Project registry for tracking hash→path mappings and persistent storage management.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { app } from 'electron';
import { createLogger } from '../logger';
import { loadGitConfig, generateGitCredentials } from '../git-config';
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
    claude: path.join(homeDir, '.claude'),
    opencode: {
      config: path.join(homeDir, '.config', 'opencode'),
      data: path.join(homeDir, '.local', 'share', 'opencode'),
    },
    codex: path.join(homeDir, '.codex'),
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

  // Create OpenCode directories
  fs.mkdirSync(paths.opencode.config, { recursive: true });
  fs.mkdirSync(paths.opencode.data, { recursive: true });

  // Create Claude directory (might not exist for new users)
  fs.mkdirSync(paths.claude, { recursive: true });

  // Create Codex directory
  fs.mkdirSync(paths.codex, { recursive: true });
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

    // Tool configurations
    `${toDockerPath(paths.claude)}:/home/agent/.claude:rw`,
    `${toDockerPath(paths.opencode.config)}:/home/agent/.config/opencode:rw`,
    `${toDockerPath(paths.opencode.data)}:/home/agent/.local/share/opencode:rw`,
  ];

  // Only mount Codex config for Codex agent (least-privilege)
  if (agent === 'codex') {
    binds.push(`${toDockerPath(paths.codex)}:/home/agent/.codex:rw`);
  }

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
  }

  return binds;
}

/**
 * Get the yolium SSH directory path if it exists.
 * @returns SSH directory path or null if not configured
 */
export function getYoliumSshDir(): string | null {
  const homeDir = app.getPath('home');
  const sshDir = path.join(homeDir, '.yolium', 'ssh');

  try {
    if (fs.statSync(sshDir).isDirectory()) {
      return sshDir;
    }
  } catch {
    // SSH not configured
  }
  return null;
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
