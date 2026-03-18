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

import * as path from 'node:path';
import {
  parseSpecialistDefinition,
  listSpecialists,
  validateSchedules,
  loadSpecialistRaw,
  loadSpecialist,
  getSpecialistsDir,
  getCustomSpecialistsDir,
} from '@main/services/specialist-loader';

const blueskyMarkdown = `---
name: bluesky-privacybooks
description: Grow a Bluesky account focused on UK tax and small business content
model: sonnet
tools:
  - Read
  - WebSearch
  - WebFetch
schedules:
  - type: heartbeat
    cron: "*/20 * * * *"
    enabled: false
  - type: daily
    cron: "0 8 * * *"
    enabled: false
  - type: weekly
    cron: "0 9 * * 1"
    enabled: false
memory:
  strategy: distill_daily
  maxEntries: 500
  retentionDays: 90
escalation:
  onFailure: notify_slack
  onPattern: reduce_frequency
integrations:
  - service: bluesky-api
    env:
      BLUESKY_IDENTIFIER: ""
      BLUESKY_APP_PASSWORD: ""
    tools:
      - bluesky
promptTemplates:
  heartbeat: |
    Review original posts, replies, and engagement. Use search_posts and get_notifications.
  daily: |
    Review strategy, search queries, HMRC updates, tax themes, and content mix.
  weekly: |
    Weekly audit of engagement, follower growth, and KPI trends.
---

# Bluesky Privacybooks Specialist

You are a specialist agent for PrivacyBooks on Bluesky.`;

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

  describe('cron-schedule-type consistency', () => {
    it('should warn when a daily schedule type has a cron expression that fires more than once per day', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // */15 * * * * fires every 15 minutes — not daily
      const markdown = `---
name: test-specialist
description: Test
model: haiku
tools:
  - Read
schedules:
  - type: daily
    cron: "*/15 * * * *"
    enabled: true
memory:
  strategy: raw
  maxEntries: 100
  retentionDays: 30
escalation:
  onFailure: alert_user
---

Content`;

      const result = parseSpecialistDefinition(markdown);
      // Should still parse successfully
      expect(result.name).toBe('test-specialist');
      // But should have warned about the mismatch
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('daily'),
      );

      consoleWarnSpy.mockRestore();
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

      // Heartbeat should reference reply workflow, mentions, search
      expect(templates.heartbeat).toMatch(/reply|mentions/i);
      expect(templates.heartbeat).toMatch(/search_tweets|crisis|reputation/i);

      // Daily should reference reply strategy, search queries, reply categories
      expect(templates.daily).toMatch(/reply/i);
      expect(templates.daily).toMatch(/search queries|reply categories/i);

      // Weekly should reference reply engagement, conversation participation, KPI
      expect(templates.weekly).toMatch(/reply|engagement/i);
      expect(templates.weekly).toMatch(/conversation participation|follow-back/i);
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

    it('should warn when an integration env map contains a key named "tools" (likely YAML indentation error)', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const markdown = `---
name: test-specialist
description: Test specialist
model: haiku
tools:
  - Read
schedules:
  - { type: heartbeat, cron: "*/30 * * * *", enabled: true }
integrations:
  - service: some-api
    env:
      API_KEY: some-key
      tools:
        - twitter
---

System prompt here.`;

      parseSpecialistDefinition(markdown);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('YAML indentation error')
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('"tools"')
      );
      warnSpy.mockRestore();
    });

    it('should warn when an integration env map contains a key named "service" (likely YAML indentation error)', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const markdown = `---
name: test-specialist
description: Test specialist
model: haiku
tools:
  - Read
schedules:
  - { type: heartbeat, cron: "*/30 * * * *", enabled: true }
integrations:
  - service: some-api
    env:
      API_KEY: some-key
      service: nested-service
---

System prompt here.`;

      parseSpecialistDefinition(markdown);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('YAML indentation error')
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('"service"')
      );
      warnSpy.mockRestore();
    });

    it('should not warn when integration env map contains only legitimate credential keys', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const markdown = `---
name: test-specialist
description: Test specialist
model: haiku
tools:
  - Read
schedules:
  - { type: heartbeat, cron: "*/30 * * * *", enabled: true }
integrations:
  - service: some-api
    env:
      API_KEY: some-key
      WEBHOOK_URL: https://example.com
    tools:
      - twitter
---

System prompt here.`;

      parseSpecialistDefinition(markdown);

      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe('bluesky-privacybooks specialist', () => {
    it('should parse bluesky-privacybooks.md frontmatter with all required fields (name, description, model, tools, schedules, memory, escalation, integrations, promptTemplates)', () => {
      const result = parseSpecialistDefinition(blueskyMarkdown);

      expect(result.name).toBe('bluesky-privacybooks');
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

    it('should contain heartbeat, daily, and weekly prompt templates with Bluesky-specific content', () => {
      const result = parseSpecialistDefinition(blueskyMarkdown);
      const templates = result.promptTemplates!;

      // Heartbeat should reference original posts, replies, engagement
      expect(templates.heartbeat).toMatch(/original posts|replies|engagement/i);
      expect(templates.heartbeat).toMatch(/search_posts|get_notifications/i);

      // Daily should reference strategy, search queries, content mix
      expect(templates.daily).toMatch(/strategy|search queries/i);
      expect(templates.daily).toMatch(/HMRC|tax|content mix/i);

      // Weekly should reference audit, engagement, KPI
      expect(templates.weekly).toMatch(/audit|engagement/i);
      expect(templates.weekly).toMatch(/follower growth|KPI/i);
    });

    it('should include tools field in parsed ServiceIntegration with value [\'bluesky\']', () => {
      const result = parseSpecialistDefinition(blueskyMarkdown);
      const blueskyIntegration = result.integrations!.find(i => i.service === 'bluesky-api');
      expect(blueskyIntegration).toBeDefined();
      expect(blueskyIntegration!.tools).toEqual(['bluesky']);
    });

    it('should include BLUESKY_IDENTIFIER and BLUESKY_APP_PASSWORD in the bluesky-api integration env map', () => {
      const result = parseSpecialistDefinition(blueskyMarkdown);
      const blueskyIntegration = result.integrations!.find(i => i.service === 'bluesky-api');

      expect(blueskyIntegration).toBeDefined();
      expect(blueskyIntegration!.env).toHaveProperty('BLUESKY_IDENTIFIER');
      expect(blueskyIntegration!.env).toHaveProperty('BLUESKY_APP_PASSWORD');
    });

    it('should have 3 schedules: heartbeat (*/20), daily, and weekly', () => {
      const result = parseSpecialistDefinition(blueskyMarkdown);

      expect(result.schedules).toHaveLength(3);
      expect(result.schedules[0].type).toBe('heartbeat');
      expect(result.schedules[0].cron).toBe('*/20 * * * *');
      expect(result.schedules[1].type).toBe('daily');
      expect(result.schedules[2].type).toBe('weekly');
    });

    it('should have all schedules disabled by default', () => {
      const result = parseSpecialistDefinition(blueskyMarkdown);

      expect(result.schedules[0].enabled).toBe(false);
      expect(result.schedules[1].enabled).toBe(false);
      expect(result.schedules[2].enabled).toBe(false);
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

      const expectedPath = path.join('/app/resources', 'agents', 'cron');
      vi.mocked(fs.existsSync).mockImplementation((p) => p === expectedPath);

      expect(getSpecialistsDir()).toBe(expectedPath);

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

    it('should resolve to the repo src/agents/cron path when running from a standalone .vite build', async () => {
      const fs = await import('node:fs');
      const originalResourcesPath = process.resourcesPath;
      Object.defineProperty(process, 'resourcesPath', { value: '', writable: true, configurable: true });

      const repoCronPath = path.join(process.cwd(), 'src', 'agents', 'cron');
      vi.mocked(fs.existsSync).mockImplementation((candidate) => candidate === repoCronPath);

      expect(getSpecialistsDir()).toBe(repoCronPath);

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

  describe('dual-directory loading', () => {
    const validMarkdown = `---
name: custom-agent
description: A custom agent
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

# Custom Agent`;

    it('should return custom specialists dir as ~/.yolium/agents/cron/custom/', () => {
      const result = getCustomSpecialistsDir();
      expect(result).toBe(path.join('/home/test', '.yolium', 'agents', 'cron', 'custom'));
    });

    it('should list specialists from both default and custom directories', async () => {
      const fs = await import('node:fs');
      const defaultDir = getSpecialistsDir();
      const customDir = getCustomSpecialistsDir();

      vi.mocked(fs.existsSync).mockImplementation((p) => {
        return p === defaultDir || p === customDir;
      });
      vi.mocked(fs.readdirSync as unknown as (p: string) => string[]).mockImplementation((p) => {
        if (p === defaultDir) return ['security-monitor.md', 'codebase-health.md'];
        if (p === customDir) return ['my-custom-agent.md'];
        return [];
      });

      const specialists = listSpecialists();
      expect(specialists).toContain('security-monitor');
      expect(specialists).toContain('codebase-health');
      expect(specialists).toContain('my-custom-agent');
    });

    it('should set source to default for specialists in the default directory', async () => {
      const fs = await import('node:fs');
      const defaultDir = getSpecialistsDir();

      vi.mocked(fs.existsSync).mockImplementation((p) => {
        return p === path.join(defaultDir, 'security-monitor.md') || p === defaultDir;
      });
      vi.mocked(fs.readFileSync).mockReturnValue(validMarkdown.replace('custom-agent', 'security-monitor'));

      const result = loadSpecialist('security-monitor');
      expect(result.source).toBe('default');
    });

    it('should set source to custom for specialists in the custom directory', async () => {
      const fs = await import('node:fs');
      const defaultDir = getSpecialistsDir();
      const customDir = getCustomSpecialistsDir();

      vi.mocked(fs.existsSync).mockImplementation((p) => {
        if (p === path.join(defaultDir, 'my-custom.md')) return false;
        if (p === path.join(customDir, 'my-custom.md')) return true;
        return false;
      });
      vi.mocked(fs.readFileSync).mockReturnValue(validMarkdown.replace('custom-agent', 'my-custom'));

      const result = loadSpecialist('my-custom');
      expect(result.source).toBe('custom');
    });

    it('should prefer default over custom when same name exists in both directories', async () => {
      const fs = await import('node:fs');
      const defaultDir = getSpecialistsDir();
      const customDir = getCustomSpecialistsDir();

      vi.mocked(fs.existsSync).mockImplementation((p) => {
        return p === defaultDir || p === customDir;
      });
      vi.mocked(fs.readdirSync as unknown as (p: string) => string[]).mockImplementation((p) => {
        if (p === defaultDir) return ['shared-agent.md'];
        if (p === customDir) return ['shared-agent.md', 'unique-custom.md'];
        return [];
      });

      const specialists = listSpecialists();
      // shared-agent should appear only once (from default), plus unique-custom
      const sharedCount = specialists.filter(s => s === 'shared-agent').length;
      expect(sharedCount).toBe(1);
      expect(specialists).toContain('unique-custom');
    });

    it('should load specialist from custom dir when not found in default dir', async () => {
      const fs = await import('node:fs');
      const defaultDir = getSpecialistsDir();
      const customDir = getCustomSpecialistsDir();

      vi.mocked(fs.existsSync).mockImplementation((p) => {
        if (p === path.join(defaultDir, 'custom-only.md')) return false;
        if (p === path.join(customDir, 'custom-only.md')) return true;
        return false;
      });
      vi.mocked(fs.readFileSync).mockReturnValue(validMarkdown.replace('custom-agent', 'custom-only'));

      const result = loadSpecialist('custom-only');
      expect(result.name).toBe('custom-only');
      expect(result.source).toBe('custom');
    });

    it('should load raw specialist from custom dir when not found in default dir', async () => {
      const fs = await import('node:fs');
      const defaultDir = getSpecialistsDir();
      const customDir = getCustomSpecialistsDir();

      vi.mocked(fs.existsSync).mockImplementation((p) => {
        if (p === path.join(defaultDir, 'custom-only.md')) return false;
        if (p === path.join(customDir, 'custom-only.md')) return true;
        return false;
      });
      vi.mocked(fs.readFileSync).mockReturnValue(validMarkdown);

      const result = loadSpecialistRaw('custom-only');
      expect(result).toBe(validMarkdown);
    });
  });
});
