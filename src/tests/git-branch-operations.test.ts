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
}))

import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import {
  checkMergeConflicts,
  getWorktreeChangedFiles,
  getWorktreeDiffStats,
  getWorktreeFileDiff,
  mergeWorktreeBranch,
  rebaseBranchOntoDefault,
} from '@main/git/git-branch-operations'

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

describe('git-branch-operations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(execFileSync).mockReturnValue(Buffer.from(''))
  })

  it('getWorktreeDiffStats should parse the diff --stat summary line into file, insertion, and deletion counts', async () => {
    vi.mocked(execFileSync).mockImplementation((cmd: string, args?: readonly string[]) => {
      const command = `${cmd} ${(args || []).join(' ')}`
      if (command === 'git check-ref-format --branch feature-branch') return Buffer.from('')
      if (command === 'git symbolic-ref refs/remotes/origin/HEAD') throw new Error('no origin head')
      if (command === 'git rev-parse --verify main') return Buffer.from('abc123')
      if (command === 'git rev-parse --verify feature-branch') return Buffer.from('def456')
      throw new Error(`Unexpected command: ${command}`)
    })

    setupExecFileAsyncMock(() => ({
      stdout: ' src/main.ts | 10 +++++-----\n 1 file changed, 5 insertions(+), 5 deletions(-)\n',
    }))

    await expect(getWorktreeDiffStats('/project', 'feature-branch')).resolves.toEqual({
      filesChanged: 1,
      insertions: 5,
      deletions: 5,
    })
  })

  it('getWorktreeDiffStats should return zeroed stats when the diff command fails', async () => {
    vi.mocked(execFileSync).mockImplementation((cmd: string, args?: readonly string[]) => {
      const command = `${cmd} ${(args || []).join(' ')}`
      if (command === 'git check-ref-format --branch feature-branch') return Buffer.from('')
      if (command === 'git symbolic-ref refs/remotes/origin/HEAD') throw new Error('no origin head')
      if (command === 'git rev-parse --verify main') return Buffer.from('abc123')
      if (command === 'git rev-parse --verify feature-branch') return Buffer.from('def456')
      throw new Error(`Unexpected command: ${command}`)
    })

    setupExecFileAsyncMock(() => ({
      error: new Error('diff failed'),
    }))

    await expect(getWorktreeDiffStats('/project', 'feature-branch')).resolves.toEqual({
      filesChanged: 0,
      insertions: 0,
      deletions: 0,
    })
  })

  it('getWorktreeChangedFiles should parse modified, added, deleted, and renamed files from diff --name-status output', () => {
    vi.mocked(execFileSync).mockImplementation((cmd: string, args?: readonly string[]) => {
      const command = `${cmd} ${(args || []).join(' ')}`
      if (command === 'git check-ref-format --branch feature-branch') return Buffer.from('')
      if (command === 'git symbolic-ref refs/remotes/origin/HEAD') throw new Error('no origin head')
      if (command === 'git rev-parse --verify main') return Buffer.from('abc123')
      if (command === 'git rev-parse --verify feature-branch') return Buffer.from('def456')
      if (command === 'git diff main...feature-branch --name-status') {
        return 'M\tsrc/app.ts\nA\tsrc/new.ts\nD\tsrc/old.ts\nR100\tsrc/was.ts\tsrc/now.ts\n'
      }
      throw new Error(`Unexpected command: ${command}`)
    })

    expect(getWorktreeChangedFiles('/project', 'feature-branch')).toEqual([
      { path: 'src/app.ts', status: 'M' },
      { path: 'src/new.ts', status: 'A' },
      { path: 'src/old.ts', status: 'D' },
      { path: 'src/now.ts', status: 'R' },
    ])
  })

  it('getWorktreeChangedFiles should fall back to origin/<branch> when the local branch ref does not exist', () => {
    vi.mocked(execFileSync).mockImplementation((cmd: string, args?: readonly string[]) => {
      const command = `${cmd} ${(args || []).join(' ')}`
      if (command === 'git check-ref-format --branch feature-branch') return Buffer.from('')
      if (command === 'git symbolic-ref refs/remotes/origin/HEAD') throw new Error('no origin head')
      if (command === 'git rev-parse --verify main') return Buffer.from('abc123')
      if (command === 'git rev-parse --verify feature-branch') throw new Error('missing local ref')
      if (command === 'git rev-parse --verify origin/feature-branch') return Buffer.from('def456')
      if (command === 'git diff main...origin/feature-branch --name-status') return 'M\tsrc/app.ts\n'
      throw new Error(`Unexpected command: ${command}`)
    })

    expect(getWorktreeChangedFiles('/project', 'feature-branch')).toEqual([
      { path: 'src/app.ts', status: 'M' },
    ])
  })

  it('getWorktreeFileDiff should throw a branch-reference-not-found error when neither the local nor remote ref exists', () => {
    vi.mocked(execFileSync).mockImplementation((cmd: string, args?: readonly string[]) => {
      const command = `${cmd} ${(args || []).join(' ')}`
      if (command === 'git check-ref-format --branch feature-branch') return Buffer.from('')
      if (command === 'git symbolic-ref refs/remotes/origin/HEAD') throw new Error('no origin head')
      if (command === 'git rev-parse --verify main') return Buffer.from('abc123')
      if (command === 'git rev-parse --verify feature-branch') throw new Error('missing local ref')
      if (command === 'git rev-parse --verify origin/feature-branch') throw new Error('missing remote ref')
      throw new Error(`Unexpected command: ${command}`)
    })

    expect(() => getWorktreeFileDiff('/project', 'feature-branch', 'src/app.ts')).toThrow(
      'Branch reference not found for "feature-branch". Tried "feature-branch" and "origin/feature-branch". Fetch latest refs or restore the branch before comparing changes.',
    )
  })

  it('mergeWorktreeBranch should abort the merge and throw a conflict-prefixed error when git reports conflicts', () => {
    vi.mocked(execFileSync).mockImplementation((cmd: string, args?: readonly string[]) => {
      const command = `${cmd} ${(args || []).join(' ')}`
      if (command === 'git check-ref-format --branch feature-branch') return Buffer.from('')
      if (command === 'git symbolic-ref refs/remotes/origin/HEAD') throw new Error('no origin head')
      if (command === 'git rev-parse --verify main') return Buffer.from('abc123')
      if (command === 'git symbolic-ref --short HEAD') return 'main'
      if (command === "git merge feature-branch --no-ff -m Merge branch 'feature-branch'") {
        const error = new Error('merge failed') as Error & { stderr: Buffer; stdout: Buffer }
        error.stderr = Buffer.from('Automatic merge failed; fix conflicts and then commit the result.')
        error.stdout = Buffer.from('CONFLICT (content): Merge conflict in src/app.ts')
        throw error
      }
      if (command === 'git merge --abort') return Buffer.from('')
      throw new Error(`Unexpected command: ${command}`)
    })

    expect(() => mergeWorktreeBranch('/project', 'feature-branch')).toThrow(
      'conflict: Merge conflicts detected. Please resolve manually.',
    )
    expect(execFileSync).toHaveBeenCalledWith(
      'git',
      ['merge', '--abort'],
      expect.objectContaining({ cwd: '/project', stdio: 'ignore' }),
    )
  })

  it('checkMergeConflicts should return conflicting files from git merge-tree status 1 output', () => {
    vi.mocked(execFileSync).mockImplementation((cmd: string, args?: readonly string[]) => {
      const command = `${cmd} ${(args || []).join(' ')}`
      if (command === 'git check-ref-format --branch feature-branch') return Buffer.from('')
      if (command === 'git symbolic-ref refs/remotes/origin/HEAD') throw new Error('no origin head')
      if (command === 'git rev-parse --verify main') return Buffer.from('abc123')
      if (command === 'git merge-tree --write-tree --no-messages main feature-branch') {
        const error = new Error('conflicts') as Error & { status: number; stdout: string }
        error.status = 1
        error.stdout = 'treehash\nsrc/app.ts\nsrc/index.ts\n'
        throw error
      }
      throw new Error(`Unexpected command: ${command}`)
    })

    expect(checkMergeConflicts('/project', 'feature-branch')).toEqual({
      clean: false,
      conflictingFiles: ['src/app.ts', 'src/index.ts'],
    })
  })

  it('checkMergeConflicts should fall back to a dry-run merge when merge-tree is unavailable and return parsed conflict paths', () => {
    vi.mocked(execFileSync).mockImplementation((cmd: string, args?: readonly string[]) => {
      const command = `${cmd} ${(args || []).join(' ')}`
      if (command === 'git check-ref-format --branch feature-branch') return Buffer.from('')
      if (command === 'git symbolic-ref refs/remotes/origin/HEAD') throw new Error('no origin head')
      if (command === 'git rev-parse --verify main') return Buffer.from('abc123')
      if (command === 'git merge-tree --write-tree --no-messages main feature-branch') {
        const error = new Error('merge-tree unavailable') as Error & { status: number }
        error.status = 128
        throw error
      }
      if (command === 'git symbolic-ref --short HEAD') return 'main'
      if (command === 'git merge --no-commit --no-ff feature-branch') {
        const error = new Error('merge failed') as Error & { stderr: Buffer; stdout: Buffer }
        error.stderr = Buffer.from('CONFLICT (content): Merge conflict in README.md')
        error.stdout = Buffer.from('')
        throw error
      }
      if (command === 'git merge --abort') return Buffer.from('')
      throw new Error(`Unexpected command: ${command}`)
    })

    expect(checkMergeConflicts('/project', 'feature-branch')).toEqual({
      clean: false,
      conflictingFiles: ['README.md'],
    })
  })

  it('checkMergeConflicts should return clean when the dry-run merge fallback succeeds', () => {
    vi.mocked(execFileSync).mockImplementation((cmd: string, args?: readonly string[]) => {
      const command = `${cmd} ${(args || []).join(' ')}`
      if (command === 'git check-ref-format --branch feature-branch') return Buffer.from('')
      if (command === 'git symbolic-ref refs/remotes/origin/HEAD') throw new Error('no origin head')
      if (command === 'git rev-parse --verify main') return Buffer.from('abc123')
      if (command === 'git merge-tree --write-tree --no-messages main feature-branch') {
        const error = new Error('merge-tree unavailable') as Error & { status: number }
        error.status = 128
        throw error
      }
      if (command === 'git symbolic-ref --short HEAD') return 'main'
      if (command === 'git merge --no-commit --no-ff feature-branch') return Buffer.from('')
      if (command === 'git merge --abort') return Buffer.from('')
      throw new Error(`Unexpected command: ${command}`)
    })

    expect(checkMergeConflicts('/project', 'feature-branch')).toEqual({
      clean: true,
      conflictingFiles: [],
    })
  })

  it('rebaseBranchOntoDefault should prefer origin/<defaultBranch> when it exists', () => {
    vi.mocked(execFileSync).mockImplementation((cmd: string, args?: readonly string[]) => {
      const command = `${cmd} ${(args || []).join(' ')}`
      if (command === 'git symbolic-ref refs/remotes/origin/HEAD') throw new Error('no origin head')
      if (command === 'git rev-parse --verify main') return Buffer.from('abc123')
      if (command === 'git fetch origin') return Buffer.from('')
      if (command === 'git rev-parse --verify origin/main') return Buffer.from('def456')
      if (command === 'git rebase origin/main') return Buffer.from('')
      throw new Error(`Unexpected command: ${command}`)
    })

    expect(rebaseBranchOntoDefault('/worktree', '/project')).toEqual({ success: true })
    expect(execFileSync).toHaveBeenCalledWith(
      'git',
      ['rebase', 'origin/main'],
      expect.objectContaining({ cwd: '/worktree', stdio: 'pipe' }),
    )
  })

  it('rebaseBranchOntoDefault should abort the rebase and return conflicting files when git reports could not apply', () => {
    vi.mocked(execFileSync).mockImplementation((cmd: string, args?: readonly string[]) => {
      const command = `${cmd} ${(args || []).join(' ')}`
      if (command === 'git symbolic-ref refs/remotes/origin/HEAD') throw new Error('no origin head')
      if (command === 'git rev-parse --verify main') return Buffer.from('abc123')
      if (command === 'git fetch origin') return Buffer.from('')
      if (command === 'git rev-parse --verify origin/main') return Buffer.from('def456')
      if (command === 'git rebase origin/main') {
        const error = new Error('rebase failed') as Error & { stderr: Buffer; stdout: Buffer }
        error.stderr = Buffer.from('error: could not apply 1234567... work in progress\nCONFLICT (content): Merge conflict in src/main.ts')
        error.stdout = Buffer.from('')
        throw error
      }
      if (command === 'git rebase --abort') return Buffer.from('')
      throw new Error(`Unexpected command: ${command}`)
    })

    expect(rebaseBranchOntoDefault('/worktree', '/project')).toEqual({
      success: false,
      conflict: true,
      error: 'Rebase conflicts detected. The branch cannot be automatically rebased onto the latest default.',
      conflictingFiles: ['src/main.ts'],
    })
  })

  it('rebaseBranchOntoDefault should fall back to the local default branch when origin/<defaultBranch> is unavailable', () => {
    vi.mocked(execFileSync).mockImplementation((cmd: string, args?: readonly string[]) => {
      const command = `${cmd} ${(args || []).join(' ')}`
      if (command === 'git symbolic-ref refs/remotes/origin/HEAD') throw new Error('no origin head')
      if (command === 'git rev-parse --verify main') return Buffer.from('abc123')
      if (command === 'git fetch origin') throw new Error('no remote')
      if (command === 'git rev-parse --verify origin/main') throw new Error('missing remote main')
      if (command === 'git rebase main') return Buffer.from('')
      throw new Error(`Unexpected command: ${command}`)
    })

    expect(rebaseBranchOntoDefault('/worktree', '/project')).toEqual({ success: true })
    expect(execFileSync).toHaveBeenCalledWith(
      'git',
      ['rebase', 'main'],
      expect.objectContaining({ cwd: '/worktree', stdio: 'pipe' }),
    )
  })

  it('rebaseBranchOntoDefault should abort and return a prefixed error on non-conflict failures', () => {
    vi.mocked(execFileSync).mockImplementation((cmd: string, args?: readonly string[]) => {
      const command = `${cmd} ${(args || []).join(' ')}`
      if (command === 'git symbolic-ref refs/remotes/origin/HEAD') throw new Error('no origin head')
      if (command === 'git rev-parse --verify main') return Buffer.from('abc123')
      if (command === 'git fetch origin') return Buffer.from('')
      if (command === 'git rev-parse --verify origin/main') return Buffer.from('def456')
      if (command === 'git rebase origin/main') {
        const error = new Error('rebase error') as Error & { stderr: Buffer; stdout: Buffer }
        error.stderr = Buffer.from('fatal: some other error')
        error.stdout = Buffer.from('')
        throw error
      }
      if (command === 'git rebase --abort') return Buffer.from('')
      throw new Error(`Unexpected command: ${command}`)
    })

    expect(rebaseBranchOntoDefault('/worktree', '/project')).toEqual({
      success: false,
      error: 'Rebase failed: fatal: some other error\n',
    })
    expect(execFileSync).toHaveBeenCalledWith(
      'git',
      ['rebase', '--abort'],
      expect.objectContaining({ cwd: '/worktree', stdio: 'ignore' }),
    )
  })
})
