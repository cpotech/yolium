import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as path from 'node:path'
import * as os from 'node:os'
import * as crypto from 'node:crypto'

// Mock execSync to avoid actual git commands
vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
  execFileSync: vi.fn(),
}))

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  rmSync: vi.fn(),
}))

// Import after mocking
import { execSync, execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import {
  isGitRepo,
  hasCommits,
  generateBranchName,
  getWorktreePath,
  initGitRepo,
  createWorktree,
} from '../lib/git-worktree'

describe('git-worktree', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(execFileSync).mockReturnValue(Buffer.from(''))
  })

  describe('isGitRepo', () => {
    it('returns true for valid git repo', () => {
      vi.mocked(execSync).mockReturnValue(Buffer.from('true'))
      expect(isGitRepo('/some/path')).toBe(true)
    })

    it('returns false when git command fails', () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('not a git repo')
      })
      expect(isGitRepo('/not/a/repo')).toBe(false)
    })
  })

  describe('hasCommits', () => {
    it('returns true when repo has commits', () => {
      vi.mocked(execSync).mockReturnValue(Buffer.from('abc123'))
      expect(hasCommits('/some/path')).toBe(true)
    })

    it('returns false when repo has no commits', () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('fatal: bad revision HEAD')
      })
      expect(hasCommits('/empty/repo')).toBe(false)
    })
  })

  describe('generateBranchName', () => {
    it('generates branch name with yolium prefix', () => {
      const name = generateBranchName()
      expect(name).toMatch(/^yolium-\d+-[a-f0-9]{6}$/)
    })

    it('generates names based on timestamp', async () => {
      const name1 = generateBranchName()
      await new Promise(r => setTimeout(r, 5)) // small delay
      const name2 = generateBranchName()
      expect(name1).not.toBe(name2)
    })
  })

  describe('getWorktreePath', () => {
    it('returns path in ~/.yolium/worktrees', () => {
      const result = getWorktreePath('/home/user/project', 'feature-branch')
      expect(result).toContain('.yolium')
      expect(result).toContain('worktrees')
      expect(result).toContain('feature-branch')
    })

    it('uses hash of absolute path for isolation', () => {
      const path1 = getWorktreePath('/home/user/project1', 'main')
      const path2 = getWorktreePath('/home/user/project2', 'main')
      expect(path1).not.toBe(path2)
    })

    it('throws for branch names with unsafe characters', () => {
      vi.mocked(execFileSync).mockImplementationOnce(() => {
        throw new Error('invalid')
      })
      expect(() => getWorktreePath('/path', 'branch;rm -rf /')).toThrow('Invalid branch name')
    })

    it('throws for branch names starting with hyphen', () => {
      vi.mocked(execFileSync).mockImplementationOnce(() => {
        throw new Error('invalid')
      })
      expect(() => getWorktreePath('/path', '-branch')).toThrow('Invalid branch name')
    })

    it('throws for branch names with consecutive dots', () => {
      vi.mocked(execFileSync).mockImplementationOnce(() => {
        throw new Error('invalid')
      })
      expect(() => getWorktreePath('/path', 'branch..name')).toThrow('Invalid branch name')
    })

    it('accepts valid branch names', () => {
      expect(() => getWorktreePath('/path', 'feature/my-branch')).not.toThrow()
      expect(() => getWorktreePath('/path', 'fix_bug_123')).not.toThrow()
      expect(() => getWorktreePath('/path', 'v1.0.0')).not.toThrow()
    })

    it('validates branch names with git check-ref-format', () => {
      getWorktreePath('/path', 'feature/branch')
      expect(execFileSync).toHaveBeenCalledWith(
        'git',
        ['check-ref-format', '--branch', 'feature/branch'],
        expect.any(Object)
      )
    })
  })

  describe('initGitRepo', () => {
    it('initializes git in a non-repo folder', () => {
      // First call to isGitRepo returns false (not a repo)
      vi.mocked(execSync).mockImplementationOnce(() => {
        throw new Error('not a git repo')
      })
      // Second call is git init which succeeds
      vi.mocked(execSync).mockImplementationOnce(() => Buffer.from('Initialized empty Git repository'))

      const result = initGitRepo('/some/folder')
      expect(result).toBe(true)
      expect(execSync).toHaveBeenCalledWith('git init', expect.objectContaining({ cwd: '/some/folder' }))
    })

    it('returns false if already a git repo', () => {
      // isGitRepo returns true
      vi.mocked(execSync).mockReturnValue(Buffer.from('true'))

      const result = initGitRepo('/existing/repo')
      expect(result).toBe(false)
    })

    it('throws error if git init fails', () => {
      // First call to isGitRepo returns false
      vi.mocked(execSync).mockImplementationOnce(() => {
        throw new Error('not a git repo')
      })
      // Second call is git init which fails
      const error = new Error('git init failed') as Error & { stderr: Buffer }
      error.stderr = Buffer.from('permission denied')
      vi.mocked(execSync).mockImplementationOnce(() => {
        throw error
      })

      expect(() => initGitRepo('/some/folder')).toThrow('Failed to initialize git repository')
    })
  })

  describe('createWorktree', () => {
    it('reuses existing worktree when path is already registered', () => {
      const projectPath = '/home/user/project'
      const branchName = 'feature-branch'
      const worktreePath = getWorktreePath(projectPath, branchName)

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(execSync).mockImplementation((command: string) => {
        if (command.startsWith('git rev-parse HEAD')) {
          return Buffer.from('abc123')
        }
        if (command.startsWith('git worktree prune')) {
          return Buffer.from('')
        }
        if (command.startsWith('git worktree list --porcelain')) {
          return `worktree ${worktreePath}\nbranch refs/heads/${branchName}\n`
        }
        throw new Error(`Unexpected command: ${command}`)
      })

      const result = createWorktree(projectPath, branchName)
      expect(result).toBe(worktreePath)
      expect(execSync).not.toHaveBeenCalledWith(
        expect.stringContaining('git worktree add'),
        expect.any(Object)
      )
    })
  })
})
