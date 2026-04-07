import { docker } from './shared';
import { createLogger } from '../lib/logger';

const logger = createLogger('container-exec');

export interface ExecResult {
  exitCode: number;
  output: string;
}

/**
 * Execute a command in a container and return the result.
 * Collects stdout/stderr from the exec stream using dockerode's demuxStream.
 */
export async function execInContainer(
  containerId: string,
  cmd: string[],
): Promise<ExecResult> {
  const container = docker.getContainer(containerId);

  const exec = await container.exec({
    Cmd: cmd,
    AttachStdout: true,
    AttachStderr: true,
    Tty: false,
  });

  const stream = await exec.start({ hijack: true, stdin: false });

  const output = await new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    docker.modem.demuxStream(stream, {
      write: (chunk: Buffer) => { chunks.push(chunk); },
    }, {
      write: (chunk: Buffer) => { stderrChunks.push(chunk); },
    });

    stream.on('end', () => {
      const stdout = Buffer.concat(chunks).toString('utf8');
      const stderr = Buffer.concat(stderrChunks).toString('utf8');
      resolve(stdout || stderr);
    });

    stream.on('error', reject);
  });

  const inspectResult = await exec.inspect();

  return {
    exitCode: inspectResult.ExitCode ?? 0,
    output: output.trim(),
  };
}

type PackageManager = 'npm' | 'yarn' | 'pnpm';

/**
 * Detect the package manager used in the container workspace by checking for lockfiles.
 */
async function detectPackageManager(containerId: string): Promise<PackageManager> {
  // Check for lockfiles in priority order
  const lockfiles: Array<[string, PackageManager]> = [
    ['/workspace/pnpm-lock.yaml', 'pnpm'],
    ['/workspace/yarn.lock', 'yarn'],
  ];

  for (const [lockfile, pm] of lockfiles) {
    try {
      const result = await execInContainer(containerId, ['test', '-f', lockfile]);
      if (result.exitCode === 0) return pm;
    } catch { // Lockfile check failed — fall through to next lockfile or default to npm
    }
  }

  return 'npm';
}

/**
 * Detect the dev command by examining package.json in the container.
 * Checks scripts in priority order: dev, start, serve.
 * Detects package manager from lockfiles (yarn.lock, pnpm-lock.yaml, or npm default).
 */
export async function detectDevCommand(containerId: string): Promise<string | null> {
  try {
    const result = await execInContainer(containerId, ['cat', '/workspace/package.json']);

    if (result.exitCode !== 0) {
      return null;
    }

    let packageJson: { scripts?: Record<string, string> };
    try {
      packageJson = JSON.parse(result.output);
    } catch { // Malformed JSON — return null gracefully
      logger.warn('Failed to parse package.json in container', { containerId });
      return null;
    }

    const scripts = packageJson.scripts ?? {};
    const scriptName = ['dev', 'start', 'serve'].find(name => name in scripts);

    if (!scriptName) return null;

    const pm = await detectPackageManager(containerId);
    return `${pm} run ${scriptName}`;
  } catch (error) {
    logger.error('Failed to detect dev command in container', {
      containerId,
      error: (error as Error).message,
    });
    return null;
  }
}

/**
 * Start the dev server in a container (detached, non-blocking).
 */
export async function startDevServer(
  containerId: string,
  command: string,
): Promise<void> {
  const container = docker.getContainer(containerId);
  const cmdParts = command.split(' ');

  const exec = await container.exec({
    Cmd: cmdParts,
    AttachStdout: false,
    AttachStderr: false,
    Tty: false,
    Detach: true,
  });

  await exec.start({ Detach: true });

  logger.info('Started dev server in container', { containerId, command });
}
