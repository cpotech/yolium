import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as os from 'node:os';

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

vi.mock('@main/git/git-config', () => ({
  loadGitConfig: vi.fn(),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  statSync: vi.fn(),
  mkdirSync: vi.fn(),
  renameSync: vi.fn(),
}));

vi.mock('node:os', () => ({
  homedir: vi.fn(() => '/home/test'),
}));

import { execSync } from 'node:child_process';
import { loadGitConfig } from '@main/git/git-config';
import { loadDetectedGitConfig } from '@main/git/git-identity';

describe('loadDetectedGitConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(execSync).mockReset();
    vi.mocked(loadGitConfig).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return null when no config sources exist', () => {
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('git not available');
    });
    vi.mocked(loadGitConfig).mockReturnValue(null);
    delete process.env.GIT_AUTHOR_NAME;
    delete process.env.GIT_AUTHOR_EMAIL;
    delete process.env.GITHUB_TOKEN;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    const result = loadDetectedGitConfig();

    expect(result).toBeNull();
  });

  it('should detect name and email from system git config', () => {
    vi.mocked(execSync)
      .mockReturnValueOnce('Test User\n')
      .mockReturnValueOnce('test@example.com\n');
    vi.mocked(loadGitConfig).mockReturnValue({ name: '', email: '' });
    delete process.env.GIT_AUTHOR_NAME;
    delete process.env.GIT_AUTHOR_EMAIL;

    const result = loadDetectedGitConfig();

    expect(result).not.toBeNull();
    expect(result?.name).toBe('Test User');
    expect(result?.email).toBe('test@example.com');
    expect(result?.sources.name).toBe('system');
    expect(result?.sources.email).toBe('system');
  });

  it('should detect name and email from environment variables', () => {
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('git not available');
    });
    vi.mocked(loadGitConfig).mockReturnValue(null);
    process.env.GIT_AUTHOR_NAME = 'Env User';
    process.env.GIT_AUTHOR_EMAIL = 'env@example.com';

    const result = loadDetectedGitConfig();

    expect(result).not.toBeNull();
    expect(result?.name).toBe('Env User');
    expect(result?.email).toBe('env@example.com');
    expect(result?.sources.name).toBe('environment');
    expect(result?.sources.email).toBe('environment');

    delete process.env.GIT_AUTHOR_NAME;
    delete process.env.GIT_AUTHOR_EMAIL;
  });

  it('should detect tokens from environment variables', () => {
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('git not available');
    });
    vi.mocked(loadGitConfig).mockReturnValue(null);
    process.env.GITHUB_TOKEN = 'ghp_env_token';
    process.env.OPENAI_API_KEY = 'sk-env-openai';
    process.env.ANTHROPIC_API_KEY = 'sk-ant-env-anthropic';

    const result = loadDetectedGitConfig();

    expect(result).not.toBeNull();
    expect(result?.githubPat).toBe('ghp_env_token');
    expect(result?.openaiApiKey).toBe('sk-env-openai');
    expect(result?.anthropicApiKey).toBe('sk-ant-env-anthropic');
    expect(result?.sources.githubPat).toBe('environment');
    expect(result?.sources.openaiApiKey).toBe('environment');
    expect(result?.sources.anthropicApiKey).toBe('environment');

    delete process.env.GITHUB_TOKEN;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
  });

  it('should prioritize Yolium config over environment over system', () => {
    vi.mocked(execSync)
      .mockReturnValueOnce('System User\n')
      .mockReturnValueOnce('system@example.com\n');
    vi.mocked(loadGitConfig).mockReturnValue({
      name: 'Yolium User',
      email: 'yolium@example.com',
      githubPat: 'ghp_yolium',
    });
    process.env.GIT_AUTHOR_NAME = 'Env User';
    process.env.GITHUB_TOKEN = 'ghp_env';

    const result = loadDetectedGitConfig();

    expect(result).not.toBeNull();
    expect(result?.name).toBe('Yolium User');
    expect(result?.sources.name).toBe('yolium');
    expect(result?.email).toBe('yolium@example.com');
    expect(result?.sources.email).toBe('yolium');
    expect(result?.githubPat).toBe('ghp_yolium');
    expect(result?.sources.githubPat).toBe('yolium');

    delete process.env.GIT_AUTHOR_NAME;
    delete process.env.GITHUB_TOKEN;
  });

  it('should track source for each detected field', () => {
    vi.mocked(execSync)
      .mockReturnValueOnce('System User\n')
      .mockReturnValueOnce('system@example.com\n');
    vi.mocked(loadGitConfig).mockReturnValue({
      name: 'Yolium User',
      email: '',
      openaiApiKey: 'sk-yolium-openai',
    });
    process.env.GITHUB_TOKEN = 'ghp_env';

    const result = loadDetectedGitConfig();

    expect(result).not.toBeNull();
    expect(result?.sources.name).toBe('yolium');
    expect(result?.sources.email).toBe('system');
    expect(result?.sources.githubPat).toBe('environment');
    expect(result?.sources.openaiApiKey).toBe('yolium');

    delete process.env.GITHUB_TOKEN;
  });

  it('should return null when git command fails', () => {
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('git not available');
    });
    vi.mocked(loadGitConfig).mockReturnValue(null);
    delete process.env.GIT_AUTHOR_NAME;
    delete process.env.GIT_AUTHOR_EMAIL;
    delete process.env.GITHUB_TOKEN;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    const result = loadDetectedGitConfig();

    expect(result).toBeNull();
  });

  it('should detect partial config from different sources', () => {
    vi.mocked(execSync)
      .mockReturnValueOnce('System User\n')
      .mockReturnValueOnce('system@example.com\n');
    vi.mocked(loadGitConfig).mockReturnValue(null);
    delete process.env.GIT_AUTHOR_NAME;
    delete process.env.GIT_AUTHOR_EMAIL;
    process.env.GITHUB_TOKEN = 'ghp_partial';

    const result = loadDetectedGitConfig();

    expect(result).not.toBeNull();
    expect(result?.name).toBe('System User');
    expect(result?.email).toBe('system@example.com');
    expect(result?.githubPat).toBe('ghp_partial');
    expect(result?.sources.name).toBe('system');
    expect(result?.sources.email).toBe('system');
    expect(result?.sources.githubPat).toBe('environment');

    delete process.env.GITHUB_TOKEN;
  });
});
