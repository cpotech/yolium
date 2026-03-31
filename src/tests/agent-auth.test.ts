import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the git-config module
const mockLoadGitConfig = vi.hoisted(() => vi.fn());
vi.mock('@main/git/git-config', () => ({
  loadGitConfig: mockLoadGitConfig,
}));

// Mock Claude OAuth
vi.mock('@main/git/claude-oauth', () => ({
  hasHostClaudeOAuth: vi.fn(() => false),
}));

// Mock Codex OAuth
vi.mock('@main/git/codex-oauth', () => ({
  hasHostCodexOAuth: vi.fn(() => false),
}));

import { checkAgentAuth } from '@main/docker/agent-auth';

describe('checkAgentAuth - openrouter', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.OPENROUTER_API_KEY;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return authenticated when openrouterApiKey is set in git config', () => {
    mockLoadGitConfig.mockReturnValue({
      name: 'Test User',
      email: 'test@example.com',
      openrouterApiKey: 'sk-or-v1-test-key',
    });

    const result = checkAgentAuth('openrouter');
    expect(result).toEqual({ authenticated: true });
  });

  it('should return authenticated when OPENROUTER_API_KEY env var is set', () => {
    mockLoadGitConfig.mockReturnValue({
      name: 'Test User',
      email: 'test@example.com',
    });
    process.env.OPENROUTER_API_KEY = 'sk-or-v1-env-key';

    const result = checkAgentAuth('openrouter');
    expect(result).toEqual({ authenticated: true });
  });

  it('should return not authenticated when no openrouter key is found', () => {
    mockLoadGitConfig.mockReturnValue({
      name: 'Test User',
      email: 'test@example.com',
    });
    delete process.env.OPENROUTER_API_KEY;

    const result = checkAgentAuth('openrouter');
    expect(result).toEqual({ authenticated: false });
  });
});
