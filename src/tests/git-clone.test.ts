import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fs from 'node:fs'
import { execFile } from 'node:child_process'
import * as path from 'node:path'
import * as os from 'node:os'

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  statSync: vi.fn(),
}))

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}))

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: vi.fn(() => actual.homedir()) };
})

vi.mock('@main/git/git-config', () => ({
  loadGitConfig: vi.fn(),
}))

vi.mock('@main/git/git-credentials', () => ({
  generateGitCredentials: vi.fn().mockReturnValue(null),
}))

import {
  cloneRepository,
  expandHomePath,
  extractRepoNameFromUrl,
  resolveCloneTargetPath,
  buildGitCloneEnv,
  runGitClone,
} from '@main/git/git-clone'
import { loadGitConfig } from '@main/git/git-config'
import { generateGitCredentials } from '@main/git/git-credentials'

const TMP_PROJECTS = path.join('/tmp', 'projects')
const TMP_PROJECTS_REPO = path.join('/tmp', 'projects', 'repo')

function normalizePath(p: string): string {
  return p.replace(/[\\/]+/g, '/')
}

describe('git-clone service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(loadGitConfig).mockReturnValue({
      name: '',
      email: '',
      githubPat: undefined,
      openaiApiKey: undefined,
      anthropicApiKey: undefined,
    })
    vi.mocked(generateGitCredentials).mockReturnValue(null)
  })

  describe('extractRepoNameFromUrl', () => {
    it('extracts from https URL with .git suffix', () => {
      expect(extractRepoNameFromUrl('https://github.com/user/repo.git')).toBe('repo')
    })

    it('extracts from https URL without .git suffix', () => {
      expect(extractRepoNameFromUrl('https://github.com/user/repo')).toBe('repo')
    })

    it('extracts from ssh URL formats', () => {
      expect(extractRepoNameFromUrl('git@github.com:user/repo.git')).toBe('repo')
      expect(extractRepoNameFromUrl('ssh://git@github.com/user/repo.git')).toBe('repo')
    })

    it('returns null for invalid URLs', () => {
      expect(extractRepoNameFromUrl('')).toBeNull()
      expect(extractRepoNameFromUrl('just-repo-name')).toBeNull()
      expect(extractRepoNameFromUrl('https://github.com')).toBeNull()
    })
  })

  describe('expandHomePath', () => {
    it('should replace ~ with home directory', () => {
      vi.mocked(os.homedir).mockReturnValue('/home/user');
      expect(expandHomePath('~/projects')).toBe('/home/user/projects');
    })

    it('should return non-tilde paths unchanged', () => {
      expect(expandHomePath('/absolute/path')).toBe('/absolute/path')
      expect(expandHomePath('relative/path')).toBe('relative/path')
    })
  })

  describe('resolveCloneTargetPath', () => {
    it('should append repo name when target ends with separator', () => {
      expect(resolveCloneTargetPath('/tmp/projects/', 'repo')).toBe(path.join('/tmp/projects', 'repo'))
    })

    it('should append repo name when target is existing directory', () => {
      vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => true } as any)
      expect(resolveCloneTargetPath('/tmp/projects', 'repo')).toBe(path.join('/tmp/projects', 'repo'))
    })

    it('should use path as-is when target does not exist and has no trailing separator', () => {
      vi.mocked(fs.statSync).mockImplementation(() => { throw new Error('not found') })
      expect(resolveCloneTargetPath('/tmp/projects/repo', 'repo')).toBe('/tmp/projects/repo')
    })

    it('should use cwd when target is empty', () => {
      const originalCwd = process.cwd;
      (process as any).cwd = () => '/current/dir';
      try {
        expect(resolveCloneTargetPath('', 'repo')).toBe(path.join('/current/dir', 'repo'))
      } finally {
        (process as any).cwd = originalCwd;
      }
    })
  })

  describe('buildGitCloneEnv', () => {
    it('should include credential helper env vars when PAT exists', () => {
      vi.mocked(loadGitConfig).mockReturnValue({
        name: '',
        email: '',
        githubPat: 'ghp_test',
        openaiApiKey: undefined,
        anthropicApiKey: undefined,
      })
      vi.mocked(generateGitCredentials).mockReturnValue('/fake/path/git-credentials')

      const env = buildGitCloneEnv()
      expect(env.GIT_TERMINAL_PROMPT).toBe('0')
      expect(env.GIT_CONFIG_COUNT).toBe('1')
      expect(env.GIT_CONFIG_KEY_0).toBe('credential.helper')
      expect(env.GIT_CONFIG_VALUE_0).toBe('store --file "/fake/path/git-credentials"')
    })

    it('should return plain env when no PAT configured', () => {
      vi.mocked(loadGitConfig).mockReturnValue({
        name: '',
        email: '',
        githubPat: undefined,
        openaiApiKey: undefined,
        anthropicApiKey: undefined,
      })
      const env = buildGitCloneEnv()
      expect(env.GIT_TERMINAL_PROMPT).toBeUndefined()
      expect(env.GIT_CONFIG_COUNT).toBeUndefined()
    })
  })

  describe('runGitClone', () => {
    it('should resolve on successful clone', async () => {
      vi.mocked(execFile).mockImplementation((file: string, args: readonly string[] | null | undefined, options: any, callback: (error: Error | null, stdout: string, stderr: string) => void) => {
        callback(null, '', '')
        // Return a mock ChildProcess with stderr event emitter
        return {
          stderr: {
            on: vi.fn()
          }
        } as any
      })

      await expect(runGitClone('url', 'path', {}))
        .resolves
        .toBeUndefined()
    })

    it('should reject on clone failure', async () => {
      vi.mocked(execFile).mockImplementation((file: string, args: readonly string[] | null | undefined, options: any, callback: (error: Error, stdout: string, stderr: string) => void) => {
        callback(new Error('clone failed'), '', 'stderr error')
        // Return a mock ChildProcess with stderr event emitter
        return {
          stderr: {
            on: vi.fn()
          }
        } as any
      })

      await expect(runGitClone('url', 'path', {}))
        .rejects
        .toThrow('stderr error')
    })
  })

  describe('cloneRepository', () => {
    it('should call git clone with correct args and return cloned path', async () => {
      // Mock fs.existsSync
      vi.spyOn(fs, 'existsSync').mockImplementation((value: fs.PathLike) => {
        const p = normalizePath(String(value))
        if (p === normalizePath(TMP_PROJECTS_REPO)) return false
        if (p === normalizePath(TMP_PROJECTS)) return true
        return false
      })

      vi.mocked(loadGitConfig).mockReturnValue({
        name: '',
        email: '',
        githubPat: 'ghp_test',
        openaiApiKey: undefined,
        anthropicApiKey: undefined,
      })
      vi.mocked(generateGitCredentials).mockReturnValue('/home/test/.yolium/git-credentials')

      vi.mocked(execFile).mockImplementation((file: string, args: readonly string[] | null | undefined, options: any, callback: (error: Error | null, stdout: string, stderr: string) => void) => {
        callback(null, '', '')
        // Return a mock ChildProcess with stderr event emitter
        return {
          stderr: {
            on: vi.fn()
          }
        } as any
      })

      const result = await cloneRepository('https://github.com/user/repo.git', '/tmp/projects/')

      expect(result).toEqual({
        success: true,
        clonedPath: TMP_PROJECTS_REPO,
        error: null,
      })

      expect(execFile).toHaveBeenCalledOnce()
      expect(execFile).toHaveBeenCalledWith(
        'git',
        ['clone', 'https://github.com/user/repo.git', TMP_PROJECTS_REPO],
        expect.objectContaining({
          env: expect.objectContaining({
            GIT_TERMINAL_PROMPT: '0',
            GIT_CONFIG_COUNT: '1',
            GIT_CONFIG_KEY_0: 'credential.helper',
            GIT_CONFIG_VALUE_0: 'store --file "/home/test/.yolium/git-credentials"',
          }),
        }),
        expect.any(Function),
      )
    })

    it('should return error for invalid URL', async () => {
      const result = await cloneRepository('not-a-valid-repo-url', '/tmp/projects/')

      expect(result).toEqual({
        success: false,
        clonedPath: null,
        error: 'Invalid repository URL',
      })
      expect(execFile).not.toHaveBeenCalled()
    })

    it('should return error when target already exists', async () => {
      // Mock fs.existsSync
      vi.spyOn(fs, 'existsSync').mockImplementation((value: fs.PathLike) => {
        const p = normalizePath(String(value))
        if (p === normalizePath(TMP_PROJECTS_REPO)) return true
        return false
      })

      const result = await cloneRepository('https://github.com/user/repo.git', '/tmp/projects/')

      expect(result.success).toBe(false)
      expect(result.error).toContain('Target already exists')
      expect(execFile).not.toHaveBeenCalled()
    })

    it('should return error when parent directory does not exist', async () => {
      // Mock fs.existsSync
      vi.spyOn(fs, 'existsSync').mockImplementation((value: fs.PathLike) => {
        const p = normalizePath(String(value))
        if (p === normalizePath(TMP_PROJECTS_REPO)) return false
        if (p === normalizePath(TMP_PROJECTS)) return false
        return false
      })

      const result = await cloneRepository('https://github.com/user/repo.git', '/tmp/projects/')

      expect(result.success).toBe(false)
      expect(result.error).toContain('Parent directory does not exist')
      expect(execFile).not.toHaveBeenCalled()
    })

    it('should return git stderr on clone failure', async () => {
      // Mock fs.existsSync
      vi.spyOn(fs, 'existsSync').mockImplementation((value: fs.PathLike) => {
        const p = normalizePath(String(value))
        if (p === normalizePath(TMP_PROJECTS_REPO)) return false
        if (p === normalizePath(TMP_PROJECTS)) return true
        return false
      })

      vi.mocked(execFile).mockImplementation((file: string, args: readonly string[] | null | undefined, options: any, callback: (error: Error, stdout: string, stderr: string) => void) => {
        callback(new Error('clone failed'), '', 'fatal: repository not found')
        // Return a mock ChildProcess with stderr event emitter
        return {
          stderr: {
            on: vi.fn()
          }
        } as any
      })

      const result = await cloneRepository('https://github.com/user/repo.git', '/tmp/projects/')

      expect(result).toEqual({
        success: false,
        clonedPath: null,
        error: 'fatal: repository not found',
      })
    })
  })
})