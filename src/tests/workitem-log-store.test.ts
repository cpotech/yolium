import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock fs — inline factory to avoid hoisting issues
vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
  appendFileSync: vi.fn(),
  readFileSync: vi.fn(() => ''),
  unlinkSync: vi.fn(),
}));

vi.mock('node:os', () => ({
  homedir: vi.fn(() => '/home/test'),
}));

vi.mock('node:path', async () => {
  const actual = await vi.importActual<typeof import('node:path')>('node:path');
  return {
    ...actual,
    resolve: vi.fn((...args: string[]) => args[args.length - 1]),
  };
});

import * as fs from 'node:fs';
import {
  projectHash,
  appendLog,
  readLog,
  deleteLog,
  appendSessionHeader,
} from '@main/stores/workitem-log-store';

const existsSyncMock = vi.mocked(fs.existsSync);
const mkdirSyncMock = vi.mocked(fs.mkdirSync);
const appendFileSyncMock = vi.mocked(fs.appendFileSync);
const readFileSyncMock = vi.mocked(fs.readFileSync);
const unlinkSyncMock = vi.mocked(fs.unlinkSync);

describe('workitem-log-store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    existsSyncMock.mockReturnValue(false);
  });

  describe('projectHash', () => {
    it('returns a 12-character hex string', () => {
      const hash = projectHash('/home/user/project');
      expect(hash).toMatch(/^[0-9a-f]{12}$/);
    });

    it('returns consistent hash for same path', () => {
      const hash1 = projectHash('/home/user/project');
      const hash2 = projectHash('/home/user/project');
      expect(hash1).toBe(hash2);
    });

    it('returns different hash for different paths', () => {
      const hash1 = projectHash('/home/user/project1');
      const hash2 = projectHash('/home/user/project2');
      expect(hash1).not.toBe(hash2);
    });

    it('strips trailing slash', () => {
      const hash1 = projectHash('/home/user/project');
      const hash2 = projectHash('/home/user/project/');
      expect(hash1).toBe(hash2);
    });
  });

  describe('appendLog', () => {
    it('creates directory and appends data to log file', () => {
      appendLog('/project', 'item-1', 'hello world');

      expect(mkdirSyncMock).toHaveBeenCalledWith(
        expect.stringContaining('logs'),
        { recursive: true },
      );
      expect(appendFileSyncMock).toHaveBeenCalledWith(
        expect.stringContaining('item-1.log'),
        'hello world',
      );
    });

    it('appends multiple calls to the same file', () => {
      appendLog('/project', 'item-1', 'line 1\n');
      appendLog('/project', 'item-1', 'line 2\n');

      expect(appendFileSyncMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('readLog', () => {
    it('returns empty string when log file does not exist', () => {
      existsSyncMock.mockReturnValue(false);

      const result = readLog('/project', 'item-1');
      expect(result).toBe('');
    });

    it('returns file contents when log exists', () => {
      existsSyncMock.mockReturnValue(true);
      readFileSyncMock.mockReturnValue('line 1\nline 2\n');

      const result = readLog('/project', 'item-1');
      expect(result).toBe('line 1\nline 2\n');
    });

    it('returns empty string on read error', () => {
      existsSyncMock.mockReturnValue(true);
      readFileSyncMock.mockImplementation(() => {
        throw new Error('permission denied');
      });

      const result = readLog('/project', 'item-1');
      expect(result).toBe('');
    });
  });

  describe('deleteLog', () => {
    it('returns false when log file does not exist', () => {
      existsSyncMock.mockReturnValue(false);

      const result = deleteLog('/project', 'item-1');
      expect(result).toBe(false);
      expect(unlinkSyncMock).not.toHaveBeenCalled();
    });

    it('deletes log file and returns true when it exists', () => {
      existsSyncMock.mockReturnValue(true);

      const result = deleteLog('/project', 'item-1');
      expect(result).toBe(true);
      expect(unlinkSyncMock).toHaveBeenCalledWith(
        expect.stringContaining('item-1.log'),
      );
    });
  });

  describe('appendSessionHeader', () => {
    it('appends a session header with agent name and timestamp', () => {
      appendSessionHeader('/project', 'item-1', 'code-agent');

      expect(appendFileSyncMock).toHaveBeenCalledWith(
        expect.stringContaining('item-1.log'),
        expect.stringMatching(/--- code-agent session started at .+ ---/),
      );
    });
  });
});
