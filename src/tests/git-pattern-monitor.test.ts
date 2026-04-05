// src/tests/git-pattern-monitor.test.ts
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

import {
  parseSpecialistDefinition,
  validateSchedules,
} from '@main/services/specialist-loader';

// Read the actual file using real fs (bypassing mocks)
const gitPatternMonitorMarkdown = (() => {
  const realFs = require('node:fs');
  const realPath = require('node:path');
  const filePath = realPath.join(__dirname, '..', 'agents', 'cron', 'git-pattern-monitor.md');
  return realFs.readFileSync(filePath, 'utf-8');
})();

describe('git-pattern-monitor specialist', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should parse git-pattern-monitor.md without errors', () => {
    expect(() => parseSpecialistDefinition(gitPatternMonitorMarkdown)).not.toThrow();
  });

  it('should have name "git-pattern-monitor"', () => {
    const result = parseSpecialistDefinition(gitPatternMonitorMarkdown);
    expect(result.name).toBe('git-pattern-monitor');
  });

  it('should have model "sonnet"', () => {
    const result = parseSpecialistDefinition(gitPatternMonitorMarkdown);
    expect(result.model).toBe('sonnet');
  });

  it('should have correct tools: Read, Glob, Grep, Bash, WebSearch', () => {
    const result = parseSpecialistDefinition(gitPatternMonitorMarkdown);
    expect(result.tools).toEqual(['Read', 'Glob', 'Grep', 'Bash', 'WebSearch']);
  });

  it('should have 3 schedules: heartbeat, daily, weekly', () => {
    const result = parseSpecialistDefinition(gitPatternMonitorMarkdown);
    expect(result.schedules).toHaveLength(3);
    expect(result.schedules.map(s => s.type)).toEqual(['heartbeat', 'daily', 'weekly']);
  });

  it('should have heartbeat schedule with cron "0 */6 * * *" and enabled: true', () => {
    const result = parseSpecialistDefinition(gitPatternMonitorMarkdown);
    const heartbeat = result.schedules.find(s => s.type === 'heartbeat');
    expect(heartbeat).toBeDefined();
    expect(heartbeat!.cron).toBe('0 */6 * * *');
    expect(heartbeat!.enabled).toBe(true);
  });

  it('should have daily schedule with cron "0 9 * * *" and enabled: true', () => {
    const result = parseSpecialistDefinition(gitPatternMonitorMarkdown);
    const daily = result.schedules.find(s => s.type === 'daily');
    expect(daily).toBeDefined();
    expect(daily!.cron).toBe('0 9 * * *');
    expect(daily!.enabled).toBe(true);
  });

  it('should have weekly schedule with cron "0 10 * * 1" and enabled: true', () => {
    const result = parseSpecialistDefinition(gitPatternMonitorMarkdown);
    const weekly = result.schedules.find(s => s.type === 'weekly');
    expect(weekly).toBeDefined();
    expect(weekly!.cron).toBe('0 10 * * 1');
    expect(weekly!.enabled).toBe(true);
  });

  it('should have memory strategy "distill_daily"', () => {
    const result = parseSpecialistDefinition(gitPatternMonitorMarkdown);
    expect(result.memory.strategy).toBe('distill_daily');
    expect(result.memory.maxEntries).toBe(300);
    expect(result.memory.retentionDays).toBe(90);
  });

  it('should have escalation onFailure "alert_user" and onPattern "reduce_frequency"', () => {
    const result = parseSpecialistDefinition(gitPatternMonitorMarkdown);
    expect(result.escalation.onFailure).toBe('alert_user');
    expect(result.escalation.onPattern).toBe('reduce_frequency');
  });

  it('should have promptTemplates for heartbeat, daily, and weekly', () => {
    const result = parseSpecialistDefinition(gitPatternMonitorMarkdown);
    expect(result.promptTemplates).toBeDefined();
    const keys = Object.keys(result.promptTemplates!);
    expect(keys).toContain('heartbeat');
    expect(keys).toContain('daily');
    expect(keys).toContain('weekly');
  });

  it('should have non-empty systemPrompt', () => {
    const result = parseSpecialistDefinition(gitPatternMonitorMarkdown);
    expect(result.systemPrompt).toBeTruthy();
    expect(result.systemPrompt.length).toBeGreaterThan(100);
  });

  it('should have heartbeat promptTemplate mentioning revert/fixup commits', () => {
    const result = parseSpecialistDefinition(gitPatternMonitorMarkdown);
    const heartbeat = result.promptTemplates!.heartbeat;
    expect(heartbeat).toMatch(/revert/i);
    expect(heartbeat).toMatch(/fixup/i);
  });

  it('should have daily promptTemplate mentioning pattern analysis', () => {
    const result = parseSpecialistDefinition(gitPatternMonitorMarkdown);
    const daily = result.promptTemplates!.daily;
    expect(daily).toMatch(/pattern analysis/i);
  });

  it('should have weekly promptTemplate mentioning AGENTS.md proposals', () => {
    const result = parseSpecialistDefinition(gitPatternMonitorMarkdown);
    const weekly = result.promptTemplates!.weekly;
    expect(weekly).toMatch(/AGENTS\.md/i);
  });

  it('should pass schedule validation via node-cron validate', () => {
    const result = parseSpecialistDefinition(gitPatternMonitorMarkdown);
    expect(validateSchedules(result.schedules)).toBe(true);
  });

  it('should not have any integrations (no external service dependencies)', () => {
    const result = parseSpecialistDefinition(gitPatternMonitorMarkdown);
    expect(result.integrations).toEqual([]);
  });
});
