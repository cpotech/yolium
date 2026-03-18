import { BrowserWindow } from 'electron';
import { PassThrough } from 'node:stream';
import { createLogger } from '@main/lib/logger';
import { extractProtocolMessages } from '@main/services/agent-protocol';
import { formatLogTimestamp } from '@main/stores/workitem-log-store';
import { fixWorktreeGitFile } from '@main/git/git-worktree';
import { normalizeSvgToDataUri } from './svg-normalize';
import { agentSessions } from './shared';
import {
  accumulateSessionUsage,
  combineUsageParts,
  detectErrorInOutput,
  flushLineBuffer,
  processStreamChunk,
} from './agent-container-stream';

const logger = createLogger('agent-container-runtime');

export interface AgentContainerRuntimeCallbacks {
  onOutput?: (data: string) => void;
  onDisplayOutput?: (data: string) => void;
  onProtocolMessage?: (message: unknown) => void;
  onExit?: (code: number) => void;
}

interface RuntimeContainer {
  stop(options: { t: number }): Promise<void>;
  remove(options: { force: true }): Promise<void>;
  inspect(): Promise<{ State: { ExitCode: number } }>;
}

function getWebContents(webContentsId: number): Electron.WebContents | undefined {
  return BrowserWindow.getAllWindows().find(
    (window) => window.webContents.id === webContentsId
  )?.webContents;
}

export function cleanupSession(sessionId: string, state: 'stopped' | 'crashed'): void {
  const session = agentSessions.get(sessionId);
  if (!session) return;

  if (session.timeoutId) {
    clearTimeout(session.timeoutId);
  }

  session.state = state;

  if (process.platform === 'win32' && session.worktreePath) {
    fixWorktreeGitFile(session.worktreePath);
  }
}

export function notifyExit(
  webContentsId: number,
  sessionId: string,
  exitCode: number,
  onExit?: (code: number) => void
): void {
  onExit?.(exitCode);
  const webContents = getWebContents(webContentsId);
  if (webContents && !webContents.isDestroyed()) {
    webContents.send('agent:exit', sessionId, exitCode);
  }
}

function dispatchOutput(
  result: ReturnType<typeof processStreamChunk>,
  ctx: {
    sessionId: string;
    webContentsId: number;
    resolvedProjectPath: string;
    itemId: string;
    agentProvider?: string;
  } & AgentContainerRuntimeCallbacks
): void {
  if (result.displayParts.length === 0 && result.usageParts.length === 0) return;

  let displayStr = '';
  if (result.displayParts.length > 0) {
    const timestamp = formatLogTimestamp();
    displayStr = result.displayParts.map((line) => `${timestamp} ${line}`).join('\n');
    logger.info('Agent output', {
      sessionId: ctx.sessionId,
      displayLines: result.displayParts.length,
      display: displayStr.slice(0, 500),
    });
  }

  if (result.textContent) ctx.onOutput?.(result.textContent);
  if (displayStr) ctx.onDisplayOutput?.(displayStr);

  const webContents = getWebContents(ctx.webContentsId);
  if (webContents && !webContents.isDestroyed()) {
    if (displayStr) webContents.send('agent:output', ctx.sessionId, displayStr);

    if (result.usageParts.length > 0) {
      const combined = combineUsageParts(result.usageParts);
      const session = agentSessions.get(ctx.sessionId);
      if (session) accumulateSessionUsage(session, combined);
      webContents.send('agent:cost-update', ctx.sessionId, ctx.resolvedProjectPath, ctx.itemId, combined);
    }
  }

  if (result.textContent) {
    const messages = extractProtocolMessages(result.textContent);
    if (messages.length > 0) {
      const session = agentSessions.get(ctx.sessionId);
      if (session) session.protocolMessageCount += messages.length;
      for (const message of messages) {
        ctx.onProtocolMessage?.(message);
        if (webContents && !webContents.isDestroyed()) {
          webContents.send('agent:protocol-message', ctx.sessionId, message);
        }
      }
    }
  }

  if (ctx.agentProvider && ctx.agentProvider !== 'claude' && result.agentMessageTexts.length > 0) {
    for (const text of result.agentMessageTexts) {
      if (text.includes('@@YOLIUM:')) continue;
      if (text.length < 50) continue;

      const session = agentSessions.get(ctx.sessionId);
      if (session) {
        if (!session.agentMessageTexts) session.agentMessageTexts = [];
        session.agentMessageTexts.push(text);
        session.protocolMessageCount += 1;
      }

      const syntheticMessage = { type: 'add_comment' as const, text: normalizeSvgToDataUri(text) };
      ctx.onProtocolMessage?.(syntheticMessage);
      if (webContents && !webContents.isDestroyed()) {
        webContents.send('agent:protocol-message', ctx.sessionId, syntheticMessage);
      }
    }
  }
}

export function wireAgentContainerRuntime(params: {
  sessionId: string;
  webContentsId: number;
  resolvedProjectPath: string;
  itemId: string;
  agentProvider?: string;
  effectiveTimeoutMs: number;
  container: RuntimeContainer;
  stream: NodeJS.EventEmitter;
  stdout: PassThrough;
  stderr: PassThrough;
} & AgentContainerRuntimeCallbacks): { timeoutId?: NodeJS.Timeout } {
  const {
    sessionId,
    webContentsId,
    resolvedProjectPath,
    itemId,
    agentProvider,
    effectiveTimeoutMs,
    container,
    stream,
    stdout,
    stderr,
    onOutput,
    onDisplayOutput,
    onProtocolMessage,
    onExit,
  } = params;

  let lineBuffer = '';
  let timeoutId: NodeJS.Timeout | undefined;

  const resetTimeout = () => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(async () => {
      logger.warn('Agent container timed out (no output)', { sessionId, timeoutMs: effectiveTimeoutMs });
      const session = agentSessions.get(sessionId);
      if (session && session.state === 'running') {
        cleanupSession(sessionId, 'crashed');
        try {
          await container.stop({ t: 5 });
          await container.remove({ force: true });
        } catch { /* Container is already stopping or gone. */
        }
        notifyExit(webContentsId, sessionId, 124, onExit);
      }
    }, effectiveTimeoutMs);

    const session = agentSessions.get(sessionId);
    if (session) session.timeoutId = timeoutId;
  };

  const handleOutput = (data: Buffer) => {
    const dataStr = data.toString();
    resetTimeout();

    const session = agentSessions.get(sessionId);
    const detectedError = detectErrorInOutput(dataStr, agentProvider);
    if (detectedError && session && !session.detectedError) {
      session.detectedError = detectedError;
      logger.warn('Detected error in agent output', { sessionId, error: detectedError, provider: agentProvider });
    }

    const result = processStreamChunk(dataStr, lineBuffer);
    lineBuffer = result.lineBuffer;
    dispatchOutput(result, {
      sessionId,
      webContentsId,
      resolvedProjectPath,
      itemId,
      agentProvider,
      onOutput,
      onDisplayOutput,
      onProtocolMessage,
    });
  };

  stdout.on('data', handleOutput);
  stderr.on('data', handleOutput);

  stream.on('end', async () => {
    const flushed = flushLineBuffer(lineBuffer);
    lineBuffer = '';

    if (flushed.textContent) onOutput?.(flushed.textContent);
    if (flushed.protocolMessages.length > 0) {
      const session = agentSessions.get(sessionId);
      if (session) session.protocolMessageCount += flushed.protocolMessages.length;
      for (const message of flushed.protocolMessages) {
        onProtocolMessage?.(message);
      }
    }

    if (flushed.usage) {
      const session = agentSessions.get(sessionId);
      if (session) accumulateSessionUsage(session, flushed.usage);
      const webContents = getWebContents(webContentsId);
      if (webContents && !webContents.isDestroyed()) {
        webContents.send('agent:cost-update', sessionId, resolvedProjectPath, itemId, flushed.usage);
      }
    }

    cleanupSession(sessionId, 'stopped');
    const session = agentSessions.get(sessionId);
    if (session) {
      let exitCode = 0;
      try {
        const info = await container.inspect();
        exitCode = info.State.ExitCode;
        logger.info('Agent container completed', { sessionId, exitCode });
      } catch { /* Container may already be removed. */
      }

      notifyExit(webContentsId, sessionId, exitCode, onExit);
      try {
        await container.remove({ force: true });
      } catch { /* Container may already be removed. */
      }
      agentSessions.delete(sessionId);
    }
  });

  stream.on('error', (err: Error) => {
    logger.error('Agent stream error', { sessionId, error: err.message });
    cleanupSession(sessionId, 'crashed');
    notifyExit(webContentsId, sessionId, 1, onExit);
  });

  resetTimeout();
  return { timeoutId };
}
