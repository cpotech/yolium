import { describe, it, expect } from 'vitest';
import {
  normalizePath,
  getParentDirectory,
  ensureTrailingSeparator,
  hasTrailingSeparator,
  getBasename,
  PATH_SEP,
} from '../lib/path-utils';

describe('path-utils', () => {
  describe('normalizePath', () => {
    it('should convert backslashes to forward slashes', () => {
      expect(normalizePath('C:\\Users\\name\\Documents')).toBe('C:/Users/name/Documents');
    });

    it('should leave forward slashes unchanged', () => {
      expect(normalizePath('/home/user/documents')).toBe('/home/user/documents');
    });

    it('should handle mixed separators', () => {
      expect(normalizePath('C:\\Users/name\\Documents/projects')).toBe('C:/Users/name/Documents/projects');
    });

    it('should handle empty string', () => {
      expect(normalizePath('')).toBe('');
    });

    it('should handle root paths', () => {
      expect(normalizePath('/')).toBe('/');
      expect(normalizePath('\\')).toBe('/');
      expect(normalizePath('C:\\')).toBe('C:/');
    });

    it('should collapse multiple separators', () => {
      expect(normalizePath('C:\\\\Users\\\\name')).toBe('C:/Users/name');
      expect(normalizePath('//home//user')).toBe('/home/user');
    });

    it('should not collapse leading double slash (UNC paths)', () => {
      // UNC paths start with \\ and should be preserved as //
      expect(normalizePath('\\\\server\\share')).toBe('//server/share');
    });
  });

  describe('getParentDirectory', () => {
    it('should return parent of Unix path', () => {
      expect(getParentDirectory('/home/user/documents/')).toBe('/home/user/');
      expect(getParentDirectory('/home/user/documents')).toBe('/home/user/');
    });

    it('should return parent of Windows path', () => {
      expect(getParentDirectory('C:\\Users\\name\\Documents\\')).toBe('C:/Users/name/');
      expect(getParentDirectory('C:\\Users\\name\\Documents')).toBe('C:/Users/name/');
    });

    it('should return root for top-level directory', () => {
      expect(getParentDirectory('/home/')).toBe('/');
      expect(getParentDirectory('C:\\Users\\')).toBe('C:/');
    });

    it('should return empty for root path', () => {
      expect(getParentDirectory('/')).toBe('/');
      expect(getParentDirectory('C:/')).toBe('C:/');
    });

    it('should handle tilde paths', () => {
      expect(getParentDirectory('~/projects/myapp/')).toBe('~/projects/');
      expect(getParentDirectory('~/')).toBe('~/');
    });
  });

  describe('ensureTrailingSeparator', () => {
    it('should add trailing separator if missing', () => {
      expect(ensureTrailingSeparator('/home/user')).toBe('/home/user/');
      expect(ensureTrailingSeparator('C:\\Users\\name')).toBe('C:/Users/name/');
    });

    it('should not duplicate trailing separator', () => {
      expect(ensureTrailingSeparator('/home/user/')).toBe('/home/user/');
      expect(ensureTrailingSeparator('C:\\Users\\name\\')).toBe('C:/Users/name/');
    });

    it('should handle empty string', () => {
      expect(ensureTrailingSeparator('')).toBe('/');
    });

    it('should handle root paths', () => {
      expect(ensureTrailingSeparator('/')).toBe('/');
      expect(ensureTrailingSeparator('C:/')).toBe('C:/');
    });
  });

  describe('hasTrailingSeparator', () => {
    it('should detect forward slash', () => {
      expect(hasTrailingSeparator('/home/user/')).toBe(true);
      expect(hasTrailingSeparator('/home/user')).toBe(false);
    });

    it('should detect backslash', () => {
      expect(hasTrailingSeparator('C:\\Users\\name\\')).toBe(true);
      expect(hasTrailingSeparator('C:\\Users\\name')).toBe(false);
    });

    it('should handle empty string', () => {
      expect(hasTrailingSeparator('')).toBe(false);
    });
  });

  describe('getBasename', () => {
    it('should extract basename from Unix path', () => {
      expect(getBasename('/home/user/documents')).toBe('documents');
      expect(getBasename('/home/user/documents/')).toBe('documents');
    });

    it('should extract basename from Windows path', () => {
      expect(getBasename('C:\\Users\\name\\Documents')).toBe('Documents');
      expect(getBasename('C:\\Users\\name\\Documents\\')).toBe('Documents');
    });

    it('should handle root paths', () => {
      expect(getBasename('/')).toBe('');
      expect(getBasename('C:/')).toBe('');
      expect(getBasename('C:\\')).toBe('');
    });

    it('should handle tilde paths', () => {
      expect(getBasename('~/projects/myapp')).toBe('myapp');
    });
  });

  describe('PATH_SEP', () => {
    it('should always be forward slash for UI consistency', () => {
      expect(PATH_SEP).toBe('/');
    });
  });
});
