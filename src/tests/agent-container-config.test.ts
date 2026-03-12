import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const getValidatedSharedDirsMock = vi.hoisted(() => vi.fn<() => string[]>(() => []));

vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => false),
  statSync: vi.fn(() => ({ isDirectory: () => false })),
}));

vi.mock('@main/docker/path-utils', () => ({
  toDockerPath: vi.fn((value: string) => value.replace(/\\/g, '/')),
  toContainerHomePath: vi.fn((value: string) => value.replace(/\\/g, '/')),
}));

vi.mock('@main/services/project-config', () => ({
  getValidatedSharedDirs: getValidatedSharedDirsMock,
}));

vi.mock('@main/docker/project-registry', () => ({
  getGitCredentialsBind: vi.fn(() => null),
  getClaudeOAuthBind: vi.fn(() => null),
  getCodexOAuthBind: vi.fn(() => null),
}));

import * as fs from 'node:fs';
import { buildBindMounts, buildAgentEnv } from '@main/docker/agent-container-config';

describe('agent-container config helpers', () => {
  const originalEnv = {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    YOLIUM_NETWORK_FULL: process.env.YOLIUM_NETWORK_FULL,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    getValidatedSharedDirsMock.mockReturnValue([]);
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.YOLIUM_NETWORK_FULL;
  });

  afterEach(() => {
    if (originalEnv.ANTHROPIC_API_KEY === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = originalEnv.ANTHROPIC_API_KEY;

    if (originalEnv.OPENAI_API_KEY === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalEnv.OPENAI_API_KEY;

    if (originalEnv.YOLIUM_NETWORK_FULL === undefined) delete process.env.YOLIUM_NETWORK_FULL;
    else process.env.YOLIUM_NETWORK_FULL = originalEnv.YOLIUM_NETWORK_FULL;
  });

  it('buildBindMounts returns the primary project mount when no optional binds are present', () => {
    const binds = buildBindMounts({
      mountPath: '/home/user/project',
      containerProjectPath: '/workspace/project',
      gitCredentialsBind: null,
      claudeOAuthBind: null,
      codexOAuthBind: null,
    });

    expect(binds).toEqual(['/home/user/project:/workspace/project:rw']);
  });

  it('buildBindMounts adds the original repo .git mount and validated shared directory mounts when worktreePath and originalPath are provided', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => true } as fs.Stats);
    getValidatedSharedDirsMock.mockReturnValue(['samples', 'docs']);

    const binds = buildBindMounts({
      mountPath: '/home/user/worktrees/feature',
      containerProjectPath: '/workspace/worktree',
      worktreePath: '/home/user/worktrees/feature',
      originalPath: '/home/user/project',
      gitCredentialsBind: null,
      claudeOAuthBind: null,
      codexOAuthBind: null,
    });

    expect(binds).toEqual([
      '/home/user/worktrees/feature:/workspace/worktree:rw',
      '/home/user/project/.git:/home/user/project/.git:rw',
      '/home/user/project/samples:/workspace/worktree/samples:ro',
      '/home/user/project/docs:/workspace/worktree/docs:ro',
    ]);
  });

  it('buildBindMounts appends git credentials, Claude OAuth, and Codex OAuth binds after the project/worktree mounts', () => {
    const binds = buildBindMounts({
      mountPath: '/home/user/project',
      containerProjectPath: '/workspace/project',
      gitCredentialsBind: '/creds:/home/agent/.git-credentials-mounted:ro',
      claudeOAuthBind: '/claude:/home/agent/.claude-credentials.json:ro',
      codexOAuthBind: '/codex:/home/agent/.codex-auth.json:ro',
    });

    expect(binds).toEqual([
      '/home/user/project:/workspace/project:rw',
      '/creds:/home/agent/.git-credentials-mounted:ro',
      '/claude:/home/agent/.claude-credentials.json:ro',
      '/codex:/home/agent/.codex-auth.json:ro',
    ]);
  });

  it('buildAgentEnv includes PROJECT_TYPES, NODE_PACKAGE_MANAGER, AGENT_PROMPT, AGENT_MODEL, AGENT_TOOLS, AGENT_ITEM_ID, and AGENT_PROVIDER values', () => {
    const env = buildAgentEnv({
      containerProjectPath: '/workspace',
      projectTypesValue: 'node,typescript',
      nodePackageManager: 'pnpm',
      promptBase64: 'cHJvbXB0',
      goalBase64: 'Z29hbA==',
      model: 'sonnet',
      tools: ['Read', 'Write', 'Bash'],
      itemId: 'item-123',
      agentName: 'code-agent',
      agentProvider: 'claude',
      gitConfig: null,
      useOAuth: false,
      useCodexOAuth: false,
    });

    expect(env).toContain('PROJECT_DIR=/workspace');
    expect(env).toContain('PROJECT_TYPES=node,typescript');
    expect(env).toContain('NODE_PACKAGE_MANAGER=pnpm');
    expect(env).toContain('AGENT_PROMPT=cHJvbXB0');
    expect(env).toContain('AGENT_MODEL=sonnet');
    expect(env).toContain('AGENT_TOOLS=Read,Write,Bash');
    expect(env).toContain('AGENT_ITEM_ID=item-123');
    expect(env).toContain('AGENT_PROVIDER=claude');
    expect(env).toContain('AGENT_GOAL=Z29hbA==');
  });

  it('buildAgentEnv prefers CLAUDE_OAUTH_ENABLED and CODEX_OAUTH_ENABLED over API keys and otherwise falls back to git config or process env keys', () => {
    process.env.ANTHROPIC_API_KEY = 'process-anthropic';
    process.env.OPENAI_API_KEY = 'process-openai';

    const oauthEnv = buildAgentEnv({
      containerProjectPath: '/workspace',
      projectTypesValue: 'node',
      nodePackageManager: 'npm',
      promptBase64: 'cHJvbXB0',
      model: 'sonnet',
      tools: ['Read'],
      itemId: 'item-1',
      agentName: 'code-agent',
      agentProvider: 'codex',
      gitConfig: {
        name: 'Agent User',
        email: 'agent@example.com',
        anthropicApiKey: 'git-anthropic',
        openaiApiKey: 'git-openai',
      },
      useOAuth: true,
      useCodexOAuth: true,
    });

    expect(oauthEnv).toContain('CLAUDE_OAUTH_ENABLED=true');
    expect(oauthEnv).toContain('CODEX_OAUTH_ENABLED=true');
    expect(oauthEnv.find((entry) => entry.startsWith('ANTHROPIC_API_KEY='))).toBeUndefined();
    expect(oauthEnv.find((entry) => entry.startsWith('OPENAI_API_KEY='))).toBeUndefined();

    const apiKeyEnv = buildAgentEnv({
      containerProjectPath: '/workspace',
      projectTypesValue: 'node',
      nodePackageManager: 'npm',
      promptBase64: 'cHJvbXB0',
      model: 'sonnet',
      tools: ['Read'],
      itemId: 'item-1',
      agentName: 'code-agent',
      agentProvider: 'codex',
      gitConfig: null,
      useOAuth: false,
      useCodexOAuth: false,
    });

    expect(apiKeyEnv).toContain('ANTHROPIC_API_KEY=process-anthropic');
    expect(apiKeyEnv).toContain('OPENAI_API_KEY=process-openai');
  });

  it('buildAgentEnv injects specialist credentials that are not protected and rejects credentials that attempt to overwrite protected core env vars', () => {
    const env = buildAgentEnv({
      containerProjectPath: '/workspace',
      projectTypesValue: 'node',
      nodePackageManager: 'npm',
      promptBase64: 'cHJvbXB0',
      model: 'sonnet',
      tools: ['Read'],
      itemId: 'item-1',
      agentName: 'code-agent',
      agentProvider: 'claude',
      gitConfig: null,
      useOAuth: false,
      useCodexOAuth: false,
      specialistCredentials: {
        allowed: {
          API_KEY: 'abc123',
          WEBHOOK_URL: 'https://hooks.slack.com/services/test',
        },
        blocked: {
          PROJECT_DIR: '/tmp/hijack',
          AGENT_PROVIDER: 'opencode',
          OPENAI_API_KEY: 'stolen',
        },
      },
    });

    expect(env).toContain('API_KEY=abc123');
    expect(env).toContain('WEBHOOK_URL=https://hooks.slack.com/services/test');
    expect(env).toContain('PROJECT_DIR=/workspace');
    expect(env).toContain('AGENT_PROVIDER=claude');
    expect(env).not.toContain('PROJECT_DIR=/tmp/hijack');
    expect(env).not.toContain('AGENT_PROVIDER=opencode');
    expect(env).not.toContain('OPENAI_API_KEY=stolen');
  });

  it('buildBindMounts should append toolBinds to the bind mount array when provided', () => {
    const binds = buildBindMounts({
      mountPath: '/home/user/project',
      containerProjectPath: '/workspace/project',
      gitCredentialsBind: null,
      claudeOAuthBind: null,
      codexOAuthBind: null,
      toolBinds: ['/host/tools/twitter:/opt/tools/twitter:ro'],
    });

    expect(binds).toContain('/home/user/project:/workspace/project:rw');
    expect(binds).toContain('/host/tools/twitter:/opt/tools/twitter:ro');
  });

  it('buildBindMounts should return only standard binds when toolBinds is empty', () => {
    const binds = buildBindMounts({
      mountPath: '/home/user/project',
      containerProjectPath: '/workspace/project',
      gitCredentialsBind: null,
      claudeOAuthBind: null,
      codexOAuthBind: null,
      toolBinds: [],
    });

    expect(binds).toEqual(['/home/user/project:/workspace/project:rw']);
  });

  it('buildBindMounts should append multiple toolBinds in order', () => {
    const binds = buildBindMounts({
      mountPath: '/home/user/project',
      containerProjectPath: '/workspace/project',
      gitCredentialsBind: null,
      claudeOAuthBind: null,
      codexOAuthBind: null,
      toolBinds: [
        '/host/tools/twitter:/opt/tools/twitter:ro',
        '/host/tools/slack:/opt/tools/slack:ro',
      ],
    });

    const twitterIndex = binds.indexOf('/host/tools/twitter:/opt/tools/twitter:ro');
    const slackIndex = binds.indexOf('/host/tools/slack:/opt/tools/slack:ro');
    expect(twitterIndex).toBeGreaterThan(0);
    expect(slackIndex).toBeGreaterThan(twitterIndex);
  });
});
