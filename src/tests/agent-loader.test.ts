// src/tests/agent-loader.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseAgentDefinition, loadAgentDefinition, getAgentsDir } from '@main/services/agent-loader';

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

    it('should parse optional timeout field', () => {
      const markdown = `---
name: code-agent
description: Implements code
model: sonnet
tools:
  - Read
timeout: 60
---

# Code Agent`;

      const result = parseAgentDefinition(markdown);
      expect(result.timeout).toBe(60);
    });

    it('should ignore timeout when not present', () => {
      const markdown = `---
name: plan-agent
description: Plans work
model: opus
tools:
  - Read
---

# Plan Agent`;

      const result = parseAgentDefinition(markdown);
      expect(result.timeout).toBeUndefined();
    });

    it('should ignore zero or negative timeout', () => {
      const zeroMarkdown = `---
name: test-agent
description: Test
model: haiku
tools:
  - Read
timeout: 0
---

Content`;

      expect(parseAgentDefinition(zeroMarkdown).timeout).toBeUndefined();

      const negativeMarkdown = `---
name: test-agent
description: Test
model: haiku
tools:
  - Read
timeout: -5
---

Content`;

      expect(parseAgentDefinition(negativeMarkdown).timeout).toBeUndefined();
    });

    it('should parse code-agent definition with Bash/Write/Edit tools', () => {
      const markdown = `---
name: code-agent
description: Autonomously implements code changes
model: sonnet
tools:
  - Read
  - Glob
  - Grep
  - Bash
  - Write
  - Edit
  - WebSearch
  - WebFetch
---

# Code Agent

You are the Code Agent...`;

      const result = parseAgentDefinition(markdown);

      expect(result).toEqual({
        name: 'code-agent',
        description: 'Autonomously implements code changes',
        model: 'sonnet',
        tools: ['Read', 'Glob', 'Grep', 'Bash', 'Write', 'Edit', 'WebSearch', 'WebFetch'],
        systemPrompt: '# Code Agent\n\nYou are the Code Agent...',
      });
    });
    it('should parse ba-agent definition with read-only tools and order field', () => {
      const markdown = `---
name: ba-agent
description: Finds business logic bugs by analyzing state lifecycles, API contracts, and domain invariants
model: opus
timeout: 30
order: 8
tools:
  - Read
  - Glob
  - Grep
  - Bash
---

# BA Agent

You are the BA Agent...`;

      const result = parseAgentDefinition(markdown);

      expect(result.name).toBe('ba-agent');
      expect(result.description).toBe('Finds business logic bugs by analyzing state lifecycles, API contracts, and domain invariants');
      expect(result.model).toBe('opus');
      expect(result.timeout).toBe(30);
      expect(result.order).toBe(8);
      expect(result.tools).toEqual(['Read', 'Glob', 'Grep', 'Bash']);
      expect(result.systemPrompt).toContain('# BA Agent');
    });
  });
});
