import { PassThrough } from 'node:stream';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createContainerMock,
  getContainerMock,
  demuxStreamMock,
  detectProjectTypesMock,
  detectPackageManagerMock,
  loadGitConfigMock,
  refreshCodexOAuthTokenSerializedMock,
  getGitCredentialsBindMock,
  getClaudeOAuthBindMock,
  getCodexOAuthBindMock,
  formatLogTimestampMock,
  fixWorktreeGitFileMock,
  sendMock,
  mockWindows,
  agentSessions,
} = vi.hoisted(() => ({
  createContainerMock: vi.fn(),
  getContainerMock: vi.fn(),
  demuxStreamMock: vi.fn(),
  detectProjectTypesMock: vi.fn(() => []),
  detectPackageManagerMock: vi.fn(() => null),
  loadGitConfigMock: vi.fn(() => null),
  refreshCodexOAuthTokenSerializedMock: vi.fn(async () => undefined),
  getGitCredentialsBindMock: vi.fn(() => null),
  getClaudeOAuthBindMock: vi.fn(() => null),
  getCodexOAuthBindMock: vi.fn(() => null),
  formatLogTimestampMock: vi.fn(() => '[10:00:00]'),
  fixWorktreeGitFileMock: vi.fn(),
  sendMock: vi.fn(),
  mockWindows: [{ webContents: { id: 11, isDestroyed: vi.fn(() => false), send: vi.fn() } }],
  agentSessions: new Map(),
}));

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: () => mockWindows,
  },
}));

vi.mock('@main/lib/logger', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

vi.mock('@main/services/project-onboarding', () => ({
  detectProjectTypes: detectProjectTypesMock,
  detectPackageManager: detectPackageManagerMock,
}));

vi.mock('@main/git/git-config', () => ({
  loadGitConfig: loadGitConfigMock,
}))

vi.mock('@main/git/codex-oauth', () => ({
  refreshCodexOAuthTokenSerialized: refreshCodexOAuthTokenSerializedMock,
}));

vi.mock('@main/docker/project-registry', () => ({
  getGitCredentialsBind: getGitCredentialsBindMock,
  getClaudeOAuthBind: getClaudeOAuthBindMock,
  getCodexOAuthBind: getCodexOAuthBindMock,
}));

vi.mock('@main/stores/workitem-log-store', () => ({
  formatLogTimestamp: formatLogTimestampMock,
}));

vi.mock('@main/git/git-worktree', () => ({
  fixWorktreeGitFile: fixWorktreeGitFileMock,
}));

vi.mock('@main/docker/shared', () => ({
  docker: {
    createContainer: createContainerMock,
    getContainer: getContainerMock,
    modem: {
      demuxStream: demuxStreamMock,
    },
  },
  agentSessions,
  DEFAULT_IMAGE: 'yolium:latest',
  CONTAINER_WORKSPACE: '/workspace',
  isWindows: false,
}));

import { createAgentContainer, stopAgentContainer, getAgentSession } from '@main/docker/agent-container';

type MockContainer = {
  id: string;
  attachStream: PassThrough;
  attach: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  inspect: ReturnType<typeof vi.fn>;
};

function createMockContainer(id: string, exitCode = 0): MockContainer {
  const attachStream = new PassThrough();
  return {
    id,
    attachStream,
    attach: vi.fn(async () => attachStream),
    start: vi.fn(async () => undefined),
    stop: vi.fn(async () => undefined),
    remove: vi.fn(async () => undefined),
    inspect: vi.fn(async () => ({ State: { ExitCode: exitCode } })),
  };
}

async function flushAsyncWork(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
  await Promise.resolve();
}

describe('agent-container orchestration', () => {
  let stdout: PassThrough;
  let stderr: PassThrough;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    agentSessions.clear();
    stdout = new PassThrough();
    stderr = new PassThrough();
    mockWindows[0].webContents.send = sendMock;
    mockWindows[0].webContents.isDestroyed = vi.fn(() => false);
    demuxStreamMock.mockImplementation((_stream: PassThrough, nextStdout: PassThrough, nextStderr: PassThrough) => {
      stdout = nextStdout;
      stderr = nextStderr;
    });
  });

  afterEach(async () => {
    for (const sessionId of Array.from(agentSessions.keys())) {
      await stopAgentContainer(sessionId);
    }
    agentSessions.clear();
    vi.useRealTimers();
  });

  it('createAgentContainer registers an agent session, attaches demuxed stdout/stderr handlers, and forwards timestamped display output through onDisplayOutput and agent:output', async () => {
    const container = createMockContainer('container-1');
    createContainerMock.mockResolvedValue(container);
    getContainerMock.mockReturnValue(container);

    const onDisplayOutput = vi.fn();
    const onOutput = vi.fn();

    const sessionId = await createAgentContainer({
      webContentsId: 11,
      projectPath: '/tmp/project',
      agentName: 'code-agent',
      prompt: 'Implement feature',
      model: 'sonnet',
      tools: ['Read', 'Write'],
      itemId: 'item-1',
      agentProvider: 'claude',
      timeoutMs: 5_000,
    }, { onDisplayOutput, onOutput });

    expect(agentSessions.has(sessionId)).toBe(true);
    expect(demuxStreamMock).toHaveBeenCalledTimes(1);

    stdout.write(Buffer.from('{"type":"assistant","message":{"content":[{"type":"text","text":"hello world"}]}}\n'));

    expect(onDisplayOutput).toHaveBeenCalledWith('[10:00:00] hello world');
    expect(onOutput).toHaveBeenCalledWith('hello world\n');
    expect(sendMock).toHaveBeenCalledWith('agent:output', sessionId, '[10:00:00] hello world');
  });

  it('createAgentContainer forwards extracted protocol messages to onProtocolMessage and agent:protocol-message while incrementing protocolMessageCount', async () => {
    const container = createMockContainer('container-2');
    createContainerMock.mockResolvedValue(container);
    getContainerMock.mockReturnValue(container);

    const onProtocolMessage = vi.fn();

    const sessionId = await createAgentContainer({
      webContentsId: 11,
      projectPath: '/tmp/project',
      agentName: 'plan-agent',
      prompt: 'Plan work',
      model: 'sonnet',
      tools: ['Bash'],
      itemId: 'item-2',
      agentProvider: 'claude',
      timeoutMs: 5_000,
    }, { onProtocolMessage });

    const protocolEvent = JSON.stringify({
      type: 'assistant',
      message: {
        content: [
          {
            type: 'tool_use',
            name: 'Bash',
            input: {
              command: `echo '@@YOLIUM:${JSON.stringify({
                type: 'progress',
                step: 'tests',
                detail: 'running',
              })}'`,
            },
          },
        ],
      },
    });

    stdout.write(Buffer.from(`${protocolEvent}\n`));

    expect(onProtocolMessage).toHaveBeenCalledWith({
      type: 'progress',
      step: 'tests',
      detail: 'running',
      attempt: undefined,
      maxAttempts: undefined,
    });
    expect(sendMock).toHaveBeenCalledWith('agent:protocol-message', sessionId, {
      type: 'progress',
      step: 'tests',
      detail: 'running',
      attempt: undefined,
      maxAttempts: undefined,
    });
    expect(getAgentSession(sessionId)?.protocolMessageCount).toBe(1);
  });

  it('createAgentContainer accumulates usage into the stored session and emits agent:cost-update for streamed and flushed result events', async () => {
    const container = createMockContainer('container-3', 23);
    let resolveInspect: (() => void) | undefined;
    container.inspect.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveInspect = () => resolve({ State: { ExitCode: 23 } });
        })
    );

    createContainerMock.mockResolvedValue(container);
    getContainerMock.mockReturnValue(container);

    const onExit = vi.fn();
    const projectPath = '/tmp/project';
    const resolvedProjectPath = path.resolve(projectPath);

    const sessionId = await createAgentContainer({
      webContentsId: 11,
      projectPath: '/tmp/project',
      agentName: 'code-agent',
      prompt: 'Implement feature',
      model: 'sonnet',
      tools: ['Read'],
      itemId: 'item-3',
      agentProvider: 'claude',
      timeoutMs: 5_000,
    }, { onExit });

    stdout.write(Buffer.from('{"type":"result","cost_usd":0.05,"usage":{"input_tokens":100,"output_tokens":50}}\n'));

    expect(getAgentSession(sessionId)?.cumulativeUsage).toEqual({
      inputTokens: 100,
      outputTokens: 50,
      costUsd: 0.05,
    });
    expect(sendMock).toHaveBeenCalledWith('agent:cost-update', sessionId, resolvedProjectPath, 'item-3', {
      inputTokens: 100,
      outputTokens: 50,
      costUsd: 0.05,
    });

    stdout.write(Buffer.from('{"type":"result","cost_usd":0.02,"usage":{"input_tokens":10,"output_tokens":5}}'));
    container.attachStream.emit('end');
    await flushAsyncWork();

    expect(getAgentSession(sessionId)?.cumulativeUsage).toEqual({
      inputTokens: 110,
      outputTokens: 55,
      costUsd: 0.07,
    });
    expect(sendMock).toHaveBeenCalledWith('agent:cost-update', sessionId, resolvedProjectPath, 'item-3', {
      inputTokens: 10,
      outputTokens: 5,
      costUsd: 0.02,
    });

    resolveInspect?.();
    await flushAsyncWork();

    expect(onExit).toHaveBeenCalledWith(23);
    expect(sendMock).toHaveBeenCalledWith('agent:exit', sessionId, 23);
    expect(agentSessions.has(sessionId)).toBe(false);
  });

  it('createAgentContainer records detectedError once for non-Claude providers and stores long non-Claude agent messages for conclusion synthesis', async () => {
    const container = createMockContainer('container-4');
    createContainerMock.mockResolvedValue(container);
    getContainerMock.mockReturnValue(container);

    const onProtocolMessage = vi.fn();

    const sessionId = await createAgentContainer({
      webContentsId: 11,
      projectPath: '/tmp/project',
      agentName: 'code-agent',
      prompt: 'Implement feature',
      model: 'o3',
      tools: ['Read'],
      itemId: 'item-4',
      agentProvider: 'codex',
      timeoutMs: 5_000,
    }, { onProtocolMessage });

    stderr.write(Buffer.from('Error: Missing bearer authentication.\n'));
    stderr.write(Buffer.from('429 Too Many Requests\n'));
    stdout.write(Buffer.from(
      '{"type":"item.completed","item":{"type":"agent_message","content":[{"type":"text","text":"Analysis complete: found 3 issues in the codebase and prepared a detailed remediation plan for the next step."}]}}\n'
    ));

    expect(getAgentSession(sessionId)?.detectedError).toBe('Authentication failed (401 Unauthorized)');
    expect(getAgentSession(sessionId)?.agentMessageTexts).toEqual([
      'Analysis complete: found 3 issues in the codebase and prepared a detailed remediation plan for the next step.',
    ]);
    expect(getAgentSession(sessionId)?.protocolMessageCount).toBe(1);
    expect(onProtocolMessage).toHaveBeenCalledWith({
      type: 'add_comment',
      text: 'Analysis complete: found 3 issues in the codebase and prepared a detailed remediation plan for the next step.',
    });
    expect(sendMock).toHaveBeenCalledWith('agent:protocol-message', sessionId, {
      type: 'add_comment',
      text: 'Analysis complete: found 3 issues in the codebase and prepared a detailed remediation plan for the next step.',
    });
  });

  it('createAgentContainer handles stream end by flushing the remaining line buffer, notifying onExit/agent:exit, removing the container, and deleting the session', async () => {
    const container = createMockContainer('container-5', 7);
    createContainerMock.mockResolvedValue(container);
    getContainerMock.mockReturnValue(container);

    const onOutput = vi.fn();
    const onExit = vi.fn();

    const sessionId = await createAgentContainer({
      webContentsId: 11,
      projectPath: '/tmp/project',
      agentName: 'code-agent',
      prompt: 'Implement feature',
      model: 'sonnet',
      tools: ['Read'],
      itemId: 'item-5',
      agentProvider: 'claude',
      timeoutMs: 5_000,
    }, { onOutput, onExit });

    stdout.write(Buffer.from('{"type":"assistant","message":{"content":[{"type":"text","text":"tail output"}]}}'));
    container.attachStream.emit('end');
    await flushAsyncWork();

    expect(onOutput).toHaveBeenCalledWith('tail output\n');
    expect(onExit).toHaveBeenCalledWith(7);
    expect(sendMock).toHaveBeenCalledWith('agent:exit', sessionId, 7);
    expect(container.remove).toHaveBeenCalledWith({ force: true });
    expect(agentSessions.has(sessionId)).toBe(false);
  });

  it('createAgentContainer handles inactivity timeout by stopping/removing the container, marking the session crashed, and reporting exit code 124', async () => {
    const container = createMockContainer('container-6');
    createContainerMock.mockResolvedValue(container);
    getContainerMock.mockReturnValue(container);

    const onExit = vi.fn();

    const sessionId = await createAgentContainer({
      webContentsId: 11,
      projectPath: '/tmp/project',
      agentName: 'code-agent',
      prompt: 'Implement feature',
      model: 'o3',
      tools: ['Read'],
      itemId: 'item-6',
      agentProvider: 'codex',
      timeoutMs: 10,
    }, { onExit });

    await vi.advanceTimersByTimeAsync(10);

    expect(getAgentSession(sessionId)?.state).toBe('crashed');
    expect(container.stop).toHaveBeenCalledWith({ t: 5 });
    expect(container.remove).toHaveBeenCalledWith({ force: true });
    expect(onExit).toHaveBeenCalledWith(124);
    expect(sendMock).toHaveBeenCalledWith('agent:exit', sessionId, 124);
  });

  it('stopAgentContainer clears timeout state, stops and removes the Docker container, and deletes the session entry', async () => {
    const container = createMockContainer('container-7');
    createContainerMock.mockResolvedValue(container);
    getContainerMock.mockReturnValue(container);

    const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');

    const sessionId = await createAgentContainer({
      webContentsId: 11,
      projectPath: '/tmp/project',
      agentName: 'code-agent',
      prompt: 'Implement feature',
      model: 'sonnet',
      tools: ['Read'],
      itemId: 'item-7',
      agentProvider: 'claude',
      timeoutMs: 5_000,
    });

    expect(getAgentSession(sessionId)?.state).toBe('running');

    await stopAgentContainer(sessionId);

    expect(clearTimeoutSpy).toHaveBeenCalled();
    expect(container.stop).toHaveBeenCalledWith({ t: 5 });
    expect(container.remove).toHaveBeenCalledWith({ force: true });
    expect(getAgentSession(sessionId)).toBeUndefined();
  });
});
