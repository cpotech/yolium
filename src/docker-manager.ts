import Docker from 'dockerode';
import { BrowserWindow, app } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { PassThrough } from 'node:stream';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createLogger } from './lib/logger';
import { createWorktree, deleteWorktree, generateBranchName, hasUncommittedChanges, getWorktreeBranch } from './lib/git-worktree';
import { loadGitConfig, generateGitCredentials } from './lib/git-config';
import { extractProtocolMessages } from './lib/agent-protocol';
import type { ContainerSession, ProjectCacheInfo, CacheStats, CleanupResult } from './types/docker';
import type { ReviewAgentType } from './types/agent';

export type { ContainerSession, ProjectCacheInfo, CacheStats, CleanupResult } from './types/docker';
export type { ReviewAgentType } from './types/agent';

const logger = createLogger('docker-manager');

const sessions = new Map<string, ContainerSession>();

// Agent container session tracking (separate from interactive sessions)
interface AgentContainerSession {
  id: string;
  containerId: string;
  webContentsId: number;
  projectPath: string;
  itemId: string;
  agentName: string;
  state: 'running' | 'stopped' | 'crashed';
  timeoutId?: NodeJS.Timeout;
  worktreePath?: string;
  originalPath?: string;
  branchName?: string;
}

const agentSessions = new Map<string, AgentContainerSession>();

// On Windows, we can't use Windows paths inside Linux containers
// Use a fixed container path and let Docker handle the host path translation
const CONTAINER_WORKSPACE = '/workspace';
const isWindows = os.platform() === 'win32';

/**
 * Normalize a host path for use in Docker bind mount strings.
 * On Windows, converts backslashes to forward slashes (Docker requirement).
 * On Linux/macOS, returns the path unchanged.
 *
 * Docker bind mounts require forward slashes even on Windows:
 * - Valid:   C:/Users/name/project:/workspace:rw
 * - Invalid: C:\Users\name\project:/workspace:rw
 */
function toDockerPath(hostPath: string): string {
  if (!isWindows) return hostPath;
  // Convert backslashes to forward slashes for Docker
  return hostPath.replace(/\\/g, '/');
}

/**
 * Get the container-side path for the project directory.
 * On Windows, returns /workspace (since Windows paths don't work in Linux containers).
 * On Linux/macOS, returns the same path for symlink compatibility.
 */
function getContainerProjectPath(hostPath: string): string {
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
 * Example: C:\Users\name -> /c/Users/name
 */
function toContainerHomePath(hostHome: string): string {
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
 */
function hashProjectPath(projectPath: string): string {
  const absolutePath = path.resolve(projectPath);
  return createHash('sha256')
    .update(absolutePath)
    .digest('hex')
    .substring(0, 12);
}

/**
 * Sanitize a folder name for use in directory names.
 * Removes/replaces characters that could cause issues in paths.
 */
function sanitizeFolderName(folderPath: string): string {
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
 */
function getProjectDirName(projectPath: string): string {
  const sanitizedName = sanitizeFolderName(projectPath);
  const hash = hashProjectPath(projectPath);
  return sanitizedName ? `${sanitizedName}-${hash}` : `project-${hash}`;
}

// ============================================================================
// Project Registry - tracks hash→path mappings for cache auditing/cleanup
// ============================================================================

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
 */
function getProjectRegistryPath(): string {
  return path.join(os.homedir(), '.yolium', 'project-registry.json');
}

/**
 * Load the project registry from disk.
 */
function loadProjectRegistry(): ProjectRegistry {
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
 */
function saveProjectRegistry(registry: ProjectRegistry): void {
  const registryPath = getProjectRegistryPath();
  fs.mkdirSync(path.dirname(registryPath), { recursive: true });
  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2));
}

/**
 * Register a project path, updating its last-accessed timestamp.
 * Called whenever a container is created for a project.
 */
function registerProject(projectPath: string): void {
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
 */
function getPersistentPaths(projectPath: string) {
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
 */
function ensurePersistentDirs(paths: ReturnType<typeof getPersistentPaths>, projectPath: string): void {
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

// Initialize docker client (auto-detects socket path)
const docker = new Docker();

// Default yolium image (locally built)
const DEFAULT_IMAGE = 'yolium:latest';

/**
 * Get the path to the docker directory containing Dockerfile.
 * In development: src/docker
 * In production: resources/docker (copied during build)
 */
function getDockerDir(): string {
  // In development, use src/docker relative to app root
  const devPath = path.join(app.getAppPath(), 'src', 'docker');
  if (fs.existsSync(path.join(devPath, 'Dockerfile'))) {
    return devPath;
  }

  // In production, check resources folder
  const prodPath = path.join(process.resourcesPath, 'docker');
  if (fs.existsSync(path.join(prodPath, 'Dockerfile'))) {
    return prodPath;
  }

  throw new Error('Docker directory not found');
}

/**
 * Compute a combined hash of Dockerfile + entrypoint.sh to detect image staleness.
 */
function computeDockerImageHash(): string {
  const dockerDir = getDockerDir();
  const dockerfilePath = path.join(dockerDir, 'Dockerfile');
  const entrypointPath = path.join(dockerDir, 'entrypoint.sh');
  const dockerfile = fs.readFileSync(dockerfilePath, 'utf-8');
  const entrypoint = fs.readFileSync(entrypointPath, 'utf-8');
  return createHash('sha256')
    .update(dockerfile)
    .update('\n---\n')
    .update(entrypoint)
    .digest('hex')
    .substring(0, 20);
}

/**
 * Build the yolium Docker image locally using docker CLI with BuildKit.
 */
async function buildLocalImage(
  onProgress?: (msg: string) => void
): Promise<void> {
  const dockerDir = getDockerDir();
  // On Windows, uid/gid return -1, so default to 1000 (standard Linux first user)
  const userId = os.userInfo().uid > 0 ? os.userInfo().uid : 1000;
  const groupId = os.userInfo().gid > 0 ? os.userInfo().gid : 1000;
  const buildTimestamp = new Date().toISOString();
  const buildHash = computeDockerImageHash();

  onProgress?.('Building Docker image (this may take a few minutes on first run)...');

  // Use docker CLI with BuildKit enabled (required for --mount in Dockerfile)
  const args = [
    'build',
    '--build-arg', `USER_ID=${userId}`,
    '--build-arg', `GROUP_ID=${groupId}`,
    '--build-arg', 'USERNAME=agent',
    '--build-arg', `BUILD_TIMESTAMP=${buildTimestamp}`,
    '--label', 'yolium.version=1.0.0',
    '--label', `yolium.built=${buildTimestamp}`,
    '--label', `yolium.build_hash=${buildHash}`,
    '-t', DEFAULT_IMAGE,
    dockerDir,
  ];

  await new Promise<void>((resolve, reject) => {
    const proc = spawn('docker', args, {
      env: { ...process.env, DOCKER_BUILDKIT: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    // Capture recent output lines so we can include them in error messages
    const recentLines: string[] = [];
    const MAX_ERROR_LINES = 20;

    proc.stdout.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n').filter((l) => l.trim());
      for (const line of lines) {
        onProgress?.(line);
        recentLines.push(line);
        if (recentLines.length > MAX_ERROR_LINES) recentLines.shift();
      }
    });

    proc.stderr.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n').filter((l) => l.trim());
      for (const line of lines) {
        onProgress?.(line);
        recentLines.push(line);
        if (recentLines.length > MAX_ERROR_LINES) recentLines.shift();
      }
    });

    proc.on('close', (code) => {
      if (code === 0) {
        onProgress?.('Image built successfully!');
        resolve();
      } else {
        const context = recentLines.length > 0
          ? `\n\nBuild output:\n${recentLines.join('\n')}`
          : '';
        reject(new Error(`Docker build failed with exit code ${code}${context}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to start docker build: ${err.message}`));
    });
  });
}

/**
 * Build bind mount array for persistent storage.
 * Creates directories if they don't exist and returns mount strings.
 *
 * @param mountPath - The path to mount as the project directory (may be a worktree)
 * @param cacheKeyPath - Optional path to use for cache directory isolation (defaults to mountPath)
 * @param originalRepoPath - Optional path to the original repo (for worktree .git access)
 */
function buildPersistentBindMounts(mountPath: string, agent: string, cacheKeyPath?: string, originalRepoPath?: string): string[] {
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
 */
function getYoliumSshDir(): string | null {
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
 */
function getGitCredentialsBind(): string | null {
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
 * Check if Docker daemon is available and running.
 */
export async function isDockerAvailable(): Promise<boolean> {
  try {
    await docker.ping();
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure the specified image is available locally.
 * For local images (yolium:latest), throws helpful error if not built.
 * For remote images, pulls from registry if not present.
 */
export async function ensureImage(
  imageName: string = DEFAULT_IMAGE,
  onProgress?: (msg: string) => void
): Promise<void> {
  // Check if image already exists
  const images = await docker.listImages({
    filters: { reference: [imageName] },
  });

  if (images.length > 0) {
    // If this is the local yolium image, rebuild when Dockerfile/entrypoint changes
    if (imageName === DEFAULT_IMAGE) {
      try {
        const image = docker.getImage(imageName);
        const inspect = await image.inspect();
        const labels = inspect.Config?.Labels || {};
        const currentHash = computeDockerImageHash();
        const imageHash = labels['yolium.build_hash'];
        // Only rebuild if the hash label exists but doesn't match.
        // If the label is missing, the image was built externally (e.g., CI) - skip rebuild.
        if (imageHash && imageHash !== currentHash) {
          onProgress?.('Dockerfile or entrypoint changed, rebuilding image...');
          await buildLocalImage(onProgress);
        }
      } catch (err) {
        logger.warn('Failed to inspect existing image, rebuilding', {
          imageName,
          error: err instanceof Error ? err.message : String(err),
        });
        await buildLocalImage(onProgress);
      }
    }
    return; // Image already present (or rebuilt above)
  }

  // For local yolium image, build it automatically
  if (imageName === DEFAULT_IMAGE) {
    await buildLocalImage(onProgress);
    return;
  }

  // Pull remote image
  const stream = await docker.pull(imageName);

  // Wait for pull to complete with progress tracking
  await new Promise<void>((resolve, reject) => {
    docker.modem.followProgress(
      stream,
      (err) => (err ? reject(err) : resolve()),
      (event) => {
        if (onProgress && event.status) {
          onProgress(event.progress || event.status);
        }
      }
    );
  });
}

/**
 * Create and start an yolium container with the specified folder mounted.
 * Returns a session ID that can be used for subsequent operations.
 *
 * @param webContentsId - The Electron webContents ID for IPC
 * @param folderPath - The local folder to mount in the container
 * @param agent - The agent to run: 'claude', 'opencode', 'codex', or 'shell'
 * @param gsdEnabled - Whether to run get-shit-done-cc before Claude
 * @param gitConfig - Optional git identity config (name and email)
 * @param worktreeEnabled - Whether to create a git worktree for isolation
 * @param branchName - Optional branch name for the worktree (auto-generated if not provided)
 */
export async function createYolium(
  webContentsId: number,
  folderPath: string,
  agent: string = 'claude',
  gsdEnabled: boolean = true,
  gitConfig?: { name: string; email: string },
  worktreeEnabled: boolean = false,
  branchName?: string
): Promise<string> {
  const sessionId = `yolium-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  // Resolve to absolute path to ensure drive letter is present on Windows
  // This fixes paths like "\Users\gaming\repos\test" -> "C:\Users\gaming\repos\test"
  const resolvedFolderPath = path.resolve(folderPath);

  logger.info('Creating container', { sessionId, folderPath: resolvedFolderPath, agent, gsdEnabled, worktreeEnabled, branchName });

  // Handle worktree creation if enabled
  let mountPath = resolvedFolderPath;
  let worktreePath: string | undefined;
  let actualBranchName: string | undefined;

  if (worktreeEnabled) {
    actualBranchName = branchName || generateBranchName();
    logger.info('Creating worktree', { sessionId, folderPath: resolvedFolderPath, branchName: actualBranchName });

    try {
      worktreePath = createWorktree(resolvedFolderPath, actualBranchName);
      mountPath = worktreePath;
      logger.info('Worktree created', { sessionId, worktreePath });
    } catch (err) {
      logger.error('Failed to create worktree', { sessionId, error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  }

  // Create container with folder mounted (on Linux: same path, on Windows: /workspace)
  // Use mountPath (which may be a worktree) instead of original folderPath
  const containerProjectPath = getContainerProjectPath(mountPath);

  // The entrypoint script handles command selection based on TOOL env var
  // This avoids issues with Cmd array being corrupted by bundling/serialization
  logger.info('Container config', {
    agent,
    gsdEnabled,
    containerProjectPath,
    mountPath,
    worktreePath,
  });

  // Build bind mounts (extract to log them for debugging)
  // Use mountPath for project directory, but use original resolvedFolderPath for cache isolation
  // Pass resolvedFolderPath as originalRepoPath so worktrees can access the main repo's .git
  const binds = buildPersistentBindMounts(mountPath, agent, resolvedFolderPath, worktreePath ? resolvedFolderPath : undefined);
  const sshDir = getYoliumSshDir();
  if (sshDir) {
    binds.push(`${toDockerPath(sshDir)}:/home/agent/.ssh:rw`);
  }
  // Add git-credentials for HTTPS auth if PAT is configured
  const gitCredBind = getGitCredentialsBind();
  if (gitCredBind) {
    binds.push(gitCredBind);
  }

  logger.debug('Container bind mounts', { sessionId, binds });

  let container;
  try {
    container = await docker.createContainer({
      Image: DEFAULT_IMAGE,
      // Cmd is handled by entrypoint based on TOOL env var
      Tty: true,
      OpenStdin: true,
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      WorkingDir: containerProjectPath,
      Env: [
          `PROJECT_DIR=${containerProjectPath}`,
          `TOOL=${agent}`,
          `GSD_ENABLED=${gsdEnabled}`,
          `HOST_HOME=${toContainerHomePath(os.homedir())}`,
          'CLAUDE_CONFIG_DIR=/home/agent/.claude',
          'HISTFILE=/home/agent/.yolium_history/zsh_history',
          ...(process.env.YOLIUM_NETWORK_FULL === 'true' ? ['YOLIUM_NETWORK_FULL=true'] : []),
          ...(process.env.YOLIUM_LOG_LEVEL ? [`YOLIUM_LOG_LEVEL=${process.env.YOLIUM_LOG_LEVEL}`] : []),
          ...(gitConfig?.name ? [`GIT_USER_NAME=${gitConfig.name}`] : []),
          ...(gitConfig?.email ? [`GIT_USER_EMAIL=${gitConfig.email}`] : []),
          // For worktrees: pass the original repo path so entrypoint can create symlink for git
          ...(worktreePath ? [`WORKTREE_REPO_PATH=${toDockerPath(resolvedFolderPath)}`] : []),
          // Pass OpenAI API key for Codex agent only (stored config takes precedence over env var)
          ...(agent === 'codex' ? (() => {
            const storedConfig = loadGitConfig();
            const key = storedConfig?.openaiApiKey || process.env.OPENAI_API_KEY;
            return key ? [`OPENAI_API_KEY=${key}`] : [];
          })() : []),
        ],
      HostConfig: {
        CapAdd: ['NET_ADMIN'],
        Binds: binds,
      },
    });
  } catch (err) {
    logger.error('Failed to create container', {
      sessionId,
      error: err instanceof Error ? err.message : String(err),
      binds,
    });
    throw err;
  }

  // Start the container
  try {
    await container.start();
  } catch (err) {
    logger.error('Failed to start container', {
      sessionId,
      containerId: container.id,
      error: err instanceof Error ? err.message : String(err),
      binds,
    });
    // Clean up the created but not started container
    try {
      await container.remove();
    } catch {
      // Ignore cleanup errors
    }
    throw err;
  }

  // Attach to container with bidirectional stream (hijack required for stdin)
  const stream = await container.attach({
    stream: true,
    stdin: true,
    stdout: true,
    stderr: true,
    hijack: true,
  });

  // Store session with running state (include worktree info if applicable)
  sessions.set(sessionId, {
    id: sessionId,
    containerId: container.id,
    stream,
    webContentsId,
    folderPath: mountPath, // Use the actual mounted path
    state: 'running',
    // Worktree info (only set if worktree is enabled)
    ...(worktreePath && {
      worktreePath,
      originalPath: resolvedFolderPath,
      branchName: actualBranchName,
    }),
  });

  // Forward stream data to renderer
  stream.on('data', (data: Buffer) => {
    const dataStr = data.toString();
    // Log escape sequences (terminal queries from OpenCode)
    if (dataStr.includes('\x1b[') || dataStr.includes('\x1b]')) {
      logger.debug('Container output (escape seq)', {
        sessionId,
        dataLength: dataStr.length,
        dataHex: data.toString('hex').slice(0, 40)
      });
    }

    const webContents = BrowserWindow.getAllWindows().find(
      (w) => w.webContents.id === webContentsId
    )?.webContents;

    if (webContents && !webContents.isDestroyed()) {
      webContents.send('container:data', sessionId, dataStr);
    }
  });

  // Handle stream end (container exit)
  stream.on('end', async () => {
    const session = sessions.get(sessionId);
    if (session) {
      session.state = 'stopped';

      // Get exit code from container
      let exitCode = 0;
      try {
        const info = await container.inspect();
        exitCode = info.State.ExitCode;
      } catch {
        // Container may already be removed
      }

      const webContents = BrowserWindow.getAllWindows().find(
        (w) => w.webContents.id === webContentsId
      )?.webContents;

      if (webContents && !webContents.isDestroyed()) {
        webContents.send('container:exit', sessionId, exitCode);
      }
    }
  });

  // Handle stream errors
  stream.on('error', (err: Error) => {
    logger.error('Container stream error', { sessionId, error: err.message });
    const session = sessions.get(sessionId);
    if (session) {
      session.state = 'crashed';
    }
  });

  return sessionId;
}

/**
 * Write data to the container's stdin.
 */
export function writeToContainer(sessionId: string, data: string): void {
  const session = sessions.get(sessionId);
  if (session?.stream) {
    session.stream.write(data);
  }
}

/**
 * Resize the container's TTY dimensions.
 */
export async function resizeContainer(
  sessionId: string,
  cols: number,
  rows: number
): Promise<void> {
  const session = sessions.get(sessionId);
  if (!session) return;

  try {
    const container = docker.getContainer(session.containerId);
    await container.resize({ h: rows, w: cols });
  } catch (err) {
    logger.error('Error resizing container', { sessionId, error: err instanceof Error ? err.message : String(err) });
  }
}

/**
 * Stop and remove an yolium container.
 * Uses a 5-second grace period for SIGTERM before force killing.
 */
export async function stopYolium(sessionId: string): Promise<void> {
  const session = sessions.get(sessionId);
  if (!session) return;

  try {
    const container = docker.getContainer(session.containerId);

    // Stop with grace period
    await container.stop({ t: 5 });

    // Remove container
    await container.remove();
  } catch (err) {
    // Container may already be stopped or removed
    logger.error('Error stopping container', { sessionId, error: err instanceof Error ? err.message : String(err) });
  }

  sessions.delete(sessionId);
}

/**
 * Close all container sessions and remove containers.
 * Called on app shutdown. Properly waits for all cleanup to complete.
 */
export async function closeAllContainers(): Promise<void> {
  const sessionIds = Array.from(sessions.keys());

  // Cleanup all sessions in parallel
  await Promise.all(sessionIds.map(async (sessionId) => {
    const session = sessions.get(sessionId);
    if (!session) return;

    try {
      // Delete worktree first (while session info is still available)
      if (session.worktreePath && session.originalPath) {
        try {
          deleteWorktree(session.originalPath, session.worktreePath);
          logger.info('Worktree deleted on shutdown', { sessionId, worktreePath: session.worktreePath });
        } catch (err) {
          logger.error('Failed to delete worktree on shutdown', {
            sessionId,
            worktreePath: session.worktreePath,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      // Stop and remove container
      const container = docker.getContainer(session.containerId);
      try {
        await container.stop({ t: 2 });
      } catch {
        // Container may already be stopped
      }
      try {
        await container.remove();
      } catch {
        // Container may already be removed
      }
    } catch (err) {
      logger.error('Error during container cleanup', {
        sessionId,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }));

  sessions.clear();

  // Also clean up all agent sessions
  const agentSessionIds = Array.from(agentSessions.keys());
  await Promise.all(agentSessionIds.map(async (sessionId) => {
    const session = agentSessions.get(sessionId);
    if (!session) return;

    try {
      // Clean up worktree first
      if (session.worktreePath && session.originalPath) {
        try {
          deleteWorktree(session.originalPath, session.worktreePath);
          logger.info('Agent worktree deleted on shutdown', { sessionId, worktreePath: session.worktreePath });
        } catch (err) {
          logger.error('Failed to delete agent worktree on shutdown', {
            sessionId,
            worktreePath: session.worktreePath,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      // Clear timeout
      if (session.timeoutId) {
        clearTimeout(session.timeoutId);
      }

      // Stop and remove container
      const container = docker.getContainer(session.containerId);
      try {
        await container.stop({ t: 2 });
      } catch {
        // Container may already be stopped
      }
      try {
        await container.remove();
      } catch {
        // Container may already be removed
      }
    } catch (err) {
      logger.error('Error during agent container cleanup', {
        sessionId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }));

  agentSessions.clear();
}

/**
 * Remove all yolium containers (running or stopped).
 * Used when rebuilding the Docker image.
 * @returns Number of containers removed
 */
export async function removeAllYoliumContainers(): Promise<number> {
  const containers = await docker.listContainers({
    all: true,
    filters: { ancestor: [DEFAULT_IMAGE] },
  });

  for (const containerInfo of containers) {
    const container = docker.getContainer(containerInfo.Id);
    try {
      await container.stop({ t: 5 });
    } catch {
      // Container may already be stopped
    }
    await container.remove({ force: true });
  }

  // Clear local session tracking
  sessions.clear();
  agentSessions.clear();

  return containers.length;
}

/**
 * Remove the yolium Docker image.
 * Used when rebuilding the image.
 */
export async function removeYoliumImage(): Promise<void> {
  const image = docker.getImage(DEFAULT_IMAGE);
  await image.remove({ force: true });
}

/**
 * Get worktree info for a session.
 * Returns null if the session doesn't exist or doesn't have a worktree.
 */
export function getSessionWorktreeInfo(sessionId: string): {
  worktreePath: string;
  originalPath: string;
  branchName: string;
  hasUncommittedChanges: boolean;
} | null {
  const session = sessions.get(sessionId);
  if (!session?.worktreePath || !session?.originalPath || !session?.branchName) {
    return null;
  }

  return {
    worktreePath: session.worktreePath,
    originalPath: session.originalPath,
    branchName: session.branchName,
    hasUncommittedChanges: hasUncommittedChanges(session.worktreePath),
  };
}

/**
 * Delete a worktree for a session.
 * Should be called after the container has been stopped.
 */
export function deleteSessionWorktree(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (!session?.worktreePath || !session?.originalPath) {
    return;
  }

  try {
    deleteWorktree(session.originalPath, session.worktreePath);
    logger.info('Worktree deleted', { sessionId, worktreePath: session.worktreePath });
  } catch (err) {
    logger.error('Failed to delete worktree', {
      sessionId,
      worktreePath: session.worktreePath,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ============================================================================
// Code Review Functions
// ============================================================================

/**
 * List remote branches for a git repository URL.
 * Uses git ls-remote with credentials from stored git config.
 */
export async function listRemoteBranches(repoUrl: string): Promise<{ branches: string[]; error?: string }> {
  const gitConfig = loadGitConfig();
  const env: Record<string, string> = { ...process.env as Record<string, string> };

  // If PAT is configured, set GIT_ASKPASS to provide credentials
  if (gitConfig?.githubPat) {
    const credPath = generateGitCredentials(gitConfig);
    if (credPath) {
      env.GIT_TERMINAL_PROMPT = '0';
      // Use credential helper with the stored credentials file
      env.GIT_CONFIG_COUNT = '1';
      env.GIT_CONFIG_KEY_0 = 'credential.helper';
      env.GIT_CONFIG_VALUE_0 = `store --file "${credPath}"`;
    }
  }

  return new Promise((resolve) => {
    const proc = spawn('git', ['ls-remote', '--heads', repoUrl], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30000,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        logger.error('Failed to list remote branches', { repoUrl, stderr });
        resolve({ branches: [], error: stderr.trim() || `git ls-remote failed with code ${code}` });
        return;
      }

      const branches = stdout
        .split('\n')
        .filter(line => line.trim())
        .map(line => {
          // Format: <sha>\trefs/heads/<branch-name>
          const match = line.match(/refs\/heads\/(.+)$/);
          return match ? match[1] : null;
        })
        .filter((b): b is string => b !== null)
        .sort();

      resolve({ branches });
    });

    proc.on('error', (err) => {
      logger.error('Failed to spawn git ls-remote', { repoUrl, error: err.message });
      resolve({ branches: [], error: `Failed to run git: ${err.message}` });
    });
  });
}

/**
 * Check if an agent has cached authentication credentials.
 * For Claude: checks if ~/.claude directory has auth data.
 * For OpenCode: checks if ~/.config/opencode has auth data.
 */
export function checkAgentAuth(agent: string): { authenticated: boolean } {
  const homeDir = os.homedir();

  if (agent === 'claude') {
    // Claude stores auth in ~/.claude/credentials.json or similar
    const claudeDir = path.join(homeDir, '.claude');
    try {
      const entries = fs.readdirSync(claudeDir);
      // If the directory has files beyond just settings, likely authenticated
      const hasAuth = entries.some(e =>
        e.includes('credentials') || e.includes('auth') || e === '.credentials.json'
      );
      // Also check if there's a non-empty directory (Claude stores session data)
      const hasContent = entries.length > 0;
      return { authenticated: hasAuth || hasContent };
    } catch {
      return { authenticated: false };
    }
  }

  if (agent === 'opencode') {
    const opencodeConfig = path.join(homeDir, '.config', 'opencode');
    try {
      const entries = fs.readdirSync(opencodeConfig);
      return { authenticated: entries.length > 0 };
    } catch {
      return { authenticated: false };
    }
  }

  if (agent === 'codex') {
    // Codex can authenticate via:
    // 1. Stored OpenAI API key in Yolium settings
    // 2. OPENAI_API_KEY environment variable
    // 3. OAuth tokens in ~/.codex/auth.json (from `codex` login)
    const storedConfig = loadGitConfig();
    if (storedConfig?.openaiApiKey || process.env.OPENAI_API_KEY) {
      return { authenticated: true };
    }
    const codexAuthFile = path.join(homeDir, '.codex', 'auth.json');
    try {
      const content = fs.readFileSync(codexAuthFile, 'utf-8');
      const auth = JSON.parse(content);
      // Check for OAuth tokens or an API key in auth.json
      if (auth.tokens?.access_token || auth.OPENAI_API_KEY) {
        return { authenticated: true };
      }
    } catch {
      // auth.json doesn't exist or is invalid
    }
    return { authenticated: false };
  }

  return { authenticated: false };
}

/**
 * Create a headless code review container.
 * Clones the repo, checks out the branch, runs the agent with a review prompt,
 * and posts comments to the PR via gh CLI.
 *
 * @param webContentsId - The Electron webContents ID for IPC status updates
 * @param repoUrl - The git repository URL to clone
 * @param branch - The branch to review
 * @param agent - The review agent to use ('claude' or 'opencode')
 * @param gitConfig - Git identity config
 */
export async function createCodeReviewContainer(
  webContentsId: number,
  repoUrl: string,
  branch: string,
  agent: string = 'claude',
  gitConfig?: { name: string; email: string },
): Promise<string> {
  const sessionId = `review-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  logger.info('Creating code review container', { sessionId, repoUrl, branch, agent });

  // Create a temporary directory for the clone
  const tmpDir = path.join(os.tmpdir(), `yolium-review-${sessionId}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  const containerProjectPath = getContainerProjectPath(tmpDir);

  // Build minimal bind mounts (no project cache needed for ephemeral review)
  const homeDir = os.homedir();
  const claudeDir = path.join(homeDir, '.claude');
  const opencodeConfigDir = path.join(homeDir, '.config', 'opencode');
  const opencodeDataDir = path.join(homeDir, '.local', 'share', 'opencode');
  fs.mkdirSync(claudeDir, { recursive: true });
  fs.mkdirSync(opencodeConfigDir, { recursive: true });
  fs.mkdirSync(opencodeDataDir, { recursive: true });

  const binds = [
    `${toDockerPath(tmpDir)}:${containerProjectPath}:rw`,
    `${toDockerPath(claudeDir)}:/home/agent/.claude:rw`,
    `${toDockerPath(opencodeConfigDir)}:/home/agent/.config/opencode:rw`,
    `${toDockerPath(opencodeDataDir)}:/home/agent/.local/share/opencode:rw`,
  ];

  // Only mount Codex config for Codex agent (least-privilege)
  if (agent === 'codex') {
    const codexDir = path.join(homeDir, '.codex');
    fs.mkdirSync(codexDir, { recursive: true });
    binds.push(`${toDockerPath(codexDir)}:/home/agent/.codex:rw`);
  }

  // Add SSH keys if available
  const sshDir = getYoliumSshDir();
  if (sshDir) {
    binds.push(`${toDockerPath(sshDir)}:/home/agent/.ssh:rw`);
  }

  // Add git credentials
  const gitCredBind = getGitCredentialsBind();
  if (gitCredBind) {
    binds.push(gitCredBind);
  }

  logger.debug('Code review container bind mounts', { sessionId, binds });

  const container = await docker.createContainer({
    Image: DEFAULT_IMAGE,
    Tty: false,
    OpenStdin: false,
    AttachStdin: false,
    AttachStdout: true,
    AttachStderr: true,
    WorkingDir: containerProjectPath,
    Env: [
      `PROJECT_DIR=${containerProjectPath}`,
      `TOOL=code-review`,
      `REVIEW_REPO_URL=${repoUrl}`,
      `REVIEW_BRANCH=${branch}`,
      `REVIEW_AGENT=${agent}`,
      `HOST_HOME=${toContainerHomePath(os.homedir())}`,
      'CLAUDE_CONFIG_DIR=/home/agent/.claude',
      ...(process.env.YOLIUM_NETWORK_FULL === 'true' ? ['YOLIUM_NETWORK_FULL=true'] : []),
      ...(gitConfig?.name ? [`GIT_USER_NAME=${gitConfig.name}`] : []),
      ...(gitConfig?.email ? [`GIT_USER_EMAIL=${gitConfig.email}`] : []),
      ...(agent === 'codex' ? (() => {
        const storedConfig = loadGitConfig();
        const key = storedConfig?.openaiApiKey || process.env.OPENAI_API_KEY;
        return key ? [`OPENAI_API_KEY=${key}`] : [];
      })() : []),
    ],
    HostConfig: {
      CapAdd: ['NET_ADMIN'],
      Binds: binds,
    },
  });

  // Attach before start to avoid race condition where container exits before attach completes
  const stream = await container.attach({
    stream: true,
    stdout: true,
    stderr: true,
  });

  // Demux the multiplexed stream (Tty: false uses 8-byte header framing)
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  docker.modem.demuxStream(stream, stdout, stderr);

  await container.start();
  logger.info('Code review container started', { sessionId, containerId: container.id });

  // Store session
  sessions.set(sessionId, {
    id: sessionId,
    containerId: container.id,
    stream: stream as unknown as NodeJS.ReadWriteStream,
    webContentsId,
    folderPath: tmpDir,
    state: 'running',
  });

  // Track whether we've seen an auth error in the output
  let detectedAuthError = false;

  const handleOutput = (data: Buffer) => {
    const dataStr = data.toString();
    logger.debug('Code review output', { sessionId, output: dataStr.slice(0, 200) });

    // Detect 401 auth errors from Codex output (missing OPENAI_API_KEY)
    // Scoped to codex agent to avoid false positives from reviewed repo output
    if (!detectedAuthError && agent === 'codex' && /401 Unauthorized|Missing bearer.*authentication/i.test(dataStr)) {
      detectedAuthError = true;
      logger.warn('Code review auth error detected', { sessionId, agent });
    }

    const webContents = BrowserWindow.getAllWindows().find(
      (w) => w.webContents.id === webContentsId
    )?.webContents;

    if (webContents && !webContents.isDestroyed()) {
      webContents.send('code-review:output', sessionId, dataStr);
    }
  };

  // Forward demuxed output for status tracking
  stdout.on('data', handleOutput);
  stderr.on('data', handleOutput);

  // Handle completion (stream ends when container exits)
  stream.on('end', async () => {
    const session = sessions.get(sessionId);
    if (session) {
      session.state = 'stopped';

      let exitCode = 0;
      try {
        const info = await container.inspect();
        exitCode = info.State.ExitCode;
        logger.info('Code review completed', { sessionId, exitCode });
      } catch {
        // Container may already be removed
      }

      const webContents = BrowserWindow.getAllWindows().find(
        (w) => w.webContents.id === webContentsId
      )?.webContents;

      if (webContents && !webContents.isDestroyed()) {
        webContents.send('code-review:complete', sessionId, exitCode, detectedAuthError);
      }

      // Cleanup: remove container and temp directory
      try {
        await container.remove({ force: true });
      } catch {
        // Container may already be removed
      }
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // Temp dir may already be removed
      }

      sessions.delete(sessionId);
    }
  });

  stream.on('error', (err: Error) => {
    logger.error('Code review stream error', { sessionId, error: err.message });
    const session = sessions.get(sessionId);
    if (session) {
      session.state = 'crashed';
    }

    const webContents = BrowserWindow.getAllWindows().find(
      (w) => w.webContents.id === webContentsId
    )?.webContents;

    if (webContents && !webContents.isDestroyed()) {
      webContents.send('code-review:complete', sessionId, 1);
    }
  });

  return sessionId;
}

// ============================================================================
// Agent Container Functions
// ============================================================================

export interface AgentContainerParams {
  webContentsId: number;
  projectPath: string;
  agentName: string;
  prompt: string;
  model: string;
  tools: string[];
  itemId: string;
  worktreePath?: string;
  originalPath?: string;
  branchName?: string;
  timeoutMs?: number; // Inactivity timeout in milliseconds (default: 30 min)
}

export interface AgentContainerCallbacks {
  onOutput?: (data: string) => void;
  onProtocolMessage?: (message: unknown) => void;
  onExit?: (code: number) => void;
}

// Default timeout: 30 minutes of no output
const DEFAULT_AGENT_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Create a headless agent container.
 * Encodes the prompt as base64, runs the agent, parses protocol messages from stdout.
 *
 * @param params - Agent container parameters
 * @param callbacks - Optional callbacks for output, protocol messages, and exit
 * @returns Session ID for the agent container
 */
export async function createAgentContainer(
  params: AgentContainerParams,
  callbacks: AgentContainerCallbacks = {}
): Promise<string> {
  const { webContentsId, projectPath, agentName, prompt, model, tools, itemId, worktreePath, originalPath, branchName, timeoutMs } = params;
  const { onOutput, onProtocolMessage, onExit } = callbacks;

  const sessionId = `agent-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  // Resolve to absolute path
  const resolvedProjectPath = path.resolve(projectPath);

  // Use worktree as mount path if available, otherwise use project path directly
  const mountPath = worktreePath || resolvedProjectPath;

  logger.info('Creating agent container', {
    sessionId,
    projectPath: resolvedProjectPath,
    agentName,
    model,
    tools,
    itemId,
    ...(worktreePath && { worktreePath, branchName }),
  });

  const containerProjectPath = getContainerProjectPath(mountPath);

  // Build bind mounts for the project (minimal set for headless agent)
  const homeDir = os.homedir();
  const claudeDir = path.join(homeDir, '.claude');
  fs.mkdirSync(claudeDir, { recursive: true });

  const binds = [
    `${toDockerPath(mountPath)}:${containerProjectPath}:rw`,
    `${toDockerPath(claudeDir)}:/home/agent/.claude:rw`,
  ];

  // For worktrees, mount the original repo's .git directory so git commands work
  if (worktreePath && originalPath) {
    const mainGitDir = path.join(originalPath, '.git');
    if (fs.existsSync(mainGitDir) && fs.statSync(mainGitDir).isDirectory()) {
      const dockerGitDir = toDockerPath(mainGitDir);
      const containerGitDir = toContainerHomePath(mainGitDir);
      binds.push(`${dockerGitDir}:${containerGitDir}:rw`);
    }
  }

  // Add SSH keys if available
  const sshDir = getYoliumSshDir();
  if (sshDir) {
    binds.push(`${toDockerPath(sshDir)}:/home/agent/.ssh:rw`);
  }

  // Add git credentials
  const gitCredBind = getGitCredentialsBind();
  if (gitCredBind) {
    binds.push(gitCredBind);
  }

  logger.debug('Agent container bind mounts', { sessionId, binds });

  // Encode prompt as base64 to avoid shell escaping issues
  const promptBase64 = Buffer.from(prompt).toString('base64');
  logger.info('Agent prompt encoded', { sessionId, promptLength: prompt.length, base64Length: promptBase64.length });

  const container = await docker.createContainer({
    Image: DEFAULT_IMAGE,
    Tty: false,  // Headless - no TTY
    OpenStdin: false,
    AttachStdin: false,
    AttachStdout: true,
    AttachStderr: true,
    WorkingDir: containerProjectPath,
    Env: [
      `PROJECT_DIR=${containerProjectPath}`,
      'TOOL=agent',
      `AGENT_PROMPT=${promptBase64}`,
      `AGENT_MODEL=${model}`,
      `AGENT_TOOLS=${tools.join(',')}`,
      `AGENT_ITEM_ID=${itemId}`,
      `HOST_HOME=${toContainerHomePath(os.homedir())}`,
      'CLAUDE_CONFIG_DIR=/home/agent/.claude',
      ...(process.env.YOLIUM_NETWORK_FULL === 'true' ? ['YOLIUM_NETWORK_FULL=true'] : []),
      ...(worktreePath && originalPath ? [`WORKTREE_REPO_PATH=${toDockerPath(originalPath)}`] : []),
    ],
    HostConfig: {
      CapAdd: ['NET_ADMIN'],
      Binds: binds,
    },
  });

  // Attach before start to avoid race condition
  const stream = await container.attach({
    stream: true,
    stdout: true,
    stderr: true,
  });

  // Demux the multiplexed stream (Tty: false uses 8-byte header framing)
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  docker.modem.demuxStream(stream, stdout, stderr);

  await container.start();
  logger.info('Agent container started', { sessionId, containerId: container.id });

  // Set up timeout tracking
  let timeoutId: NodeJS.Timeout | undefined;

  const effectiveTimeoutMs = timeoutMs ?? DEFAULT_AGENT_TIMEOUT_MS;

  const resetTimeout = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(async () => {
      logger.warn('Agent container timed out (no output)', { sessionId, timeoutMs: effectiveTimeoutMs });
      const session = agentSessions.get(sessionId);
      if (session && session.state === 'running') {
        session.state = 'crashed';
        try {
          await container.stop({ t: 5 });
          await container.remove({ force: true });
        } catch {
          // Container may already be stopped
        }
        onExit?.(124); // Timeout exit code
      }
    }, effectiveTimeoutMs);
  };

  // Start initial timeout
  resetTimeout();

  // Store session (include worktree info if applicable)
  agentSessions.set(sessionId, {
    id: sessionId,
    containerId: container.id,
    webContentsId,
    projectPath: resolvedProjectPath,
    itemId,
    agentName,
    state: 'running',
    timeoutId,
    ...(worktreePath && { worktreePath, originalPath, branchName }),
  });

  // Handle output
  const handleOutput = (data: Buffer) => {
    const dataStr = data.toString();

    // Reset timeout on any output
    resetTimeout();

    // Update session timeout reference
    const session = agentSessions.get(sessionId);
    if (session) {
      session.timeoutId = timeoutId;
    }

    logger.info('Agent output', { sessionId, outputLength: dataStr.length, output: dataStr.slice(0, 500) });

    // Forward raw output (flows through agent-runner events → main.ts → renderer IPC)
    onOutput?.(dataStr);

    // Parse and forward protocol messages
    const messages = extractProtocolMessages(dataStr);
    if (messages.length > 0) {
      const webContents = BrowserWindow.getAllWindows().find(
        (w) => w.webContents.id === webContentsId
      )?.webContents;

      for (const message of messages) {
        onProtocolMessage?.(message);

        if (webContents && !webContents.isDestroyed()) {
          webContents.send('agent:protocol-message', sessionId, message);
        }
      }
    }
  };

  stdout.on('data', handleOutput);
  stderr.on('data', handleOutput);

  // Handle completion
  stream.on('end', async () => {
    const session = agentSessions.get(sessionId);
    if (session) {
      // Clear timeout
      if (session.timeoutId) {
        clearTimeout(session.timeoutId);
      }

      session.state = 'stopped';

      let exitCode = 0;
      try {
        const info = await container.inspect();
        exitCode = info.State.ExitCode;
        logger.info('Agent container completed', { sessionId, exitCode });
      } catch {
        // Container may already be removed
      }

      onExit?.(exitCode);

      const webContents = BrowserWindow.getAllWindows().find(
        (w) => w.webContents.id === webContentsId
      )?.webContents;

      if (webContents && !webContents.isDestroyed()) {
        webContents.send('agent:exit', sessionId, exitCode);
      }

      // Cleanup container
      try {
        await container.remove({ force: true });
      } catch {
        // Container may already be removed
      }

      // Clean up worktree if this agent had one
      if (session.worktreePath && session.originalPath) {
        try {
          deleteWorktree(session.originalPath, session.worktreePath);
          logger.info('Agent worktree deleted on exit', { sessionId, worktreePath: session.worktreePath });
        } catch (err) {
          logger.error('Failed to clean up agent worktree on exit', {
            sessionId,
            worktreePath: session.worktreePath,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      agentSessions.delete(sessionId);
    }
  });

  stream.on('error', (err: Error) => {
    logger.error('Agent stream error', { sessionId, error: err.message });
    const session = agentSessions.get(sessionId);
    if (session) {
      // Clear timeout
      if (session.timeoutId) {
        clearTimeout(session.timeoutId);
      }

      session.state = 'crashed';
    }

    onExit?.(1);

    const webContents = BrowserWindow.getAllWindows().find(
      (w) => w.webContents.id === webContentsId
    )?.webContents;

    if (webContents && !webContents.isDestroyed()) {
      webContents.send('agent:exit', sessionId, 1);
    }
  });

  return sessionId;
}

/**
 * Stop and remove an agent container.
 */
export async function stopAgentContainer(sessionId: string): Promise<void> {
  const session = agentSessions.get(sessionId);
  if (!session) return;

  logger.info('Stopping agent container', { sessionId, containerId: session.containerId });

  // Clear timeout
  if (session.timeoutId) {
    clearTimeout(session.timeoutId);
  }

  try {
    const container = docker.getContainer(session.containerId);
    await container.stop({ t: 5 });
    await container.remove({ force: true });
  } catch (err) {
    logger.error('Error stopping agent container', {
      sessionId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Clean up worktree if this agent had one
  if (session.worktreePath && session.originalPath) {
    try {
      deleteWorktree(session.originalPath, session.worktreePath);
      logger.info('Agent worktree deleted on stop', { sessionId, worktreePath: session.worktreePath });
    } catch (err) {
      logger.error('Failed to delete agent worktree', {
        sessionId,
        worktreePath: session.worktreePath,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  agentSessions.delete(sessionId);
}

/**
 * Get agent session info.
 */
export function getAgentSession(sessionId: string): AgentContainerSession | undefined {
  return agentSessions.get(sessionId);
}

/**
 * Get all active agent sessions.
 */
export function getAllAgentSessions(): AgentContainerSession[] {
  return Array.from(agentSessions.values());
}

// ============================================================================
// Cache Management and Cleanup Functions
// ============================================================================

/**
 * Calculate the total size of a directory recursively.
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

  logger.info('Orphaned caches cleaned up', result);
  return result;
}

/**
 * Remove caches for projects not accessed within the specified number of days.
 * @param maxAgeDays - Maximum age in days (default: 90)
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
