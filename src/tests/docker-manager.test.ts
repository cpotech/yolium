import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as path from 'node:path'
import * as os from 'node:os'
import * as crypto from 'node:crypto'

// Test pure utility functions from docker-manager
// These are extracted/reimplemented here since they're not exported

/**
 * Normalize a host path for use in Docker bind mount strings.
 * On Windows, converts backslashes to forward slashes (Docker requirement).
 * On Linux/macOS, returns the path unchanged.
 */
function toDockerPath(hostPath: string, isWindows: boolean): string {
  if (!isWindows) return hostPath
  // Convert backslashes to forward slashes for Docker
  return hostPath.replace(/\\/g, '/')
}

/**
 * Generate a 12-character SHA256 hash of the absolute project path.
 */
function hashProjectPath(projectPath: string): string {
  const absolutePath = path.resolve(projectPath)
  return crypto.createHash('sha256')
    .update(absolutePath)
    .digest('hex')
    .substring(0, 12)
}

/**
 * Sanitize a folder name for use in directory names.
 */
function sanitizeFolderName(folderPath: string): string {
  const folderName = path.basename(folderPath)
  return folderName
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 30)
}

/**
 * Generate a project directory name combining folder name and hash.
 */
function getProjectDirName(projectPath: string): string {
  const sanitizedName = sanitizeFolderName(projectPath)
  const hash = hashProjectPath(projectPath)
  return sanitizedName ? `${sanitizedName}-${hash}` : `project-${hash}`
}

describe('docker-manager utilities', () => {
  describe('hashProjectPath', () => {
    it('returns a 12-character hex string', () => {
      const hash = hashProjectPath('/home/user/project')
      expect(hash).toMatch(/^[a-f0-9]{12}$/)
    })

    it('returns same hash for same path', () => {
      const hash1 = hashProjectPath('/home/user/project')
      const hash2 = hashProjectPath('/home/user/project')
      expect(hash1).toBe(hash2)
    })

    it('returns different hash for different paths', () => {
      const hash1 = hashProjectPath('/home/user/project1')
      const hash2 = hashProjectPath('/home/user/project2')
      expect(hash1).not.toBe(hash2)
    })

    it('resolves relative paths', () => {
      const hash1 = hashProjectPath('./project')
      const hash2 = hashProjectPath(path.resolve('./project'))
      expect(hash1).toBe(hash2)
    })
  })

  describe('sanitizeFolderName', () => {
    it('converts to lowercase', () => {
      expect(sanitizeFolderName('/path/to/MyProject')).toBe('myproject')
    })

    it('replaces special characters with hyphens', () => {
      expect(sanitizeFolderName('/path/my project')).toBe('my-project')
      expect(sanitizeFolderName('/path/my@project!')).toBe('my-project')
    })

    it('collapses multiple hyphens', () => {
      expect(sanitizeFolderName('/path/my---project')).toBe('my-project')
    })

    it('trims leading and trailing hyphens', () => {
      expect(sanitizeFolderName('/path/-project-')).toBe('project')
    })

    it('limits length to 30 characters', () => {
      const longName = 'a'.repeat(50)
      expect(sanitizeFolderName(`/path/${longName}`).length).toBeLessThanOrEqual(30)
    })

    it('preserves alphanumeric and valid characters', () => {
      expect(sanitizeFolderName('/path/my-project_123')).toBe('my-project_123')
    })
  })

  describe('getProjectDirName', () => {
    it('combines sanitized name and hash', () => {
      const dirName = getProjectDirName('/home/user/MyProject')
      expect(dirName).toMatch(/^myproject-[a-f0-9]{12}$/)
    })

    it('uses project prefix when folder name is empty after sanitization', () => {
      const dirName = getProjectDirName('/path/---')
      expect(dirName).toMatch(/^project-[a-f0-9]{12}$/)
    })

    it('generates unique names for different projects', () => {
      const name1 = getProjectDirName('/home/user/project1')
      const name2 = getProjectDirName('/home/user/project2')
      expect(name1).not.toBe(name2)
    })

    it('generates same name for same project', () => {
      const name1 = getProjectDirName('/home/user/project')
      const name2 = getProjectDirName('/home/user/project')
      expect(name1).toBe(name2)
    })
  })

  describe('toDockerPath', () => {
    it('returns path unchanged on non-Windows', () => {
      const linuxPath = '/home/user/project'
      expect(toDockerPath(linuxPath, false)).toBe(linuxPath)
    })

    it('returns path unchanged for Unix paths on Windows', () => {
      // Unix-style paths should still work (forward slashes are valid)
      const unixPath = '/home/user/project'
      expect(toDockerPath(unixPath, true)).toBe(unixPath)
    })

    it('converts Windows backslashes to forward slashes', () => {
      const windowsPath = 'C:\\Users\\name\\project'
      expect(toDockerPath(windowsPath, true)).toBe('C:/Users/name/project')
    })

    it('handles mixed slashes on Windows', () => {
      const mixedPath = 'C:\\Users/name\\project'
      expect(toDockerPath(mixedPath, true)).toBe('C:/Users/name/project')
    })

    it('handles nested Windows paths', () => {
      const deepPath = 'C:\\Users\\name\\.cache\\yolium\\project\\npm'
      expect(toDockerPath(deepPath, true)).toBe('C:/Users/name/.cache/yolium/project/npm')
    })

    it('handles paths with spaces on Windows', () => {
      const pathWithSpaces = 'C:\\Users\\User Name\\My Project'
      expect(toDockerPath(pathWithSpaces, true)).toBe('C:/Users/User Name/My Project')
    })
  })
})
