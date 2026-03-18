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

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import * as fs from 'node:fs';
import { hasHostClaudeOAuth, refreshClaudeOAuthToken, refreshClaudeOAuthTokenSerialized, getHostClaudeCredentialsPath } from '@main/git/claude-oauth';

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

describe('hasHostClaudeOAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.existsSync).mockReturnValue(false);
  });

  it('should return true when .credentials.json exists with accessToken', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(makeCredentialsJson());

    expect(hasHostClaudeOAuth()).toBe(true);
  });

  it('should return false when .credentials.json does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    expect(hasHostClaudeOAuth()).toBe(false);
  });

  it('should return false when .credentials.json has no accessToken', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({ claudeAiOauth: { scopes: ['user:inference'] } }),
    );

    expect(hasHostClaudeOAuth()).toBe(false);
  });

  it('should return false when .credentials.json is malformed JSON', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('invalid json');

    expect(hasHostClaudeOAuth()).toBe(false);
  });
});

describe('refreshClaudeOAuthToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.existsSync).mockReturnValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should refresh token successfully and write updated credentials', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(makeCredentialsJson());

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
      }),
    });

    const result = await refreshClaudeOAuthToken();

    expect(result).toBe(true);
    expect(fs.writeFileSync).toHaveBeenCalledOnce();
    const writtenContent = JSON.parse(vi.mocked(fs.writeFileSync).mock.calls[0][1] as string);
    expect(writtenContent.claudeAiOauth.accessToken).toBe('new-access-token');
    expect(writtenContent.claudeAiOauth.refreshToken).toBe('new-refresh-token');
  });

  it('should preserve existing refreshToken when response omits it', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(makeCredentialsJson());

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'new-access-token',
        // no refresh_token in response
      }),
    });

    const result = await refreshClaudeOAuthToken();

    expect(result).toBe(true);
    const writtenContent = JSON.parse(vi.mocked(fs.writeFileSync).mock.calls[0][1] as string);
    expect(writtenContent.claudeAiOauth.refreshToken).toBe('sk-ant-ort01-test-refresh');
  });

  it('should return false when credentials file does not exist', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const result = await refreshClaudeOAuthToken();

    expect(result).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should return false when no refreshToken in credentials', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({ claudeAiOauth: { accessToken: 'sk-ant-oat01-test-token' } }),
    );

    const result = await refreshClaudeOAuthToken();

    expect(result).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should return false on HTTP error response', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(makeCredentialsJson());

    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await refreshClaudeOAuthToken();

    expect(result).toBe(false);
    expect(fs.writeFileSync).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('should return false on network error', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(makeCredentialsJson());

    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await refreshClaudeOAuthToken();

    expect(result).toBe(false);
    expect(fs.writeFileSync).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });
});

describe('refreshClaudeOAuthTokenSerialized', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(makeCredentialsJson());
  });

  it('should serialize concurrent refresh calls (mutex coalesces)', async () => {
    let resolveFirst!: (value: Response) => void;
    const firstCall = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });

    mockFetch.mockReturnValue(firstCall);

    const p1 = refreshClaudeOAuthTokenSerialized();
    const p2 = refreshClaudeOAuthTokenSerialized();

    resolveFirst({
      ok: true,
      json: async () => ({
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
      }),
    } as Response);

    const [r1, r2] = await Promise.all([p1, p2]);

    expect(r1).toBe(true);
    expect(r2).toBe(true);
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it('should allow new refresh after previous completes', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'token-1',
        refresh_token: 'refresh-1',
      }),
    });

    await refreshClaudeOAuthTokenSerialized();
    expect(mockFetch).toHaveBeenCalledTimes(1);

    await refreshClaudeOAuthTokenSerialized();
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

describe('getHostClaudeCredentialsPath', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return Claude credentials path when file exists', () => {
    vi.mocked(fs.statSync).mockReturnValue({ isFile: () => true } as ReturnType<typeof fs.statSync>);

    const result = getHostClaudeCredentialsPath();

    expect(result).toBe(CRED_PATH);
  });

  it('should return null when Claude credentials file does not exist', () => {
    vi.mocked(fs.statSync).mockImplementation(() => {
      throw new Error('ENOENT');
    });

    const result = getHostClaudeCredentialsPath();

    expect(result).toBeNull();
  });
});
