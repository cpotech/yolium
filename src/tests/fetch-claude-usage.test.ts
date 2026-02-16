/**
 * Tests for Claude OAuth usage fetch in git-config.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as os from 'node:os';

// Mock node:fs
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

// Mock node:child_process (required by git-config for loadSystemGitConfig)
vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import * as fs from 'node:fs';
import { fetchClaudeUsage } from '@main/git/git-config';

const CRED_PATH = path.join(os.homedir(), '.claude', '.credentials.json');

function makeCredentialsJson(overrides?: Record<string, unknown>) {
  return JSON.stringify({
    claudeAiOauth: {
      accessToken: 'sk-ant-oat01-test-token',
      scopes: ['user:inference', 'user:profile'],
    },
    ...overrides,
  });
}

function makeApiResponse(overrides?: Record<string, unknown>) {
  return {
    five_hour: {
      utilization: 37.0,
      resets_at: '2025-01-15T18:00:00.000Z',
    },
    seven_day: {
      utilization: 26.0,
      resets_at: '2025-01-22T00:00:00.000Z',
    },
    ...overrides,
  };
}

describe('fetchClaudeUsage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.existsSync).mockReturnValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return usage data on successful API response', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(makeCredentialsJson());

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => makeApiResponse(),
    });

    const result = await fetchClaudeUsage();

    expect(result).not.toBeNull();
    expect(result?.fiveHour.utilization).toBe(37.0);
    expect(result?.fiveHour.resetsAt).toBe('2025-01-15T18:00:00.000Z');
    expect(result?.sevenDay.utilization).toBe(26.0);
    expect(result?.sevenDay.resetsAt).toBe('2025-01-22T00:00:00.000Z');

    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.anthropic.com/api/oauth/usage',
      {
        headers: {
          'Authorization': 'Bearer sk-ant-oat01-test-token',
          'anthropic-beta': 'oauth-2025-04-20',
        },
      },
    );
  });

  it('should return null when credentials file does not exist', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const result = await fetchClaudeUsage();

    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should return null when credentials file has no accessToken', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({ claudeAiOauth: { scopes: ['user:inference'] } }),
    );

    const result = await fetchClaudeUsage();

    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should return null on API error (non-200 response)', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(makeCredentialsJson());

    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    });

    const result = await fetchClaudeUsage();

    expect(result).toBeNull();
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it('should return null on network error', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(makeCredentialsJson());

    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await fetchClaudeUsage();

    expect(result).toBeNull();
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it('should handle API response with missing fields gracefully', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(makeCredentialsJson());

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        five_hour: { utilization: 50.0 },
        // Missing seven_day
      }),
    });

    const result = await fetchClaudeUsage();

    expect(result).not.toBeNull();
    expect(result?.fiveHour.utilization).toBe(50.0);
    expect(result?.fiveHour.resetsAt).toBe('');
    expect(result?.sevenDay.utilization).toBe(0);
    expect(result?.sevenDay.resetsAt).toBe('');
  });

  it('should handle invalid JSON in credentials file', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('invalid json');

    const result = await fetchClaudeUsage();

    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should handle empty credentials object', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({}));

    const result = await fetchClaudeUsage();

    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should handle 403 Forbidden response', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(makeCredentialsJson());

    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
    });

    const result = await fetchClaudeUsage();

    expect(result).toBeNull();
    expect(mockFetch).toHaveBeenCalledOnce();
  });
});
