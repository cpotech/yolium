/**
 * Tests for the providerModels feature: migration from providerModelDefaults
 * in loadGitConfig.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';

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
vi.mock('node:fs', () => ({
  existsSync: (...args: unknown[]) => mockExistsSync(...args),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
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

import { loadGitConfig } from '@main/git/git-config';

describe('providerModels migration in loadGitConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should migrate providerModelDefaults to providerModels when providerModels is absent', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({
      name: 'Test User',
      email: 'test@example.com',
      providerModelDefaults: {
        claude: 'opus',
        codex: 'o3-mini',
      },
    }));

    const config = loadGitConfig();

    expect(config).not.toBeNull();
    expect(config!.providerModels).toEqual({
      claude: ['opus'],
      codex: ['o3-mini'],
    });
    // Original providerModelDefaults should still be present
    expect(config!.providerModelDefaults).toEqual({
      claude: 'opus',
      codex: 'o3-mini',
    });
  });

  it('should NOT overwrite providerModels when already present', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({
      name: 'Test User',
      email: 'test@example.com',
      providerModelDefaults: {
        claude: 'opus',
      },
      providerModels: {
        claude: ['opus', 'sonnet', 'haiku'],
        codex: ['o3-mini'],
      },
    }));

    const config = loadGitConfig();

    expect(config).not.toBeNull();
    expect(config!.providerModels).toEqual({
      claude: ['opus', 'sonnet', 'haiku'],
      codex: ['o3-mini'],
    });
  });

  it('should return config with providerModels as a meaningful value', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({
      providerModels: {
        claude: ['opus'],
      },
    }));

    const config = loadGitConfig();

    expect(config).not.toBeNull();
    expect(config!.providerModels).toEqual({ claude: ['opus'] });
  });

  it('should skip empty providerModelDefaults entries during migration', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({
      name: 'Test',
      providerModelDefaults: {
        claude: 'opus',
        codex: '',
        opencode: 'sonnet',
      },
    }));

    const config = loadGitConfig();

    expect(config).not.toBeNull();
    expect(config!.providerModels).toEqual({
      claude: ['opus'],
      opencode: ['sonnet'],
    });
    expect(config!.providerModels!['codex']).toBeUndefined();
  });

  it('should return null when config file does not exist', () => {
    mockExistsSync.mockReturnValue(false);

    const config = loadGitConfig();

    expect(config).toBeNull();
  });

  it('should not create providerModels when providerModelDefaults is empty', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({
      name: 'Test',
      providerModelDefaults: {},
    }));

    const config = loadGitConfig();

    expect(config).not.toBeNull();
    expect(config!.providerModels).toBeUndefined();
  });
});
