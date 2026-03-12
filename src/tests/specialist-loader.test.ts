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

// Use real gray-matter — it's a pure JS library that parses YAML frontmatter correctly

import {
  parseSpecialistDefinition,
  listSpecialists,
  validateSchedules,
  loadSpecialistRaw,
  getSpecialistsDir,
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

    it('should parse integrations array from frontmatter when present', () => {
      const markdown = `---
name: twitter-growth
description: Social media specialist
model: sonnet
tools:
  - Read
  - Bash
schedules:
  - { type: daily, cron: "0 0 * * *", enabled: true }
memory:
  strategy: raw
  maxEntries: 100
  retentionDays: 30
escalation:
  onFailure: alert_user
integrations:
  - { service: twitter-api, env: { API_KEY: "", API_SECRET: "" } }
  - { service: slack, env: { WEBHOOK_URL: "" } }
---

Content`;

      const result = parseSpecialistDefinition(markdown);
      expect(result.integrations).toBeDefined();
      expect(result.integrations).toHaveLength(2);
      expect(result.integrations![0].service).toBe('twitter-api');
      expect(result.integrations![0].env).toEqual({ API_KEY: '', API_SECRET: '' });
      expect(result.integrations![1].service).toBe('slack');
    });

    it('should return empty integrations array when frontmatter has no integrations field', () => {
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
      expect(result.integrations).toEqual([]);
    });

    it('should validate integration entries have required service and env fields', () => {
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
integrations:
  - { service: valid-service, env: { KEY: "" } }
  - { badfield: invalid }
---

Content`;

      const result = parseSpecialistDefinition(markdown);
      // Should only include the valid integration, skipping the malformed one
      expect(result.integrations).toHaveLength(1);
      expect(result.integrations![0].service).toBe('valid-service');
    });

    it('should ignore malformed integration entries without crashing', () => {
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
integrations:
  - not-an-object
  - 12345
---

Content`;

      // Should not throw, just return empty integrations
      const result = parseSpecialistDefinition(markdown);
      expect(result.integrations).toEqual([]);
    });

    it('should parse tools array from integration entry when present', () => {
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
integrations:
  - service: twitter-api
    env:
      API_KEY: ""
    tools:
      - twitter
---

Content`;

      const result = parseSpecialistDefinition(markdown);
      expect(result.integrations).toHaveLength(1);
      expect(result.integrations![0].tools).toEqual(['twitter']);
    });

    it('should default to empty tools array when integration has no tools field', () => {
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
integrations:
  - service: slack
    env:
      WEBHOOK_URL: ""
---

Content`;

      const result = parseSpecialistDefinition(markdown);
      expect(result.integrations).toHaveLength(1);
      expect(result.integrations![0].tools).toEqual([]);
    });
  });

  describe('twitter-growth specialist', () => {
    // These tests validate the actual twitter-growth.md content by parsing its frontmatter
    // We read the file content as a string constant and parse it with parseSpecialistDefinition

    const twitterGrowthMarkdown = (() => {
      // Use real fs to read the actual file (not the mocked version)
      const realFs = require('node:fs');
      const realPath = require('node:path');
      const filePath = realPath.join(__dirname, '..', 'agents', 'cron', 'twitter-growth.md');
      return realFs.readFileSync(filePath, 'utf-8');
    })();

    it('should parse twitter-growth.md frontmatter with all required fields (name, description, model, tools, schedules, memory, escalation, integrations, promptTemplates)', () => {
      const result = parseSpecialistDefinition(twitterGrowthMarkdown);

      expect(result.name).toBe('twitter-growth');
      expect(result.description).toBeTruthy();
      expect(result.model).toBe('sonnet');
      expect(result.tools).toContain('WebSearch');
      expect(result.tools).toContain('WebFetch');
      expect(result.schedules).toHaveLength(3);
      expect(result.schedules.map(s => s.type)).toEqual(['heartbeat', 'daily', 'weekly']);
      expect(result.memory.strategy).toBe('distill_daily');
      expect(result.memory.maxEntries).toBe(500);
      expect(result.memory.retentionDays).toBe(90);
      expect(result.escalation.onFailure).toBe('notify_slack');
      expect(result.escalation.onPattern).toBe('reduce_frequency');
      expect(result.integrations).toBeDefined();
      expect(result.integrations!.length).toBeGreaterThanOrEqual(1);
      expect(result.promptTemplates).toBeDefined();
      expect(Object.keys(result.promptTemplates!)).toContain('heartbeat');
      expect(Object.keys(result.promptTemplates!)).toContain('daily');
      expect(Object.keys(result.promptTemplates!)).toContain('weekly');
    });

    it('should contain heartbeat, daily, and weekly prompt templates with specific strategy content', () => {
      const result = parseSpecialistDefinition(twitterGrowthMarkdown);
      const templates = result.promptTemplates!;

      // Heartbeat should reference tweet mix, response time targets, crisis detection
      expect(templates.heartbeat).toMatch(/tweet mix|engagement/i);
      expect(templates.heartbeat).toMatch(/crisis|reputation/i);

      // Daily should reference thread strategy, performance targets, engagement rate
      expect(templates.daily).toMatch(/thread/i);
      expect(templates.daily).toMatch(/engagement rate|2\.5%/i);

      // Weekly should reference Twitter Spaces, follower growth, KPI
      expect(templates.weekly).toMatch(/Twitter Spaces|Spaces/i);
      expect(templates.weekly).toMatch(/follower growth|10%/i);
    });

    it('should include tools field in parsed ServiceIntegration for twitter-growth.md', () => {
      const result = parseSpecialistDefinition(twitterGrowthMarkdown);
      const twitterIntegration = result.integrations!.find(i => i.service === 'twitter-api');
      expect(twitterIntegration).toBeDefined();
      expect(twitterIntegration!.tools).toEqual(['twitter']);
    });

    it('should include TWITTER_ACCESS_TOKEN and TWITTER_ACCESS_TOKEN_SECRET in the twitter-api integration env map for twitter-growth.md', () => {
      const result = parseSpecialistDefinition(twitterGrowthMarkdown);
      const twitterIntegration = result.integrations!.find(i => i.service === 'twitter-api');

      expect(twitterIntegration).toBeDefined();
      expect(twitterIntegration!.env).toHaveProperty('TWITTER_API_KEY');
      expect(twitterIntegration!.env).toHaveProperty('TWITTER_API_SECRET');
      expect(twitterIntegration!.env).toHaveProperty('TWITTER_BEARER_TOKEN');
      expect(twitterIntegration!.env).toHaveProperty('TWITTER_ACCESS_TOKEN');
      expect(twitterIntegration!.env).toHaveProperty('TWITTER_ACCESS_TOKEN_SECRET');
    });
  });

  describe('getSpecialistsDir', () => {
    it('should resolve to src/agents/cron/ in development when app.getAppPath() is available', () => {
      // In test environment, require('electron') throws, so we verify
      // the function follows the same pattern as getAgentsDir in agent-loader.ts.
      // The dev path (app.getAppPath() + 'src/agents/cron') is tested via E2E.
      // Here we verify the fallback produces a valid path ending in agents/cron.
      const result = getSpecialistsDir();
      expect(result).toMatch(/agents[/\\]cron$/);
    });

    it('should resolve to resources/agents/cron/ in production when process.resourcesPath exists', async () => {
      const fs = await import('node:fs');
      const originalResourcesPath = process.resourcesPath;
      Object.defineProperty(process, 'resourcesPath', { value: '/app/resources', writable: true, configurable: true });

      vi.mocked(fs.existsSync).mockImplementation((p) => p === '/app/resources/agents/cron');

      expect(getSpecialistsDir()).toBe('/app/resources/agents/cron');

      Object.defineProperty(process, 'resourcesPath', { value: originalResourcesPath, writable: true, configurable: true });
    });

    it('should fall back to __dirname-relative path in test environment when Electron is not available', async () => {
      const fs = await import('node:fs');
      const originalResourcesPath = process.resourcesPath;
      Object.defineProperty(process, 'resourcesPath', { value: '', writable: true, configurable: true });

      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = getSpecialistsDir();
      expect(result).toMatch(/agents[/\\]cron$/);

      Object.defineProperty(process, 'resourcesPath', { value: originalResourcesPath, writable: true, configurable: true });
    });

    it('should return cron directory path that contains .md files when pointed at real src/agents/cron', () => {
      const realFs = require('node:fs');
      const realPath = require('node:path');
      const cronDir = realPath.join(__dirname, '..', 'agents', 'cron');

      const files = realFs.readdirSync(cronDir) as string[];
      const mdFiles = files.filter((f: string) => f.endsWith('.md') && !f.startsWith('_'));
      expect(mdFiles.length).toBeGreaterThan(0);
    });
  });

  describe('loadSpecialistRaw', () => {
    it('should return raw markdown content for an existing specialist', async () => {
      const fs = await import('node:fs');
      const rawContent = `---\nname: test-agent\ndescription: Test\nmodel: haiku\n---\n\n# Test Agent`;
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(rawContent);

      const result = loadSpecialistRaw('test-agent');
      expect(result).toBe(rawContent);
      expect(fs.readFileSync).toHaveBeenCalled();
    });

    it('should throw when specialist file does not exist', async () => {
      const fs = await import('node:fs');
      vi.mocked(fs.existsSync).mockReturnValue(false);

      expect(() => loadSpecialistRaw('nonexistent')).toThrow();
    });
  });
});
