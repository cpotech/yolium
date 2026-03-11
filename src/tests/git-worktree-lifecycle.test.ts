import * as crypto from 'node:crypto'
import * as os from 'node:os'
import * as path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockExecFile, mockExecFileCustom } = vi.hoisted(() => {
  const mockExecFileCustom = vi.fn()
  const mockExecFile: any = vi.fn()
  mockExecFile[Symbol.for('nodejs.util.promisify.custom')] = mockExecFileCustom
  return { mockExecFile, mockExecFileCustom }
})

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
  execFile: mockExecFile,
}))

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
  rmSync: vi.fn(),
  writeFileSync: vi.fn(),
}))

import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import {
  cleanupWorktreeAndBranch,
  createWorktree,
  deleteWorktree,
  getWorktreeBranch,
  hasUncommittedChanges,
} from '@main/git/git-worktree-lifecycle'
import {
  fixWorktreeGitFile,
  generateBranchName,
  getWorktreePath,
} from '@main/git/git-worktree-paths'

function setupExecFileAsyncMock(
  handler: (cmd: string, args: readonly string[]) => { stdout?: string; stderr?: string; error?: Error | null },
) {
  mockExecFileCustom.mockImplementation((cmd: string, cmdArgs?: readonly string[]) => {
    const args = cmdArgs || []
    const result = handler(cmd, args)
    if (result.error) {
      return Promise.reject(result.error)
    }
    return Promise.resolve({ stdout: result.stdout || '', stderr: result.stderr || '' })
  })
}

describe('git-worktree-lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(execFileSync).mockReturnValue(Buffer.from(''))
  })

  it('generateBranchName should return a yolium-prefixed unique branch name', () => {
    const branchName = generateBranchName()
    expect(branchName).toMatch(/^yolium-\d+-[a-f0-9]{6}$/)
  })

  it('getWorktreePath should hash the absolute project path and reject invalid branch names', () => {
    vi.mocked(execFileSync).mockImplementationOnce(() => Buffer.from(''))

    const projectPath = '/home/user/project'
    const branchName = 'feature/refactor'
    const expectedHash = crypto
      .createHash('sha256')
      .update(path.resolve(projectPath))
      .digest('hex')
      .slice(0, 12)

    expect(getWorktreePath(projectPath, branchName)).toBe(
      path.join(os.homedir(), '.yolium', 'worktrees', `yolium-${expectedHash}`, branchName),
    )

    vi.mocked(execFileSync).mockImplementationOnce(() => {
      throw new Error('invalid ref')
    })
    expect(() => getWorktreePath(projectPath, 'bad..branch')).toThrow('Invalid branch name')
  })

  it('fixWorktreeGitFile should rewrite both the worktree .git file and reverse gitdir file on Windows-style MSYS2 paths', () => {
    vi.mocked(fs.readFileSync).mockImplementation((filePath: unknown) => {
      const file = String(filePath)
      if (file.endsWith('/.git')) {
        return 'gitdir: /c/Users/gaming/repos/project/.git/worktrees/my-branch\n'
      }
      if (file.endsWith('/gitdir')) {
        return '/c/Users/gaming/.yolium/worktrees/project/my-branch\n'
      }
      return ''
    })

    fixWorktreeGitFile('/tmp/worktree')

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      '/tmp/worktree/.git',
      'gitdir: C:/Users/gaming/repos/project/.git/worktrees/my-branch\n',
    )
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      'C:/Users/gaming/repos/project/.git/worktrees/my-branch/gitdir',
      'C:/Users/gaming/.yolium/worktrees/project/my-branch\n',
    )
  })

  it('fixWorktreeGitFile should leave already-native paths unchanged', () => {
    vi.mocked(fs.readFileSync).mockImplementation((filePath: unknown) => {
      const file = String(filePath)
      if (file.endsWith('/.git')) {
        return 'gitdir: C:/Users/gaming/repos/project/.git/worktrees/my-branch\n'
      }
      if (file.endsWith('/gitdir')) {
        return 'C:/Users/gaming/.yolium/worktrees/project/my-branch\n'
      }
      return ''
    })

    fixWorktreeGitFile('/tmp/worktree')

    expect(fs.writeFileSync).not.toHaveBeenCalled()
  })

  it('createWorktree should reuse an already-registered worktree path instead of recreating it', () => {
    const projectPath = '/home/user/project'
    const branchName = 'feature-branch'
    const worktreePath = getWorktreePath(projectPath, branchName)

    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(execFileSync).mockImplementation((cmd: string, args?: readonly string[]) => {
      const command = `${cmd} ${(args || []).join(' ')}`
      if (command.startsWith('git check-ref-format')) return Buffer.from('')
      if (command === 'git rev-parse HEAD') return Buffer.from('abc123')
      if (command === 'git worktree prune') return Buffer.from('')
      if (command === 'git worktree list --porcelain') {
        return `worktree ${worktreePath}\nbranch refs/heads/${branchName}\n`
      }
      throw new Error(`Unexpected command: ${command}`)
    })

    expect(createWorktree(projectPath, branchName)).toBe(worktreePath)
    expect(execFileSync).not.toHaveBeenCalledWith(
      'git',
      expect.arrayContaining(['worktree', 'add']),
      expect.any(Object),
    )
  })

  it('createWorktree should throw a branch-already-checked-out message when git worktree add reports an existing checkout', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false)
    vi.mocked(execFileSync).mockImplementation((cmd: string, args?: readonly string[]) => {
      const command = `${cmd} ${(args || []).join(' ')}`
      if (command.startsWith('git check-ref-format')) return Buffer.from('')
      if (command === 'git rev-parse HEAD') return Buffer.from('abc123')
      if (command === 'git worktree prune') return Buffer.from('')
      if (command === 'git rev-parse --verify feature-branch') return Buffer.from('abc123')
      if (command.startsWith('git worktree add')) {
        const error = new Error('already checked out') as Error & { stderr: Buffer }
        error.stderr = Buffer.from("fatal: 'feature-branch' is already checked out at '/tmp/other'")
        throw error
      }
      throw new Error(`Unexpected command: ${command}`)
    })

    expect(() => createWorktree('/project', 'feature-branch')).toThrow(
      'Branch "feature-branch" is already checked out in another worktree. Please use a different branch name.',
    )
  })

  it('createWorktree should skip Windows path repair on non-Windows platforms', () => {
    const originalPlatform = process.platform
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true })

    vi.mocked(fs.existsSync).mockReturnValue(false)
    vi.mocked(execFileSync).mockImplementation((cmd: string, args?: readonly string[]) => {
      const command = `${cmd} ${(args || []).join(' ')}`
      if (command.startsWith('git check-ref-format')) return Buffer.from('')
      if (command === 'git rev-parse HEAD') return Buffer.from('abc123')
      if (command === 'git worktree prune') return Buffer.from('')
      if (command === 'git rev-parse --verify feature-branch') throw new Error('missing branch')
      if (command.startsWith('git worktree add -b feature-branch')) return Buffer.from('')
      throw new Error(`Unexpected command: ${command}`)
    })

    createWorktree('/project', 'feature-branch')

    expect(fs.readFileSync).not.toHaveBeenCalled()
    expect(fs.writeFileSync).not.toHaveBeenCalled()

    Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true })
  })

  it('deleteWorktree should fall back to prune and filesystem removal when git worktree remove fails', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(execFileSync).mockImplementation((cmd: string, args?: readonly string[]) => {
      const command = `${cmd} ${(args || []).join(' ')}`
      if (command === 'git worktree remove /tmp/worktree --force') {
        throw new Error('remove failed')
      }
      if (command === 'git worktree prune') {
        return Buffer.from('')
      }
      throw new Error(`Unexpected command: ${command}`)
    })

    deleteWorktree('/project', '/tmp/worktree')

    expect(fs.rmSync).toHaveBeenCalledWith('/tmp/worktree', {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 500,
    })
  })

  it('cleanupWorktreeAndBranch should delete the worktree and force-delete the branch when safe deletion fails', async () => {
    vi.mocked(execFileSync).mockImplementation((cmd: string, args?: readonly string[]) => {
      const command = `${cmd} ${(args || []).join(' ')}`
      if (command.startsWith('git check-ref-format')) return Buffer.from('')
      throw new Error(`Unexpected command: ${command}`)
    })

    const calls: string[] = []
    setupExecFileAsyncMock((cmd, args) => {
      const command = `${cmd} ${args.join(' ')}`
      calls.push(command)
      if (command === 'git branch -d feature-branch') {
        return { error: new Error('not fully merged') }
      }
      return {}
    })

    await cleanupWorktreeAndBranch('/project', '/tmp/worktree', 'feature-branch')

    expect(calls).toContain('git worktree remove /tmp/worktree --force')
    expect(calls).toContain('git branch -D feature-branch')
  })

  it('hasUncommittedChanges should return false when git status fails', () => {
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error('status failed')
    })

    expect(hasUncommittedChanges('/tmp/worktree')).toBe(false)
  })

  it('getWorktreeBranch should return null when the branch cannot be resolved', () => {
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error('detached head')
    })

    expect(getWorktreeBranch('/tmp/worktree')).toBeNull()
  })
})
