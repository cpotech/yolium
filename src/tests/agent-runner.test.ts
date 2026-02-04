// src/tests/agent-runner.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock electron-dependent logger before importing agent-runner
vi.mock('../lib/logger', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

import { buildAgentPrompt, resolveModel } from '../lib/agent-runner';

describe('agent-runner', () => {
  describe('buildAgentPrompt', () => {
    it('should build prompt with goal only', () => {
      const prompt = buildAgentPrompt({
        systemPrompt: 'You are the Plan Agent.',
        goal: 'Add user authentication',
        conversationHistory: '',
      });

      expect(prompt).toContain('You are the Plan Agent.');
      expect(prompt).toContain('Add user authentication');
      expect(prompt).not.toContain('Previous conversation:');
    });

    it('should include conversation history when provided', () => {
      const prompt = buildAgentPrompt({
        systemPrompt: 'You are the Plan Agent.',
        goal: 'Add auth',
        conversationHistory: '[agent]: Which method?\n\n[user]: OAuth',
      });

      expect(prompt).toContain('Previous conversation:');
      expect(prompt).toContain('[agent]: Which method?');
      expect(prompt).toContain('[user]: OAuth');
    });
  });

  describe('resolveModel', () => {
    it('should use item model when provided', () => {
      const result = resolveModel('opus', 'sonnet');
      expect(result).toBe('claude-opus-4-5-20251101');
    });

    it('should fall back to agent model when item model is undefined', () => {
      const result = resolveModel(undefined, 'sonnet');
      expect(result).toBe('claude-sonnet-4-20250514');
    });

    it('should map short names to full model IDs', () => {
      expect(resolveModel(undefined, 'opus')).toBe('claude-opus-4-5-20251101');
      expect(resolveModel(undefined, 'sonnet')).toBe('claude-sonnet-4-20250514');
      expect(resolveModel(undefined, 'haiku')).toBe('claude-haiku-3-5-20241022');
    });

    it('should pass through unknown model names as-is', () => {
      const result = resolveModel(undefined, 'some-custom-model');
      expect(result).toBe('some-custom-model');
    });
  });

  describe('resumeAgent', () => {
    it('should rebuild prompt with conversation history', () => {
      const systemPrompt = 'You are the Plan Agent.';
      const goal = 'Add authentication';
      const history = '[agent]: Which method?\n\n[user]: OAuth';

      const prompt = buildAgentPrompt({
        systemPrompt,
        goal,
        conversationHistory: history,
      });

      expect(prompt).toContain('Previous conversation:');
      expect(prompt).toContain('[agent]: Which method?');
      expect(prompt).toContain('[user]: OAuth');
      expect(prompt).toContain('Continue from where you left off');
    });
  });
});
