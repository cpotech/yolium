// src/tests/specialist-loader.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock node:fs before importing the module
vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(() => ''),
  readdirSync: vi.fn(() => []),
}));

vi.mock('node:os', () => ({
  homedir: vi.fn(() => '/home/test'),
}));

// Mock node-cron validate (default export with validate method)
vi.mock('node-cron', () => {
  const validateFn = vi.fn((expr: string) => {
    if (!expr || typeof expr !== 'string') return false;
    const parts = expr.trim().split(/\s+/);
    return parts.length >= 5 && parts.length <= 6;
  });
  return { default: { validate: validateFn }, validate: validateFn };
});

// Mock gray-matter
vi.mock('gray-matter', () => {
  return {
    default: vi.fn((content: string) => {
      // Simple YAML frontmatter parser for tests
      const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
      if (!match) return { data: {}, content };

      const yamlStr = match[1];
      const bodyContent = match[2];
      const data: Record<string, unknown> = {};

      // Parse simple YAML fields
      const lines = yamlStr.split('\n');
      let currentKey = '';
      let currentArray: string[] | null = null;
      let currentObject: Record<string, unknown> | null = null;

      for (const line of lines) {
        const keyMatch = line.match(/^(\w+):\s*(.*)$/);
        if (keyMatch) {
          if (currentArray && currentKey) {
            data[currentKey] = currentArray;
            currentArray = null;
          }
          if (currentObject && currentKey) {
            data[currentKey] = currentObject;
            currentObject = null;
          }
          currentKey = keyMatch[1];
          const value = keyMatch[2].trim();
          if (value === '' || value === undefined) {
            // Could be start of array or object
          } else if (value === 'true') {
            data[currentKey] = true;
          } else if (value === 'false') {
            data[currentKey] = false;
          } else if (!isNaN(Number(value))) {
            data[currentKey] = Number(value);
          } else {
            data[currentKey] = value;
          }
        } else if (line.match(/^\s+-\s+(.*)$/)) {
          if (!currentArray) currentArray = [];
          const arrayMatch = line.match(/^\s+-\s+(.*)$/);
          if (arrayMatch) currentArray.push(arrayMatch[1]);
        } else if (line.match(/^\s+(\w+):\s*(.*)$/)) {
          if (!currentObject) currentObject = {};
          const objMatch = line.match(/^\s+(\w+):\s*(.*)$/);
          if (objMatch) {
            const val = objMatch[2].trim();
            if (val === 'true') currentObject[objMatch[1]] = true;
            else if (val === 'false') currentObject[objMatch[1]] = false;
            else if (!isNaN(Number(val)) && val !== '') currentObject[objMatch[1]] = Number(val);
            else currentObject[objMatch[1]] = val;
          }
        }
      }
      if (currentArray && currentKey) data[currentKey] = currentArray;
      if (currentObject && currentKey) data[currentKey] = currentObject;

      return { data, content: bodyContent.trim() };
    }),
  };
});

import {
  parseSpecialistDefinition,
  listSpecialists,
  validateSchedules,
} from '@main/services/specialist-loader';

describe('specialist-loader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('parseSpecialistDefinition', () => {
    it('should parse valid specialist markdown with schedule config', () => {
      const markdown = `---
name: security-monitor
description: Scans for security issues
model: haiku
tools:
  - Read
  - Grep
  - Bash
schedules:
  - { type: heartbeat, cron: "*/30 * * * *", enabled: true }
memory:
  strategy: distill_daily
  maxEntries: 300
  retentionDays: 90
escalation:
  onFailure: alert_user
  onPattern: reduce_frequency
---

# Security Monitor

You are a security monitoring specialist.`;

      // Use the actual parsing with our mock
      const result = parseSpecialistDefinition(markdown);

      expect(result.name).toBe('security-monitor');
      expect(result.description).toBe('Scans for security issues');
      expect(result.model).toBe('haiku');
      expect(result.tools).toEqual(['Read', 'Grep', 'Bash']);
      expect(result.systemPrompt).toContain('Security Monitor');
    });

    it('should extract prompt templates from frontmatter', () => {
      const markdown = `---
name: test-specialist
description: Test specialist
model: sonnet
tools:
  - Read
schedules:
  - { type: daily, cron: "0 0 * * *", enabled: true }
memory:
  strategy: distill_daily
  maxEntries: 100
  retentionDays: 30
escalation:
  onFailure: alert_user
promptTemplates:
  daily: You are a daily specialist. Review the day.
  weekly: You are a weekly specialist. Audit the week.
---

# Test Specialist`;

      const result = parseSpecialistDefinition(markdown);
      expect(result.promptTemplates).toBeDefined();
      expect(typeof result.promptTemplates).toBe('object');
    });

    it('should reject specialist missing required schedules field', () => {
      const markdown = `---
name: bad-specialist
description: Missing schedules
model: haiku
tools:
  - Read
---

# Bad Specialist`;

      expect(() => parseSpecialistDefinition(markdown)).toThrow();
    });

    it('should validate cron expressions and reject invalid ones', () => {
      // Valid cron expression
      expect(validateSchedules([{ type: 'heartbeat', cron: '*/30 * * * *', enabled: true }])).toBe(true);

      // Invalid cron expression (too few fields)
      expect(validateSchedules([{ type: 'heartbeat', cron: 'invalid', enabled: true }])).toBe(false);
    });

    it('should list all specialist files from the cron directory', async () => {
      const fs = await import('node:fs');
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync as unknown as () => string[]).mockReturnValue([
        'security-monitor.md',
        'codebase-health.md',
        'twitter-growth.md',
        '_protocol.md',
        'README.md',
      ]);

      const specialists = listSpecialists();
      expect(specialists).toEqual(['security-monitor', 'codebase-health', 'twitter-growth']);
    });

    it('should handle empty specialists directory gracefully', async () => {
      const fs = await import('node:fs');
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync as unknown as () => string[]).mockReturnValue([]);

      const specialists = listSpecialists();
      expect(specialists).toEqual([]);
    });

    it('should parse memory strategy configuration', () => {
      const markdown = `---
name: test-specialist
description: Test
model: haiku
tools:
  - Read
schedules:
  - { type: daily, cron: "0 0 * * *", enabled: true }
memory:
  strategy: distill_daily
  maxEntries: 500
  retentionDays: 90
escalation:
  onFailure: alert_user
---

Content`;

      const result = parseSpecialistDefinition(markdown);
      expect(result.memory.strategy).toBe('distill_daily');
      expect(result.memory.maxEntries).toBe(500);
      expect(result.memory.retentionDays).toBe(90);
    });

    it('should parse escalation configuration', () => {
      const markdown = `---
name: test-specialist
description: Test
model: haiku
tools:
  - Read
schedules:
  - { type: daily, cron: "0 0 * * *", enabled: true }
memory:
  strategy: raw
  maxEntries: 100
  retentionDays: 30
escalation:
  onFailure: notify_slack
  onPattern: pause
---

Content`;

      const result = parseSpecialistDefinition(markdown);
      expect(result.escalation.onFailure).toBe('notify_slack');
      expect(result.escalation.onPattern).toBe('pause');
    });

    it('should fall back to default timeout when not specified', () => {
      const markdown = `---
name: test-specialist
description: Test
model: haiku
tools:
  - Read
schedules:
  - { type: daily, cron: "0 0 * * *", enabled: true }
memory:
  strategy: raw
  maxEntries: 100
  retentionDays: 30
escalation:
  onFailure: alert_user
---

Content`;

      const result = parseSpecialistDefinition(markdown);
      expect(result.timeout).toBeUndefined();
    });

    it('should reject unknown memory strategies', () => {
      const markdown = `---
name: test-specialist
description: Test
model: haiku
tools:
  - Read
schedules:
  - { type: daily, cron: "0 0 * * *", enabled: true }
memory:
  strategy: unknown_strategy
  maxEntries: 100
  retentionDays: 30
escalation:
  onFailure: alert_user
---

Content`;

      expect(() => parseSpecialistDefinition(markdown)).toThrow();
    });
  });
});
