/**
 * @module src/lib/docker/code-review
 * Code review container and related functions.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { spawn } from 'node:child_process';
import { PassThrough } from 'node:stream';
import { BrowserWindow } from 'electron';
import { createLogger } from '@main/lib/logger';
import { loadGitConfig, generateGitCredentials, hasHostClaudeOAuth } from '@main/git/git-config';
import { docker, sessions, DEFAULT_IMAGE } from './shared';
import { toDockerPath, getContainerProjectPath, toContainerHomePath } from './path-utils';
import { getYoliumSshDir, getGitCredentialsBind, getClaudeOAuthBind } from './project-registry';

const logger = createLogger('code-review');

/**
 * List remote branches for a git repository URL.
 * Uses git ls-remote with credentials from stored git config.
 *
 * @param repoUrl - The repository URL
 * @returns Object with branches array and optional error
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
 * Check if an agent has API key authentication configured.
 * API keys are passed as environment variables (no host directory scanning).
 *
 * @param agent - Agent name ('claude', 'opencode', or 'codex')
 * @returns Object indicating authentication status
 */
export function checkAgentAuth(agent: string): { authenticated: boolean } {
  const storedConfig = loadGitConfig();

  if (agent === 'claude' || agent === 'opencode') {
    // Claude and OpenCode use Anthropic API key OR Claude OAuth tokens
    const hasApiKey = !!(storedConfig?.anthropicApiKey || process.env.ANTHROPIC_API_KEY);
    const hasOAuth = !!(storedConfig?.useClaudeOAuth && hasHostClaudeOAuth());
    return { authenticated: hasApiKey || hasOAuth };
  }

  if (agent === 'codex') {
    // Codex uses OpenAI API key
    return { authenticated: !!(storedConfig?.openaiApiKey || process.env.OPENAI_API_KEY) };
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
 * @returns Session ID for the review container
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
  // API keys are passed as env vars — no host config directories mounted
  const binds = [
    `${toDockerPath(tmpDir)}:${containerProjectPath}:rw`,
  ];

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

  // Add Claude OAuth credentials if enabled
  const oauthBind = getClaudeOAuthBind();
  if (oauthBind) {
    binds.push(oauthBind);
  }

  logger.debug('Code review container bind mounts', { sessionId, binds });

  const storedConfig = loadGitConfig();
  const useOAuth = storedConfig?.useClaudeOAuth && oauthBind;

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
      ...(process.env.YOLIUM_NETWORK_FULL === 'true' ? ['YOLIUM_NETWORK_FULL=true'] : []),
      ...(gitConfig?.name ? [`GIT_USER_NAME=${gitConfig.name}`] : []),
      ...(gitConfig?.email ? [`GIT_USER_EMAIL=${gitConfig.email}`] : []),
      // Pass API keys as env vars for all agents (skip Anthropic key when OAuth is enabled)
      ...(() => {
        if (useOAuth) return ['CLAUDE_OAUTH_ENABLED=true'];
        const anthropicKey = storedConfig?.anthropicApiKey || process.env.ANTHROPIC_API_KEY;
        return anthropicKey ? [`ANTHROPIC_API_KEY=${anthropicKey}`] : [];
      })(),
      ...(() => {
        const openaiKey = storedConfig?.openaiApiKey || process.env.OPENAI_API_KEY;
        return openaiKey ? [`OPENAI_API_KEY=${openaiKey}`] : [];
      })(),
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
