import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

// Mock os.homedir to return a temp directory
const { homedirMock } = vi.hoisted(() => ({
  homedirMock: vi.fn(),
}));

vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof import('node:os')>('node:os');
  return { ...actual, homedir: homedirMock };
});

import {
  saveCredentials,
  loadCredentials,
  loadRedactedCredentials,
  deleteCredentials,
} from '@main/stores/specialist-credentials-store';

describe('specialist-credentials-store', () => {
  let tempDir: string;
  let credentialsPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cred-store-'));
    fs.mkdirSync(path.join(tempDir, '.yolium'), { recursive: true });
    homedirMock.mockReturnValue(tempDir);
    credentialsPath = path.join(tempDir, '.yolium', 'specialist-credentials.json');
  });

  afterEach(() => {
    vi.clearAllMocks();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should return empty object for unknown specialist id', () => {
    const result = loadCredentials('non-existent');
    expect(result).toEqual({});
  });

  it('should save and load credentials for a specialist', () => {
    saveCredentials('twitter-growth', 'twitter-api', { API_KEY: 'abc123', API_SECRET: 'secret456' });

    const result = loadCredentials('twitter-growth');
    expect(result).toEqual({
      'twitter-api': { API_KEY: 'abc123', API_SECRET: 'secret456' },
    });
  });

  it('should merge partial credential updates with existing values for the same service', () => {
    saveCredentials('twitter-growth', 'twitter-api', {
      API_KEY: 'old-key',
      API_SECRET: 'secret-1',
    });
    saveCredentials('twitter-growth', 'twitter-api', { API_KEY: 'new-key' });

    const result = loadCredentials('twitter-growth');
    expect(result).toEqual({
      'twitter-api': { API_KEY: 'new-key', API_SECRET: 'secret-1' },
    });
  });

  it('should keep other services for the same specialist untouched when merging credential updates', () => {
    saveCredentials('twitter-growth', 'twitter-api', { API_KEY: 'old-key' });
    saveCredentials('twitter-growth', 'slack', { WEBHOOK_URL: 'https://example.test/hook' });

    saveCredentials('twitter-growth', 'twitter-api', { API_SECRET: 'secret-2' });

    const result = loadCredentials('twitter-growth');
    expect(result).toEqual({
      'twitter-api': { API_KEY: 'old-key', API_SECRET: 'secret-2' },
      slack: { WEBHOOK_URL: 'https://example.test/hook' },
    });
  });

  it('should delete credentials for a specialist without affecting others', () => {
    saveCredentials('twitter-growth', 'twitter-api', { API_KEY: 'abc' });
    saveCredentials('security-monitor', 'slack', { WEBHOOK_URL: 'https://...' });

    deleteCredentials('twitter-growth');

    expect(loadCredentials('twitter-growth')).toEqual({});
    expect(loadCredentials('security-monitor')).toEqual({
      slack: { WEBHOOK_URL: 'https://...' },
    });
  });

  it('should return redacted credentials with hasSecret flags instead of raw values', () => {
    saveCredentials('twitter-growth', 'twitter-api', { API_KEY: 'abc123', API_SECRET: '' });

    const result = loadRedactedCredentials('twitter-growth');
    expect(result).toEqual({
      'twitter-api': { API_KEY: true, API_SECRET: false },
    });
  });

  it.skipIf(process.platform === 'win32')('should write credentials file with mode 0o600', () => {
    saveCredentials('twitter-growth', 'twitter-api', { API_KEY: 'abc123' });

    expect(fs.existsSync(credentialsPath)).toBe(true);
    const stats = fs.statSync(credentialsPath);
    // Check file permissions (owner read/write only)
    const mode = stats.mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it('should handle missing credentials file gracefully', () => {
    // Don't create any file — just load
    const result = loadCredentials('anything');
    expect(result).toEqual({});

    const redacted = loadRedactedCredentials('anything');
    expect(redacted).toEqual({});
  });
});
