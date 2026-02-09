import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as path from 'node:path'
import * as os from 'node:os'
import * as crypto from 'node:crypto'

// Mock execFileSync to avoid actual git commands
vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}))

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  rmSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}))

// Import after mocking
import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import {
  isGitRepo,
  hasCommits,
  generateBranchName,
  getWorktreePath,
  initGitRepo,
  createWorktree,
  sanitizeBranchName,
  generatePrBranchName,
  mergeBranchAndPushPR,
  checkMergeConflicts,
  rebaseBranchOntoDefault,
} from '@main/git/git-worktree'

describe('git-worktree', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(execFileSync).mockReturnValue(Buffer.from(''))
  })

  describe('isGitRepo', () => {
    it('returns true for valid git repo', () => {
      vi.mocked(execFileSync).mockReturnValue(Buffer.from('true'))
      expect(isGitRepo('/some/path')).toBe(true)
    })

    it('returns false when git command fails', () => {
      vi.mocked(execFileSync).mockImplementation(() => {
        throw new Error('not a git repo')
      })
      expect(isGitRepo('/not/a/repo')).toBe(false)
    })
  })

  describe('hasCommits', () => {
    it('returns true when repo has commits', () => {
      vi.mocked(execFileSync).mockReturnValue(Buffer.from('abc123'))
      expect(hasCommits('/some/path')).toBe(true)
    })

    it('returns false when repo has no commits', () => {
      vi.mocked(execFileSync).mockImplementation(() => {
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

  describe('sanitizeBranchName', () => {
    it('replaces colons with slashes', () => {
      expect(sanitizeBranchName('fix:e2e')).toBe('fix/e2e')
    })

    it('replaces multiple colons', () => {
      expect(sanitizeBranchName('fix:plan:dup-workitems')).toBe('fix/plan/dup-workitems')
    })

    it('collapses consecutive slashes', () => {
      expect(sanitizeBranchName('fix://double')).toBe('fix/double')
    })

    it('removes trailing slash', () => {
      expect(sanitizeBranchName('fix:trailing:')).toBe('fix/trailing')
    })

    it('leaves valid branch names unchanged', () => {
      expect(sanitizeBranchName('feature/my-branch')).toBe('feature/my-branch')
      expect(sanitizeBranchName('fix_bug_123')).toBe('fix_bug_123')
      expect(sanitizeBranchName('v1.0.0')).toBe('v1.0.0')
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
      vi.mocked(execFileSync).mockImplementationOnce(() => {
        throw new Error('not a git repo')
      })
      // Second call is git init which succeeds
      vi.mocked(execFileSync).mockImplementationOnce(() => Buffer.from('Initialized empty Git repository'))

      const result = initGitRepo('/some/folder')
      expect(result).toBe(true)
      expect(execFileSync).toHaveBeenCalledWith('git', ['init'], expect.objectContaining({ cwd: '/some/folder' }))
    })

    it('returns false if already a git repo', () => {
      // isGitRepo returns true
      vi.mocked(execFileSync).mockReturnValue(Buffer.from('true'))

      const result = initGitRepo('/existing/repo')
      expect(result).toBe(false)
    })

    it('throws error if git init fails', () => {
      // First call to isGitRepo returns false
      vi.mocked(execFileSync).mockImplementationOnce(() => {
        throw new Error('not a git repo')
      })
      // Second call is git init which fails
      const error = new Error('git init failed') as Error & { stderr: Buffer }
      error.stderr = Buffer.from('permission denied')
      vi.mocked(execFileSync).mockImplementationOnce(() => {
        throw error
      })

      expect(() => initGitRepo('/some/folder')).toThrow('Failed to initialize git repository')
    })
  })

  describe('createWorktree', () => {
    it('fixes MSYS2 paths in .git file and back-reference gitdir on Windows', () => {
      const projectPath = '/home/user/project'
      const branchName = 'my-branch'
      const worktreePath = getWorktreePath(projectPath, branchName)

      // Simulate Windows platform
      const originalPlatform = process.platform
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })

      vi.mocked(fs.existsSync).mockReturnValue(false)
      vi.mocked(fs.readFileSync).mockImplementation((filePath: unknown) => {
        const p = String(filePath)
        if (p.endsWith('.git')) {
          // Worktree's .git file with MSYS2 path
          return 'gitdir: /c/Users/gaming/repos/project/.git/worktrees/my-branch\n'
        }
        if (p.endsWith('gitdir')) {
          // Back-reference file with MSYS2 path
          return '/c/Users/gaming/.yolium/worktrees/proj/my-branch\n'
        }
        return ''
      })
      vi.mocked(execFileSync).mockImplementation((cmd: string, args?: readonly string[]) => {
        const command = `${cmd} ${(args || []).join(' ')}`
        if (command.startsWith('git check-ref-format')) return Buffer.from('')
        if (command.startsWith('git rev-parse HEAD')) return Buffer.from('abc123')
        if (command.startsWith('git worktree prune')) return Buffer.from('')
        if (command.startsWith('git rev-parse --verify')) throw new Error('not found')
        if (command.startsWith('git worktree add')) return Buffer.from('')
        throw new Error(`Unexpected command: ${command}`)
      })

      createWorktree(projectPath, branchName)

      // Verify .git file was fixed
      expect(fs.readFileSync).toHaveBeenCalledWith(
        path.join(worktreePath, '.git'),
        'utf-8'
      )
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        path.join(worktreePath, '.git'),
        'gitdir: C:/Users/gaming/repos/project/.git/worktrees/my-branch\n'
      )

      // Verify back-reference gitdir file was also fixed
      expect(fs.readFileSync).toHaveBeenCalledWith(
        path.join('C:/Users/gaming/repos/project/.git/worktrees/my-branch', 'gitdir'),
        'utf-8'
      )
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        path.join('C:/Users/gaming/repos/project/.git/worktrees/my-branch', 'gitdir'),
        'C:/Users/gaming/.yolium/worktrees/proj/my-branch\n'
      )

      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true })
    })

    it('does not rewrite files when paths are already Windows-native', () => {
      const projectPath = '/home/user/project'
      const branchName = 'my-branch'

      const originalPlatform = process.platform
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })

      vi.mocked(fs.existsSync).mockReturnValue(false)
      vi.mocked(fs.readFileSync).mockImplementation((filePath: unknown) => {
        const p = String(filePath)
        if (p.endsWith('.git')) {
          return 'gitdir: C:/Users/gaming/repos/project/.git/worktrees/my-branch\n'
        }
        if (p.endsWith('gitdir')) {
          return 'C:/Users/gaming/.yolium/worktrees/proj/my-branch\n'
        }
        return ''
      })
      vi.mocked(execFileSync).mockImplementation((cmd: string, args?: readonly string[]) => {
        const command = `${cmd} ${(args || []).join(' ')}`
        if (command.startsWith('git check-ref-format')) return Buffer.from('')
        if (command.startsWith('git rev-parse HEAD')) return Buffer.from('abc123')
        if (command.startsWith('git worktree prune')) return Buffer.from('')
        if (command.startsWith('git rev-parse --verify')) throw new Error('not found')
        if (command.startsWith('git worktree add')) return Buffer.from('')
        throw new Error(`Unexpected command: ${command}`)
      })

      createWorktree(projectPath, branchName)

      expect(fs.writeFileSync).not.toHaveBeenCalled()

      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true })
    })

    it('does not modify .git file on non-Windows platforms', () => {
      const projectPath = '/home/user/project'
      const branchName = 'my-branch'

      const originalPlatform = process.platform
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true })

      vi.mocked(fs.existsSync).mockReturnValue(false)
      vi.mocked(execFileSync).mockImplementation((cmd: string, args?: readonly string[]) => {
        const command = `${cmd} ${(args || []).join(' ')}`
        if (command.startsWith('git check-ref-format')) return Buffer.from('')
        if (command.startsWith('git rev-parse HEAD')) return Buffer.from('abc123')
        if (command.startsWith('git worktree prune')) return Buffer.from('')
        if (command.startsWith('git rev-parse --verify')) throw new Error('not found')
        if (command.startsWith('git worktree add')) return Buffer.from('')
        throw new Error(`Unexpected command: ${command}`)
      })

      createWorktree(projectPath, branchName)

      expect(fs.readFileSync).not.toHaveBeenCalled()
      expect(fs.writeFileSync).not.toHaveBeenCalled()

      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true })
    })

    it('reuses existing worktree when path is already registered', () => {
      const projectPath = '/home/user/project'
      const branchName = 'feature-branch'
      const worktreePath = getWorktreePath(projectPath, branchName)

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(execFileSync).mockImplementation((cmd: string, args?: readonly string[]) => {
        const command = `${cmd} ${(args || []).join(' ')}`
        if (command.startsWith('git check-ref-format')) {
          return Buffer.from('')
        }
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
      expect(execFileSync).not.toHaveBeenCalledWith(
        'git',
        expect.arrayContaining(['worktree', 'add']),
        expect.any(Object)
      )
    })
  })

  describe('generatePrBranchName', () => {
    it('creates slug from item title for auto-generated yolium branches', () => {
      expect(generatePrBranchName('yolium-1738900000000-abc123', 'Add user authentication'))
        .toBe('yolium/add-user-authentication')
    })

    it('handles special characters in title', () => {
      expect(generatePrBranchName('yolium-1738900000000-def456', 'Fix bug #123: handle edge-case!'))
        .toBe('yolium/fix-bug-123-handle-edge-case')
    })

    it('truncates long titles to 50 chars', () => {
      const longTitle = 'This is a very long title that should be truncated to fifty characters maximum'
      const result = generatePrBranchName('yolium-1738900000000-aaa111', longTitle)
      // 'yolium/' prefix + slug <= 50 chars for the slug part
      const slug = result.replace('yolium/', '')
      expect(slug.length).toBeLessThanOrEqual(50)
    })

    it('falls back to "changes" for empty title after sanitization', () => {
      expect(generatePrBranchName('yolium-1738900000000-bbb222', '!!!'))
        .toBe('yolium/changes')
    })

    it('returns original branch name for user-specified branches', () => {
      expect(generatePrBranchName('feature/my-cool-feature', 'Some title'))
        .toBe('feature/my-cool-feature')
    })

    it('returns original branch name for non-yolium branches', () => {
      expect(generatePrBranchName('fix/auth-bug', 'Fix auth'))
        .toBe('fix/auth-bug')
    })
  })

  describe('mergeBranchAndPushPR', () => {
    beforeEach(() => {
      vi.clearAllMocks()
      vi.mocked(execFileSync).mockReturnValue(Buffer.from(''))
      vi.mocked(fs.existsSync).mockReturnValue(true)
    })

    it('returns conflict result when rebase has conflicts', () => {
      vi.mocked(execFileSync).mockImplementation((cmd: string, args?: readonly string[]) => {
        const command = `${cmd} ${(args || []).join(' ')}`
        // validate branch
        if (command.startsWith('git check-ref-format')) return Buffer.from('')
        // getDefaultBranch
        if (command.includes('symbolic-ref')) throw new Error('no remote')
        if (command.includes('rev-parse --verify main')) return Buffer.from('abc')
        if (command.includes('rev-parse --verify origin/main')) return Buffer.from('abc')
        // fetch
        if (command.includes('fetch origin')) return Buffer.from('')
        // rebase - fail with conflict
        if (command.includes('rebase origin/main')) {
          const err = new Error('rebase failed') as Error & { stderr: Buffer; stdout: Buffer }
          err.stderr = Buffer.from('CONFLICT (content): Merge conflict in file.ts')
          err.stdout = Buffer.from('could not apply abc123')
          throw err
        }
        // rebase --abort
        if (command.includes('rebase --abort')) return Buffer.from('')
        return Buffer.from('')
      })

      const result = mergeBranchAndPushPR(
        '/home/user/project',
        'yolium-123-abc',
        '/home/user/.yolium/worktrees/proj/yolium-123-abc',
        'Add auth feature',
        'Add user authentication',
      )

      expect(result.success).toBe(false)
      expect(result.conflict).toBe(true)
      expect(result.error).toContain('conflicts')
    })

    it('returns error when push fails', () => {
      vi.mocked(execFileSync).mockImplementation((cmd: string, args?: readonly string[]) => {
        const command = `${cmd} ${(args || []).join(' ')}`
        if (command.startsWith('git check-ref-format')) return Buffer.from('')
        if (command.includes('symbolic-ref')) throw new Error('no remote')
        if (command.includes('rev-parse --verify main')) return Buffer.from('abc')
        if (command.includes('rev-parse --verify origin/main')) return Buffer.from('abc')
        if (command.includes('fetch')) return Buffer.from('')
        if (command.includes('rebase origin/main')) return Buffer.from('')
        if (command.includes('checkout main') && !command.includes('-B')) return Buffer.from('')
        if (command.includes('pull')) return Buffer.from('')
        if (command.includes('checkout -B')) return Buffer.from('')
        if (command.includes('merge') && command.includes('--no-ff')) return Buffer.from('')
        if (command.includes('push -u')) {
          const err = new Error('push failed') as Error & { stderr: Buffer }
          err.stderr = Buffer.from('remote: Permission denied')
          throw err
        }
        return Buffer.from('')
      })

      const result = mergeBranchAndPushPR(
        '/home/user/project',
        'yolium-123-abc',
        '/home/user/.yolium/worktrees/proj/yolium-123-abc',
        'Add auth',
        'Add user auth',
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('Failed to push')
    })

    it('returns success with prUrl on full success', () => {
      vi.mocked(execFileSync).mockImplementation((cmd: string, args?: readonly string[]) => {
        const command = `${cmd} ${(args || []).join(' ')}`
        if (command.startsWith('git check-ref-format')) return Buffer.from('')
        if (command.includes('symbolic-ref')) throw new Error('no remote')
        if (command.includes('rev-parse --verify main')) return Buffer.from('abc')
        if (command.includes('rev-parse --verify origin/main')) return Buffer.from('abc')
        if (command.includes('fetch')) return Buffer.from('')
        if (command.includes('rebase origin/main')) return Buffer.from('')
        if (command.includes('checkout main') && !command.includes('-B')) return Buffer.from('')
        if (command.includes('pull')) return Buffer.from('')
        if (command.includes('checkout -B')) return Buffer.from('')
        if (command.includes('merge') && command.includes('--no-ff')) return Buffer.from('')
        if (command.includes('push -u')) return Buffer.from('')
        // gh pr create
        if (cmd === 'gh') return 'https://github.com/user/repo/pull/42\n'
        // cleanup: worktree remove, branch delete, worktree prune
        if (command.includes('worktree remove')) return Buffer.from('')
        if (command.includes('branch -d')) return Buffer.from('')
        return Buffer.from('')
      })

      const result = mergeBranchAndPushPR(
        '/home/user/project',
        'yolium-123-abc',
        '/home/user/.yolium/worktrees/proj/yolium-123-abc',
        'Add auth feature',
        'Add user authentication',
      )

      expect(result.success).toBe(true)
      expect(result.prUrl).toBe('https://github.com/user/repo/pull/42')
      expect(result.prBranch).toBe('yolium/add-auth-feature')
    })

    it('returns partial success when PR creation fails but push succeeds', () => {
      vi.mocked(execFileSync).mockImplementation((cmd: string, args?: readonly string[]) => {
        const command = `${cmd} ${(args || []).join(' ')}`
        if (command.startsWith('git check-ref-format')) return Buffer.from('')
        if (command.includes('symbolic-ref')) throw new Error('no remote')
        if (command.includes('rev-parse --verify main')) return Buffer.from('abc')
        if (command.includes('rev-parse --verify origin/main')) return Buffer.from('abc')
        if (command.includes('fetch')) return Buffer.from('')
        if (command.includes('rebase origin/main')) return Buffer.from('')
        if (command.includes('checkout main') && !command.includes('-B')) return Buffer.from('')
        if (command.includes('pull')) return Buffer.from('')
        if (command.includes('checkout -B')) return Buffer.from('')
        if (command.includes('merge') && command.includes('--no-ff')) return Buffer.from('')
        if (command.includes('push -u')) return Buffer.from('')
        // gh pr create fails
        if (cmd === 'gh') {
          const err = new Error('gh failed') as Error & { stderr: Buffer }
          err.stderr = Buffer.from('gh: not found')
          throw err
        }
        return Buffer.from('')
      })

      const result = mergeBranchAndPushPR(
        '/home/user/project',
        'yolium-123-abc',
        '/home/user/.yolium/worktrees/proj/yolium-123-abc',
        'Add auth',
        'Description',
      )

      expect(result.success).toBe(true)
      expect(result.prUrl).toBeUndefined()
      expect(result.prBranch).toBe('yolium/add-auth')
      expect(result.error).toContain('PR creation failed')
    })

    it('succeeds when prBranch equals worktreeBranch (user-specified branch)', () => {
      vi.mocked(execFileSync).mockImplementation((cmd: string, args?: readonly string[]) => {
        const command = `${cmd} ${(args || []).join(' ')}`
        if (command.startsWith('git check-ref-format')) return Buffer.from('')
        if (command.includes('symbolic-ref')) throw new Error('no remote')
        if (command.includes('rev-parse --verify main')) return Buffer.from('abc')
        if (command.includes('rev-parse --verify origin/main')) return Buffer.from('abc')
        if (command.includes('fetch')) return Buffer.from('')
        if (command.includes('rebase origin/main')) return Buffer.from('')
        if (command.includes('checkout main') && !command.includes('-B')) return Buffer.from('')
        if (command.includes('pull')) return Buffer.from('')
        // checkout -B should handle existing branch without error
        if (command.includes('checkout -B')) return Buffer.from('')
        if (command.includes('merge') && command.includes('--no-ff')) return Buffer.from('')
        if (command.includes('push -u')) return Buffer.from('')
        if (cmd === 'gh') return 'https://github.com/user/repo/pull/99\n'
        if (command.includes('worktree remove')) return Buffer.from('')
        if (command.includes('branch -d')) return Buffer.from('')
        return Buffer.from('')
      })

      // Use a non-yolium branch so prBranch === worktreeBranch
      const result = mergeBranchAndPushPR(
        '/home/user/project',
        '(bug)-agent-type-wrong',
        '/home/user/.yolium/worktrees/proj/(bug)-agent-type-wrong',
        'Fix agent type',
        'Fix the agent type bug',
      )

      expect(result.success).toBe(true)
      expect(result.prBranch).toBe('(bug)-agent-type-wrong')
    })

    it('returns error when checkout of default branch fails', () => {
      vi.mocked(execFileSync).mockImplementation((cmd: string, args?: readonly string[]) => {
        const command = `${cmd} ${(args || []).join(' ')}`
        if (command.startsWith('git check-ref-format')) return Buffer.from('')
        if (command.includes('symbolic-ref')) throw new Error('no remote')
        if (command.includes('rev-parse --verify main')) return Buffer.from('abc')
        if (command.includes('rev-parse --verify origin/main')) return Buffer.from('abc')
        if (command.includes('fetch')) return Buffer.from('')
        if (command.includes('rebase origin/main')) return Buffer.from('')
        if (command.includes('checkout main')) {
          const err = new Error('checkout failed') as Error & { stderr: Buffer }
          err.stderr = Buffer.from('error: uncommitted changes')
          throw err
        }
        return Buffer.from('')
      })

      const result = mergeBranchAndPushPR(
        '/home/user/project',
        'yolium-123-abc',
        '/home/user/.yolium/worktrees/proj/yolium-123-abc',
        'Add auth',
        'Description',
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('Failed to checkout main')
    })

    it('calls rebase before merge and returns rebased flag on success', () => {
      vi.mocked(execFileSync).mockImplementation((cmd: string, args?: readonly string[]) => {
        const command = `${cmd} ${(args || []).join(' ')}`
        if (command.startsWith('git check-ref-format')) return Buffer.from('')
        if (command.includes('symbolic-ref')) throw new Error('no remote')
        if (command.includes('rev-parse --verify main')) return Buffer.from('abc')
        if (command.includes('rev-parse --verify origin/main')) return Buffer.from('abc')
        if (command.includes('fetch')) return Buffer.from('')
        if (command.includes('rebase origin/main')) return Buffer.from('')
        if (command.includes('checkout main') && !command.includes('-B')) return Buffer.from('')
        if (command.includes('pull')) return Buffer.from('')
        if (command.includes('checkout -B')) return Buffer.from('')
        if (command.includes('merge') && command.includes('--no-ff')) return Buffer.from('')
        if (command.includes('push -u')) return Buffer.from('')
        if (cmd === 'gh') return 'https://github.com/user/repo/pull/50\n'
        if (command.includes('worktree remove')) return Buffer.from('')
        if (command.includes('branch -d')) return Buffer.from('')
        return Buffer.from('')
      })

      const result = mergeBranchAndPushPR(
        '/home/user/project',
        'yolium-123-abc',
        '/home/user/.yolium/worktrees/proj/yolium-123-abc',
        'Add feature',
        'Feature description',
      )

      expect(result.success).toBe(true)
      expect(result.rebased).toBe(true)
      expect(result.prUrl).toBe('https://github.com/user/repo/pull/50')
    })

    it('returns conflict when rebase fails with conflicts', () => {
      vi.mocked(execFileSync).mockImplementation((cmd: string, args?: readonly string[]) => {
        const command = `${cmd} ${(args || []).join(' ')}`
        if (command.startsWith('git check-ref-format')) return Buffer.from('')
        if (command.includes('symbolic-ref')) throw new Error('no remote')
        if (command.includes('rev-parse --verify main')) return Buffer.from('abc')
        if (command.includes('rev-parse --verify origin/main')) return Buffer.from('abc')
        if (command.includes('fetch')) return Buffer.from('')
        // Rebase fails with conflict
        if (command.includes('rebase origin/main')) {
          const err = new Error('rebase failed') as Error & { stderr: Buffer; stdout: Buffer }
          err.stderr = Buffer.from('CONFLICT (content): Merge conflict in src/app.ts')
          err.stdout = Buffer.from('could not apply abc123')
          throw err
        }
        if (command.includes('rebase --abort')) return Buffer.from('')
        return Buffer.from('')
      })

      const result = mergeBranchAndPushPR(
        '/home/user/project',
        'yolium-123-abc',
        '/home/user/.yolium/worktrees/proj/yolium-123-abc',
        'Add feature',
        'Feature description',
      )

      expect(result.success).toBe(false)
      expect(result.conflict).toBe(true)
      expect(result.conflictingFiles).toContain('src/app.ts')
    })
  })

  describe('checkMergeConflicts', () => {
    beforeEach(() => {
      vi.clearAllMocks()
      vi.mocked(execFileSync).mockReturnValue(Buffer.from(''))
    })

    it('returns clean when merge-tree succeeds (exit code 0)', () => {
      vi.mocked(execFileSync).mockImplementation((cmd: string, args?: readonly string[]) => {
        const command = `${cmd} ${(args || []).join(' ')}`
        if (command.startsWith('git check-ref-format')) return Buffer.from('')
        if (command.includes('symbolic-ref')) throw new Error('no remote')
        if (command.includes('rev-parse --verify main')) return Buffer.from('abc')
        // merge-tree succeeds
        if (command.includes('merge-tree')) return 'abc123def456\n'
        return Buffer.from('')
      })

      const result = checkMergeConflicts('/home/user/project', 'feature-branch')
      expect(result.clean).toBe(true)
      expect(result.conflictingFiles).toEqual([])
    })

    it('returns conflicts when merge-tree fails (exit code 1)', () => {
      vi.mocked(execFileSync).mockImplementation((cmd: string, args?: readonly string[]) => {
        const command = `${cmd} ${(args || []).join(' ')}`
        if (command.startsWith('git check-ref-format')) return Buffer.from('')
        if (command.includes('symbolic-ref')) throw new Error('no remote')
        if (command.includes('rev-parse --verify main')) return Buffer.from('abc')
        if (command.includes('merge-tree')) {
          const err = new Error('conflicts') as Error & { status: number; stdout: string; stderr: string }
          err.status = 1
          err.stdout = 'abc123def456\nsrc/app.ts\nsrc/index.ts\n'
          err.stderr = ''
          throw err
        }
        return Buffer.from('')
      })

      const result = checkMergeConflicts('/home/user/project', 'feature-branch')
      expect(result.clean).toBe(false)
      expect(result.conflictingFiles).toContain('src/app.ts')
      expect(result.conflictingFiles).toContain('src/index.ts')
    })

    it('falls back to dry-run merge when merge-tree is not available', () => {
      vi.mocked(execFileSync).mockImplementation((cmd: string, args?: readonly string[]) => {
        const command = `${cmd} ${(args || []).join(' ')}`
        if (command.startsWith('git check-ref-format')) return Buffer.from('')
        if (command.includes('symbolic-ref')) throw new Error('no remote')
        if (command.includes('rev-parse --verify main')) return Buffer.from('abc')
        // merge-tree not available (different error, not status 1)
        if (command.includes('merge-tree')) {
          const err = new Error('unknown command') as Error & { status: number }
          err.status = 128
          throw err
        }
        // Fallback: checkout default
        if (command.includes('checkout main')) return Buffer.from('')
        // Fallback: dry-run merge succeeds
        if (command.includes('merge --no-commit --no-ff')) return Buffer.from('')
        // abort
        if (command.includes('merge --abort')) return Buffer.from('')
        return Buffer.from('')
      })

      const result = checkMergeConflicts('/home/user/project', 'feature-branch')
      expect(result.clean).toBe(true)
    })

    it('reports conflicts in dry-run merge fallback', () => {
      vi.mocked(execFileSync).mockImplementation((cmd: string, args?: readonly string[]) => {
        const command = `${cmd} ${(args || []).join(' ')}`
        if (command.startsWith('git check-ref-format')) return Buffer.from('')
        if (command.includes('symbolic-ref')) throw new Error('no remote')
        if (command.includes('rev-parse --verify main')) return Buffer.from('abc')
        // merge-tree not available
        if (command.includes('merge-tree')) {
          const err = new Error('unknown command') as Error & { status: number }
          err.status = 128
          throw err
        }
        if (command.includes('checkout main')) return Buffer.from('')
        // dry-run merge fails with conflict
        if (command.includes('merge --no-commit --no-ff')) {
          const err = new Error('merge failed') as Error & { stderr: Buffer; stdout: Buffer }
          err.stderr = Buffer.from('CONFLICT (content): Merge conflict in README.md')
          err.stdout = Buffer.from('')
          throw err
        }
        if (command.includes('merge --abort')) return Buffer.from('')
        return Buffer.from('')
      })

      const result = checkMergeConflicts('/home/user/project', 'feature-branch')
      expect(result.clean).toBe(false)
      expect(result.conflictingFiles).toContain('README.md')
    })
  })

  describe('rebaseBranchOntoDefault', () => {
    beforeEach(() => {
      vi.clearAllMocks()
      vi.mocked(execFileSync).mockReturnValue(Buffer.from(''))
    })

    it('returns success when rebase completes cleanly', () => {
      vi.mocked(execFileSync).mockImplementation((cmd: string, args?: readonly string[]) => {
        const command = `${cmd} ${(args || []).join(' ')}`
        if (command.includes('symbolic-ref')) throw new Error('no remote')
        if (command.includes('rev-parse --verify main')) return Buffer.from('abc')
        if (command.includes('rev-parse --verify origin/main')) return Buffer.from('abc')
        if (command.includes('fetch')) return Buffer.from('')
        if (command.includes('rebase origin/main')) return Buffer.from('')
        return Buffer.from('')
      })

      const result = rebaseBranchOntoDefault('/home/user/worktree', '/home/user/project')
      expect(result.success).toBe(true)
    })

    it('returns conflict when rebase fails with conflicts', () => {
      vi.mocked(execFileSync).mockImplementation((cmd: string, args?: readonly string[]) => {
        const command = `${cmd} ${(args || []).join(' ')}`
        if (command.includes('symbolic-ref')) throw new Error('no remote')
        if (command.includes('rev-parse --verify main')) return Buffer.from('abc')
        if (command.includes('rev-parse --verify origin/main')) return Buffer.from('abc')
        if (command.includes('fetch')) return Buffer.from('')
        if (command.includes('rebase origin/main')) {
          const err = new Error('rebase failed') as Error & { stderr: Buffer; stdout: Buffer }
          err.stderr = Buffer.from('CONFLICT (content): Merge conflict in src/main.ts')
          err.stdout = Buffer.from('')
          throw err
        }
        if (command.includes('rebase --abort')) return Buffer.from('')
        return Buffer.from('')
      })

      const result = rebaseBranchOntoDefault('/home/user/worktree', '/home/user/project')
      expect(result.success).toBe(false)
      expect(result.conflict).toBe(true)
      expect(result.conflictingFiles).toContain('src/main.ts')
    })

    it('uses local default branch when origin is not available', () => {
      vi.mocked(execFileSync).mockImplementation((cmd: string, args?: readonly string[]) => {
        const command = `${cmd} ${(args || []).join(' ')}`
        if (command.includes('symbolic-ref')) throw new Error('no remote')
        if (command.includes('rev-parse --verify main')) return Buffer.from('abc')
        // origin/main not available
        if (command.includes('rev-parse --verify origin/main')) throw new Error('not found')
        if (command.includes('fetch')) throw new Error('no remote')
        // rebase onto local main
        if (command.includes('rebase main')) return Buffer.from('')
        return Buffer.from('')
      })

      const result = rebaseBranchOntoDefault('/home/user/worktree', '/home/user/project')
      expect(result.success).toBe(true)
    })

    it('aborts rebase on failure and returns error', () => {
      vi.mocked(execFileSync).mockImplementation((cmd: string, args?: readonly string[]) => {
        const command = `${cmd} ${(args || []).join(' ')}`
        if (command.includes('symbolic-ref')) throw new Error('no remote')
        if (command.includes('rev-parse --verify main')) return Buffer.from('abc')
        if (command.includes('rev-parse --verify origin/main')) return Buffer.from('abc')
        if (command.includes('fetch')) return Buffer.from('')
        if (command.includes('rebase origin/main')) {
          const err = new Error('rebase error') as Error & { stderr: Buffer; stdout: Buffer }
          err.stderr = Buffer.from('fatal: some other error')
          err.stdout = Buffer.from('')
          throw err
        }
        if (command.includes('rebase --abort')) return Buffer.from('')
        return Buffer.from('')
      })

      const result = rebaseBranchOntoDefault('/home/user/worktree', '/home/user/project')
      expect(result.success).toBe(false)
      expect(result.conflict).toBeUndefined()
      expect(result.error).toContain('Rebase failed')
    })
  })
})
