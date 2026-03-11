import { describe, it, expect } from 'vitest';
import { buildAgentPrompt, buildScheduledPrompt } from '@main/services/agent-prompts';

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
      expect(prompt).toContain('.yolium-plan.md');
      expect(prompt).toContain('Write Your Plan to a File');
      expect(prompt).not.toContain('.yolium-summary.md');
    });

    it('should append FILE_OUTPUT_CODE for non-Claude code-agent', () => {
      const prompt = buildAgentPrompt({
        systemPrompt: 'You are the Code Agent.',
        goal: 'Fix bug',
        conversationHistory: '',
        provider: 'codex',
        agentName: 'code-agent',
      });
      expect(prompt).toContain('.yolium-summary.md');
      expect(prompt).toContain('Write Your Summary to a File');
      expect(prompt).not.toContain('.yolium-plan.md');
    });

    it('should append FILE_OUTPUT_SCOUT for non-Claude scout-agent', () => {
      const prompt = buildAgentPrompt({
        systemPrompt: 'You are the Scout Agent.',
        goal: 'Find leads',
        conversationHistory: '',
        provider: 'codex',
        agentName: 'scout-agent',
      });
      expect(prompt).toContain('.yolium-scout.json');
      expect(prompt).toContain('Write Your Dossier to a File');
      expect(prompt).not.toContain('.yolium-plan.md');
      expect(prompt).not.toContain('.yolium-summary.md');
    });

    it('should append FILE_OUTPUT_VERIFY for non-Claude verify-agent', () => {
      const prompt = buildAgentPrompt({
        systemPrompt: 'You are the Verify Agent.',
        goal: 'Verify implementation',
        conversationHistory: '',
        provider: 'codex',
        agentName: 'verify-agent',
      });
      expect(prompt).toContain('.yolium-verify.md');
      expect(prompt).toContain('Write Your Verification Report to a File');
      expect(prompt).not.toContain('.yolium-plan.md');
      expect(prompt).not.toContain('.yolium-summary.md');
      expect(prompt).not.toContain('.yolium-scout.json');
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
      expect(prompt).not.toContain('.yolium-plan.md');
      expect(prompt).not.toContain('.yolium-summary.md');
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
      const afterSchedule = result.split('Do the daily task.')[1];
      expect(afterSchedule.trim()).toBe('');
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
  });
});
