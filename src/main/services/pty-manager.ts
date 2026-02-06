import * as pty from 'node-pty';
import { BrowserWindow } from 'electron';
import * as fs from 'fs';
import { execSync } from 'child_process';
import { createLogger } from '@main/lib/logger';

const logger = createLogger('pty-manager');

interface PtySession {
  id: string;
  process: pty.IPty;
  webContentsId: number;
}

const sessions = new Map<string, PtySession>();

// Get default shell based on platform
function getDefaultShell(): string {
  if (process.platform === 'win32') {
    return process.env.COMSPEC || 'cmd.exe';
  }
  return process.env.SHELL || '/bin/bash';
}

export function createPty(webContentsId: number, cwd?: string): string {
  const sessionId = `pty-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const shell = getDefaultShell();

  logger.info('Creating PTY session', { sessionId, shell, cwd: cwd || 'default' });

  const ptyProcess = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols: 80,
    rows: 30,
    cwd: cwd || process.env.HOME || process.cwd(),
    env: process.env as { [key: string]: string },
  });

  sessions.set(sessionId, {
    id: sessionId,
    process: ptyProcess,
    webContentsId,
  });

  // Forward PTY output to renderer
  ptyProcess.onData((data) => {
    const webContents = BrowserWindow.getAllWindows()
      .find(w => w.webContents.id === webContentsId)?.webContents;

    if (webContents && !webContents.isDestroyed()) {
      webContents.send('terminal:data', sessionId, data);
    }
  });

  // Handle PTY exit
  ptyProcess.onExit(({ exitCode }) => {
    logger.info('PTY session exited', { sessionId, exitCode });
    const webContents = BrowserWindow.getAllWindows()
      .find(w => w.webContents.id === webContentsId)?.webContents;

    if (webContents && !webContents.isDestroyed()) {
      webContents.send('terminal:exit', sessionId, exitCode);
    }
    sessions.delete(sessionId);
  });

  return sessionId;
}

export function writePty(sessionId: string, data: string): void {
  const session = sessions.get(sessionId);
  if (session) {
    session.process.write(data);
  }
}

export function resizePty(sessionId: string, cols: number, rows: number): void {
  const session = sessions.get(sessionId);
  if (session && cols > 0 && rows > 0) {
    session.process.resize(cols, rows);
  }
}

export function closePty(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (session) {
    logger.info('Closing PTY session', { sessionId });
    try {
      session.process.kill();
    } catch (err) {
      logger.error('Error killing PTY', { sessionId, error: err instanceof Error ? err.message : String(err) });
    }
    sessions.delete(sessionId);
  }
}

export function closeAllPty(): void {
  for (const [sessionId] of sessions) {
    closePty(sessionId);
  }
}

/**
 * Check if a PTY session has running child processes.
 * Used for close confirmation dialogs.
 *
 * Linux: Reads /proc/[pid]/task/[pid]/children
 * macOS: Uses pgrep -P [pid]
 * Windows: Returns false (conservative approach for MVP)
 */
export function hasRunningChildren(sessionId: string): boolean {
  const session = sessions.get(sessionId);
  if (!session) return false;

  const pid = session.process.pid;
  let hasChildren = false;

  if (process.platform === 'linux') {
    try {
      const children = fs.readFileSync(
        `/proc/${pid}/task/${pid}/children`,
        'utf8'
      ).trim();
      hasChildren = children.length > 0;
    } catch {
      hasChildren = false;
    }
  } else if (process.platform === 'darwin') {
    try {
      execSync(`pgrep -P ${pid}`, { encoding: 'utf8' });
      hasChildren = true;
    } catch {
      hasChildren = false; // pgrep exits non-zero if no children
    }
  }

  logger.debug('Child process check', { sessionId, pid, hasChildren, platform: process.platform });
  return hasChildren;
}
