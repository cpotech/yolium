// src/tests/AddSpecialistDialog.test.ts
import { describe, it, expect } from 'vitest';
import {
  serializeGuidedFormToMarkdown,
  parseMarkdownToGuidedForm,
  sanitizeSpecialistName,
  tryParseIntegrations,
} from '@renderer/components/schedule/AddSpecialistDialog';

describe('sanitizeSpecialistName', () => {
  it('should lowercase and replace spaces with hyphens', () => {
    expect(sanitizeSpecialistName('My Specialist Name')).toBe('my-specialist-name');
  });

  it('should strip non-alphanumeric characters', () => {
    expect(sanitizeSpecialistName('test@speci!al#ist')).toBe('testspecialist');
  });

  it('should collapse multiple hyphens', () => {
    expect(sanitizeSpecialistName('test---name')).toBe('test-name');
    expect(sanitizeSpecialistName('a - - b')).toBe('a-b');
  });
});

describe('serializeGuidedFormToMarkdown', () => {
  it('should include all form fields in valid YAML frontmatter', () => {
    const form = {
      name: 'test-agent',
      description: 'A test agent',
      model: 'sonnet',
      tools: ['Read', 'Write'],
      schedules: [{ type: 'daily', cron: '0 0 * * *', enabled: true }],
      memory: { strategy: 'distill_daily' as const, maxEntries: 300, retentionDays: 90 },
      escalation: { onFailure: 'alert_user' as const, onPattern: 'reduce_frequency' as const },
      promptTemplates: {},
      integrations: [],
      systemPrompt: '# Test\n\nYou are a test agent.',
    };

    const md = serializeGuidedFormToMarkdown(form);

    expect(md).toMatch(/^---\n/);
    expect(md).toMatch(/\n---\n/);
    expect(md).toContain('name: test-agent');
    expect(md).toContain('description: A test agent');
    expect(md).toContain('model: sonnet');
    expect(md).toContain('  - Read');
    expect(md).toContain('  - Write');
    expect(md).toContain('  - type: daily');
    expect(md).toContain('    cron: "0 0 * * *"');
    expect(md).toContain('  strategy: distill_daily');
    expect(md).toContain('  maxEntries: 300');
    expect(md).toContain('  retentionDays: 90');
    expect(md).toContain('  onFailure: alert_user');
    expect(md).toContain('  onPattern: reduce_frequency');
    expect(md).toContain('# Test');
    expect(md).toContain('You are a test agent.');
  });
});

describe('parseMarkdownToGuidedForm', () => {
  it('should round-trip with serializeGuidedFormToMarkdown', () => {
    const original = {
      name: 'round-trip',
      description: 'Round trip test',
      model: 'haiku',
      tools: ['Read', 'Bash', 'Grep'],
      schedules: [
        { type: 'daily', cron: '0 8 * * *', enabled: true },
        { type: 'weekly', cron: '0 9 * * 1', enabled: false },
      ],
      memory: { strategy: 'distill_weekly' as const, maxEntries: 100, retentionDays: 30 },
      escalation: { onFailure: 'pause' as const, onPattern: undefined },
      promptTemplates: {},
      integrations: [
        { service: 'slack', env: { SLACK_TOKEN: 'tok123' } },
      ],
      systemPrompt: '# Round Trip\n\nSystem prompt here.',
    };

    const serialized = serializeGuidedFormToMarkdown(original);
    const parsed = parseMarkdownToGuidedForm(serialized);

    expect(parsed.name).toBe(original.name);
    expect(parsed.description).toBe(original.description);
    expect(parsed.model).toBe(original.model);
    expect(parsed.tools).toEqual(original.tools);
    expect(parsed.schedules).toHaveLength(2);
    expect(parsed.schedules[0].type).toBe('daily');
    expect(parsed.schedules[0].cron).toBe('0 8 * * *');
    expect(parsed.schedules[1].type).toBe('weekly');
    expect(parsed.memory.strategy).toBe('distill_weekly');
    expect(parsed.memory.maxEntries).toBe(100);
    expect(parsed.integrations).toHaveLength(1);
    expect(parsed.integrations[0].service).toBe('slack');
    expect(parsed.systemPrompt).toContain('Round Trip');
  });
});

describe('tryParseIntegrations', () => {
  it('should parse service blocks from frontmatter', () => {
    const markdown = `---
name: test
description: test
model: sonnet
tools:
  - Read
schedules:
  - type: daily
    cron: "0 0 * * *"
    enabled: true
integrations:
  - service: github
    env:
      GITHUB_TOKEN: ""
      GITHUB_ORG: ""
  - service: slack
    env:
      SLACK_WEBHOOK: ""
---

# Test`;

    const result = tryParseIntegrations(markdown);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('github');
    expect(result[0].credentials).toHaveLength(2);
    expect(result[0].credentials[0].key).toBe('GITHUB_TOKEN');
    expect(result[0].credentials[1].key).toBe('GITHUB_ORG');
    expect(result[1].name).toBe('slack');
    expect(result[1].credentials).toHaveLength(1);
    expect(result[1].credentials[0].key).toBe('SLACK_WEBHOOK');
  });

  it('should return empty array for markdown without integrations', () => {
    const markdown = `---
name: test
description: test
model: sonnet
tools:
  - Read
schedules:
  - type: daily
    cron: "0 0 * * *"
    enabled: true
---

# Test`;

    const result = tryParseIntegrations(markdown);
    expect(result).toEqual([]);
  });
});
