import { describe, it, expect, vi } from 'vitest';

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

vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => false),
  statSync: vi.fn(() => ({ isDirectory: () => false })),
}));

vi.mock('@main/docker/path-utils', () => ({
  toDockerPath: vi.fn((p: string) => p),
  getContainerProjectPath: vi.fn((p: string) => p),
  toContainerHomePath: vi.fn((p: string) => p),
}));

import * as fs from 'node:fs';
import { parseStreamEvent, combineUsageParts, accumulateSessionUsage, buildBindMounts, buildAgentEnv, processStreamChunk, flushLineBuffer } from '@main/docker/agent-container';
import { extractProtocolMessages } from '@main/services/agent-protocol';
import type { AgentContainerSession } from '@main/docker';

describe('parseStreamEvent', () => {
  it('extracts @@YOLIUM messages from Bash tool_use commands', () => {
    const parsed = parseStreamEvent({
      type: 'assistant',
      message: {
        content: [
          {
            type: 'tool_use',
            name: 'Bash',
            input: {
              command: "echo '@@YOLIUM:{\"type\":\"comment\",\"text\":\"Posted from bash\"}'",
            },
          },
        ],
      },
    });

    expect(parsed.text).toContain('@@YOLIUM:');
    const messages = extractProtocolMessages(parsed.text || '');
    expect(messages).toEqual([{ type: 'add_comment', text: 'Posted from bash' }]);
  });

  it('extracts multiple @@YOLIUM messages from one Bash command', () => {
    const parsed = parseStreamEvent({
      type: 'assistant',
      message: {
        content: [
          {
            type: 'tool_use',
            name: 'Bash',
            input: {
              command: "echo '@@YOLIUM:{\"type\":\"progress\",\"step\":\"tests\",\"detail\":\"running\"}' && echo '@@YOLIUM:{\"type\":\"complete\",\"summary\":\"done\"}'",
            },
          },
        ],
      },
    });

    const messages = extractProtocolMessages(parsed.text || '');
    expect(messages).toEqual([
      { type: 'progress', step: 'tests', detail: 'running', attempt: undefined, maxAttempts: undefined },
      { type: 'complete', summary: 'done' },
    ]);
  });

  it('does not add non-protocol Bash commands to text output', () => {
    const parsed = parseStreamEvent({
      type: 'assistant',
      message: {
        content: [
          {
            type: 'tool_use',
            name: 'Bash',
            input: { command: 'echo hello world' },
          },
        ],
      },
    });

    expect(parsed.text).toBeUndefined();
  });

  it('keeps existing text-based protocol extraction behavior', () => {
    const parsed = parseStreamEvent({
      type: 'assistant',
      message: {
        content: [
          {
            type: 'text',
            text: '@@YOLIUM:{"type":"complete","summary":"done"}',
          },
        ],
      },
    });

    const messages = extractProtocolMessages(parsed.text || '');
    expect(messages).toEqual([{ type: 'complete', summary: 'done' }]);
  });

  it('extracts usage and cost from result events', () => {
    const parsed = parseStreamEvent({
      type: 'result',
      result: 'Done',
      cost_usd: 0.01234,
      usage: { input_tokens: 1234, output_tokens: 567 },
    });

    expect(parsed.usage).toEqual({
      inputTokens: 1234,
      outputTokens: 567,
      costUsd: 0.01234,
    });
  });

  it('returns usage with zero cost when cost is missing', () => {
    const parsed = parseStreamEvent({
      type: 'result',
      usage: { input_tokens: 10, output_tokens: 20 },
    });

    expect(parsed.usage).toEqual({
      inputTokens: 10,
      outputTokens: 20,
      costUsd: 0,
    });
  });

  it('omits usage when result event has no usage or cost', () => {
    const parsed = parseStreamEvent({ type: 'result' });
    expect(parsed.usage).toBeUndefined();
  });

  // ─── Codex JSONL event types ──────────────────────────────────────────

  it('handles Codex thread.started event', () => {
    const parsed = parseStreamEvent({ type: 'thread.started' });
    expect(parsed.display).toBe('[Agent] Codex session started');
  });

  it('handles Codex turn.started event', () => {
    const parsed = parseStreamEvent({ type: 'turn.started' });
    expect(parsed.display).toBe('[Agent] Turn started');
  });

  it('handles Codex item.started with command_execution', () => {
    const parsed = parseStreamEvent({
      type: 'item.started',
      item: { type: 'command_execution', command: 'npm test' },
    });
    expect(parsed.display).toBe('[Bash] npm test');
  });

  it('handles Codex item.started with no item', () => {
    const parsed = parseStreamEvent({ type: 'item.started' });
    expect(parsed.display).toBeUndefined();
  });

  it('handles Codex item.completed with agent_message', () => {
    const parsed = parseStreamEvent({
      type: 'item.completed',
      item: {
        type: 'agent_message',
        content: [{ type: 'text', text: 'Hello from Codex agent' }],
      },
    });
    expect(parsed.display).toBe('Hello from Codex agent');
    expect(parsed.text).toBe('Hello from Codex agent');
  });

  it('handles Codex item.completed with agent_message containing multiple text blocks', () => {
    const parsed = parseStreamEvent({
      type: 'item.completed',
      item: {
        type: 'agent_message',
        content: [
          { type: 'text', text: 'Part 1' },
          { type: 'text', text: 'Part 2' },
        ],
      },
    });
    expect(parsed.display).toBe('Part 1\nPart 2');
    expect(parsed.text).toBe('Part 1Part 2');
  });

  it('extracts protocol messages from Codex agent_message text', () => {
    const parsed = parseStreamEvent({
      type: 'item.completed',
      item: {
        type: 'agent_message',
        content: [
          { type: 'text', text: '@@YOLIUM:{"type":"complete","summary":"done"}' },
        ],
      },
    });
    expect(parsed.text).toContain('@@YOLIUM:');
    const messages = extractProtocolMessages(parsed.text || '');
    expect(messages).toEqual([{ type: 'complete', summary: 'done' }]);
  });

  it('handles Codex item.completed with command_execution', () => {
    const parsed = parseStreamEvent({
      type: 'item.completed',
      item: {
        type: 'command_execution',
        command: 'ls -la',
        output: 'total 0\ndrwxr-xr-x 2 user user 40 Jan 1 00:00 .',
      },
    });
    expect(parsed.display).toContain('[Bash] ls -la');
    expect(parsed.display).toContain('total 0');
  });

  it('handles Codex item.completed with file_change', () => {
    const parsed = parseStreamEvent({
      type: 'item.completed',
      item: { type: 'file_change', filename: 'src/index.ts' },
    });
    expect(parsed.display).toBe('[File] src/index.ts');
  });

  it('handles Codex item.completed with no item', () => {
    const parsed = parseStreamEvent({ type: 'item.completed' });
    expect(parsed.display).toBeUndefined();
  });

  it('handles Codex item.completed with unknown item type', () => {
    const parsed = parseStreamEvent({
      type: 'item.completed',
      item: { type: 'unknown_type' },
    });
    expect(parsed.display).toBeUndefined();
  });

  it('handles Codex turn.completed with usage data', () => {
    const parsed = parseStreamEvent({
      type: 'turn.completed',
      usage: { input_tokens: 500, output_tokens: 200, cached_input_tokens: 100 },
    });
    expect(parsed.usage).toBeDefined();
    expect(parsed.usage!.inputTokens).toBe(600); // 500 + 100 cached
    expect(parsed.usage!.outputTokens).toBe(200);
    expect(parsed.usage!.costUsd).toBeGreaterThan(0);
    expect(parsed.display).toContain('[Cost:');
  });

  it('handles Codex turn.completed without usage', () => {
    const parsed = parseStreamEvent({ type: 'turn.completed' });
    expect(parsed.usage).toBeUndefined();
    expect(parsed.display).toBeUndefined();
  });
});

describe('buildBindMounts', () => {
  it('creates project-only binds when no optional params are provided', () => {
    const binds = buildBindMounts({
      mountPath: '/home/user/project',
      containerProjectPath: '/home/user/project',
      gitCredentialsBind: null,
      claudeOAuthBind: null,
      codexOAuthBind: null,
    });

    expect(binds).toEqual([
      '/home/user/project:/home/user/project:rw',
    ]);
  });

  it('adds git credentials bind when provided', () => {
    const binds = buildBindMounts({
      mountPath: '/home/user/project',
      containerProjectPath: '/home/user/project',
      gitCredentialsBind: '/home/user/.git-credentials:/home/agent/.git-credentials-mounted:ro',
      claudeOAuthBind: null,
      codexOAuthBind: null,
    });

    expect(binds).toHaveLength(2);
    expect(binds[1]).toBe('/home/user/.git-credentials:/home/agent/.git-credentials-mounted:ro');
  });

  it('adds Claude OAuth bind when provided', () => {
    const binds = buildBindMounts({
      mountPath: '/home/user/project',
      containerProjectPath: '/home/user/project',
      gitCredentialsBind: null,
      claudeOAuthBind: '/home/user/.claude/.credentials.json:/home/agent/.claude-credentials.json:ro',
      codexOAuthBind: null,
    });

    expect(binds).toHaveLength(2);
    expect(binds[1]).toContain('.claude-credentials.json');
  });

  it('adds Codex OAuth bind when provided', () => {
    const binds = buildBindMounts({
      mountPath: '/home/user/project',
      containerProjectPath: '/home/user/project',
      gitCredentialsBind: null,
      claudeOAuthBind: null,
      codexOAuthBind: '/home/user/.codex/auth.json:/home/agent/.codex-auth.json:ro',
    });

    expect(binds).toHaveLength(2);
    expect(binds[1]).toContain('.codex-auth.json');
  });

  it('adds all credential binds when all are provided', () => {
    const binds = buildBindMounts({
      mountPath: '/home/user/project',
      containerProjectPath: '/home/user/project',
      gitCredentialsBind: '/creds:/home/agent/.git-credentials-mounted:ro',
      claudeOAuthBind: '/claude:/home/agent/.claude-credentials.json:ro',
      codexOAuthBind: '/codex:/home/agent/.codex-auth.json:ro',
    });

    expect(binds).toHaveLength(4);
  });

  it('adds worktree .git mount when worktree and original path exist with .git dir', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => true } as fs.Stats);

    const binds = buildBindMounts({
      mountPath: '/home/user/worktrees/feat-branch',
      containerProjectPath: '/home/user/worktrees/feat-branch',
      worktreePath: '/home/user/worktrees/feat-branch',
      originalPath: '/home/user/project',
      gitCredentialsBind: null,
      claudeOAuthBind: null,
      codexOAuthBind: null,
    });

    expect(binds).toHaveLength(2);
    expect(binds[1]).toContain('.git');

    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => false } as fs.Stats);
  });

  it('does not add worktree .git mount when .git dir does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const binds = buildBindMounts({
      mountPath: '/home/user/worktrees/feat-branch',
      containerProjectPath: '/home/user/worktrees/feat-branch',
      worktreePath: '/home/user/worktrees/feat-branch',
      originalPath: '/home/user/project',
      gitCredentialsBind: null,
      claudeOAuthBind: null,
      codexOAuthBind: null,
    });

    expect(binds).toHaveLength(1);
  });

  it('does not add worktree .git mount when only worktreePath is set (no originalPath)', () => {
    const binds = buildBindMounts({
      mountPath: '/home/user/worktrees/feat-branch',
      containerProjectPath: '/home/user/worktrees/feat-branch',
      worktreePath: '/home/user/worktrees/feat-branch',
      gitCredentialsBind: null,
      claudeOAuthBind: null,
      codexOAuthBind: null,
    });

    expect(binds).toHaveLength(1);
  });
});

describe('buildAgentEnv', () => {
  const baseParams = {
    containerProjectPath: '/workspace',
    projectTypesValue: 'node,typescript',
    nodePackageManager: 'npm' as string | null,
    promptBase64: 'dGVzdCBwcm9tcHQ=',
    model: 'sonnet',
    tools: ['Read', 'Write', 'Bash'],
    itemId: 'item-123',
    agentProvider: 'claude',
    gitConfig: null,
    useOAuth: false,
    useCodexOAuth: false,
  };

  it('includes all required env vars', () => {
    const env = buildAgentEnv(baseParams);

    expect(env).toContain('PROJECT_DIR=/workspace');
    expect(env).toContain('TOOL=agent');
    expect(env).toContain('PROJECT_TYPES=node,typescript');
    expect(env).toContain('NODE_PACKAGE_MANAGER=npm');
    expect(env).toContain('AGENT_PROMPT=dGVzdCBwcm9tcHQ=');
    expect(env).toContain('AGENT_MODEL=sonnet');
    expect(env).toContain('AGENT_TOOLS=Read,Write,Bash');
    expect(env).toContain('AGENT_ITEM_ID=item-123');
    expect(env).toContain('AGENT_PROVIDER=claude');
    expect(env).toContain('OPENCODE_YOLO=true');
  });

  it('omits PROJECT_TYPES when empty', () => {
    const env = buildAgentEnv({ ...baseParams, projectTypesValue: '' });

    expect(env.find(e => e.startsWith('PROJECT_TYPES='))).toBeUndefined();
  });

  it('omits NODE_PACKAGE_MANAGER when null', () => {
    const env = buildAgentEnv({ ...baseParams, nodePackageManager: null });

    expect(env.find(e => e.startsWith('NODE_PACKAGE_MANAGER='))).toBeUndefined();
  });

  it('includes AGENT_GOAL when goalBase64 is provided', () => {
    const env = buildAgentEnv({ ...baseParams, goalBase64: 'Z29hbA==' });

    expect(env).toContain('AGENT_GOAL=Z29hbA==');
  });

  it('omits AGENT_GOAL when goalBase64 is not provided', () => {
    const env = buildAgentEnv(baseParams);

    expect(env.find(e => e.startsWith('AGENT_GOAL='))).toBeUndefined();
  });

  it('includes WORKTREE_REPO_PATH when worktree and original path are set', () => {
    const env = buildAgentEnv({
      ...baseParams,
      worktreePath: '/home/user/worktrees/feat',
      originalPath: '/home/user/project',
    });

    expect(env).toContain('WORKTREE_REPO_PATH=/home/user/project');
  });

  it('omits WORKTREE_REPO_PATH when only worktreePath is set', () => {
    const env = buildAgentEnv({ ...baseParams, worktreePath: '/home/user/worktrees/feat' });

    expect(env.find(e => e.startsWith('WORKTREE_REPO_PATH='))).toBeUndefined();
  });

  it('includes git user name and email when gitConfig has them', () => {
    const env = buildAgentEnv({
      ...baseParams,
      gitConfig: { name: 'Test User', email: 'test@example.com' },
    });

    expect(env).toContain('GIT_USER_NAME=Test User');
    expect(env).toContain('GIT_USER_EMAIL=test@example.com');
  });

  it('omits git user name/email when gitConfig is null', () => {
    const env = buildAgentEnv(baseParams);

    expect(env.find(e => e.startsWith('GIT_USER_NAME='))).toBeUndefined();
    expect(env.find(e => e.startsWith('GIT_USER_EMAIL='))).toBeUndefined();
  });

  it('sets CLAUDE_OAUTH_ENABLED when useOAuth is true', () => {
    const env = buildAgentEnv({ ...baseParams, useOAuth: true });

    expect(env).toContain('CLAUDE_OAUTH_ENABLED=true');
    expect(env.find(e => e.startsWith('ANTHROPIC_API_KEY='))).toBeUndefined();
  });

  it('sets ANTHROPIC_API_KEY from gitConfig when useOAuth is false', () => {
    const env = buildAgentEnv({
      ...baseParams,
      gitConfig: { name: 'User', email: 'u@e.com', anthropicApiKey: 'sk-ant-test' },
    });

    expect(env).toContain('ANTHROPIC_API_KEY=sk-ant-test');
    expect(env.find(e => e.startsWith('CLAUDE_OAUTH_ENABLED='))).toBeUndefined();
  });

  it('sets CODEX_OAUTH_ENABLED when useCodexOAuth is true', () => {
    const env = buildAgentEnv({ ...baseParams, useCodexOAuth: true });

    expect(env).toContain('CODEX_OAUTH_ENABLED=true');
    expect(env.find(e => e.startsWith('OPENAI_API_KEY='))).toBeUndefined();
  });

  it('sets OPENAI_API_KEY from gitConfig when useCodexOAuth is false', () => {
    const env = buildAgentEnv({
      ...baseParams,
      gitConfig: { name: 'User', email: 'u@e.com', openaiApiKey: 'sk-openai-test' },
    });

    expect(env).toContain('OPENAI_API_KEY=sk-openai-test');
    expect(env.find(e => e.startsWith('CODEX_OAUTH_ENABLED='))).toBeUndefined();
  });
});

describe('processStreamChunk (Codex JSONL)', () => {
  it('processes a sequence of Codex JSONL events', () => {
    const codexSession = [
      '{"type":"thread.started"}',
      '{"type":"turn.started"}',
      '{"type":"item.started","item":{"type":"command_execution","command":"npm test"}}',
      '{"type":"item.completed","item":{"type":"agent_message","content":[{"type":"text","text":"Running tests now"}]}}',
      '{"type":"item.completed","item":{"type":"command_execution","command":"npm test","output":"All tests passed"}}',
      '{"type":"item.completed","item":{"type":"file_change","filename":"src/app.ts"}}',
      '{"type":"turn.completed","usage":{"input_tokens":1000,"output_tokens":500,"cached_input_tokens":200}}',
    ].join('\n') + '\n';

    const result = processStreamChunk(codexSession, '');

    expect(result.lineBuffer).toBe('');
    expect(result.displayParts).toContain('[Agent] Codex session started');
    expect(result.displayParts).toContain('[Agent] Turn started');
    expect(result.displayParts).toContain('[Bash] npm test');
    expect(result.displayParts).toContain('Running tests now');
    expect(result.displayParts).toContain('[File] src/app.ts');
    expect(result.textContent).toContain('Running tests now');
    expect(result.usageParts).toHaveLength(1);
    expect(result.usageParts[0].inputTokens).toBe(1200); // 1000 + 200 cached
    expect(result.usageParts[0].outputTokens).toBe(500);
  });

  it('extracts protocol messages from Codex agent_message in stream', () => {
    const data = '{"type":"item.completed","item":{"type":"agent_message","content":[{"type":"text","text":"@@YOLIUM:{\\"type\\":\\"progress\\",\\"step\\":\\"analyze\\",\\"detail\\":\\"Found 5 files\\"}"}]}}\n';
    const result = processStreamChunk(data, '');

    expect(result.textContent).toContain('@@YOLIUM:');
    const messages = extractProtocolMessages(result.textContent);
    expect(messages).toEqual([
      { type: 'progress', step: 'analyze', detail: 'Found 5 files', attempt: undefined, maxAttempts: undefined },
    ]);
  });
});

describe('processStreamChunk', () => {
  it('parses complete JSON lines', () => {
    const data = '{"type":"system"}\n{"type":"assistant","message":{"content":[{"type":"text","text":"hello"}]}}\n';
    const result = processStreamChunk(data, '');

    expect(result.lineBuffer).toBe('');
    expect(result.displayParts).toContain('[Agent] Session started');
    expect(result.displayParts).toContain('hello');
    expect(result.textContent).toContain('hello');
  });

  it('buffers incomplete last line', () => {
    const data = '{"type":"system"}\n{"type":"ass';
    const result = processStreamChunk(data, '');

    expect(result.lineBuffer).toBe('{"type":"ass');
    expect(result.displayParts).toEqual(['[Agent] Session started']);
  });

  it('completes buffered line across chunks', () => {
    // First chunk — partial JSON
    const result1 = processStreamChunk('{"type":"ass', '');
    expect(result1.lineBuffer).toBe('{"type":"ass');
    expect(result1.displayParts).toEqual([]);

    // Second chunk — completes the line
    const result2 = processStreamChunk('istant","message":{"content":[{"type":"text","text":"hello"}]}}\n', result1.lineBuffer);
    expect(result2.lineBuffer).toBe('');
    expect(result2.displayParts).toContain('hello');
    expect(result2.textContent).toContain('hello');
  });

  it('handles non-JSON lines as raw text', () => {
    const data = 'Starting agent...\n';
    const result = processStreamChunk(data, '');

    expect(result.displayParts).toEqual(['Starting agent...']);
    expect(result.textContent).toBe('Starting agent...\n');
  });

  it('handles mixed JSON and non-JSON content', () => {
    const data = 'echo from entrypoint\n{"type":"system"}\n';
    const result = processStreamChunk(data, '');

    expect(result.displayParts).toEqual(['echo from entrypoint', '[Agent] Session started']);
    expect(result.textContent).toContain('echo from entrypoint');
  });

  it('skips empty lines', () => {
    const data = '\n\n{"type":"system"}\n\n';
    const result = processStreamChunk(data, '');

    expect(result.displayParts).toEqual(['[Agent] Session started']);
  });

  it('collects usage parts from result events', () => {
    const data = '{"type":"result","cost_usd":0.05,"usage":{"input_tokens":100,"output_tokens":50}}\n';
    const result = processStreamChunk(data, '');

    expect(result.usageParts).toEqual([{ inputTokens: 100, outputTokens: 50, costUsd: 0.05 }]);
  });

  it('returns empty results for empty chunk', () => {
    const result = processStreamChunk('', '');

    expect(result.lineBuffer).toBe('');
    expect(result.displayParts).toEqual([]);
    expect(result.textContent).toBe('');
    expect(result.usageParts).toEqual([]);
  });

  it('handles multiple lines in one chunk', () => {
    const data = '{"type":"system"}\n{"type":"assistant","message":{"content":[{"type":"text","text":"line1"}]}}\n{"type":"assistant","message":{"content":[{"type":"text","text":"line2"}]}}\n';
    const result = processStreamChunk(data, '');

    expect(result.displayParts).toHaveLength(3);
    expect(result.textContent).toContain('line1');
    expect(result.textContent).toContain('line2');
  });
});

describe('flushLineBuffer', () => {
  it('returns empty results for empty buffer', () => {
    const result = flushLineBuffer('');

    expect(result.textContent).toBe('');
    expect(result.protocolMessages).toEqual([]);
  });

  it('returns empty results for whitespace-only buffer', () => {
    const result = flushLineBuffer('   \n  ');

    expect(result.textContent).toBe('');
    expect(result.protocolMessages).toEqual([]);
  });

  it('parses JSON buffer as stream event', () => {
    const result = flushLineBuffer('{"type":"assistant","message":{"content":[{"type":"text","text":"final text"}]}}');

    expect(result.textContent).toContain('final text');
  });

  it('handles non-JSON buffer as raw text', () => {
    const result = flushLineBuffer('some raw output');

    expect(result.textContent).toBe('some raw output\n');
  });

  it('extracts protocol messages from JSON buffer', () => {
    const result = flushLineBuffer('{"type":"assistant","message":{"content":[{"type":"text","text":"@@YOLIUM:{\\"type\\":\\"complete\\",\\"summary\\":\\"done\\"}"}]}}');

    expect(result.protocolMessages).toEqual([{ type: 'complete', summary: 'done' }]);
  });

  it('extracts protocol messages from raw text buffer', () => {
    const result = flushLineBuffer('@@YOLIUM:{"type":"complete","summary":"all done"}');

    expect(result.textContent).toContain('@@YOLIUM:');
    expect(result.protocolMessages).toEqual([{ type: 'complete', summary: 'all done' }]);
  });

  it('returns empty protocol messages when no protocol text', () => {
    const result = flushLineBuffer('just some regular text');

    expect(result.textContent).toBe('just some regular text\n');
    expect(result.protocolMessages).toEqual([]);
  });

  it('handles JSON result event (no text content)', () => {
    const result = flushLineBuffer('{"type":"result","result":"Done","cost_usd":0.05}');

    // Result events don't return text (by design — avoids duplicate protocol extraction)
    expect(result.textContent).toBe('');
    expect(result.protocolMessages).toEqual([]);
  });
});

describe('cumulative usage helpers', () => {
  it('combines usage parts and accumulates into session totals', () => {
    const combined = combineUsageParts([
      { inputTokens: 100, outputTokens: 50, costUsd: 0.001 },
      { inputTokens: 40, outputTokens: 80, costUsd: 0.0025 },
    ]);

    expect(combined).toEqual({
      inputTokens: 140,
      outputTokens: 130,
      costUsd: 0.0035,
    });

    const session = {
      cumulativeUsage: { inputTokens: 10, outputTokens: 20, costUsd: 0.0009 },
    } as AgentContainerSession;

    accumulateSessionUsage(session, combined);

    expect(session.cumulativeUsage).toEqual({
      inputTokens: 150,
      outputTokens: 150,
      costUsd: 0.0044,
    });
  });
});
