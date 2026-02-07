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
// deleteWorktree no longer called here — worktrees persist with kanban items
import { extractProtocolMessages } from '@main/services/agent-protocol';
import { formatLogTimestamp } from '@main/stores/workitem-log-store';
import { loadGitConfig } from '@main/git/git-config';
import { docker, agentSessions, DEFAULT_IMAGE, type AgentContainerSession } from './shared';
import { toDockerPath, getContainerProjectPath, toContainerHomePath } from './path-utils';
import { getYoliumSshDir, getGitCredentialsBind } from './project-registry';

const logger = createLogger('agent-container');

// Default timeout: 30 minutes of no output
const DEFAULT_AGENT_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Format a tool_use event into a readable one-line summary.
 */
function formatToolUse(name: string, input: Record<string, unknown> | undefined): string {
  if (!input) return `[Tool: ${name}]`;
  switch (name) {
    case 'Read':
      return `[Read] ${input.file_path || ''}`;
    case 'Write':
      return `[Write] ${input.file_path || ''}`;
    case 'Edit':
      return `[Edit] ${input.file_path || ''}`;
    case 'Bash':
      return `[Bash] ${(input.command as string || '').slice(0, 120)}`;
    case 'Glob':
      return `[Glob] ${input.pattern || ''}`;
    case 'Grep':
      return `[Grep] ${input.pattern || ''}`;
    default:
      return `[Tool: ${name}]`;
  }
}

/**
 * Parse a stream-json event from Claude CLI into display text and raw text.
 * Claude CLI with `--output-format stream-json` emits one JSON object per line:
 *   {"type":"system", ...}
 *   {"type":"assistant","message":{"content":[{"type":"text","text":"..."}]}}
 *   {"type":"assistant","message":{"content":[{"type":"tool_use","name":"Read","input":{...}}]}}
 *   {"type":"result","result":"...","cost_usd":0.05}
 *
 * @returns display text for UI, and raw text content for protocol parsing
 */
function parseStreamEvent(event: Record<string, unknown>): { display?: string; text?: string } {
  switch (event.type) {
    case 'system':
      return { display: '[Agent] Session started' };

    case 'assistant': {
      const message = event.message as Record<string, unknown> | undefined;
      const content = message?.content as Array<Record<string, unknown>> | undefined;
      if (!Array.isArray(content)) return {};

      const displayParts: string[] = [];
      let text = '';

      for (const item of content) {
        if (item.type === 'text' && typeof item.text === 'string') {
          displayParts.push(item.text);
          text += item.text;
        } else if (item.type === 'tool_use' && typeof item.name === 'string') {
          displayParts.push(formatToolUse(item.name as string, item.input as Record<string, unknown> | undefined));
        }
      }

      return {
        display: displayParts.length > 0 ? displayParts.join('\n') : undefined,
        text: text || undefined,
      };
    }

    case 'result': {
      const result = event.result as string | undefined;
      const costUsd = event.cost_usd as number | undefined;
      const parts: string[] = [];
      if (result) parts.push(result);
      if (typeof costUsd === 'number') parts.push(`[Cost: $${costUsd.toFixed(4)}]`);
      return {
        display: parts.length > 0 ? parts.join('\n') : undefined,
        text: result || undefined,
      };
    }

    default:
      return {};
  }
}

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
  /** Called with display-formatted output text (what users see in the log panel). */
  onDisplayOutput?: (data: string) => void;
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
  const { onOutput, onDisplayOutput, onProtocolMessage, onExit } = callbacks;

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

  // Load git config for identity env vars (name, email)
  const gitConfig = loadGitConfig();

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
      ...(gitConfig?.name ? [`GIT_USER_NAME=${gitConfig.name}`] : []),
      ...(gitConfig?.email ? [`GIT_USER_EMAIL=${gitConfig.email}`] : []),
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

  // Line buffer for stream-json parsing (Docker stream chunks may not align with line boundaries)
  let lineBuffer = '';

  // Handle output: parse stream-json events from Claude CLI into readable display text
  const handleOutput = (data: Buffer) => {
    const dataStr = data.toString();

    // Reset timeout on any output
    resetTimeout();

    // Update session timeout reference
    const session = agentSessions.get(sessionId);
    if (session) {
      session.timeoutId = timeoutId;
    }

    logger.debug('Agent raw chunk', { sessionId, chunkLength: dataStr.length });

    // Buffer and split on newlines for stream-json parsing
    lineBuffer += dataStr;
    const lines = lineBuffer.split('\n');
    lineBuffer = lines.pop() || ''; // Keep incomplete last line in buffer

    const displayParts: string[] = [];
    let textContent = '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const event = JSON.parse(trimmed);
        const parsed = parseStreamEvent(event);
        if (parsed.display) displayParts.push(parsed.display);
        if (parsed.text) textContent += parsed.text + '\n';
      } catch {
        // Not JSON — forward as raw text (e.g., entrypoint echo messages, stderr)
        displayParts.push(trimmed);
        textContent += trimmed + '\n';
      }
    }

    if (displayParts.length === 0) return;

    // Prepend timestamp to each display line
    const ts = formatLogTimestamp();
    const timestampedParts = displayParts.map(line => `${ts} ${line}`);
    const displayStr = timestampedParts.join('\n');
    logger.info('Agent output', { sessionId, displayLines: displayParts.length, display: displayStr.slice(0, 500) });

    // Forward text content for protocol parsing via callback
    onOutput?.(textContent || displayStr);

    // Forward display text for persistent logging
    onDisplayOutput?.(displayStr);

    // Send parsed display output to renderer
    const webContents = BrowserWindow.getAllWindows().find(
      (w) => w.webContents.id === webContentsId
    )?.webContents;

    if (webContents && !webContents.isDestroyed()) {
      webContents.send('agent:output', sessionId, displayStr);
    }

    // Parse and forward protocol messages from text content
    if (textContent) {
      const messages = extractProtocolMessages(textContent);
      if (messages.length > 0) {
        for (const message of messages) {
          onProtocolMessage?.(message);

          if (webContents && !webContents.isDestroyed()) {
            webContents.send('agent:protocol-message', sessionId, message);
          }
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

      // Worktree is NOT deleted here — it persists with the kanban item
      // and gets cleaned up on merge or item deletion

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

  // Worktree is NOT deleted here — it persists with the kanban item
  // and gets cleaned up on merge or item deletion

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
