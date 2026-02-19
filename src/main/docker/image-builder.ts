/**
 * @module src/lib/docker/image-builder
 * Docker image availability checks, building, and management.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { app } from 'electron';
import { createLogger } from '@main/lib/logger';
import { docker, DEFAULT_IMAGE } from './shared';

const logger = createLogger('image-builder');

/**
 * Check if Docker daemon is available and running.
 * @returns True if Docker is available
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
 * Get the path to the docker directory containing Dockerfile.
 * In development: src/docker
 * In production: resources/docker (copied during build)
 *
 * @returns Path to docker directory
 * @throws Error if docker directory not found
 */
export function getDockerDir(): string {
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
 * Recursively collect all file paths under a directory, sorted for deterministic hashing.
 */
function collectFiles(dir: string): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(fullPath));
    } else if (entry.isFile()) {
      results.push(fullPath);
    }
  }
  return results.sort();
}

/**
 * Compute a hash of all files in the docker directory to detect image staleness.
 * Includes Dockerfile, entrypoint.sh, entrypoint.d/ scripts, marketing-skills, etc.
 * @returns 20-character hash string
 */
export function computeDockerImageHash(): string {
  const dockerDir = getDockerDir();
  const hash = createHash('sha256');

  for (const filePath of collectFiles(dockerDir)) {
    // Use relative path as part of the hash so renames are detected
    const relativePath = path.relative(dockerDir, filePath);
    hash.update(relativePath);
    hash.update('\n');
    hash.update(fs.readFileSync(filePath, 'utf-8'));
    hash.update('\n---\n');
  }

  return hash.digest('hex').substring(0, 20);
}

/**
 * Build the yolium Docker image locally using docker CLI with BuildKit.
 *
 * @param onProgress - Optional callback for build progress messages
 */
export async function buildLocalImage(
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
 * Ensure the specified image is available locally.
 * For local images (yolium:latest), throws helpful error if not built.
 * For remote images, pulls from registry if not present.
 *
 * @param imageName - Image name to ensure (defaults to yolium:latest)
 * @param onProgress - Optional callback for progress messages
 */
export async function ensureImage(
  imageName: string = DEFAULT_IMAGE,
  onProgress?: (msg: string) => void
): Promise<void> {
  const ensureStart = performance.now();
  let phaseStart = ensureStart;

  // Check if image already exists
  const images = await docker.listImages({
    filters: { reference: [imageName] },
  });
  logger.info('Image list check', { imageName, found: images.length > 0, elapsedMs: Math.round(performance.now() - phaseStart) });

  if (images.length > 0) {
    // If this is the local yolium image, rebuild when Dockerfile/entrypoint changes
    if (imageName === DEFAULT_IMAGE) {
      try {
        phaseStart = performance.now();
        const image = docker.getImage(imageName);
        const inspect = await image.inspect();
        const labels = inspect.Config?.Labels || {};
        const currentHash = computeDockerImageHash();
        const imageHash = labels['yolium.build_hash'];
        logger.info('Image staleness check', { imageName, stale: !!(imageHash && imageHash !== currentHash), elapsedMs: Math.round(performance.now() - phaseStart) });
        // Only rebuild if the hash label exists but doesn't match.
        // If the label is missing, the image was built externally (e.g., CI) - skip rebuild.
        if (imageHash && imageHash !== currentHash) {
          onProgress?.('Docker files changed (Dockerfile, entrypoint scripts, or agent skills), rebuilding image...');
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
    logger.info('ensureImage complete', { imageName, totalElapsedMs: Math.round(performance.now() - ensureStart) });
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
 * Get info about the yolium Docker image, including staleness check.
 * @returns Image info or null if the image does not exist
 * @throws Error if Docker API fails for reasons other than image not found
 */
export async function getYoliumImageInfo(): Promise<{
  name: string;
  size: number;
  created: string;
  stale: boolean;
} | null> {
  try {
    const image = docker.getImage(DEFAULT_IMAGE);
    const inspect = await image.inspect();
    const labels = inspect.Config?.Labels || {};
    const imageHash = labels['yolium.build_hash'];

    // Check if the image is stale (Dockerfile/entrypoint changed since build)
    let stale = false;
    if (imageHash) {
      try {
        const currentHash = computeDockerImageHash();
        stale = imageHash !== currentHash;
      } catch {
        // Can't compute hash (e.g., Dockerfile not found) — skip staleness check
      }
    }

    logger.debug('Image info', {
      id: inspect.Id?.substring(0, 20),
      size: inspect.Size,
      created: inspect.Created,
      stale,
    });

    return {
      name: DEFAULT_IMAGE,
      size: inspect.Size,
      created: inspect.Created,
      stale,
    };
  } catch (err) {
    // 404 means the image doesn't exist — return null
    if (err && typeof err === 'object' && 'statusCode' in err && (err as { statusCode: number }).statusCode === 404) {
      logger.debug('Image not found');
      return null;
    }
    // Any other error (Docker daemon down, network issue, etc.) — propagate
    logger.warn('Failed to get image info', {
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

/**
 * Remove the yolium Docker image.
 * Used when rebuilding the image.
 */
export async function removeYoliumImage(): Promise<void> {
  const image = docker.getImage(DEFAULT_IMAGE);
  await image.remove({ force: true });
}
