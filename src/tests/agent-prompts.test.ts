import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolve } from 'path';

vi.mock('electron', () => ({
  app: { isPackaged: false },
}));

vi.mock('@main/lib/logger', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

const actualFs = await vi.importActual<typeof import('node:fs')>('node:fs');

const { mockExistsSync: mockKbExistsSync, mockReadFileSync: mockKbReadFileSync } = vi.hoisted(() => ({
  mockExistsSync: vi.fn(() => false),
  mockReadFileSync: vi.fn((...args: unknown[]) => ''),
}));
vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    existsSync: mockKbExistsSync,
    readFileSync: mockKbReadFileSync,
  };
});

import { buildAgentPrompt, buildScheduledPrompt, INLINE_PROTOCOL } from '@main/services/agent-prompts';

describe('agent-prompts', () => {
  describe('buildAgentPrompt', () => {
    it('should build Claude prompt with system prompt and goal', () => {
      const prompt = buildAgentPrompt({
        systemPrompt: 'You are the Plan Agent.',
        goal: 'Add user authentication',
        conversationHistory: '',
      });
      expect(prompt).toContain('You are the Plan Agent.');
      expect(prompt).toContain('Add user authentication');
      expect(prompt).not.toContain('Previous conversation:');
    });

    it('should build Claude prompt with conversation history', () => {
      const prompt = buildAgentPrompt({
        systemPrompt: 'You are the Plan Agent.',
        goal: 'Add auth',
        conversationHistory: '[agent]: Which method?\n\n[user]: OAuth',
      });
      expect(prompt).toContain('Previous conversation:');
      expect(prompt).toContain('[agent]: Which method?');
      expect(prompt).toContain('[user]: OAuth');
    });

    it('should build non-Claude prompt with inline protocol', () => {
      const prompt = buildAgentPrompt({
        systemPrompt: 'You are the Code Agent.',
        goal: 'Fix bug',
        conversationHistory: '',
        provider: 'codex',
      });
      expect(prompt).toContain('@@YOLIUM: Protocol (MANDATORY)');
      expect(prompt).toContain('You MUST communicate with Yolium');
      expect(prompt).toContain('"type":"progress"');
      expect(prompt).toContain('"type":"comment"');
      expect(prompt).toContain('"type":"ask_question"');
      expect(prompt).toContain('"type":"complete"');
      expect(prompt).toContain('"type":"error"');
      expect(prompt).toContain('"type":"create_item"');
      expect(prompt).toContain('"type":"update_description"');
      expect(prompt).toContain('You are the Code Agent.');
      expect(prompt).toContain('Fix bug');
      expect(prompt).toContain('Your FIRST output MUST be a progress message');
      expect(prompt).toContain('LAST protocol message MUST be either a complete or error message');
      expect(prompt).toContain('REMINDER: You MUST output @@YOLIUM:');
    });

    it('should append FILE_OUTPUT_PLAN for non-Claude plan-agent', () => {
      const prompt = buildAgentPrompt({
        systemPrompt: 'You are the Plan Agent.',
        goal: 'Create plan',
        conversationHistory: '',
        provider: 'codex',
        agentName: 'plan-agent',
      });
      expect(prompt).toContain('.yolium/plan.md');
      expect(prompt).not.toContain('.yolium-plan.md');
      expect(prompt).toContain('Write Your Plan to a File');
      expect(prompt).not.toContain('.yolium/summary.md');
    });

    it('should append FILE_OUTPUT_CODE for non-Claude code-agent', () => {
      const prompt = buildAgentPrompt({
        systemPrompt: 'You are the Code Agent.',
        goal: 'Fix bug',
        conversationHistory: '',
        provider: 'codex',
        agentName: 'code-agent',
      });
      expect(prompt).toContain('.yolium/summary.md');
      expect(prompt).not.toContain('.yolium-summary.md');
      expect(prompt).toContain('Write Your Summary to a File');
      expect(prompt).not.toContain('.yolium/plan.md');
    });

    it('should append FILE_OUTPUT_SCOUT for non-Claude scout-agent', () => {
      const prompt = buildAgentPrompt({
        systemPrompt: 'You are the Scout Agent.',
        goal: 'Find leads',
        conversationHistory: '',
        provider: 'codex',
        agentName: 'scout-agent',
      });
      expect(prompt).toContain('.yolium/scout.json');
      expect(prompt).not.toContain('.yolium-scout.json');
      expect(prompt).toContain('Write Your Dossier to a File');
      expect(prompt).not.toContain('.yolium/plan.md');
      expect(prompt).not.toContain('.yolium/summary.md');
    });

    it('should append FILE_OUTPUT_VERIFY for non-Claude verify-agent', () => {
      const prompt = buildAgentPrompt({
        systemPrompt: 'You are the Verify Agent.',
        goal: 'Verify implementation',
        conversationHistory: '',
        provider: 'codex',
        agentName: 'verify-agent',
      });
      expect(prompt).toContain('.yolium/verify.md');
      expect(prompt).not.toContain('.yolium-verify.md');
      expect(prompt).toContain('Write Your Verification Report to a File');
      expect(prompt).not.toContain('.yolium/plan.md');
      expect(prompt).not.toContain('.yolium/summary.md');
      expect(prompt).not.toContain('.yolium/scout.json');
    });

    it('should not include inline protocol for Claude provider', () => {
      const prompt = buildAgentPrompt({
        systemPrompt: 'You are the Code Agent.',
        goal: 'Fix bug',
        conversationHistory: '',
        provider: 'claude',
      });
      expect(prompt).not.toContain('@@YOLIUM: Protocol (MANDATORY)');
      expect(prompt).not.toContain('REMINDER: You MUST output @@YOLIUM:');
    });

    it('should not include file output instructions for Claude provider', () => {
      const prompt = buildAgentPrompt({
        systemPrompt: 'You are the Plan Agent.',
        goal: 'Create plan',
        conversationHistory: '',
        provider: 'claude',
        agentName: 'plan-agent',
      });
      expect(prompt).not.toContain('.yolium/plan.md');
      expect(prompt).not.toContain('.yolium/summary.md');
    });

    it('should include inline protocol for opencode provider', () => {
      const prompt = buildAgentPrompt({
        systemPrompt: 'You are the Plan Agent.',
        goal: 'Create plan',
        conversationHistory: '',
        provider: 'opencode',
      });
      expect(prompt).toContain('@@YOLIUM: Protocol (MANDATORY)');
      expect(prompt).toContain('REMINDER: You MUST output @@YOLIUM:');
    });
  });

  describe('attachment support in prompts', () => {
    it('should include attachment list in prompt when item has attachments', () => {
      const prompt = buildAgentPrompt({
        systemPrompt: 'You are the Code Agent.',
        goal: 'Implement feature',
        conversationHistory: '',
        attachments: [
          { id: 'att-1', itemId: 'item-1', filename: 'screenshot.png', mimeType: 'image/png', size: 1024, createdAt: '2026-04-02T00:00:00Z' },
          { id: 'att-2', itemId: 'item-1', filename: 'design.pdf', mimeType: 'application/pdf', size: 2048, createdAt: '2026-04-02T00:00:00Z' },
        ],
        containerProjectPath: '/home/user/project',
      });
      expect(prompt).toContain('## Attachments');
      expect(prompt).toContain('screenshot.png');
      expect(prompt).toContain('design.pdf');
      expect(prompt).toContain('.yolium/attachments/');
    });

    it('should omit attachment section when item has no attachments', () => {
      const prompt = buildAgentPrompt({
        systemPrompt: 'You are the Code Agent.',
        goal: 'Implement feature',
        conversationHistory: '',
      });
      expect(prompt).not.toContain('## Attachments');
    });
  });

  describe('no-co-authored-by rules', () => {
    const projectRoot = resolve(__dirname, '..', '..');

    it('should include no-co-authored-by instruction in CLAUDE.md content', () => {
      const claudeMd = actualFs.readFileSync(resolve(projectRoot, 'CLAUDE.md'), 'utf-8');
      expect(claudeMd).toContain('Co-Authored-By');
      expect(claudeMd).toMatch(/never.*co-authored-by/i);
    });

    it('should include no-co-authored-by rule in code-agent commit step', () => {
      const codeAgent = actualFs.readFileSync(resolve(projectRoot, 'src/agents/code-agent.md'), 'utf-8');
      expect(codeAgent).toMatch(/co-authored-by/i);
      expect(codeAgent).toMatch(/no.*trailer/i);
    });

    it('should include no-co-authored-by rule in inline protocol for non-Claude providers', () => {
      expect(INLINE_PROTOCOL).toMatch(/co-authored-by/i);
      expect(INLINE_PROTOCOL).toMatch(/no.*trailer/i);
    });
  });

  describe('KB context injection', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      mockKbExistsSync.mockReturnValue(false);
      mockKbReadFileSync.mockReturnValue('');
    });

    it('should inject KB context into Claude prompt when _index.md exists', () => {
      mockKbExistsSync.mockReturnValue(true);
      mockKbReadFileSync.mockReturnValue('- [Architecture](architecture.md) — system overview');

      const prompt = buildAgentPrompt({
        systemPrompt: 'You are the Code Agent.',
        goal: 'Fix bug',
        conversationHistory: '',
        provider: 'claude',
        agentName: 'code-agent',
        projectPath: '/host/project',
        containerProjectPath: '/container/project',
      });
      expect(prompt).toContain('## Project Knowledge Base');
      expect(prompt).toContain('- [Architecture](architecture.md) — system overview');
    });

    it('should not inject KB context when _index.md does not exist', () => {
      mockKbExistsSync.mockReturnValue(false);

      const prompt = buildAgentPrompt({
        systemPrompt: 'You are the Code Agent.',
        goal: 'Fix bug',
        conversationHistory: '',
        provider: 'claude',
        agentName: 'code-agent',
        projectPath: '/host/project',
        containerProjectPath: '/container/project',
      });
      expect(prompt).not.toContain('## Project Knowledge Base');
    });

    it('should not inject KB context for kb-agent', () => {
      mockKbExistsSync.mockReturnValue(true);
      mockKbReadFileSync.mockReturnValue('- [Architecture](architecture.md)');

      const prompt = buildAgentPrompt({
        systemPrompt: 'You are the KB Agent.',
        goal: 'Build KB',
        conversationHistory: '',
        provider: 'claude',
        agentName: 'kb-agent',
        projectPath: '/host/project',
        containerProjectPath: '/container/project',
      });
      expect(prompt).not.toContain('## Project Knowledge Base');
    });

    it('should inject KB context into non-Claude prompt when _index.md exists', () => {
      mockKbExistsSync.mockReturnValue(true);
      mockKbReadFileSync.mockReturnValue('- [Patterns](patterns.md) — coding patterns');

      const prompt = buildAgentPrompt({
        systemPrompt: 'You are the Code Agent.',
        goal: 'Fix bug',
        conversationHistory: '',
        provider: 'codex',
        agentName: 'code-agent',
        projectPath: '/host/project',
        containerProjectPath: '/container/project',
      });
      expect(prompt).toContain('## Project Knowledge Base');
      expect(prompt).toContain('- [Patterns](patterns.md) — coding patterns');
    });

    it('should not inject KB context when projectPath is not provided', () => {
      mockKbExistsSync.mockReturnValue(true);
      mockKbReadFileSync.mockReturnValue('- [Architecture](architecture.md)');

      const prompt = buildAgentPrompt({
        systemPrompt: 'You are the Code Agent.',
        goal: 'Fix bug',
        conversationHistory: '',
        provider: 'claude',
        agentName: 'code-agent',
        containerProjectPath: '/container/project',
      });
      expect(prompt).not.toContain('## Project Knowledge Base');
    });

    it('should append FILE_OUTPUT_KB for non-Claude kb-agent', () => {
      const prompt = buildAgentPrompt({
        systemPrompt: 'You are the KB Agent.',
        goal: 'Build KB',
        conversationHistory: '',
        provider: 'codex',
        agentName: 'kb-agent',
      });
      expect(prompt).toContain('.yolium/kb-summary.md');
      expect(prompt).not.toContain('.yolium-kb-summary.md');
    });

    it('should not append FILE_OUTPUT_KB for Claude kb-agent', () => {
      const prompt = buildAgentPrompt({
        systemPrompt: 'You are the KB Agent.',
        goal: 'Build KB',
        conversationHistory: '',
        provider: 'claude',
        agentName: 'kb-agent',
      });
      expect(prompt).not.toContain('.yolium/kb-summary.md');
    });

    it('should reference containerProjectPath (not projectPath) in KB context prompt text', () => {
      mockKbExistsSync.mockReturnValue(true);
      mockKbReadFileSync.mockReturnValue('- [Architecture](architecture.md)');

      const prompt = buildAgentPrompt({
        systemPrompt: 'You are the Code Agent.',
        goal: 'Fix bug',
        conversationHistory: '',
        provider: 'claude',
        agentName: 'code-agent',
        projectPath: '/host/project',
        containerProjectPath: '/container/project',
      });
      expect(prompt).toContain('/container/project/.yolium/kb/');
      expect(prompt).not.toContain('/host/project/.yolium/kb/');
    });
  });

  describe('buildScheduledPrompt', () => {
    it('should build scheduled prompt with template', () => {
      const result = buildScheduledPrompt({
        systemPrompt: 'You are the Twitter Growth specialist.',
        scheduleType: 'daily',
        promptTemplate: 'Check Twitter mentions and respond to engagement.',
        description: 'Monitor Twitter engagement',
        memoryContext: '',
      });
      expect(result).toContain('## Schedule: daily');
      expect(result).toContain('Check Twitter mentions and respond to engagement.');
    });

    it('should build scheduled prompt with fallback directive', () => {
      const result = buildScheduledPrompt({
        systemPrompt: 'You are the Twitter Growth specialist.',
        scheduleType: 'daily',
        promptTemplate: undefined,
        description: 'Monitor Twitter engagement and post updates',
        memoryContext: '',
      });
      expect(result).toContain('## Schedule: daily');
      expect(result).toContain('Execute your daily task');
      expect(result).toContain('Monitor Twitter engagement and post updates');
    });

    it('should append memory context to scheduled prompt', () => {
      const result = buildScheduledPrompt({
        systemPrompt: 'You are the Twitter Growth specialist.',
        scheduleType: 'daily',
        promptTemplate: 'Do the daily task.',
        description: 'Monitor Twitter',
        memoryContext: '## Run History\n\nLast run: 2026-03-09 — posted 3 tweets.',
      });
      expect(result).toContain('## Run History');
      expect(result).toContain('Last run: 2026-03-09');
      const scheduleIdx = result.indexOf('## Schedule: daily');
      const memoryIdx = result.indexOf('## Run History');
      expect(memoryIdx).toBeGreaterThan(scheduleIdx);
    });

    it('should not append memory context when empty', () => {
      const result = buildScheduledPrompt({
        systemPrompt: 'You are the specialist.',
        scheduleType: 'daily',
        promptTemplate: 'Do the daily task.',
        description: 'Monitor',
        memoryContext: '',
      });
      // Should still contain the protocol reminder even without memory context
      expect(result).toContain('@@YOLIUM:');
    });

    it('should always include system prompt as the base', () => {
      const result = buildScheduledPrompt({
        systemPrompt: 'You are the specialist.',
        scheduleType: 'daily',
        promptTemplate: 'Some template.',
        description: 'Monitor',
        memoryContext: '',
      });
      expect(result.startsWith('You are the specialist.')).toBe(true);
    });

    it('should append @@YOLIUM protocol reminder to scheduled agent prompts', () => {
      const result = buildScheduledPrompt({
        systemPrompt: 'You are the specialist.',
        scheduleType: 'daily',
        promptTemplate: 'Do the daily task.',
        description: 'Monitor',
        memoryContext: '',
      });
      expect(result).toContain('@@YOLIUM:');
      expect(result).toContain('CRITICAL');
    });

    it('should include run_result message format instructions in the protocol reminder', () => {
      const result = buildScheduledPrompt({
        systemPrompt: 'You are the specialist.',
        scheduleType: 'daily',
        promptTemplate: 'Do the daily task.',
        description: 'Monitor',
        memoryContext: '',
      });
      expect(result).toContain('run_result');
      expect(result).toContain('completed|no_action|failed');
    });

    it('should include the protocol reminder after memory context section', () => {
      const result = buildScheduledPrompt({
        systemPrompt: 'You are the specialist.',
        scheduleType: 'daily',
        promptTemplate: 'Do the daily task.',
        description: 'Monitor',
        memoryContext: '## Run History\n\nSome history here.',
      });
      const memoryIdx = result.indexOf('## Run History');
      const protocolIdx = result.indexOf('CRITICAL: You MUST output @@YOLIUM:');
      expect(memoryIdx).toBeGreaterThan(-1);
      expect(protocolIdx).toBeGreaterThan(memoryIdx);
    });

    it('should preserve existing prompt structure (system prompt, schedule section, memory context)', () => {
      const result = buildScheduledPrompt({
        systemPrompt: 'You are the specialist.',
        scheduleType: 'daily',
        promptTemplate: 'Do the daily task.',
        description: 'Monitor',
        memoryContext: '## Run History\n\nSome history.',
      });
      const systemIdx = result.indexOf('You are the specialist.');
      const scheduleIdx = result.indexOf('## Schedule: daily');
      const memoryIdx = result.indexOf('## Run History');
      const protocolIdx = result.indexOf('CRITICAL: You MUST output @@YOLIUM:');
      expect(systemIdx).toBe(0);
      expect(scheduleIdx).toBeGreaterThan(systemIdx);
      expect(memoryIdx).toBeGreaterThan(scheduleIdx);
      expect(protocolIdx).toBeGreaterThan(memoryIdx);
    });

    it('should include protocol reminder even when memoryContext is empty', () => {
      const result = buildScheduledPrompt({
        systemPrompt: 'You are the specialist.',
        scheduleType: 'daily',
        promptTemplate: 'Do the daily task.',
        description: 'Monitor',
        memoryContext: '',
      });
      expect(result).toContain('CRITICAL: You MUST output @@YOLIUM:');
      expect(result).toContain('run_result');
    });

    it('should include protocol reminder even when promptTemplate is undefined', () => {
      const result = buildScheduledPrompt({
        systemPrompt: 'You are the specialist.',
        scheduleType: 'daily',
        promptTemplate: undefined,
        description: 'Monitor engagement',
        memoryContext: '',
      });
      expect(result).toContain('CRITICAL: You MUST output @@YOLIUM:');
      expect(result).toContain('run_result');
    });

    it('buildScheduledPrompt should include Projects section when projectPaths provided', () => {
      const result = buildScheduledPrompt({
        systemPrompt: 'You are the specialist.',
        scheduleType: 'daily',
        promptTemplate: 'Do the daily task.',
        description: 'Monitor',
        memoryContext: '',
        projectPaths: [
          { hostPath: '/home/user/my-app', containerPath: '/projects/my-app' },
          { hostPath: '/home/user/other', containerPath: '/projects/other' },
        ],
      });
      expect(result).toContain('## Projects');
      expect(result).toContain('/projects/my-app');
      expect(result).toContain('/projects/other');
    });

    it('buildScheduledPrompt should list container paths with host path context', () => {
      const result = buildScheduledPrompt({
        systemPrompt: 'You are the specialist.',
        scheduleType: 'daily',
        promptTemplate: 'Do the daily task.',
        description: 'Monitor',
        memoryContext: '',
        projectPaths: [
          { hostPath: '/home/user/my-app', containerPath: '/projects/my-app' },
        ],
      });
      expect(result).toContain('/home/user/my-app');
      expect(result).toContain('/projects/my-app');
    });

    it('buildScheduledPrompt should not include Projects section when no projectPaths', () => {
      const result = buildScheduledPrompt({
        systemPrompt: 'You are the specialist.',
        scheduleType: 'daily',
        promptTemplate: 'Do the daily task.',
        description: 'Monitor',
        memoryContext: '',
      });
      expect(result).not.toContain('## Projects');
    });
  });
});
