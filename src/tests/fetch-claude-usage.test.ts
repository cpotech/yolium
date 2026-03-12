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
import { fetchClaudeUsage, refreshClaudeOAuthToken, refreshClaudeOAuthTokenSerialized } from '@main/git/git-config';

const CRED_PATH = path.join(os.homedir(), '.claude', '.credentials.json');

function makeCredentialsJson(oauthOverrides?: Record<string, unknown>) {
  return JSON.stringify({
    claudeAiOauth: {
      accessToken: 'sk-ant-oat01-test-token',
      refreshToken: 'sk-ant-ort01-test-refresh',
      scopes: ['user:inference', 'user:profile'],
      ...oauthOverrides,
    },
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

  it('should return null on API error (non-200, non-401 response)', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(makeCredentialsJson());

    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
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

  it('should attempt token refresh when API returns 401 and refreshToken exists', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(makeCredentialsJson());

    // First call returns 401, refresh succeeds, second call succeeds
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 401, statusText: 'Unauthorized' })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'new-token', refresh_token: 'new-refresh' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => makeApiResponse() });

    // After refresh, re-read returns updated creds
    vi.mocked(fs.readFileSync)
      .mockReturnValueOnce(makeCredentialsJson()) // initial read
      .mockReturnValueOnce(makeCredentialsJson({ accessToken: 'new-token' })); // re-read after refresh

    const result = await fetchClaudeUsage();

    // Should have called fetch 3 times: usage API, refresh endpoint, retry usage API
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(result).not.toBeNull();
    expect(result?.fiveHour.utilization).toBe(37.0);
  });

  it('should return usage data after successful token refresh on 401', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);

    vi.mocked(fs.readFileSync)
      .mockReturnValueOnce(makeCredentialsJson()) // initial read
      .mockReturnValueOnce(makeCredentialsJson()) // read for refresh (refreshToken)
      .mockReturnValueOnce(makeCredentialsJson({ accessToken: 'refreshed-token' })); // re-read after refresh

    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 401, statusText: 'Unauthorized' })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'refreshed-token', refresh_token: 'new-refresh' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => makeApiResponse({ five_hour: { utilization: 99.0, resets_at: '2026-01-01T00:00:00Z' } }) });

    const result = await fetchClaudeUsage();

    expect(result).not.toBeNull();
    expect(result?.fiveHour.utilization).toBe(99.0);
  });

  it('should return null when token refresh fails', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(makeCredentialsJson());

    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 401, statusText: 'Unauthorized' })
      .mockResolvedValueOnce({ ok: false, status: 400, statusText: 'Bad Request' }); // refresh fails

    const result = await fetchClaudeUsage();

    expect(result).toBeNull();
  });

  it('should return null when credentials have no refreshToken field', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        claudeAiOauth: {
          accessToken: 'sk-ant-oat01-test-token',
          scopes: ['user:inference', 'user:profile'],
          // no refreshToken
        },
      }),
    );

    mockFetch.mockResolvedValueOnce({ ok: false, status: 401, statusText: 'Unauthorized' });

    const result = await fetchClaudeUsage();

    expect(result).toBeNull();
    // Should not attempt refresh endpoint call — only the initial usage call
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should write updated access token to credentials file after successful refresh', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(makeCredentialsJson());

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'new-access-token', refresh_token: 'new-refresh-token' }),
    });

    const result = await refreshClaudeOAuthToken();

    expect(result).toBe(true);
    expect(fs.writeFileSync).toHaveBeenCalledOnce();

    const writtenContent = JSON.parse(vi.mocked(fs.writeFileSync).mock.calls[0][1] as string);
    expect(writtenContent.claudeAiOauth.accessToken).toBe('new-access-token');
    expect(writtenContent.claudeAiOauth.refreshToken).toBe('new-refresh-token');
  });

  it('should not attempt refresh on non-401 errors (403, 500)', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(makeCredentialsJson());

    // 403 — should not trigger refresh
    mockFetch.mockResolvedValueOnce({ ok: false, status: 403, statusText: 'Forbidden' });
    const result403 = await fetchClaudeUsage();
    expect(result403).toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(1);

    mockFetch.mockClear();
    vi.mocked(fs.readFileSync).mockReturnValue(makeCredentialsJson());

    // 500 — should not trigger refresh
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500, statusText: 'Internal Server Error' });
    const result500 = await fetchClaudeUsage();
    expect(result500).toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should use serialized refresh to prevent concurrent refresh calls', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(makeCredentialsJson());

    // Make the refresh endpoint slow
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'new-token', refresh_token: 'new-refresh' }),
    });

    // Call serialized refresh twice concurrently
    const [result1, result2] = await Promise.all([
      refreshClaudeOAuthTokenSerialized(),
      refreshClaudeOAuthTokenSerialized(),
    ]);

    expect(result1).toBe(true);
    expect(result2).toBe(true);
    // Should only call fetch once (serialized)
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should return null when refresh token is expired or revoked', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(makeCredentialsJson());

    // Refresh endpoint returns 401 (refresh token expired/revoked)
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401, statusText: 'Unauthorized' });

    const result = await refreshClaudeOAuthToken();

    expect(result).toBe(false);
  });
});
