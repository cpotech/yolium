// src/tests/specialist-readiness.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock node:fs for resolveToolDir dependency
vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => false),
}));

// Mock tools-resolver to control resolveToolDir behavior
vi.mock('@main/services/tools-resolver', () => ({
  resolveToolDir: vi.fn(() => null),
}));

import { checkSpecialistReadiness } from '@main/services/specialist-readiness';
import { resolveToolDir } from '@main/services/tools-resolver';
import type { SpecialistDefinition, ServiceCredentials } from '@shared/types/schedule';

function makeSpecialist(overrides: Partial<SpecialistDefinition> = {}): SpecialistDefinition {
  return {
    name: 'test-specialist',
    description: 'Test specialist',
    model: 'sonnet',
    tools: ['Read', 'Bash'],
    systemPrompt: 'You are a test specialist.',
    schedules: [{ type: 'daily', cron: '0 8 * * *', enabled: true }],
    memory: { strategy: 'raw', maxEntries: 100, retentionDays: 30 },
    escalation: { onFailure: 'alert_user' },
    promptTemplates: {},
    integrations: [],
    ...overrides,
  };
}

describe('specialist-readiness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return ready when all integration credentials are configured', () => {
    const specialist = makeSpecialist({
      integrations: [
        { service: 'twitter-api', env: { API_KEY: '', API_SECRET: '' }, tools: [] },
      ],
    });
    const credentials: ServiceCredentials = {
      'twitter-api': { API_KEY: 'key123', API_SECRET: 'secret456' },
    };

    const result = checkSpecialistReadiness(specialist, credentials);
    expect(result.ready).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it('should return not-ready with missing credential details when credentials are empty', () => {
    const specialist = makeSpecialist({
      integrations: [
        { service: 'twitter-api', env: { API_KEY: '', API_SECRET: '' }, tools: [] },
      ],
    });
    const credentials: ServiceCredentials = {};

    const result = checkSpecialistReadiness(specialist, credentials);
    expect(result.ready).toBe(false);
    expect(result.reasons.length).toBeGreaterThan(0);
    expect(result.reasons.some(r => r.includes('twitter-api'))).toBe(true);
    expect(result.reasons.some(r => r.includes('API_KEY'))).toBe(true);
    expect(result.reasons.some(r => r.includes('API_SECRET'))).toBe(true);
  });

  it('should return ready when specialist has no integrations', () => {
    const specialist = makeSpecialist({ integrations: [] });
    const credentials: ServiceCredentials = {};

    const result = checkSpecialistReadiness(specialist, credentials);
    expect(result.ready).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it('should return not-ready when tool directory does not exist on disk', () => {
    vi.mocked(resolveToolDir).mockReturnValue(null);

    const specialist = makeSpecialist({
      integrations: [
        { service: 'twitter-api', env: {}, tools: ['twitter'] },
      ],
    });
    const credentials: ServiceCredentials = {};

    const result = checkSpecialistReadiness(specialist, credentials);
    expect(result.ready).toBe(false);
    expect(result.reasons.some(r => r.includes('twitter'))).toBe(true);
  });

  it('should return ready when tool directory exists on disk', () => {
    vi.mocked(resolveToolDir).mockReturnValue('/path/to/tools/twitter');

    const specialist = makeSpecialist({
      integrations: [
        { service: 'twitter-api', env: {}, tools: ['twitter'] },
      ],
    });
    const credentials: ServiceCredentials = {};

    const result = checkSpecialistReadiness(specialist, credentials);
    expect(result.ready).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it('should list all missing credentials by service and env key name', () => {
    const specialist = makeSpecialist({
      integrations: [
        {
          service: 'twitter-api',
          env: { TWITTER_API_KEY: '', TWITTER_API_SECRET: '', TWITTER_BEARER_TOKEN: '' },
          tools: [],
        },
      ],
    });
    // Provide only one of three keys
    const credentials: ServiceCredentials = {
      'twitter-api': { TWITTER_API_KEY: 'has-value' },
    };

    const result = checkSpecialistReadiness(specialist, credentials);
    expect(result.ready).toBe(false);
    expect(result.reasons.some(r => r.includes('TWITTER_API_SECRET'))).toBe(true);
    expect(result.reasons.some(r => r.includes('TWITTER_BEARER_TOKEN'))).toBe(true);
    // Should NOT include the key that has a value
    expect(result.reasons.some(r => r.includes('TWITTER_API_KEY'))).toBe(false);
  });

  it('should handle specialist with multiple integrations, some ready and some not', () => {
    vi.mocked(resolveToolDir).mockImplementation((name: string) => {
      if (name === 'twitter') return '/path/to/tools/twitter';
      return null;
    });

    const specialist = makeSpecialist({
      integrations: [
        { service: 'twitter-api', env: { API_KEY: '' }, tools: ['twitter'] },
        { service: 'slack', env: { WEBHOOK_URL: '' }, tools: ['slack-tool'] },
      ],
    });
    const credentials: ServiceCredentials = {
      'twitter-api': { API_KEY: 'has-value' },
      // slack credentials missing
    };

    const result = checkSpecialistReadiness(specialist, credentials);
    expect(result.ready).toBe(false);
    // Slack credential missing
    expect(result.reasons.some(r => r.includes('slack') && r.includes('WEBHOOK_URL'))).toBe(true);
    // Slack tool missing
    expect(result.reasons.some(r => r.includes('slack-tool'))).toBe(true);
    // Twitter should be fine
    expect(result.reasons.some(r => r.includes('API_KEY'))).toBe(false);
  });
});
