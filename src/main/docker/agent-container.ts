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
import { extractProtocolMessages } from '@main/services/agent-protocol';
import { detectPackageManager, detectProjectTypes } from '@main/services/project-onboarding';
import { formatLogTimestamp } from '@main/stores/workitem-log-store';
import { loadGitConfig, refreshCodexOAuthTokenSerialized } from '@main/git/git-config';
import type { GitConfig } from '@main/git/git-config';
import { fixWorktreeGitFile } from '@main/git/git-worktree';
import { docker, agentSessions, DEFAULT_IMAGE, type AgentContainerSession } from './shared';
import { toDockerPath, getContainerProjectPath, toContainerHomePath } from './path-utils';
import { getGitCredentialsBind, getClaudeOAuthBind, getCodexOAuthBind } from './project-registry';

const logger = createLogger('agent-container');

// Default timeout: 30 minutes of no output
const DEFAULT_AGENT_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Error patterns to detect in agent output (for non-Claude providers).
 * These patterns indicate API errors, auth failures, rate limits, etc.
 */
const ERROR_PATTERNS = [
  // Auth errors
  { pattern: /401 Unauthorized|Missing bearer.*authentication/i, message: 'Authentication failed (401 Unauthorized)' },
  // Rate limit errors
  { pattern: /429 Too Many Requests|rate limit/i, message: 'Rate limit exceeded (429 Too Many Requests)' },
  // Overload errors
  { pattern: /overloaded|503 Service/i, message: 'API overloaded (503 Service Unavailable)' },
  // Network errors
  { pattern: /ECONNREFUSED|ENOTFOUND|network error|connection refused/i, message: 'Network error (connection failed)' },
  // Codex CLI errors
  { pattern: /Error:\s*(.+)/i, message: (match: RegExpMatchArray) => `Codex error: ${match[1]}` },
];

/**
 * Detect errors in raw output text for non-Claude providers.
 * Returns the first detected error message, or undefined if no error found.
 */
export function detectErrorInOutput(text: string, provider?: string): string | undefined {
  // Only apply pattern detection for non-Claude providers
  // Claude uses stream-json which handles errors structurally
  if (provider === 'claude' || !provider) {
    return undefined;
  }

  for (const { pattern, message } of ERROR_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      if (typeof message === 'function') {
        return message(match);
      }
      return message;
    }
  }
  return undefined;
}

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
export interface ParsedStreamEvent {
  display?: string;
  text?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  };
}

export function combineUsageParts(
  usageParts: Array<NonNullable<ParsedStreamEvent['usage']>>
): NonNullable<ParsedStreamEvent['usage']> {
  return usageParts.reduce(
    (acc, usage) => ({
      inputTokens: acc.inputTokens + usage.inputTokens,
      outputTokens: acc.outputTokens + usage.outputTokens,
      costUsd: acc.costUsd + usage.costUsd,
    }),
    { inputTokens: 0, outputTokens: 0, costUsd: 0 }
  );
}

export function accumulateSessionUsage(
  session: Pick<AgentContainerSession, 'cumulativeUsage'>,
  usage: NonNullable<ParsedStreamEvent['usage']>
): void {
  session.cumulativeUsage.inputTokens += usage.inputTokens;
  session.cumulativeUsage.outputTokens += usage.outputTokens;
  session.cumulativeUsage.costUsd += usage.costUsd;
}

export function parseStreamEvent(event: Record<string, unknown>): ParsedStreamEvent {
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
          const name = item.name as string;
          const input = item.input as Record<string, unknown> | undefined;

          displayParts.push(formatToolUse(name, input));

          // Protocol messages may be emitted via Bash `echo '@@YOLIUM:...'`.
          // Include command text so downstream protocol extraction can process it.
          if (name === 'Bash') {
            const command = input?.command;
            if (typeof command === 'string' && command.includes('@@YOLIUM:')) {
              text += `${command}\n`;
            }
          }
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
      const usage = event.usage as { input_tokens?: number; output_tokens?: number } | undefined;
      const inputTokens = usage?.input_tokens ?? 0;
      const outputTokens = usage?.output_tokens ?? 0;
      const parts: string[] = [];
      if (result) parts.push(result);
      if (typeof costUsd === 'number') parts.push(`[Cost: $${costUsd.toFixed(4)}]`);
      return {
        display: parts.length > 0 ? parts.join('\n') : undefined,
        ...(typeof costUsd === 'number' || inputTokens > 0 || outputTokens > 0
          ? { usage: { inputTokens, outputTokens, costUsd: costUsd ?? 0 } }
          : {}),
        // Don't return text — result event duplicates text already processed from assistant events,
        // which would cause protocol messages to be extracted and handled twice.
      };
    }

    // ─── Codex JSONL event types ──────────────────────────────────────────
    // Codex CLI with `--json` streams JSONL events:
    //   {"type":"thread.started",...}
    //   {"type":"turn.started",...}
    //   {"type":"item.started","item":{"type":"command_execution","command":"..."}}
    //   {"type":"item.completed","item":{"type":"agent_message","content":[{"type":"text","text":"..."}]}}
    //   {"type":"item.completed","item":{"type":"command_execution","command":"...","output":"..."}}
    //   {"type":"item.completed","item":{"type":"file_change","filename":"..."}}
    //   {"type":"turn.completed","usage":{"input_tokens":N,"output_tokens":N,"cached_input_tokens":N},...}

    case 'thread.started':
      return { display: '[Agent] Codex session started' };

    case 'turn.started':
      return { display: '[Agent] Turn started' };

    case 'item.started': {
      const item = event.item as Record<string, unknown> | undefined;
      if (!item) return {};
      if (item.type === 'command_execution' && typeof item.command === 'string') {
        return { display: `[Bash] ${item.command.slice(0, 120)}` };
      }
      return {};
    }

    case 'item.completed': {
      const item = event.item as Record<string, unknown> | undefined;
      if (!item) return {};

      if (item.type === 'agent_message') {
        const content = item.content as Array<Record<string, unknown>> | undefined;
        if (!Array.isArray(content)) return {};

        const displayParts: string[] = [];
        let text = '';

        for (const block of content) {
          if (block.type === 'text' && typeof block.text === 'string') {
            displayParts.push(block.text);
            text += block.text;
          }
        }

        return {
          display: displayParts.length > 0 ? displayParts.join('\n') : undefined,
          text: text || undefined,
        };
      }

      if (item.type === 'command_execution') {
        const command = typeof item.command === 'string' ? item.command.slice(0, 120) : '';
        const output = typeof item.output === 'string' ? item.output.slice(0, 500) : '';
        const parts: string[] = [];
        if (command) parts.push(`[Bash] ${command}`);
        if (output) parts.push(output);
        return { display: parts.length > 0 ? parts.join('\n') : undefined };
      }

      if (item.type === 'file_change') {
        const filename = typeof item.filename === 'string' ? item.filename : '';
        return { display: filename ? `[File] ${filename}` : undefined };
      }

      return {};
    }

    case 'turn.completed': {
      const usage = event.usage as Record<string, unknown> | undefined;
      if (!usage) return {};

      const inputTokens = (typeof usage.input_tokens === 'number' ? usage.input_tokens : 0)
        + (typeof usage.cached_input_tokens === 'number' ? usage.cached_input_tokens : 0);
      const outputTokens = typeof usage.output_tokens === 'number' ? usage.output_tokens : 0;

      // Codex doesn't provide cost directly — estimate from tokens
      // Using approximate o3/codex pricing: $2/1M input, $8/1M output
      const costUsd = (inputTokens * 2 / 1_000_000) + (outputTokens * 8 / 1_000_000);

      return {
        display: `[Cost: $${costUsd.toFixed(4)}]`,
        usage: { inputTokens, outputTokens, costUsd },
      };
    }

    default:
      return {};
  }
}

// ─── Extracted helper functions ─────────────────────────────────────────────

/**
 * Build bind mount array for headless agent containers.
 * Pure function: takes config, returns mount strings.
 */
export function buildBindMounts(params: {
  mountPath: string;
  containerProjectPath: string;
  worktreePath?: string;
  originalPath?: string;
  gitCredentialsBind: string | null;
  claudeOAuthBind: string | null;
  codexOAuthBind: string | null;
}): string[] {
  const { mountPath, containerProjectPath, worktreePath, originalPath, gitCredentialsBind, claudeOAuthBind, codexOAuthBind } = params;

  const binds = [
    `${toDockerPath(mountPath)}:${containerProjectPath}:rw`,
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

  if (gitCredentialsBind) {
    binds.push(gitCredentialsBind);
  }

  if (claudeOAuthBind) {
    binds.push(claudeOAuthBind);
  }

  if (codexOAuthBind) {
    binds.push(codexOAuthBind);
  }

  return binds;
}

/**
 * Build the environment variable array for agent containers.
 * Pure function: takes config, returns env var strings.
 */
export function buildAgentEnv(params: {
  containerProjectPath: string;
  projectTypesValue: string;
  nodePackageManager: string | null;
  promptBase64: string;
  goalBase64?: string;
  model: string;
  tools: string[];
  itemId: string;
  agentProvider: string;
  worktreePath?: string;
  originalPath?: string;
  gitConfig: GitConfig | null;
  useOAuth: boolean;
  useCodexOAuth: boolean;
}): string[] {
  const {
    containerProjectPath, projectTypesValue, nodePackageManager,
    promptBase64, goalBase64, model, tools, itemId, agentProvider,
    worktreePath, originalPath, gitConfig, useOAuth, useCodexOAuth,
  } = params;

  return [
    `PROJECT_DIR=${containerProjectPath}`,
    'TOOL=agent',
    ...(projectTypesValue ? [`PROJECT_TYPES=${projectTypesValue}`] : []),
    ...(nodePackageManager ? [`NODE_PACKAGE_MANAGER=${nodePackageManager}`] : []),
    `AGENT_PROMPT=${promptBase64}`,
    `AGENT_MODEL=${model}`,
    `AGENT_TOOLS=${tools.join(',')}`,
    `AGENT_ITEM_ID=${itemId}`,
    `AGENT_PROVIDER=${agentProvider}`,
    ...(goalBase64 ? [`AGENT_GOAL=${goalBase64}`] : []),
    `HOST_HOME=${toContainerHomePath(os.homedir())}`,
    'OPENCODE_YOLO=true',  // Skip permission prompts — container is already isolated
    ...(process.env.YOLIUM_NETWORK_FULL === 'true' ? ['YOLIUM_NETWORK_FULL=true'] : []),
    ...(worktreePath && originalPath ? [`WORKTREE_REPO_PATH=${toDockerPath(originalPath)}`] : []),
    ...(gitConfig?.name ? [`GIT_USER_NAME=${gitConfig.name}`] : []),
    ...(gitConfig?.email ? [`GIT_USER_EMAIL=${gitConfig.email}`] : []),
    // Pass API keys as env vars (skip Anthropic key when OAuth is enabled)
    ...(() => {
      if (useOAuth) return ['CLAUDE_OAUTH_ENABLED=true'];
      const key = gitConfig?.anthropicApiKey || process.env.ANTHROPIC_API_KEY;
      return key ? [`ANTHROPIC_API_KEY=${key}`] : [];
    })(),
    ...(() => {
      if (useCodexOAuth) return ['CODEX_OAUTH_ENABLED=true'];
      const key = gitConfig?.openaiApiKey || process.env.OPENAI_API_KEY;
      return key ? [`OPENAI_API_KEY=${key}`] : [];
    })(),
  ];
}

/**
 * Find BrowserWindow webContents by ID.
 * Internal helper to avoid duplicating BrowserWindow.getAllWindows().find(...).
 */
function getWebContents(webContentsId: number): Electron.WebContents | undefined {
  return BrowserWindow.getAllWindows().find(
    (w) => w.webContents.id === webContentsId
  )?.webContents;
}

/**
 * Dispatch parsed stream output to callbacks, renderer IPC, and protocol message handlers.
 * Internal helper that consolidates the output→display→IPC→protocol pipeline.
 */
function dispatchOutput(
  result: ReturnType<typeof processStreamChunk>,
  ctx: {
    sessionId: string;
    webContentsId: number;
    resolvedProjectPath: string;
    itemId: string;
    onOutput?: (data: string) => void;
    onDisplayOutput?: (data: string) => void;
    onProtocolMessage?: (message: unknown) => void;
  }
): void {
  if (result.displayParts.length === 0 && result.usageParts.length === 0) return;

  // Format display output with timestamps
  let displayStr = '';
  if (result.displayParts.length > 0) {
    const ts = formatLogTimestamp();
    displayStr = result.displayParts.map(line => `${ts} ${line}`).join('\n');
    logger.info('Agent output', { sessionId: ctx.sessionId, displayLines: result.displayParts.length, display: displayStr.slice(0, 500) });
  }

  if (result.textContent) ctx.onOutput?.(result.textContent);
  if (displayStr) ctx.onDisplayOutput?.(displayStr);

  // Send to renderer
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

  // Extract and forward protocol messages
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
}

/**
 * Process a chunk of stream data into parsed display parts, text content, and usage info.
 * Pure function: takes data string + current buffer, returns parsed results + remaining buffer.
 */
export function processStreamChunk(
  dataStr: string,
  lineBuffer: string
): { lineBuffer: string; displayParts: string[]; textContent: string; usageParts: NonNullable<ParsedStreamEvent['usage']>[] } {
  lineBuffer += dataStr;
  const lines = lineBuffer.split('\n');
  lineBuffer = lines.pop() || ''; // Keep incomplete last line in buffer

  const displayParts: string[] = [];
  const usageParts: Array<NonNullable<ParsedStreamEvent['usage']>> = [];
  let textContent = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    try {
      const event = JSON.parse(trimmed);
      const parsed = parseStreamEvent(event);
      if (parsed.display) displayParts.push(parsed.display);
      if (parsed.text) textContent += parsed.text + '\n';
      if (parsed.usage) usageParts.push(parsed.usage);
    } catch {
      // Not JSON — forward as raw text (e.g., entrypoint echo messages, stderr)
      displayParts.push(trimmed);
      textContent += trimmed + '\n';
    }
  }

  return { lineBuffer, displayParts, textContent, usageParts };
}

/**
 * Flush any remaining data in the line buffer at stream end.
 * Pure function: takes buffer contents, returns parsed text and protocol messages.
 */
export function flushLineBuffer(
  lineBuffer: string
): { textContent: string; protocolMessages: unknown[] } {
  const trimmed = lineBuffer.trim();
  if (!trimmed) {
    return { textContent: '', protocolMessages: [] };
  }

  let textContent: string;
  try {
    const event = JSON.parse(trimmed);
    const parsed = parseStreamEvent(event);
    textContent = parsed.text ? parsed.text + '\n' : '';
  } catch {
    textContent = trimmed + '\n';
  }

  // Extract protocol messages from text content (or raw text if not JSON)
  const protocolMessages = textContent
    ? extractProtocolMessages(textContent.endsWith('\n') ? textContent.slice(0, -1) : textContent)
    : [];

  return { textContent, protocolMessages };
}

/**
 * Clean up a session: clear timeout, update state, fix worktree paths.
 * Internal helper consolidating the repeated cleanup pattern.
 */
function cleanupSession(
  sessionId: string,
  state: 'stopped' | 'crashed'
): void {
  const session = agentSessions.get(sessionId);
  if (!session) return;

  if (session.timeoutId) {
    clearTimeout(session.timeoutId);
  }

  session.state = state;

  // Re-fix worktree .git paths — the Linux container rewrites them to /c/ style
  if (process.platform === 'win32' && session.worktreePath) {
    fixWorktreeGitFile(session.worktreePath);
  }
}

/**
 * Notify renderer and callbacks that the agent has exited.
 * Internal helper for stream end/error handlers.
 */
function notifyExit(
  webContentsId: number,
  sessionId: string,
  exitCode: number,
  onExit?: (code: number) => void,
): void {
  onExit?.(exitCode);
  const webContents = getWebContents(webContentsId);
  if (webContents && !webContents.isDestroyed()) {
    webContents.send('agent:exit', sessionId, exitCode);
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Parameters for creating an agent container.
 */
export interface AgentContainerParams {
  webContentsId: number;
  projectPath: string;
  agentName: string;
  prompt: string;
  goal?: string; // Separate goal text for non-Claude providers that need a focused prompt
  model: string;
  tools: string[];
  itemId: string;
  agentProvider?: string;
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
  const { webContentsId, projectPath, agentName, prompt, goal, model, tools, itemId, agentProvider, worktreePath, originalPath, branchName, timeoutMs } = params;
  const { onOutput, onDisplayOutput, onProtocolMessage, onExit } = callbacks;

  const sessionId = `agent-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const resolvedProjectPath = path.resolve(projectPath);
  const mountPath = worktreePath || resolvedProjectPath;

  logger.info('Creating agent container', {
    sessionId, projectPath: resolvedProjectPath, agentName, model, tools, itemId,
    ...(worktreePath && { worktreePath, branchName }),
  });

  // Resolve paths and detect project config
  const containerProjectPath = getContainerProjectPath(mountPath);
  const projectTypesValue = detectProjectTypes(mountPath).join(',');
  const nodePackageManager = detectPackageManager(mountPath);

  // Build bind mounts
  const gitCredentialsBind = getGitCredentialsBind();
  const claudeOAuthBind = getClaudeOAuthBind();
  if (agentProvider === 'codex') {
    await refreshCodexOAuthTokenSerialized();
  }
  const codexOAuthBind = getCodexOAuthBind();

  const binds = buildBindMounts({
    mountPath, containerProjectPath, worktreePath, originalPath,
    gitCredentialsBind, claudeOAuthBind, codexOAuthBind,
  });
  logger.debug('Agent container bind mounts', { sessionId, binds });

  // Encode prompt as base64
  const promptBase64 = Buffer.from(prompt).toString('base64');
  const goalBase64 = goal ? Buffer.from(goal).toString('base64') : undefined;
  logger.info('Agent prompt encoded', { sessionId, promptLength: prompt.length, base64Length: promptBase64.length });

  // Build env vars
  const gitConfig = loadGitConfig();
  const useOAuth = !!(gitConfig?.useClaudeOAuth && claudeOAuthBind);
  const useCodexOAuth = !!(gitConfig?.useCodexOAuth && codexOAuthBind);

  const env = buildAgentEnv({
    containerProjectPath, projectTypesValue, nodePackageManager,
    promptBase64, goalBase64, model, tools, itemId,
    agentProvider: agentProvider || 'claude',
    worktreePath, originalPath, gitConfig, useOAuth, useCodexOAuth,
  });

  // Create container, attach, start
  const container = await docker.createContainer({
    Image: DEFAULT_IMAGE, Tty: false, OpenStdin: false, AttachStdin: false,
    AttachStdout: true, AttachStderr: true, WorkingDir: containerProjectPath,
    Env: env, HostConfig: { CapAdd: ['NET_ADMIN'], Binds: binds },
  });
  const stream = await container.attach({ stream: true, stdout: true, stderr: true });
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  docker.modem.demuxStream(stream, stdout, stderr);
  await container.start();
  logger.info('Agent container started', { sessionId, containerId: container.id });

  // Timeout tracking
  let timeoutId: NodeJS.Timeout | undefined;
  const effectiveTimeoutMs = timeoutMs ?? DEFAULT_AGENT_TIMEOUT_MS;
  const resetTimeout = () => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(async () => {
      logger.warn('Agent container timed out (no output)', { sessionId, timeoutMs: effectiveTimeoutMs });
      const session = agentSessions.get(sessionId);
      if (session && session.state === 'running') {
        cleanupSession(sessionId, 'crashed');
        try { await container.stop({ t: 5 }); await container.remove({ force: true }); } catch { /* already stopped */ }
        notifyExit(webContentsId, sessionId, 124, onExit);
      }
    }, effectiveTimeoutMs);
  };
  resetTimeout();

  // Register session
  agentSessions.set(sessionId, {
    id: sessionId, containerId: container.id, webContentsId,
    projectPath: resolvedProjectPath, itemId, agentName,
    state: 'running', timeoutId, protocolMessageCount: 0,
    cumulativeUsage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
    agentProvider,
    ...(worktreePath && { worktreePath, originalPath, branchName }),
  });

  // Stream output handling
  let lineBuffer = '';
  const dispatchCtx = {
    sessionId, webContentsId, resolvedProjectPath, itemId,
    onOutput, onDisplayOutput, onProtocolMessage,
  };

  const handleOutput = (data: Buffer) => {
    const dataStr = data.toString();
    resetTimeout();

    const session = agentSessions.get(sessionId);
    if (session) session.timeoutId = timeoutId;

    // Check for error patterns (non-Claude providers)
    const detectedError = detectErrorInOutput(dataStr, agentProvider);
    if (detectedError && session && !session.detectedError) {
      session.detectedError = detectedError;
      logger.warn('Detected error in agent output', { sessionId, error: detectedError, provider: agentProvider });
    }

    const result = processStreamChunk(dataStr, lineBuffer);
    lineBuffer = result.lineBuffer;
    dispatchOutput(result, dispatchCtx);
  };

  stdout.on('data', handleOutput);
  stderr.on('data', handleOutput);

  // Handle stream end
  stream.on('end', async () => {
    const flushed = flushLineBuffer(lineBuffer);
    lineBuffer = '';
    if (flushed.textContent) onOutput?.(flushed.textContent);
    if (flushed.protocolMessages.length > 0) {
      const s = agentSessions.get(sessionId);
      if (s) s.protocolMessageCount += flushed.protocolMessages.length;
      for (const msg of flushed.protocolMessages) onProtocolMessage?.(msg);
    }

    cleanupSession(sessionId, 'stopped');
    const session = agentSessions.get(sessionId);
    if (session) {
      let exitCode = 0;
      try { const info = await container.inspect(); exitCode = info.State.ExitCode; logger.info('Agent container completed', { sessionId, exitCode }); } catch { /* may be removed */ }
      notifyExit(webContentsId, sessionId, exitCode, onExit);
      try { await container.remove({ force: true }); } catch { /* may be removed */ }
      agentSessions.delete(sessionId);
    }
  });

  // Handle stream error
  stream.on('error', (err: Error) => {
    logger.error('Agent stream error', { sessionId, error: err.message });
    cleanupSession(sessionId, 'crashed');
    notifyExit(webContentsId, sessionId, 1, onExit);
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

  // Clear timeout and fix worktree paths
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
