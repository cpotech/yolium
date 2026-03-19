// src/tests/email-scout-specialist.test.ts
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

// Mock node-cron validate
vi.mock('node-cron', () => {
  const validateFn = vi.fn((expr: string) => {
    if (!expr || typeof expr !== 'string') return false;
    const parts = expr.trim().split(/\s+/);
    return parts.length >= 5 && parts.length <= 6;
  });
  return { default: { validate: validateFn }, validate: validateFn };
});

import { parseSpecialistDefinition } from '@main/services/specialist-loader';

describe('email-scout specialist', () => {
  const emailScoutMarkdown = (() => {
    const realFs = require('node:fs');
    const realPath = require('node:path');
    const filePath = realPath.join(__dirname, '..', 'agents', 'cron', 'email-scout.md');
    return realFs.readFileSync(filePath, 'utf-8');
  })();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should parse email-scout.md frontmatter without errors', () => {
    expect(() => parseSpecialistDefinition(emailScoutMarkdown)).not.toThrow();
  });

  it('should have name "email-scout"', () => {
    const result = parseSpecialistDefinition(emailScoutMarkdown);
    expect(result.name).toBe('email-scout');
  });

  it('should use model "sonnet"', () => {
    const result = parseSpecialistDefinition(emailScoutMarkdown);
    expect(result.model).toBe('sonnet');
  });

  it('should declare exactly 3 schedules (heartbeat, daily, weekly)', () => {
    const result = parseSpecialistDefinition(emailScoutMarkdown);
    expect(result.schedules).toHaveLength(3);
    expect(result.schedules.map(s => s.type)).toEqual(['heartbeat', 'daily', 'weekly']);
  });

  it('should have all schedules disabled by default', () => {
    const result = parseSpecialistDefinition(emailScoutMarkdown);
    expect(result.schedules[0].enabled).toBe(false);
    expect(result.schedules[1].enabled).toBe(false);
    expect(result.schedules[2].enabled).toBe(false);
  });

  it('should have valid cron expressions for all schedules', () => {
    const result = parseSpecialistDefinition(emailScoutMarkdown);
    for (const schedule of result.schedules) {
      const parts = schedule.cron.trim().split(/\s+/);
      expect(parts.length).toBeGreaterThanOrEqual(5);
    }
  });

  it('should declare email-imap-smtp integration with all required env keys', () => {
    const result = parseSpecialistDefinition(emailScoutMarkdown);
    const emailIntegration = result.integrations!.find(i => i.service === 'email-imap-smtp');
    expect(emailIntegration).toBeDefined();

    const expectedKeys = [
      'EMAIL_IMAP_HOST',
      'EMAIL_IMAP_PORT',
      'EMAIL_IMAP_USER',
      'EMAIL_IMAP_PASSWORD',
      'EMAIL_SMTP_HOST',
      'EMAIL_SMTP_PORT',
      'EMAIL_SMTP_USER',
      'EMAIL_SMTP_PASSWORD',
      'EMAIL_FROM_ADDRESS',
      'EMAIL_FROM_NAME',
    ];
    for (const key of expectedKeys) {
      expect(emailIntegration!.env).toHaveProperty(key);
    }
  });

  it('should declare "email" in integration tools', () => {
    const result = parseSpecialistDefinition(emailScoutMarkdown);
    const emailIntegration = result.integrations!.find(i => i.service === 'email-imap-smtp');
    expect(emailIntegration).toBeDefined();
    expect(emailIntegration!.tools).toEqual(['email']);
  });

  it('should have heartbeat, daily, and weekly prompt templates', () => {
    const result = parseSpecialistDefinition(emailScoutMarkdown);
    expect(result.promptTemplates).toBeDefined();
    expect(Object.keys(result.promptTemplates!)).toContain('heartbeat');
    expect(Object.keys(result.promptTemplates!)).toContain('daily');
    expect(Object.keys(result.promptTemplates!)).toContain('weekly');
  });

  it('should have a non-empty system prompt', () => {
    const result = parseSpecialistDefinition(emailScoutMarkdown);
    expect(result.systemPrompt.length).toBeGreaterThan(0);
  });

  it('should include rate guardrail language in the system prompt', () => {
    const result = parseSpecialistDefinition(emailScoutMarkdown);
    expect(result.systemPrompt).toMatch(/5.*heartbeat|heartbeat.*5/i);
    expect(result.systemPrompt).toMatch(/15.*day|day.*15/i);
  });

  it('should include DRY_RUN safety language in the system prompt', () => {
    const result = parseSpecialistDefinition(emailScoutMarkdown);
    expect(result.systemPrompt).toMatch(/DRY_RUN/);
    expect(result.systemPrompt).toMatch(/dry.run|--dry-run/i);
  });

  it('should include action protocol messages in the system prompt', () => {
    const result = parseSpecialistDefinition(emailScoutMarkdown);
    expect(result.systemPrompt).toMatch(/@@YOLIUM/);
    expect(result.systemPrompt).toMatch(/emails_checked/);
    expect(result.systemPrompt).toMatch(/emails_searched/);
    expect(result.systemPrompt).toMatch(/email_sent/);
  });
});
