/**
 * @module src/lib/docker/agent-container
 * Headless agent container creation and management for kanban work items.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { PassThrough } from 'node:stream';
import { BrowserWindow } from 'electron';
import { createLogger } from '@main/lib/logger';
import { deleteWorktree } from '@main/git/git-worktree';
import { extractProtocolMessages } from '@main/services/agent-protocol';
import { docker, agentSessions, DEFAULT_IMAGE, type AgentContainerSession } from './shared';
import { toDockerPath, getContainerProjectPath, toContainerHomePath } from './path-utils';
import { getYoliumSshDir, getGitCredentialsBind } from './project-registry';

const logger = createLogger('agent-container');

// Default timeout: 30 minutes of no output
const DEFAULT_AGENT_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Parameters for creating an agent container.
 */
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

/**
 * Callbacks for agent container events.
 */
export interface AgentContainerCallbacks {
  onOutput?: (data: string) => void;
  onProtocolMessage?: (message: unknown) => void;
  onExit?: (code: number) => void;
}

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
 *
 * @param sessionId - The session ID
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
 *
 * @param sessionId - The session ID
 * @returns Agent session or undefined if not found
 */
export function getAgentSession(sessionId: string): AgentContainerSession | undefined {
  return agentSessions.get(sessionId);
}

/**
 * Get all active agent sessions.
 * @returns Array of all agent sessions
 */
export function getAllAgentSessions(): AgentContainerSession[] {
  return Array.from(agentSessions.values());
}
