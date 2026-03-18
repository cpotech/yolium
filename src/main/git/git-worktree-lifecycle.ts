import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { deleteBranchBestEffortAsync, removeWorktreeBestEffortAsync, removeWorktreeBestEffortSync } from './git-internal'
import { hasCommits, validateBranchName } from './git-repository'
import { fixWorktreeGitFile, getWorktreePath } from './git-worktree-paths'

export function createWorktree(projectPath: string, branchName: string): string {
  validateBranchName(branchName)

  if (!hasCommits(projectPath)) {
    throw new Error('Cannot create worktree: repository has no commits yet. Please make an initial commit first.')
  }

  try {
    execFileSync('git', ['worktree', 'prune'], {
      cwd: projectPath,
      stdio: 'ignore',
    })
  } catch { /* Ignore prune errors. */
  }

  const worktreePath = getWorktreePath(projectPath, branchName)
  const worktreeDir = path.dirname(worktreePath)
  fs.mkdirSync(worktreeDir, { recursive: true })

  if (fs.existsSync(worktreePath)) {
    try {
      const output = execFileSync('git', ['worktree', 'list', '--porcelain'], {
        cwd: projectPath,
        encoding: 'utf-8',
      })
      const normalizedTarget = path.resolve(worktreePath)
      const hasMatch = output
        .split('\n')
        .filter((line) => line.startsWith('worktree '))
        .some((line) => path.resolve(line.replace('worktree ', '').trim()) === normalizedTarget)

      if (hasMatch) {
        if (process.platform === 'win32') {
          fixWorktreeGitFile(worktreePath)
        }
        return worktreePath
      }
    } catch { /* Fall through to remove and recreate. */
    }

    fs.rmSync(worktreePath, { recursive: true, force: true, maxRetries: 3, retryDelay: 500 })
  }

  let branchExists = false
  try {
    execFileSync('git', ['rev-parse', '--verify', branchName], {
      cwd: projectPath,
      stdio: 'ignore',
    })
    branchExists = true
  } catch { /* Branch does not exist yet — will be created with git worktree add -b. */
    branchExists = false
  }

  try {
    if (branchExists) {
      execFileSync('git', ['worktree', 'add', worktreePath, branchName], {
        cwd: projectPath,
        stdio: 'pipe',
      })
    } else {
      execFileSync('git', ['worktree', 'add', '-b', branchName, worktreePath], {
        cwd: projectPath,
        stdio: 'pipe',
      })
    }
  } catch (err) { /* intentionally ignored */
    const error = err as { stderr?: Buffer; message?: string }
    const stderr = error.stderr?.toString() || error.message || 'Unknown error'

    if (stderr.includes('already checked out') || stderr.includes('is already used by')) {
      throw new Error(`Branch "${branchName}" is already checked out in another worktree. Please use a different branch name.`)
    }

    throw new Error(`Failed to create worktree: ${stderr}`)
  }

  if (process.platform === 'win32') {
    fixWorktreeGitFile(worktreePath)
  }

  return worktreePath
}

export function deleteWorktree(projectPath: string, worktreePath: string): void {
  removeWorktreeBestEffortSync(projectPath, worktreePath)
}

export async function cleanupWorktreeAndBranch(
  projectPath: string,
  worktreePath: string,
  branchName: string,
): Promise<void> {
  validateBranchName(branchName)
  await removeWorktreeBestEffortAsync(projectPath, worktreePath)
  await deleteBranchBestEffortAsync(projectPath, branchName)
}

export function hasUncommittedChanges(worktreePath: string): boolean {
  try {
    const output = execFileSync('git', ['status', '--porcelain'], {
      cwd: worktreePath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    })
    return output.trim().length > 0
  } catch { /* Worktree path is inaccessible or not a git repo — treat as no uncommitted changes. */
    return false
  }
}

export function getWorktreeBranch(worktreePath: string): string | null {
  try {
    const output = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: worktreePath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    })
    return output.trim()
  } catch { /* Worktree path is inaccessible or not a git repo — branch name unavailable. */
    return null
  }
}
