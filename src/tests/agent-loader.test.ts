// src/tests/agent-loader.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseAgentDefinition, loadAgentDefinition, getAgentsDir } from '../lib/agent-loader';

describe('agent-loader', () => {
  describe('getAgentsDir', () => {
    it('should return a valid path', () => {
      const dir = getAgentsDir();
      expect(typeof dir).toBe('string');
      expect(dir.length).toBeGreaterThan(0);
    });
  });

  describe('parseAgentDefinition', () => {
    it('should parse valid agent markdown with frontmatter', () => {
      const markdown = `---
name: plan-agent
description: Decomposes goals into work items
model: opus
tools:
  - Read
  - Glob
  - Grep
---

# Plan Agent

You are the Plan Agent...`;

      const result = parseAgentDefinition(markdown);

      expect(result).toEqual({
        name: 'plan-agent',
        description: 'Decomposes goals into work items',
        model: 'opus',
        tools: ['Read', 'Glob', 'Grep'],
        systemPrompt: '# Plan Agent\n\nYou are the Plan Agent...',
      });
    });

    it('should throw on missing required fields', () => {
      const markdown = `---
name: test-agent
---

Content`;

      expect(() => parseAgentDefinition(markdown)).toThrow('missing required fields');
    });

    it('should throw on invalid model', () => {
      const markdown = `---
name: test-agent
description: Test
model: gpt-4
tools: []
---

Content`;

      expect(() => parseAgentDefinition(markdown)).toThrow('Invalid model');
    });
  });
});
