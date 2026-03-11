import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}))

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  writeFileSync: vi.fn(),
}))

import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import {
  getDefaultBranch,
  hasCommits,
  initGitRepo,
  initGitRepoWithDefaults,
  sanitizeBranchName,
  validateBranchNameForUi,
} from '@main/git/git-repository'

describe('git-repository', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(execFileSync).mockReturnValue(Buffer.from(''))
  })

  it('sanitizeBranchName should replace colons with slashes and remove trailing separators', () => {
    expect(sanitizeBranchName('fix:plan:')).toBe('fix/plan')
  })

  it('validateBranchNameForUi should return an invalid result when git check-ref-format fails', () => {
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error('invalid ref')
    })

    expect(validateBranchNameForUi('bad..branch')).toEqual({
      valid: false,
      error: 'Invalid branch name: does not match git branch naming rules',
    })
  })

  it('initGitRepo should return false when the folder is already a git repository', () => {
    vi.mocked(execFileSync).mockImplementation((cmd: string, args?: readonly string[]) => {
      const command = `${cmd} ${(args || []).join(' ')}`
      if (command === 'git rev-parse --is-inside-work-tree') {
        return Buffer.from('true')
      }
      throw new Error(`Unexpected command: ${command}`)
    })

    expect(initGitRepo('/existing/repo')).toBe(false)
  })

  it('initGitRepo should throw a prefixed error when git init fails', () => {
    vi.mocked(execFileSync).mockImplementation((cmd: string, args?: readonly string[]) => {
      const command = `${cmd} ${(args || []).join(' ')}`
      if (command === 'git rev-parse --is-inside-work-tree') {
        throw new Error('not a repo')
      }
      if (command === 'git init') {
        const error = new Error('git init failed') as Error & { stderr: Buffer }
        error.stderr = Buffer.from('permission denied')
        throw error
      }
      throw new Error(`Unexpected command: ${command}`)
    })

    expect(() => initGitRepo('/project')).toThrow(
      'Failed to initialize git repository: permission denied',
    )
  })

  it('initGitRepoWithDefaults should write a generated .gitignore and create the initial commit for a new repo', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false)
    vi.mocked(execFileSync).mockImplementation((cmd: string, args?: readonly string[]) => {
      const command = `${cmd} ${(args || []).join(' ')}`
      if (command === 'git rev-parse --is-inside-work-tree') throw new Error('not a repo')
      if (command === 'git init') return Buffer.from('initialized')
      if (command === 'git add .gitignore') return Buffer.from('')
      if (command === 'git config user.name') return Buffer.from('AI Agent (Yolium)')
      if (command === 'git config user.email') return Buffer.from('agent@yolium')
      if (command === 'git commit --allow-empty -m chore: initial commit') return Buffer.from('')
      throw new Error(`Unexpected command: ${command}`)
    })

    const result = initGitRepoWithDefaults('/project', ['nodejs'])

    expect(result).toEqual({ initialized: true, hasCommits: true })
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      '/project/.gitignore',
      expect.stringContaining('node_modules/'),
      'utf-8',
    )
    expect(execFileSync).toHaveBeenCalledWith(
      'git',
      ['commit', '--allow-empty', '-m', 'chore: initial commit'],
      expect.objectContaining({ cwd: '/project', stdio: 'ignore' }),
    )
  })

  it('initGitRepoWithDefaults should return the existing commit state without writing files when the repo already exists', () => {
    vi.mocked(execFileSync).mockImplementation((cmd: string, args?: readonly string[]) => {
      const command = `${cmd} ${(args || []).join(' ')}`
      if (command === 'git rev-parse --is-inside-work-tree') return Buffer.from('true')
      if (command === 'git rev-parse HEAD') return Buffer.from('abc123')
      throw new Error(`Unexpected command: ${command}`)
    })

    expect(initGitRepoWithDefaults('/existing/repo', ['python'])).toEqual({
      initialized: false,
      hasCommits: true,
    })
    expect(fs.writeFileSync).not.toHaveBeenCalled()
  })

  it('getDefaultBranch should prefer refs/remotes/origin/HEAD before falling back to local main or master', () => {
    vi.mocked(execFileSync).mockImplementation((cmd: string, args?: readonly string[]) => {
      const command = `${cmd} ${(args || []).join(' ')}`
      if (command === 'git symbolic-ref refs/remotes/origin/HEAD') {
        return 'refs/remotes/origin/main'
      }
      throw new Error(`Unexpected command: ${command}`)
    })

    expect(getDefaultBranch('/project')).toBe('main')
    expect(execFileSync).not.toHaveBeenCalledWith(
      'git',
      ['rev-parse', '--verify', 'main'],
      expect.any(Object),
    )
  })

  it('hasCommits should return false when rev-parse HEAD fails', () => {
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error('fatal: bad revision HEAD')
    })

    expect(hasCommits('/empty/repo')).toBe(false)
  })
})
