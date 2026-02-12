import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fs from 'node:fs'
import { execFile } from 'node:child_process'
import * as path from 'node:path'
import type { IpcMain } from 'electron'

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  statSync: vi.fn(),
  readdirSync: vi.fn(),
}))

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}))

vi.mock('@main/lib/logger', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}))

vi.mock('@main/git/git-config', () => ({
  loadGitConfig: vi.fn(),
  loadDetectedGitConfig: vi.fn(),
  saveGitConfig: vi.fn(),
  fetchGitHubUser: vi.fn(),
  hasHostClaudeOAuth: vi.fn(() => false),
  hasHostCodexOAuth: vi.fn(() => false),
  generateGitCredentials: vi.fn(),
}))

vi.mock('@main/git/git-worktree', () => ({
  isGitRepo: vi.fn(() => false),
  hasCommits: vi.fn(() => false),
  getWorktreeBranch: vi.fn(() => null),
  initGitRepoWithDefaults: vi.fn(() => ({ initialized: true, hasCommits: true })),
  validateBranchNameForUi: vi.fn(() => ({ valid: true, error: null })),
  mergeWorktreeBranch: vi.fn(),
  getWorktreeDiffStats: vi.fn(() => ({ filesChanged: 0, insertions: 0, deletions: 0 })),
  cleanupWorktreeAndBranch: vi.fn(),
  mergeBranchAndPushPR: vi.fn(),
  checkMergeConflicts: vi.fn(() => ({ clean: true, conflictingFiles: [] })),
}))

import {
  registerGitHandlers,
  extractRepoNameFromUrl,
  GIT_IPC_CHANNELS,
  type GitCloneResult,
} from '@main/ipc/git-handlers'
import {
  loadGitConfig,
  generateGitCredentials,
} from '@main/git/git-config'
import { initGitRepoWithDefaults } from '@main/git/git-worktree'

type CloneHandler = (_event: unknown, url: string, targetDir: string) => Promise<GitCloneResult>

const TMP_PROJECTS = path.join('/tmp', 'projects')
const TMP_PROJECTS_REPO = path.join('/tmp', 'projects', 'repo')
const TMP_PROJECT = path.join('/tmp', 'project')

function normalizePath(p: string): string {
  return p.replace(/[\\/]+/g, '/')
}

function registerGitHandlersForTest(): {
  handlers: Map<string, unknown>
  handleSpy: ReturnType<typeof vi.fn>
} {
  const handlers = new Map<string, unknown>()
  const handleSpy = vi.fn((channel: string, handler: unknown) => {
    handlers.set(channel, handler)
  })
  const ipcMain = {
    handle: handleSpy,
  } as unknown as IpcMain

  registerGitHandlers(ipcMain)
  return { handlers, handleSpy }
}

function registerAndGetCloneHandler(): CloneHandler {
  const { handlers } = registerGitHandlersForTest()
  const cloneHandler = handlers.get('git:clone')
  if (typeof cloneHandler !== 'function') {
    throw new Error('git:clone handler was not registered')
  }

  return cloneHandler as CloneHandler
}

function mockCloneSuccess(): void {
  vi.mocked(execFile).mockImplementation(((_file: unknown, _args: unknown, _opts: unknown, callback: unknown) => {
    const done = callback as (error: Error | null, stdout: string, stderr: string) => void
    done(null, '', '')
    return { stderr: { on: vi.fn() } }
  }) as typeof execFile)
}

function mockCloneFailure(stderr: string): void {
  vi.mocked(execFile).mockImplementation(((_file: unknown, _args: unknown, _opts: unknown, callback: unknown) => {
    const done = callback as (error: Error, stdout: string, stderr: string) => void
    done(new Error('clone failed'), '', stderr)
    return { stderr: { on: vi.fn() } }
  }) as typeof execFile)
}

describe('git:clone handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCloneSuccess()
    vi.mocked(loadGitConfig).mockReturnValue(null)
    vi.mocked(generateGitCredentials).mockReturnValue(null)
  })

  it('registers all declared git IPC channels and includes git:clone', () => {
    const { handlers, handleSpy } = registerGitHandlersForTest()

    expect(GIT_IPC_CHANNELS).toContain('git:clone')
    expect(handleSpy).toHaveBeenCalledTimes(GIT_IPC_CHANNELS.length)
    for (const channel of GIT_IPC_CHANNELS) {
      expect(handlers.has(channel)).toBe(true)
    }
  })

  it('passes optional project types to git:init handler', async () => {
    const { handlers } = registerGitHandlersForTest()
    const initHandler = handlers.get('git:init') as ((event: unknown, folderPath: string, projectTypes?: string[]) => unknown) | undefined
    expect(initHandler).toBeTypeOf('function')

    const result = initHandler?.({}, TMP_PROJECT, ['nodejs', 'python']) as { success: boolean }

    expect(result.success).toBe(true)
    expect(initGitRepoWithDefaults).toHaveBeenCalledWith(TMP_PROJECT, ['nodejs', 'python'])
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

  it('clones into target path and configures git credential helper when PAT exists', async () => {
    const cloneHandler = registerAndGetCloneHandler()
    vi.mocked(loadGitConfig).mockReturnValue({
      name: 'Test User',
      email: 'test@example.com',
      githubPat: 'ghp_test',
    })
    vi.mocked(generateGitCredentials).mockReturnValue('/home/test/.yolium/git-credentials')

    vi.mocked(fs.existsSync).mockImplementation((value: fs.PathLike) => {
      const p = normalizePath(String(value))
      if (p === normalizePath(TMP_PROJECTS_REPO)) return false
      if (p === normalizePath(TMP_PROJECTS)) return true
      return false
    })

    const result = await cloneHandler({}, 'https://github.com/user/repo.git', '/tmp/projects/')

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

  it('clones without credential helper env when PAT is not configured', async () => {
    const cloneHandler = registerAndGetCloneHandler()
    vi.mocked(fs.existsSync).mockImplementation((value: fs.PathLike) => {
      const p = normalizePath(String(value))
      if (p === normalizePath(TMP_PROJECTS_REPO)) return false
      if (p === normalizePath(TMP_PROJECTS)) return true
      return false
    })

    const result = await cloneHandler({}, 'https://github.com/user/repo.git', '/tmp/projects/')

    expect(result.success).toBe(true)

    const cloneOptions = vi.mocked(execFile).mock.calls[0][2] as { env?: NodeJS.ProcessEnv }
    expect(cloneOptions.env?.GIT_CONFIG_COUNT).toBeUndefined()
    expect(generateGitCredentials).not.toHaveBeenCalled()
  })

  it('returns validation error for invalid URL', async () => {
    const cloneHandler = registerAndGetCloneHandler()

    const result = await cloneHandler({}, 'not-a-valid-repo-url', '/tmp/projects/')

    expect(result).toEqual({
      success: false,
      clonedPath: null,
      error: 'Invalid repository URL',
    })
    expect(execFile).not.toHaveBeenCalled()
  })

  it('returns a clear error when target directory already exists', async () => {
    const cloneHandler = registerAndGetCloneHandler()
    vi.mocked(fs.existsSync).mockImplementation((value: fs.PathLike) => {
      const p = normalizePath(String(value))
      if (p === normalizePath(TMP_PROJECTS_REPO)) return true
      return false
    })

    const result = await cloneHandler({}, 'https://github.com/user/repo.git', '/tmp/projects/')

    expect(result.success).toBe(false)
    expect(result.error).toContain('Target already exists')
    expect(execFile).not.toHaveBeenCalled()
  })

  it('returns git clone stderr on clone failure', async () => {
    const cloneHandler = registerAndGetCloneHandler()
    mockCloneFailure('fatal: repository not found')

    vi.mocked(fs.existsSync).mockImplementation((value: fs.PathLike) => {
      const p = normalizePath(String(value))
      if (p === normalizePath(TMP_PROJECTS_REPO)) return false
      if (p === normalizePath(TMP_PROJECTS)) return true
      return false
    })

    const result = await cloneHandler({}, 'https://github.com/user/repo.git', '/tmp/projects/')

    expect(result).toEqual({
      success: false,
      clonedPath: null,
      error: 'fatal: repository not found',
    })
  })
})
