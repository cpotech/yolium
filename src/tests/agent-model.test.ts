import { describe, it, expect } from 'vitest';
import { resolveModel, getDisplayModel, getCompletionColumn } from '@main/services/agent-model';

describe('agent-model', () => {
  describe('resolveModel', () => {
    it('should resolve model from MODEL_MAP short names', () => {
      expect(resolveModel(undefined, undefined, 'opus')).toBe('claude-opus-4-6');
      expect(resolveModel(undefined, undefined, 'sonnet')).toBe('claude-sonnet-4-5-20250929');
      expect(resolveModel(undefined, undefined, 'haiku')).toBe('claude-haiku-4-5-20251001');
    });

    it('should pass through full model IDs unchanged', () => {
      expect(resolveModel(undefined, undefined, 'claude-opus-4-6-20250212')).toBe('claude-opus-4-6-20250212');
      expect(resolveModel(undefined, undefined, 'o3-mini')).toBe('o3-mini');
      expect(resolveModel(undefined, undefined, 'gpt-4o')).toBe('gpt-4o');
    });

    it('should prefer item model over settings and agent defaults', () => {
      expect(resolveModel('opus', 'haiku', 'sonnet')).toBe('claude-opus-4-6');
      expect(resolveModel('sonnet', 'opus', 'haiku')).toBe('claude-sonnet-4-5-20250929');
    });

    it('should use settings model when item model is undefined', () => {
      expect(resolveModel(undefined, 'haiku', 'sonnet')).toBe('claude-haiku-4-5-20251001');
    });

    it('should fall back to agent model when both item and settings are undefined', () => {
      expect(resolveModel(undefined, undefined, 'sonnet')).toBe('claude-sonnet-4-5-20250929');
    });

    it('should pass through custom provider models', () => {
      expect(resolveModel(undefined, 'minimax-m2.5-free', 'sonnet')).toBe('minimax-m2.5-free');
      expect(resolveModel('kimi-k2.5-free', 'sonnet', 'opus')).toBe('kimi-k2.5-free');
    });

    it('should pass through OpenCode provider/model format', () => {
      expect(resolveModel('opencode/big-pickle', undefined, 'opus')).toBe('opencode/big-pickle');
      expect(resolveModel(undefined, 'anthropic/claude-sonnet-4-20250514', 'opus')).toBe('anthropic/claude-sonnet-4-20250514');
    });

    it('should resolve openrouter model IDs passthrough in resolveModel', () => {
      expect(resolveModel('anthropic/claude-3.5-sonnet', undefined, 'opus')).toBe('anthropic/claude-3.5-sonnet');
      expect(resolveModel(undefined, 'google/gemini-pro', 'opus')).toBe('google/gemini-pro');
    });
  });

  describe('getDisplayModel', () => {
    it('should return override model for display when set', () => {
      expect(getDisplayModel('claude', 'sonnet', undefined, 'opus')).toBe('sonnet');
      expect(getDisplayModel('claude', undefined, 'haiku', 'opus')).toBe('haiku');
      expect(getDisplayModel('codex', 'o3-mini', undefined, 'opus')).toBe('o3-mini');
    });

    it('should return provider-specific fallback for display when no override', () => {
      expect(getDisplayModel('claude', undefined, undefined, 'opus')).toBe('opus');
      expect(getDisplayModel('opencode', undefined, undefined, 'opus')).toBe('opus');
      expect(getDisplayModel('codex', undefined, undefined, 'opus')).toBe('codex-default');
      expect(getDisplayModel('openrouter', undefined, undefined, 'opus')).toBe('opus');
      expect(getDisplayModel('unknown-provider', undefined, undefined, 'opus')).toBe('opus');
    });

    it('should prefer item model over settings model', () => {
      expect(getDisplayModel('claude', 'sonnet', 'haiku', 'opus')).toBe('sonnet');
    });
  });

  describe('getCompletionColumn', () => {
    it('should return correct completion column for plan-agent (ready)', () => {
      expect(getCompletionColumn('plan-agent')).toBe('ready');
    });

    it('should return correct completion column for scout-agent (done)', () => {
      expect(getCompletionColumn('scout-agent')).toBe('done');
    });

    it('should return verify for code-agent and other agents', () => {
      expect(getCompletionColumn('code-agent')).toBe('verify');
      expect(getCompletionColumn('verify-agent')).toBe('verify');
      expect(getCompletionColumn('unknown-agent')).toBe('verify');
      expect(getCompletionColumn('marketing-agent')).toBe('verify');
    });

    it('should return verify for ba-agent (findings need human review)', () => {
      expect(getCompletionColumn('ba-agent')).toBe('verify');
    });
  });
});
