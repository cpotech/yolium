import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => false),
}));

import * as fs from 'node:fs';
import * as path from 'node:path';
import { getToolsDir, resolveToolDir } from '@main/services/tools-resolver';

describe('tools-resolver', () => {
  let originalResourcesPath: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    originalResourcesPath = process.resourcesPath;
  });

  afterEach(() => {
    if (originalResourcesPath === undefined) {
      Object.defineProperty(process, 'resourcesPath', { value: undefined, writable: true, configurable: true });
    } else {
      Object.defineProperty(process, 'resourcesPath', { value: originalResourcesPath, writable: true, configurable: true });
    }
  });

  it('should return the base tools directory from getToolsDir()', () => {
    const dir = getToolsDir();
    expect(dir).toMatch(/tools$/);
  });

  it('should return absolute path to src/tools/{name} in dev when directory exists', () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      return typeof p === 'string' && p.endsWith(path.sep + 'twitter');
    });

    const result = resolveToolDir('twitter');
    expect(result).not.toBeNull();
    expect(result).toMatch(/tools[/\\]twitter$/);
  });

  it('should return null when requested tool directory does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const result = resolveToolDir('nonexistent');
    expect(result).toBeNull();
  });

  it('should return resources/tools/{name} path in production when process.resourcesPath is set', () => {
    Object.defineProperty(process, 'resourcesPath', { value: '/app/resources', writable: true, configurable: true });

    const expectedPath = path.join('/app/resources', 'tools', 'twitter');
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      return p === expectedPath;
    });

    const result = resolveToolDir('twitter');
    expect(result).toBe(expectedPath);
  });

  it('should handle tool names with hyphens and underscores', () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      return typeof p === 'string' && (p.endsWith(path.sep + 'my-tool') || p.endsWith(path.sep + 'my_tool'));
    });

    const hyphenResult = resolveToolDir('my-tool');
    expect(hyphenResult).not.toBeNull();
    expect(hyphenResult).toMatch(/my-tool$/);

    const underscoreResult = resolveToolDir('my_tool');
    expect(underscoreResult).not.toBeNull();
    expect(underscoreResult).toMatch(/my_tool$/);
  });
});
