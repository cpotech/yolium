import { PassThrough } from 'node:stream';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const {
  createContainerMock,
  getContainerMock,
  demuxStreamMock,
  sessions,
  agentSessions,
} = vi.hoisted(() => ({
  createContainerMock: vi.fn(),
  getContainerMock: vi.fn(),
  demuxStreamMock: vi.fn(),
  sessions: new Map(),
  agentSessions: new Map(),
}));

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: () => [],
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
  detectProjectTypes: vi.fn(() => []),
  detectPackageManager: vi.fn(() => null),
}));

vi.mock('@main/docker/shared', () => ({
  docker: {
    createContainer: createContainerMock,
    getContainer: getContainerMock,
    modem: {
      demuxStream: demuxStreamMock,
    },
  },
  sessions,
  agentSessions,
  DEFAULT_IMAGE: 'yolium:latest',
  CONTAINER_WORKSPACE: '/workspace',
  isWindows: false,
}));

vi.mock('@main/docker/project-registry', () => ({
  buildPersistentBindMounts: vi.fn(() => []),
  getGitCredentialsBind: vi.fn(() => null),
  getClaudeOAuthBind: vi.fn(() => null),
  getCodexOAuthBind: vi.fn(() => null),
}));

vi.mock('@main/git/git-config', () => ({
  loadGitConfig: vi.fn(() => null),
  refreshCodexOAuthTokenSerialized: vi.fn(async () => undefined),
}));

vi.mock('@main/git/git-worktree', () => ({
  createWorktree: vi.fn(),
  deleteWorktree: vi.fn(),
  generateBranchName: vi.fn(() => 'yolium-test-branch'),
  hasUncommittedChanges: vi.fn(() => false),
  fixWorktreeGitFile: vi.fn(),
}));

import { createYolium } from '@main/docker/container-lifecycle';
import { createAgentContainer, stopAgentContainer } from '@main/docker/agent-container';
import { detectProjectTypes, detectPackageManager } from '@main/services/project-onboarding';

function createMockContainer(containerId: string): {
  id: string;
  attach: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  inspect: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
} {
  const stream = new PassThrough();
  return {
    id: containerId,
    attach: vi.fn(async () => stream),
    start: vi.fn(async () => undefined),
    remove: vi.fn(async () => undefined),
    inspect: vi.fn(async () => ({ State: { ExitCode: 0 } })),
    stop: vi.fn(async () => undefined),
  };
}

describe('container onboarding metadata env vars', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessions.clear();
    agentSessions.clear();
    demuxStreamMock.mockImplementation(() => undefined);
  });

  afterEach(async () => {
    for (const sessionId of Array.from(agentSessions.keys())) {
      await stopAgentContainer(sessionId);
    }
    sessions.clear();
    agentSessions.clear();
  });

  it('passes PROJECT_TYPES and NODE_PACKAGE_MANAGER to interactive yolium containers', async () => {
    const container = createMockContainer('interactive-1');
    createContainerMock.mockResolvedValueOnce(container);
    vi.mocked(detectProjectTypes).mockReturnValue(['nodejs', 'python']);
    vi.mocked(detectPackageManager).mockReturnValue('pnpm');

    await createYolium(1, '/tmp/project', 'claude', true, undefined, false);

    const createCall = createContainerMock.mock.calls[0]?.[0] as { Env: string[] };
    expect(createCall.Env).toContain('PROJECT_TYPES=nodejs,python');
    expect(createCall.Env).toContain('NODE_PACKAGE_MANAGER=pnpm');
  });

  it('passes PROJECT_TYPES and NODE_PACKAGE_MANAGER to headless agent containers', async () => {
    const container = createMockContainer('agent-1');
    createContainerMock.mockResolvedValueOnce(container);
    getContainerMock.mockReturnValue(container);
    vi.mocked(detectProjectTypes).mockReturnValue(['go']);
    vi.mocked(detectPackageManager).mockReturnValue('npm');

    const sessionId = await createAgentContainer({
      webContentsId: 1,
      projectPath: '/tmp/project',
      agentName: 'plan-agent',
      prompt: 'Do the work',
      model: 'sonnet',
      tools: ['Read', 'Write'],
      itemId: 'item-1',
      agentProvider: 'claude',
      timeoutMs: 60000,
    });

    const createCall = createContainerMock.mock.calls[0]?.[0] as { Env: string[] };
    expect(createCall.Env).toContain('PROJECT_TYPES=go');
    expect(createCall.Env).toContain('NODE_PACKAGE_MANAGER=npm');

    await stopAgentContainer(sessionId);
  });

  it('sets ShmSize to 256MB in interactive container HostConfig for Chromium', async () => {
    const container = createMockContainer('interactive-shm');
    createContainerMock.mockResolvedValueOnce(container);

    await createYolium(1, '/tmp/project', 'claude', true, undefined, false);

    const createCall = createContainerMock.mock.calls[0]?.[0] as { HostConfig: { ShmSize: number } };
    expect(createCall.HostConfig.ShmSize).toBe(268435456);
  });

  it('sets ShmSize to 256MB in headless agent container HostConfig for Chromium', async () => {
    const container = createMockContainer('agent-shm');
    createContainerMock.mockResolvedValueOnce(container);
    getContainerMock.mockReturnValue(container);

    const sessionId = await createAgentContainer({
      webContentsId: 1,
      projectPath: '/tmp/project',
      agentName: 'code-agent',
      prompt: 'Implement feature',
      model: 'sonnet',
      tools: ['Read', 'Write'],
      itemId: 'item-shm',
      agentProvider: 'claude',
      timeoutMs: 60000,
    });

    const createCall = createContainerMock.mock.calls[0]?.[0] as { HostConfig: { ShmSize: number } };
    expect(createCall.HostConfig.ShmSize).toBe(268435456);

    await stopAgentContainer(sessionId);
  });
});
