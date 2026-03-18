import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as os from 'node:os';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  statSync: vi.fn(),
  mkdirSync: vi.fn(),
  renameSync: vi.fn(),
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    statSync: vi.fn(),
    mkdirSync: vi.fn(),
    renameSync: vi.fn(),
  },
}));

vi.mock('node:os', () => ({
  homedir: vi.fn(() => '/home/test'),
}));

vi.mock('node:path', () => ({
  join: vi.fn((...args: string[]) => args.join('/')),
  dirname: vi.fn((p: string) => p.split('/').slice(0, -1).join('/')),
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import * as fs from 'node:fs';
import { generateGitCredentials, getGitCredentialsPath, fetchGitHubUser } from '@main/git/git-credentials';

describe('generateGitCredentials', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.existsSync).mockReturnValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return null when no PAT in config', () => {
    const result = generateGitCredentials(null);
    expect(result).toBeNull();
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  it('should generate credentials file in git store format', () => {
    const config = { name: 'Test', email: 'test@test.com', githubPat: 'ghp_test123' };
    const result = generateGitCredentials(config);

    expect(result).toBe('/home/test/.yolium/git-credentials');
    expect(fs.mkdirSync).toHaveBeenCalledWith('/home/test/.yolium', { recursive: true });
    expect(fs.writeFileSync).toHaveBeenCalledOnce();
    const [writePath, content, options] = vi.mocked(fs.writeFileSync).mock.calls[0];
    expect(writePath).toBe('/home/test/.yolium/git-credentials');
    expect(content).toBe('https://git:ghp_test123@github.com\n');
    expect(options).toEqual({ mode: 0o600 });
  });

  it('should strip trailing @github.com from PAT', () => {
    const config = { name: '', email: '', githubPat: 'ghp_token@github.com' };
    generateGitCredentials(config);

    const content = vi.mocked(fs.writeFileSync).mock.calls[0][1] as string;
    expect(content).toBe('https://git:ghp_token@github.com\n');
  });

  it('should create directory if it does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const config = { name: '', email: '', githubPat: 'ghp_token' };
    generateGitCredentials(config);

    expect(fs.mkdirSync).toHaveBeenCalledWith('/home/test/.yolium', { recursive: true });
  });

  it('should write file with restrictive permissions (0o600)', () => {
    const config = { name: '', email: '', githubPat: 'ghp_token' };
    generateGitCredentials(config);

    const options = vi.mocked(fs.writeFileSync).mock.calls[0][2] as { mode: number };
    expect(options.mode).toBe(0o600);
  });
});

describe('getGitCredentialsPath', () => {
  it('should return correct credentials file path', () => {
    const result = getGitCredentialsPath();
    expect(result).toBe('/home/test/.yolium/git-credentials');
  });
});

describe('fetchGitHubUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should fetch GitHub user identity from valid PAT', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        login: 'testuser',
        name: 'Test User',
        email: 'test@example.com',
      }),
    });

    const result = await fetchGitHubUser('ghp_test_token');

    expect(result).toEqual({
      name: 'Test User',
      email: 'test@example.com',
      login: 'testuser',
    });
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.github.com/user',
      {
        headers: {
          Authorization: 'Bearer ghp_test_token',
          Accept: 'application/vnd.github+json',
        },
      },
    );
  });

  it('should return null on GitHub API error', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
    });

    const result = await fetchGitHubUser('invalid_token');

    expect(result).toBeNull();
  });

  it('should return null on network error', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await fetchGitHubUser('ghp_token');

    expect(result).toBeNull();
  });

  it('should use noreply email when user email is private', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        login: 'privateuser',
        name: 'Private User',
        email: null,
      }),
    });

    const result = await fetchGitHubUser('ghp_token');

    expect(result).toEqual({
      name: 'Private User',
      email: 'privateuser@users.noreply.github.com',
      login: 'privateuser',
    });
  });

  it('should use login as name when name is not set', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        login: 'nonameuser',
        name: null,
        email: 'noname@example.com',
      }),
    });

    const result = await fetchGitHubUser('ghp_token');

    expect(result).toEqual({
      name: 'nonameuser',
      email: 'noname@example.com',
      login: 'nonameuser',
    });
  });
});
