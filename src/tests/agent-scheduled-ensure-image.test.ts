// src/tests/agent-scheduled-ensure-image.test.ts
// Verify that startScheduledAgent() calls ensureImage() before createAgentContainer().
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@main/lib/logger', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(() => '{}'),
  readdirSync: vi.fn(() => []),
  unlinkSync: vi.fn(),
  chmodSync: vi.fn(),
}));

vi.mock('node:os', () => ({
  homedir: vi.fn(() => '/home/test'),
  platform: vi.fn(() => 'linux'),
  tmpdir: vi.fn(() => '/tmp'),
}));

vi.mock('node:path', async () => {
  const actual = await vi.importActual<typeof import('node:path')>('node:path');
  return {
    ...actual,
    resolve: vi.fn((...args: string[]) => args[args.length - 1]),
  };
});

vi.mock('@main/stores/yolium-db', () => ({
  normalizeForHash: (p: string) => p.replace(/\\/g, '/').replace(/\/$/, '') || '/',
  loadCredentials: vi.fn(() => ({})),
  appendRunLog: vi.fn(),
  appendAction: vi.fn(),
  pruneCredentials: vi.fn(() => 0),
}));

const {
  mockCreateAgentContainer,
  mockCheckAgentAuth,
  mockEnsureImage,
  mockGetAgentSession,
  mockExtractProtocolMessages,
} = vi.hoisted(() => ({
  mockCreateAgentContainer: vi.fn(),
  mockCheckAgentAuth: vi.fn(),
  mockEnsureImage: vi.fn(),
  mockGetAgentSession: vi.fn(),
  mockExtractProtocolMessages: vi.fn<() => any[]>(() => []),
}));

vi.mock('@main/docker', () => ({
  createAgentContainer: mockCreateAgentContainer,
  checkAgentAuth: mockCheckAgentAuth,
  ensureImage: mockEnsureImage,
  getAgentSession: mockGetAgentSession,
  stopAgentContainer: vi.fn(),
}));

vi.mock('@main/services/agent-protocol', () => ({
  extractProtocolMessages: mockExtractProtocolMessages,
}));

vi.mock('@main/git/git-config', () => ({
  loadGitConfig: vi.fn(() => ({ defaultProvider: 'claude' })),
}));

vi.mock('@main/services/specialist-readiness', () => ({
  checkSpecialistReadiness: vi.fn(() => ({ ready: true, reasons: [] })),
}));

vi.mock('@main/services/tools-resolver', () => ({
  resolveToolDir: vi.fn(() => null),
}));

import { startScheduledAgent } from '@main/services/agent-scheduled';
import type { SpecialistDefinition } from '@shared/types/schedule';

const makeSpecialist = (name = 'test-specialist'): SpecialistDefinition => ({
  name,
  description: 'Test specialist',
  model: 'sonnet',
  tools: ['Read', 'Write'],
  timeout: 30,
  systemPrompt: 'You are a test specialist.',
  schedules: [],
  memory: { strategy: 'raw', maxEntries: 10, retentionDays: 30 },
  escalation: {},
  promptTemplates: { heartbeat: 'Run test check.' },
});

describe('startScheduledAgent ensureImage integration', () => {
  beforeEach(() => {
    mockCheckAgentAuth.mockReturnValue({ authenticated: true });
    mockEnsureImage.mockResolvedValue(undefined);
    mockCreateAgentContainer.mockReset();
    mockGetAgentSession.mockReset();
    mockEnsureImage.mockClear();
    mockExtractProtocolMessages.mockReturnValue([]);
  });

  it('should call ensureImage before creating scheduled agent container', async () => {
    const callOrder: string[] = [];
    mockEnsureImage.mockImplementation(async () => {
      callOrder.push('ensureImage');
    });
    mockCreateAgentContainer.mockImplementation((_config: unknown, callbacks: { onExit: (code: number) => void }) => {
      callOrder.push('createAgentContainer');
      setTimeout(() => callbacks.onExit(0), 0);
      return Promise.resolve('session-sched-1');
    });
    mockGetAgentSession.mockReturnValue(undefined);

    await startScheduledAgent({
      specialist: makeSpecialist(),
      scheduleType: 'heartbeat',
      memoryContext: '',
      runId: 'run-1',
    });

    expect(mockEnsureImage).toHaveBeenCalledOnce();
    expect(mockCreateAgentContainer).toHaveBeenCalledOnce();
    expect(callOrder).toEqual(['ensureImage', 'createAgentContainer']);
  });

  it('should fail the run if ensureImage throws', async () => {
    mockEnsureImage.mockRejectedValue(new Error('Image build failed'));

    const result = await startScheduledAgent({
      specialist: makeSpecialist(),
      scheduleType: 'heartbeat',
      memoryContext: '',
      runId: 'run-fail',
    });

    expect(result.outcome).toBe('failed');
    expect(result.summary).toContain('Image build failed');
    expect(mockCreateAgentContainer).not.toHaveBeenCalled();
  });
});
