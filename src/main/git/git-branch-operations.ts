import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import {
  execFileAsync,
  getCurrentBranch,
  gitRefExists,
  parseConflictingWorktreePath,
  parseConflictFileList,
  resolveDiffBranchRef,
} from './git-internal'
import { getDefaultBranch, validateBranchName } from './git-repository'

function ensureDefaultBranchCheckout(projectPath: string, defaultBranch: string): void {
  if (getCurrentBranch(projectPath) === defaultBranch) {
    return
  }

  try {
    execFileSync('git', ['worktree', 'prune'], { cwd: projectPath, stdio: 'pipe' })
  } catch { /* Ignore prune errors. */
  }

  try {
    execFileSync('git', ['checkout', defaultBranch], {
      cwd: projectPath,
      stdio: 'pipe',
    })
    return
  } catch (err) { /* intentionally ignored */
    const error = err as { stderr?: Buffer; message?: string }
    const stderr = error.stderr?.toString() || error.message || 'Unknown error'

    if (!stderr.includes('already checked out')) {
      throw new Error(`Failed to checkout ${defaultBranch}: ${stderr}`)
    }

    const conflictingPath = parseConflictingWorktreePath(stderr)
    if (!conflictingPath) {
      throw new Error(`Failed to checkout ${defaultBranch}: ${stderr}`)
    }

    if (!fs.existsSync(conflictingPath)) {
      try {
        execFileSync('git', ['worktree', 'remove', conflictingPath, '--force'], {
          cwd: projectPath,
          stdio: 'pipe',
        })
      } catch { /* Ignore stale cleanup errors. */
      }
      try {
        execFileSync('git', ['worktree', 'prune'], { cwd: projectPath, stdio: 'pipe' })
      } catch { /* Ignore prune errors. */
      }
    } else if (
      conflictingPath.includes('.yolium/worktrees/') ||
      conflictingPath.includes('.yolium\\worktrees\\')
    ) {
      try {
        execFileSync('git', ['checkout', '--detach'], {
          cwd: conflictingPath,
          stdio: 'pipe',
        })
      } catch { /* Ignore detach errors and retry checkout. */
      }
    }

    try {
      execFileSync('git', ['checkout', defaultBranch], {
        cwd: projectPath,
        stdio: 'pipe',
      })
      return
    } catch (retryErr) { /* intentionally ignored */
      const retryError = retryErr as { stderr?: Buffer; message?: string }
      const retryStderr = retryError.stderr?.toString() || retryError.message || 'Unknown error'
      throw new Error(`Failed to checkout ${defaultBranch}: ${retryStderr}`)
    }
  }
}

export function mergeWorktreeBranch(projectPath: string, branchName: string): void {
  validateBranchName(branchName)

  const defaultBranch = getDefaultBranch(projectPath)
  ensureDefaultBranchCheckout(projectPath, defaultBranch)

  try {
    execFileSync('git', ['merge', branchName, '--no-ff', '-m', `Merge branch '${branchName}'`], {
      cwd: projectPath,
      stdio: 'pipe',
    })
  } catch (err) { /* intentionally ignored */
    const error = err as { stderr?: Buffer; stdout?: Buffer; message?: string }
    const output = (error.stderr?.toString() || '') + (error.stdout?.toString() || '')

    if (output.includes('CONFLICT') || output.includes('Automatic merge failed')) {
      try {
        execFileSync('git', ['merge', '--abort'], {
          cwd: projectPath,
          stdio: 'ignore',
        })
      } catch { /* Ignore abort errors. */
      }
      throw new Error('conflict: Merge conflicts detected. Please resolve manually.')
    }

    throw new Error(`Failed to merge branch: ${output || error.message || 'Unknown error'}`)
  }
}

export async function getWorktreeDiffStats(projectPath: string, branchName: string): Promise<{
  filesChanged: number
  insertions: number
  deletions: number
}> {
  validateBranchName(branchName)

  const defaultBranch = getDefaultBranch(projectPath)
  const branchRef = resolveDiffBranchRef(projectPath, branchName)

  try {
    const { stdout } = await execFileAsync(
      'git',
      ['diff', `${defaultBranch}...${branchRef}`, '--stat', '--stat-width=999'],
      {
        cwd: projectPath,
        encoding: 'utf-8',
      },
    )

    const lines = stdout.trim().split('\n')
    const summaryLine = lines[lines.length - 1] || ''

    const filesMatch = summaryLine.match(/(\d+) files? changed/)
    const insertionsMatch = summaryLine.match(/(\d+) insertions?\(\+\)/)
    const deletionsMatch = summaryLine.match(/(\d+) deletions?\(-\)/)

    return {
      filesChanged: filesMatch ? parseInt(filesMatch[1], 10) : 0,
      insertions: insertionsMatch ? parseInt(insertionsMatch[1], 10) : 0,
      deletions: deletionsMatch ? parseInt(deletionsMatch[1], 10) : 0,
    }
  } catch { /* Branch may not exist yet or diff failed — return empty stats rather than surfacing an error. */
    return { filesChanged: 0, insertions: 0, deletions: 0 }
  }
}

export function getWorktreeChangedFiles(
  projectPath: string,
  branchName: string,
): Array<{ path: string; status: 'M' | 'A' | 'D' | 'R' }> {
  validateBranchName(branchName)

  const defaultBranch = getDefaultBranch(projectPath)
  const branchRef = resolveDiffBranchRef(projectPath, branchName)

  const output = execFileSync('git', ['diff', `${defaultBranch}...${branchRef}`, '--name-status'], {
    cwd: projectPath,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'ignore'],
  })

  const lines = output.trim().split('\n').filter((line) => line.trim().length > 0)
  return lines.map((line) => {
    const parts = line.split('\t')
    const statusChar = parts[0].charAt(0) as 'M' | 'A' | 'D' | 'R'
    const filePath = statusChar === 'R' ? parts[2] : parts[1]
    return { path: filePath, status: statusChar }
  })
}

export function getWorktreeFileDiff(projectPath: string, branchName: string, filePath: string): string {
  validateBranchName(branchName)

  const defaultBranch = getDefaultBranch(projectPath)
  const branchRef = resolveDiffBranchRef(projectPath, branchName)

  return execFileSync('git', ['diff', `${defaultBranch}...${branchRef}`, '--', filePath], {
    cwd: projectPath,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'ignore'],
  })
}

export interface ConflictCheckResult {
  clean: boolean
  conflictingFiles: string[]
}

export function checkMergeConflicts(projectPath: string, branchName: string): ConflictCheckResult {
  validateBranchName(branchName)

  const defaultBranch = getDefaultBranch(projectPath)

  try {
    execFileSync(
      'git',
      ['merge-tree', '--write-tree', '--no-messages', defaultBranch, branchName],
      { cwd: projectPath, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
    )
    return { clean: true, conflictingFiles: [] }
  } catch (err) { /* intentionally ignored */
    const error = err as { status?: number; stdout?: string }
    if (error.status === 1 && error.stdout) {
      const files = error.stdout
        .trim()
        .split('\n')
        .slice(1)
        .filter((line) => line.trim().length > 0)
      return { clean: false, conflictingFiles: files }
    }
  }

  try {
    ensureDefaultBranchCheckout(projectPath, defaultBranch)
  } catch { /* Could not restore the default branch — cannot perform the merge-tree fallback check. */
    return { clean: false, conflictingFiles: ['(unable to checkout default branch)'] }
  }

  try {
    execFileSync('git', ['merge', '--no-commit', '--no-ff', branchName], {
      cwd: projectPath,
      stdio: 'pipe',
    })
    try {
      execFileSync('git', ['merge', '--abort'], { cwd: projectPath, stdio: 'ignore' })
    } catch { /* merge --abort failed (no merge in progress) — try reset --merge as fallback. */
      try {
        execFileSync('git', ['reset', '--merge'], { cwd: projectPath, stdio: 'ignore' })
      } catch { /* Best effort. */
      }
    }
    return { clean: true, conflictingFiles: [] }
  } catch (err) { /* intentionally ignored */
    const mergeErr = err as { stderr?: Buffer; stdout?: Buffer }
    const output = (mergeErr.stderr?.toString() || '') + '\n' + (mergeErr.stdout?.toString() || '')
    const conflictingFiles = parseConflictFileList(output)

    try {
      execFileSync('git', ['merge', '--abort'], { cwd: projectPath, stdio: 'ignore' })
    } catch { /* merge --abort failed (no merge in progress) — try reset --merge as fallback. */
      try {
        execFileSync('git', ['reset', '--merge'], { cwd: projectPath, stdio: 'ignore' })
      } catch { /* Best effort. */
      }
    }

    return {
      clean: false,
      conflictingFiles: conflictingFiles.length > 0 ? conflictingFiles : ['(unknown files)'],
    }
  }
}

export interface RebaseResult {
  success: boolean
  error?: string
  conflict?: boolean
  conflictingFiles?: string[]
}

export function rebaseBranchOntoDefault(worktreePath: string, projectPath: string): RebaseResult {
  const defaultBranch = getDefaultBranch(projectPath)

  try {
    execFileSync('git', ['fetch', 'origin'], {
      cwd: projectPath,
      stdio: 'pipe',
    })
  } catch { /* Continue with local refs. */
  }

  const rebaseTarget = gitRefExists(projectPath, `origin/${defaultBranch}`)
    ? `origin/${defaultBranch}`
    : defaultBranch

  try {
    execFileSync('git', ['rebase', rebaseTarget], {
      cwd: worktreePath,
      stdio: 'pipe',
    })
    return { success: true }
  } catch (err) { /* intentionally ignored */
    const error = err as { stderr?: Buffer; stdout?: Buffer; message?: string }
    const output = (error.stderr?.toString() || '') + '\n' + (error.stdout?.toString() || '')
    const conflictingFiles = parseConflictFileList(output)

    try {
      execFileSync('git', ['rebase', '--abort'], {
        cwd: worktreePath,
        stdio: 'ignore',
      })
    } catch { /* Best effort. */
    }

    if (output.includes('CONFLICT') || output.includes('could not apply')) {
      return {
        success: false,
        conflict: true,
        error: 'Rebase conflicts detected. The branch cannot be automatically rebased onto the latest default.',
        conflictingFiles: conflictingFiles.length > 0 ? conflictingFiles : undefined,
      }
    }

    return {
      success: false,
      error: `Rebase failed: ${output || error.message || 'Unknown error'}`,
    }
  }
}
