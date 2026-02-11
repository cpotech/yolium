/**
 * @module src/lib/docker/container-lifecycle
 * Interactive container creation, management, and cleanup.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { BrowserWindow } from 'electron';
import { createLogger } from '@main/lib/logger';
import { loadGitConfig, refreshCodexOAuthTokenSerialized } from '@main/git/git-config';
import { createWorktree, deleteWorktree, generateBranchName, hasUncommittedChanges, fixWorktreeGitFile } from '@main/git/git-worktree';
import { docker, sessions, agentSessions, DEFAULT_IMAGE } from './shared';
import { toDockerPath, getContainerProjectPath, toContainerHomePath } from './path-utils';
import { buildPersistentBindMounts, getGitCredentialsBind, getClaudeOAuthBind, getCodexOAuthBind } from './project-registry';

const logger = createLogger('container-lifecycle');

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
 * @returns Session ID for the container
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
  // Add git-credentials for HTTPS auth if PAT is configured
  const gitCredBind = getGitCredentialsBind();
  if (gitCredBind) {
    binds.push(gitCredBind);
  }

  // Add Claude OAuth credentials if enabled
  const oauthBind = getClaudeOAuthBind();
  if (oauthBind) {
    binds.push(oauthBind);
  }

  // Refresh Codex OAuth token before mounting (single-use refresh tokens go stale)
  if (agent === 'codex') {
    await refreshCodexOAuthTokenSerialized();
  }

  // Add Codex OAuth credentials if enabled
  const codexOAuthBind = getCodexOAuthBind();
  if (codexOAuthBind) {
    binds.push(codexOAuthBind);
  }

  logger.debug('Container bind mounts', { sessionId, binds });

  let container;
  try {
    const storedConfig = loadGitConfig();
    const useOAuth = storedConfig?.useClaudeOAuth && oauthBind;
    const useCodexOAuth = storedConfig?.useCodexOAuth && codexOAuthBind;

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
          'HISTFILE=/home/agent/.yolium_history/zsh_history',
          'OPENCODE_YOLO=true',  // Skip permission prompts — container is already isolated
          ...(process.env.YOLIUM_NETWORK_FULL === 'true' ? ['YOLIUM_NETWORK_FULL=true'] : []),
          ...(process.env.YOLIUM_LOG_LEVEL ? [`YOLIUM_LOG_LEVEL=${process.env.YOLIUM_LOG_LEVEL}`] : []),
          ...(gitConfig?.name ? [`GIT_USER_NAME=${gitConfig.name}`] : []),
          ...(gitConfig?.email ? [`GIT_USER_EMAIL=${gitConfig.email}`] : []),
          // For worktrees: pass the original repo path so entrypoint can create symlink for git
          ...(worktreePath ? [`WORKTREE_REPO_PATH=${toDockerPath(resolvedFolderPath)}`] : []),
          // Pass API keys as env vars (skip Anthropic key when OAuth is enabled)
          ...(() => {
            const envs: string[] = [];
            if (useOAuth) {
              envs.push('CLAUDE_OAUTH_ENABLED=true');
            } else {
              const anthropicKey = storedConfig?.anthropicApiKey || process.env.ANTHROPIC_API_KEY;
              if (anthropicKey) envs.push(`ANTHROPIC_API_KEY=${anthropicKey}`);
            }
            if (useCodexOAuth) {
              envs.push('CODEX_OAUTH_ENABLED=true');
            } else {
              const openaiKey = storedConfig?.openaiApiKey || process.env.OPENAI_API_KEY;
              if (openaiKey) envs.push(`OPENAI_API_KEY=${openaiKey}`);
            }
            return envs;
          })(),
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

      // Re-fix worktree .git paths — the Linux container rewrites them to /c/ style
      if (process.platform === 'win32' && session.worktreePath) {
        fixWorktreeGitFile(session.worktreePath);
      }

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
 *
 * @param sessionId - The session ID
 * @param data - Data to write
 */
export function writeToContainer(sessionId: string, data: string): void {
  const session = sessions.get(sessionId);
  if (session?.stream) {
    session.stream.write(data);
  }
}

/**
 * Resize the container's TTY dimensions.
 *
 * @param sessionId - The session ID
 * @param cols - Number of columns
 * @param rows - Number of rows
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
 *
 * @param sessionId - The session ID
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

  // Re-fix worktree .git paths — the Linux container rewrites them to /c/ style
  if (process.platform === 'win32' && session.worktreePath) {
    fixWorktreeGitFile(session.worktreePath);
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

  // Also clean up all agent sessions (containers only — worktrees persist with kanban items)
  const agentSessionIds = Array.from(agentSessions.keys());
  await Promise.all(agentSessionIds.map(async (sessionId) => {
    const session = agentSessions.get(sessionId);
    if (!session) return;

    try {
      // Clear timeout
      if (session.timeoutId) {
        clearTimeout(session.timeoutId);
      }

      // Stop and remove container (worktree is NOT deleted — persists with kanban item)
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

      // Re-fix worktree .git paths — the Linux container rewrites them to /c/ style
      if (process.platform === 'win32' && session.worktreePath) {
        fixWorktreeGitFile(session.worktreePath);
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
 *
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
 * Get worktree info for a session.
 * Returns null if the session doesn't exist or doesn't have a worktree.
 *
 * @param sessionId - The session ID
 * @returns Worktree info or null
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
 *
 * @param sessionId - The session ID
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
