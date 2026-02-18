import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as path from 'node:path';

vi.mock('electron', () => ({
  app: { isPackaged: false },
}));

vi.mock('@main/lib/logger', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(() => false),
  statSync: vi.fn(() => ({ isDirectory: () => false })),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

import * as fs from 'node:fs';
import { loadProjectConfig, isValidSharedDir, getValidatedSharedDirs, saveProjectConfig, checkSharedDirExists } from '@main/services/project-config';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('loadProjectConfig', () => {
  it('returns parsed config when .yolium.json exists', () => {
    vi.mocked(fs.readFileSync).mockReturnValue('{"sharedDirs":["samples","test-data"]}');

    const config = loadProjectConfig('/home/user/project');

    expect(config).toEqual({ sharedDirs: ['samples', 'test-data'] });
    expect(fs.readFileSync).toHaveBeenCalledWith(path.join('/home/user/project', '.yolium.json'), 'utf-8');
  });

  it('returns null when file does not exist', () => {
    const err = new Error('ENOENT') as NodeJS.ErrnoException;
    err.code = 'ENOENT';
    vi.mocked(fs.readFileSync).mockImplementation(() => { throw err; });

    const config = loadProjectConfig('/home/user/project');

    expect(config).toBeNull();
  });

  it('returns null for invalid JSON', () => {
    vi.mocked(fs.readFileSync).mockReturnValue('not json');

    const config = loadProjectConfig('/home/user/project');

    expect(config).toBeNull();
  });

  it('returns null when file is a JSON array', () => {
    vi.mocked(fs.readFileSync).mockReturnValue('["samples"]');

    const config = loadProjectConfig('/home/user/project');

    expect(config).toBeNull();
  });

  it('returns null when file is a JSON primitive', () => {
    vi.mocked(fs.readFileSync).mockReturnValue('"hello"');

    const config = loadProjectConfig('/home/user/project');

    expect(config).toBeNull();
  });

  it('returns config when sharedDirs is missing', () => {
    vi.mocked(fs.readFileSync).mockReturnValue('{"otherKey":"value"}');

    const config = loadProjectConfig('/home/user/project');

    expect(config).toEqual({ otherKey: 'value' });
  });
});

describe('isValidSharedDir', () => {
  it('accepts simple relative paths', () => {
    expect(isValidSharedDir('samples')).toBe(true);
    expect(isValidSharedDir('test-data')).toBe(true);
    expect(isValidSharedDir('data/fixtures')).toBe(true);
  });

  it('rejects empty strings', () => {
    expect(isValidSharedDir('')).toBe(false);
  });

  it('rejects absolute paths', () => {
    expect(isValidSharedDir('/etc/passwd')).toBe(false);
    expect(isValidSharedDir('/home/user/secret')).toBe(false);
  });

  it('rejects path traversal with ../', () => {
    expect(isValidSharedDir('../secret')).toBe(false);
    expect(isValidSharedDir('foo/../../etc')).toBe(false);
    expect(isValidSharedDir('..')).toBe(false);
  });

  it('rejects non-string values', () => {
    expect(isValidSharedDir(null)).toBe(false);
    expect(isValidSharedDir(undefined)).toBe(false);
    expect(isValidSharedDir(123)).toBe(false);
    expect(isValidSharedDir({})).toBe(false);
  });
});

describe('getValidatedSharedDirs', () => {
  it('returns valid, existing directories', () => {
    vi.mocked(fs.readFileSync).mockReturnValue('{"sharedDirs":["samples","test-data"]}');
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => true } as fs.Stats);

    const dirs = getValidatedSharedDirs('/home/user/project');

    expect(dirs).toEqual(['samples', 'test-data']);
  });

  it('filters out non-existent directories', () => {
    vi.mocked(fs.readFileSync).mockReturnValue('{"sharedDirs":["exists","missing"]}');
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      return String(p).includes('exists');
    });
    vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => true } as fs.Stats);

    const dirs = getValidatedSharedDirs('/home/user/project');

    expect(dirs).toEqual(['exists']);
  });

  it('filters out invalid paths', () => {
    vi.mocked(fs.readFileSync).mockReturnValue('{"sharedDirs":["good","../evil","/absolute","","also-good"]}');
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => true } as fs.Stats);

    const dirs = getValidatedSharedDirs('/home/user/project');

    expect(dirs).toEqual(['good', 'also-good']);
  });

  it('returns empty array when no config file exists', () => {
    const err = new Error('ENOENT') as NodeJS.ErrnoException;
    err.code = 'ENOENT';
    vi.mocked(fs.readFileSync).mockImplementation(() => { throw err; });

    const dirs = getValidatedSharedDirs('/home/user/project');

    expect(dirs).toEqual([]);
  });

  it('returns empty array when sharedDirs is not an array', () => {
    vi.mocked(fs.readFileSync).mockReturnValue('{"sharedDirs":"not-an-array"}');

    const dirs = getValidatedSharedDirs('/home/user/project');

    expect(dirs).toEqual([]);
  });

  it('returns empty array when sharedDirs is missing', () => {
    vi.mocked(fs.readFileSync).mockReturnValue('{}');

    const dirs = getValidatedSharedDirs('/home/user/project');

    expect(dirs).toEqual([]);
  });

  it('filters out paths that exist but are not directories', () => {
    vi.mocked(fs.readFileSync).mockReturnValue('{"sharedDirs":["a-file"]}');
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => false } as fs.Stats);

    const dirs = getValidatedSharedDirs('/home/user/project');

    expect(dirs).toEqual([]);
  });
});

describe('saveProjectConfig', () => {
  it('saves new config when .yolium.json does not exist', () => {
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      const err = new Error('ENOENT') as NodeJS.ErrnoException;
      err.code = 'ENOENT';
      throw err;
    });

    saveProjectConfig('/home/user/project', { sharedDirs: ['samples'] });

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      path.join('/home/user/project', '.yolium.json'),
      JSON.stringify({ sharedDirs: ['samples'] }, null, 2) + '\n',
      'utf-8'
    );
  });

  it('preserves existing unknown keys when saving', () => {
    vi.mocked(fs.readFileSync).mockReturnValue('{"customKey":"value","sharedDirs":["old"]}');

    saveProjectConfig('/home/user/project', { sharedDirs: ['new-dir'] });

    const written = vi.mocked(fs.writeFileSync).mock.calls[0][1] as string;
    const parsed = JSON.parse(written);
    expect(parsed.customKey).toBe('value');
    expect(parsed.sharedDirs).toEqual(['new-dir']);
  });

  it('overwrites sharedDirs field correctly', () => {
    vi.mocked(fs.readFileSync).mockReturnValue('{"sharedDirs":["old-dir"]}');

    saveProjectConfig('/home/user/project', { sharedDirs: ['new-dir-1', 'new-dir-2'] });

    const written = vi.mocked(fs.writeFileSync).mock.calls[0][1] as string;
    const parsed = JSON.parse(written);
    expect(parsed.sharedDirs).toEqual(['new-dir-1', 'new-dir-2']);
  });

  it('writes valid JSON with pretty formatting', () => {
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('ENOENT');
    });

    saveProjectConfig('/home/user/project', { sharedDirs: ['dir'] });

    const written = vi.mocked(fs.writeFileSync).mock.calls[0][1] as string;
    expect(written).toBe(JSON.stringify({ sharedDirs: ['dir'] }, null, 2) + '\n');
    // Verify trailing newline
    expect(written.endsWith('\n')).toBe(true);
  });
});

describe('checkSharedDirExists', () => {
  it('returns true for existing directory', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => true } as fs.Stats);

    expect(checkSharedDirExists('/home/user/project', 'samples')).toBe(true);
  });

  it('returns false for non-existent path', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    expect(checkSharedDirExists('/home/user/project', 'missing')).toBe(false);
  });

  it('returns false for a file (not directory)', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => false } as fs.Stats);

    expect(checkSharedDirExists('/home/user/project', 'a-file.txt')).toBe(false);
  });
});
