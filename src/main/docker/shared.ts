/**
 * @module src/lib/docker/shared
 * Shared Docker client instance, session maps, and constants used across docker modules.
 */

import Docker from 'dockerode';
import * as os from 'node:os';
import type { ContainerSession } from '@shared/types/docker';

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
