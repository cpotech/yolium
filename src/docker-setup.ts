import Docker from 'dockerode';
import * as fs from 'node:fs';
import { spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { exec } from 'node:child_process';
import sudoPrompt from 'sudo-prompt-alt';
import { createLogger } from './lib/logger';
import type { DockerState, SetupStage } from './types/docker';

export type { DockerState, SetupStage } from './types/docker';

const execAsync = promisify(exec);
const logger = createLogger('docker-setup');

// Initialize docker client (auto-detects socket path)
const docker = new Docker();

/**
 * Get the platform-specific Docker Desktop executable path.
 * Returns null if Docker Desktop is not installed.
 */
export function getDockerDesktopPath(): string | null {
  const paths: Record<string, string> = {
    win32: 'C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe',
    darwin: '/Applications/Docker.app',
    linux: '/opt/docker-desktop/bin/docker-desktop',
  };

  const p = paths[process.platform];
  if (p && fs.existsSync(p)) {
    return p;
  }
  return null;
}

/**
 * Detect current Docker state: installed and running status.
 */
export async function detectDockerState(): Promise<DockerState> {
  logger.info('Detecting Docker state');
  const desktopPath = getDockerDesktopPath();

  // Check if Docker daemon is running (regardless of how it was installed)
  let running = false;
  try {
    await docker.ping();
    running = true;
  } catch {
    running = false;
  }

  // Docker is "installed" if daemon is running OR Desktop path exists
  const installed = running || desktopPath !== null;

  logger.info('Docker state detected', { installed, running, desktopPath });
  return { installed, running, desktopPath };
}

/**
 * Wait for Docker daemon to become ready, polling every 2 seconds.
 * @param timeoutMs Maximum time to wait in milliseconds (default 60000)
 */
export async function waitForDockerReady(timeoutMs: number = 60000): Promise<boolean> {
  logger.info('Waiting for Docker daemon', { timeoutMs });
  const start = Date.now();
  const pollInterval = 2000;

  while (Date.now() - start < timeoutMs) {
    try {
      await docker.ping();
      logger.info('Docker daemon ready', { elapsedMs: Date.now() - start });
      return true;
    } catch {
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
  }
  logger.warn('Docker daemon timeout', { timeoutMs });
  return false;
}

/**
 * Start Docker Desktop using the modern CLI (v4.37+).
 * Falls back to legacy platform-specific methods if CLI not available.
 * @returns true if Docker daemon becomes ready within timeout
 */
export async function startDockerDesktop(): Promise<boolean> {
  logger.info('Starting Docker Desktop');
  // Try Docker Desktop CLI first (v4.37+)
  try {
    logger.debug('Trying Docker Desktop CLI');
    await execAsync('docker desktop start');
    return await waitForDockerReady(60000);
  } catch {
    // Fall back to platform-specific launch
    logger.debug('Docker Desktop CLI failed, falling back to legacy method');
    return startDockerDesktopLegacy();
  }
}

/**
 * Start Docker Desktop using platform-specific legacy methods.
 * Used when `docker desktop start` CLI is not available.
 */
async function startDockerDesktopLegacy(): Promise<boolean> {
  logger.info('Starting Docker Desktop (legacy method)', { platform: process.platform });
  const desktopPath = getDockerDesktopPath();

  switch (process.platform) {
    case 'darwin':
      try {
        logger.debug('Starting Docker via open command');
        await execAsync('open --background -a Docker');
      } catch (error) {
        logger.error('Failed to start Docker Desktop on macOS', { error: String(error) });
        throw new Error(`Failed to start Docker Desktop on macOS: ${error}`);
      }
      break;

    case 'win32':
      if (!desktopPath) {
        logger.error('Docker Desktop not found on Windows');
        throw new Error('Docker Desktop not found on Windows');
      }
      logger.debug('Starting Docker Desktop executable', { path: desktopPath });
      spawn(desktopPath, [], {
        detached: true,
        stdio: 'ignore',
      }).unref();
      break;

    case 'linux':
      // Try systemctl first for systemd-based systems
      try {
        logger.debug('Trying systemctl to start docker-desktop');
        spawn('systemctl', ['--user', 'start', 'docker-desktop'], {
          detached: true,
          stdio: 'ignore',
        }).unref();
      } catch {
        // Fall back to direct binary execution
        if (desktopPath) {
          logger.debug('Falling back to direct binary execution', { path: desktopPath });
          spawn(desktopPath, [], {
            detached: true,
            stdio: 'ignore',
          }).unref();
        } else {
          logger.error('Docker Desktop not found on Linux');
          throw new Error('Docker Desktop not found on Linux');
        }
      }
      break;

    default:
      logger.error('Unsupported platform', { platform: process.platform });
      throw new Error(`Unsupported platform: ${process.platform}`);
  }

  return waitForDockerReady(60000);
}

/**
 * Start Docker Engine via systemctl (Linux only).
 * Uses sudo-prompt for elevated privileges.
 * @returns true if Docker daemon becomes ready within timeout
 */
export async function startDockerEngine(): Promise<boolean> {
  if (process.platform !== 'linux') {
    logger.error('startDockerEngine called on non-Linux platform', { platform: process.platform });
    throw new Error('startDockerEngine is only supported on Linux');
  }

  logger.info('Starting Docker Engine via systemctl');
  return new Promise((resolve, reject) => {
    sudoPrompt.exec(
      'systemctl start docker',
      { name: 'Yolium Desktop' },
      async (error) => {
        if (error) {
          logger.error('Failed to start Docker Engine', { error: error.message });
          reject(new Error(`Failed to start Docker Engine: ${error.message}`));
          return;
        }
        logger.info('Docker Engine started, waiting for daemon');
        // Wait for daemon to be ready
        const ready = await waitForDockerReady(30000);
        if (ready) {
          logger.info('Docker Engine ready');
        } else {
          logger.warn('Docker Engine started but daemon not ready');
        }
        resolve(ready);
      }
    );
  });
}
