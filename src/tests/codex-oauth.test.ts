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
import { hasHostCodexOAuth, refreshCodexOAuthToken, refreshCodexOAuthTokenSerialized, getHostCodexCredentialsPath } from '@main/git/codex-oauth';

const AUTH_PATH = path.join(os.homedir(), '.codex', 'auth.json');

function makeAuthJson(overrides?: Record<string, unknown>) {
  return JSON.stringify({
    auth_mode: 'chatgpt',
    tokens: {
      id_token: 'old-id-token',
      access_token: 'old-access-token',
      refresh_token: 'old-refresh-token',
      account_id: 'acct-123',
    },
    last_refresh: '2025-01-01T00:00:00.000Z',
    ...overrides,
  });
}

describe('hasHostCodexOAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.existsSync).mockReturnValue(false);
  });

  it('should return true when auth.json has chatgpt mode and access_token', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(makeAuthJson());

    expect(hasHostCodexOAuth()).toBe(true);
  });

  it('should return false when auth.json does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    expect(hasHostCodexOAuth()).toBe(false);
  });

  it('should return false when auth_mode is not chatgpt', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      makeAuthJson({ auth_mode: 'api_key' }),
    );

    expect(hasHostCodexOAuth()).toBe(false);
  });
});

describe('refreshCodexOAuthToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.existsSync).mockReturnValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should refresh token successfully and write updated auth.json', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(makeAuthJson());

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
        id_token: 'new-id-token',
      }),
    });

    const result = await refreshCodexOAuthToken();

    expect(result).toBe(true);
    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockFetch).toHaveBeenCalledWith(
      'https://auth.openai.com/oauth/token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: 'app_EMoamEEZ73f0CkXaXp7hrann',
          grant_type: 'refresh_token',
          refresh_token: 'old-refresh-token',
          scope: 'openid profile email',
        }),
      },
    );

    expect(fs.writeFileSync).toHaveBeenCalledOnce();
    const [writePath, writeContent, writeOptions] = vi.mocked(fs.writeFileSync).mock.calls[0];
    expect(writePath).toBe(AUTH_PATH);

    const written = JSON.parse(writeContent as string);
    expect(written.tokens.access_token).toBe('new-access-token');
    expect(written.tokens.refresh_token).toBe('new-refresh-token');
    expect(written.tokens.id_token).toBe('new-id-token');
    expect(written.tokens.account_id).toBe('acct-123');
    expect(written.last_refresh).toBeDefined();
    expect(written.auth_mode).toBe('chatgpt');

    expect(writeOptions).toEqual({ encoding: 'utf-8', mode: 0o600 });
  });

  it('should handle response without id_token (keeps existing)', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(makeAuthJson());

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
      }),
    });

    const result = await refreshCodexOAuthToken();

    expect(result).toBe(true);

    const written = JSON.parse(vi.mocked(fs.writeFileSync).mock.calls[0][1] as string);
    expect(written.tokens.id_token).toBe('old-id-token');
    expect(written.tokens.access_token).toBe('new-access-token');
    expect(written.tokens.refresh_token).toBe('new-refresh-token');
  });

  it('should return false on 401 (expired refresh token) without writing', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(makeAuthJson());

    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    });

    const result = await refreshCodexOAuthToken();

    expect(result).toBe(false);
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  it('should return false on network error without writing', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(makeAuthJson());

    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await refreshCodexOAuthToken();

    expect(result).toBe(false);
    expect(fs.writeFileSync).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('should return false when auth.json does not exist', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const result = await refreshCodexOAuthToken();

    expect(result).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  it('should return false when auth_mode is not chatgpt', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      makeAuthJson({ auth_mode: 'api_key' }),
    );

    const result = await refreshCodexOAuthToken();

    expect(result).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should return false when refresh_token is missing', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        auth_mode: 'chatgpt',
        tokens: { access_token: 'some-token' },
      }),
    );

    const result = await refreshCodexOAuthToken();

    expect(result).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('refreshCodexOAuthTokenSerialized', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(makeAuthJson());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should call fetch only once for concurrent invocations (mutex)', async () => {
    let resolveFirst!: (value: Response) => void;
    const firstCall = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });

    mockFetch.mockReturnValue(firstCall);

    const p1 = refreshCodexOAuthTokenSerialized();
    const p2 = refreshCodexOAuthTokenSerialized();

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

  it('should allow a new refresh after the previous one completes', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'token-1',
        refresh_token: 'refresh-1',
      }),
    });

    await refreshCodexOAuthTokenSerialized();
    expect(mockFetch).toHaveBeenCalledTimes(1);

    await refreshCodexOAuthTokenSerialized();
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

describe('getHostCodexCredentialsPath', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return Codex credentials path when file exists', () => {
    vi.mocked(fs.statSync).mockReturnValue({ isFile: () => true } as ReturnType<typeof fs.statSync>);

    const result = getHostCodexCredentialsPath();

    expect(result).toBe(AUTH_PATH);
  });

  it('should return null when Codex credentials file does not exist', () => {
    vi.mocked(fs.statSync).mockImplementation(() => {
      throw new Error('ENOENT');
    });

    const result = getHostCodexCredentialsPath();

    expect(result).toBeNull();
  });
});
