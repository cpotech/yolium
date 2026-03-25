/**
 * @module src/lib/docker/shared
 * Shared Docker client instance, session maps, and constants used across docker modules.
 */

import Docker from 'dockerode';
import * as os from 'node:os';
import type { ContainerSession } from '@shared/types/docker';
import type { AgentTokenUsage } from '@shared/types/agent';

/**
 * Agent container session tracking (separate from interactive sessions).
 */
export interface AgentContainerSession {
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
  /** Provider used for this agent session (e.g., 'claude', 'codex', 'opencode') */
  agentProvider?: string;
  /** Error message detected in output (for non-Claude providers that don't use structured output) */
  detectedError?: string;
  /** Count of protocol messages received during this session */
  protocolMessageCount: number;
  /** Cumulative token usage emitted by this session. */
  cumulativeUsage: AgentTokenUsage;
  /** Accumulated agent message texts for non-Claude providers (used for conclusion synthesis) */
  agentMessageTexts?: string[];
  /** Whether the agent emitted an update_description protocol message */
  receivedUpdateDescription?: boolean;
}

/** Shared Docker client instance (auto-detects socket path). */
export const docker = new Docker();

/** Interactive container sessions map (sessionId → ContainerSession). */
export const sessions = new Map<string, ContainerSession>();

/** Agent container sessions map (sessionId → AgentContainerSession). */
export const agentSessions = new Map<string, AgentContainerSession>();

/** Default yolium image name (locally built). */
export const DEFAULT_IMAGE = 'yolium:latest';

/** Container workspace path (used on Windows where host paths don't work in Linux containers). */
export const CONTAINER_WORKSPACE = '/workspace';

/** Whether running on Windows platform. */
export const isWindows = os.platform() === 'win32';

/** Common dev server ports to expose from containers. */
export const DEFAULT_EXPOSED_PORTS = [3000, 5173, 4200, 8080, 8000];

/**
 * Build ExposedPorts and PortBindings config for container creation.
 * Maps each default port to a dynamic host port (HostPort '0').
 */
export function buildPortConfig(): {
  ExposedPorts: Record<string, Record<string, never>>;
  PortBindings: Record<string, Array<{ HostPort: string }>>;
} {
  const ExposedPorts: Record<string, Record<string, never>> = {};
  const PortBindings: Record<string, Array<{ HostPort: string }>> = {};
  for (const port of DEFAULT_EXPOSED_PORTS) {
    ExposedPorts[`${port}/tcp`] = {};
    PortBindings[`${port}/tcp`] = [{ HostPort: '0' }];
  }
  return { ExposedPorts, PortBindings };
}

/**
 * Query actual port mappings for a running container.
 * Returns a map of containerPort → hostPort.
 */
export async function queryContainerPorts(containerId: string): Promise<Record<number, number>> {
  try {
    const container = docker.getContainer(containerId);
    const info = await container.inspect();
    const bindings = info.NetworkSettings?.Ports;
    const mappings: Record<number, number> = {};
    if (bindings) {
      for (const [containerPort, hostBindings] of Object.entries(bindings)) {
        const hostPortStr = (hostBindings as Array<{ HostPort: string }> | null)?.[0]?.HostPort;
        if (hostPortStr) {
          const port = parseInt(containerPort.split('/')[0], 10);
          mappings[port] = parseInt(hostPortStr, 10);
        }
      }
    }
    return mappings;
  } catch { // Container may not exist or Docker may be unreachable
    return {};
  }
}
