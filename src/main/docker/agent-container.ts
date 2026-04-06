/**
 * @module src/lib/docker/agent-container
 * Headless agent container creation and management for kanban work items.
 */

import { PassThrough } from 'node:stream';
import { createLogger } from '@main/lib/logger';
import { docker, agentSessions, DEFAULT_IMAGE, buildPortConfig, type AgentContainerSession } from './shared';
import { cleanupSession, wireAgentContainerRuntime } from './agent-container-runtime';
import { prepareAgentContainerConfig } from './agent-container-config';
import type { ServiceIntegration } from '@shared/types/schedule';

const logger = createLogger('agent-container');

// Default timeout: 30 minutes of no output
const DEFAULT_AGENT_TIMEOUT_MS = 30 * 60 * 1000;

export {
  detectErrorInOutput,
  type ParsedStreamEvent,
  parseStreamEvent,
  processStreamChunk,
  flushLineBuffer,
  combineUsageParts,
  accumulateSessionUsage,
} from './agent-container-stream';

export {
  PROTECTED_ENV_VARS,
  buildBindMounts,
  buildAgentEnv,
  buildProjectBindMounts,
} from './agent-container-config';

/**
 * Parameters for creating an agent container.
 */
export interface AgentContainerParams {
  webContentsId: number;
  projectPath: string;
  agentName: string;
  prompt: string;
  goal?: string;
  model: string;
  tools: string[];
  itemId: string;
  agentProvider?: string;
  worktreePath?: string;
  originalPath?: string;
  branchName?: string;
  timeoutMs?: number;
  specialistCredentials?: Record<string, Record<string, string>>;
  integrations?: ServiceIntegration[];
  projectPaths?: string[];
}

/**
 * Callbacks for agent container events.
 */
export interface AgentContainerCallbacks {
  onOutput?: (data: string) => void;
  onDisplayOutput?: (data: string) => void;
  onProtocolMessage?: (message: unknown) => void;
  onExit?: (code: number) => void;
}

/**
 * Create a headless agent container.
 *
 * @param params - Agent container parameters
 * @param callbacks - Optional callbacks for output, protocol messages, and exit
 * @returns Session ID for the agent container
 */
export async function createAgentContainer(
  params: AgentContainerParams,
  callbacks: AgentContainerCallbacks = {}
): Promise<string> {
  const {
    webContentsId,
    projectPath,
    agentName,
    prompt,
    goal,
    model,
    tools,
    itemId,
    agentProvider,
    worktreePath,
    originalPath,
    branchName,
    timeoutMs,
    specialistCredentials,
    integrations,
    projectPaths,
  } = params;

  const sessionId = `agent-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const startupStart = performance.now();

  logger.info('Creating agent container', {
    sessionId,
    projectPath,
    agentName,
    model,
    tools,
    itemId,
    ...(worktreePath && { worktreePath, branchName }),
  });

  const configStart = performance.now();
  const prepared = await prepareAgentContainerConfig({
    projectPath,
    agentName,
    prompt,
    goal,
    model,
    tools,
    itemId,
    agentProvider,
    worktreePath,
    originalPath,
    specialistCredentials,
    integrations,
    projectPaths,
  });
  logger.info('Agent config prepared', {
    sessionId,
    bindCount: prepared.binds.length,
    envCount: prepared.env.length,
    elapsedMs: Math.round(performance.now() - configStart),
  });

  const createStart = performance.now();
  const portConfig = buildPortConfig();
  const container = await docker.createContainer({
    Image: DEFAULT_IMAGE,
    Tty: false,
    OpenStdin: false,
    AttachStdin: false,
    AttachStdout: true,
    AttachStderr: true,
    WorkingDir: prepared.containerProjectPath,
    Env: prepared.env,
    ExposedPorts: portConfig.ExposedPorts,
    HostConfig: {
      CapAdd: ['NET_ADMIN'],
      ShmSize: 268435456,
      Binds: prepared.binds,
      PortBindings: portConfig.PortBindings,
    },
  });
  logger.info('Agent Docker container created', {
    sessionId,
    containerId: container.id,
    elapsedMs: Math.round(performance.now() - createStart),
  });

  const attachStart = performance.now();
  const stream = await container.attach({ stream: true, stdout: true, stderr: true });
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  docker.modem.demuxStream(stream, stdout, stderr);
  logger.info('Agent Docker container attached', {
    sessionId,
    elapsedMs: Math.round(performance.now() - attachStart),
  });

  const startStart = performance.now();
  await container.start();
  logger.info('Agent container started', {
    sessionId,
    containerId: container.id,
    elapsedMs: Math.round(performance.now() - startStart),
  });
  logger.info('Agent container startup complete', {
    sessionId,
    totalElapsedMs: Math.round(performance.now() - startupStart),
  });

  agentSessions.set(sessionId, {
    id: sessionId,
    containerId: container.id,
    webContentsId,
    projectPath: prepared.resolvedProjectPath,
    itemId,
    agentName,
    state: 'running',
    timeoutId: undefined,
    protocolMessageCount: 0,
    cumulativeUsage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
    agentProvider,
    ...(worktreePath && { worktreePath, originalPath, branchName }),
  });

  const { timeoutId } = wireAgentContainerRuntime({
    sessionId,
    webContentsId,
    resolvedProjectPath: prepared.resolvedProjectPath,
    itemId,
    agentProvider,
    effectiveTimeoutMs: timeoutMs ?? DEFAULT_AGENT_TIMEOUT_MS,
    container,
    stream,
    stdout,
    stderr,
    ...callbacks,
  });

  const session = agentSessions.get(sessionId);
  if (session) {
    session.timeoutId = timeoutId;
  }

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

  cleanupSession(sessionId, 'stopped');

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
