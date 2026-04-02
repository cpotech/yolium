/**
 * Tests for the defaultProvider feature: loading, saving, and migration
 * in git-config.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock electron-dependent logger
vi.mock('@main/lib/logger', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

// Mock fs
const mockExistsSync = vi.fn();
const mockReadFileSync = vi.fn();
const mockWriteFileSync = vi.fn();
vi.mock('node:fs', () => ({
  existsSync: (...args: unknown[]) => mockExistsSync(...args),
  mkdirSync: vi.fn(),
  writeFileSync: (...args: unknown[]) => mockWriteFileSync(...args),
  readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
  readdirSync: vi.fn(() => []),
  unlinkSync: vi.fn(),
  statSync: vi.fn(),
  renameSync: vi.fn(),
}));

vi.mock('node:os', () => ({
  homedir: vi.fn(() => '/home/test'),
  platform: vi.fn(() => 'linux'),
}));

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

import { loadGitConfig, saveGitConfig } from '../main/git/git-config';

describe('defaultProvider in git-config', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should load defaultProvider from settings.json', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({
      name: 'Test User',
      email: 'test@example.com',
      defaultProvider: 'opencode',
    }));

    const config = loadGitConfig();

    expect(config).not.toBeNull();
    expect(config!.defaultProvider).toBe('opencode');
  });

  it('should return undefined defaultProvider when not set', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({
      name: 'Test User',
      email: 'test@example.com',
    }));

    const config = loadGitConfig();

    expect(config).not.toBeNull();
    expect(config!.defaultProvider).toBeUndefined();
  });

  it('should save defaultProvider to settings.json', () => {
    saveGitConfig({
      name: 'Test User',
      email: 'test@example.com',
      defaultProvider: 'codex',
    });

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('"defaultProvider": "codex"'),
      expect.any(Object),
    );
  });

  it('should reject invalid defaultProvider values', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({
      name: 'Test',
      defaultProvider: 'invalid-provider',
    }));

    const config = loadGitConfig();

    expect(config).not.toBeNull();
    expect(config!.defaultProvider).toBeUndefined();
  });

  it('should accept all valid provider values', () => {
    mockExistsSync.mockReturnValue(true);
    const providers = ['claude', 'opencode', 'codex', 'openrouter'];

    for (const provider of providers) {
      mockReadFileSync.mockReturnValue(JSON.stringify({
        name: 'Test',
        defaultProvider: provider,
      }));

      const config = loadGitConfig();
      expect(config!.defaultProvider).toBe(provider);
    }
  });
});
