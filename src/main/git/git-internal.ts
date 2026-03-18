import { execFile, execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import { promisify } from 'node:util'

export const execFileAsync = promisify(execFile)

export function gitRefExists(projectPath: string, refName: string): boolean {
  try {
    execFileSync('git', ['rev-parse', '--verify', refName], {
      cwd: projectPath,
      stdio: 'ignore',
    })
    return true
  } catch { /* Ref does not exist — expected for branch existence checks. */
    return false
  }
}

export function resolveDiffBranchRef(projectPath: string, branchName: string): string {
  if (gitRefExists(projectPath, branchName)) {
    return branchName
  }

  const remoteRef = `origin/${branchName}`
  if (gitRefExists(projectPath, remoteRef)) {
    return remoteRef
  }

  throw new Error(
    `Branch reference not found for "${branchName}". Tried "${branchName}" and "${remoteRef}". ` +
    'Fetch latest refs or restore the branch before comparing changes.',
  )
}

export function getCurrentBranch(cwd: string): string | null {
  try {
    return execFileSync('git', ['symbolic-ref', '--short', 'HEAD'], {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()
  } catch { /* Detached HEAD, not inside a git repo, or symbolic-ref unavailable. */
    return null
  }
}

export function parseConflictingWorktreePath(stderr: string): string | null {
  const match = stderr.match(/already checked out at '([^']+)'/)
  return match ? match[1] : null
}

export function parseConflictFileList(output: string): string[] {
  const conflictingFiles: string[] = []
  const regex = /CONFLICT \([^)]+\): (?:Merge conflict in )?(.+)/g
  let match: RegExpExecArray | null

  while ((match = regex.exec(output)) !== null) {
    conflictingFiles.push(match[1].trim())
  }

  return conflictingFiles
}

export function removeWorktreeBestEffortSync(projectPath: string, worktreePath: string): void {
  try {
    execFileSync('git', ['worktree', 'remove', worktreePath, '--force'], {
      cwd: projectPath,
      stdio: 'pipe',
    })
    return
  } catch { /* Worktree remove failed (already gone or locked) — prune stale refs and fall through to rmSync. */
    try {
      execFileSync('git', ['worktree', 'prune'], {
        cwd: projectPath,
        stdio: 'ignore',
      })
    } catch { /* Ignore prune errors. */
    }
  }

  if (!fs.existsSync(worktreePath)) {
    return
  }

  try {
    fs.rmSync(worktreePath, { recursive: true, force: true, maxRetries: 3, retryDelay: 500 })
  } catch { /* Best-effort fallback. */
  }
}

export async function removeWorktreeBestEffortAsync(projectPath: string, worktreePath: string): Promise<void> {
  try {
    await execFileAsync('git', ['worktree', 'remove', worktreePath, '--force'], {
      cwd: projectPath,
    })
    return
  } catch { /* Worktree remove failed (already gone or locked) — prune stale refs and fall through to rmSync. */
    try {
      await execFileAsync('git', ['worktree', 'prune'], {
        cwd: projectPath,
      })
    } catch { /* Ignore prune errors. */
    }
  }

  if (!fs.existsSync(worktreePath)) {
    return
  }

  try {
    fs.rmSync(worktreePath, { recursive: true, force: true, maxRetries: 3, retryDelay: 500 })
  } catch { /* Best-effort fallback. */
  }
}

export async function deleteBranchBestEffortAsync(projectPath: string, branchName: string): Promise<void> {
  try {
    await execFileAsync('git', ['branch', '-d', branchName], {
      cwd: projectPath,
    })
    return
  } catch { /* -d failed because the branch is not fully merged — retry with -D (force delete). */
    try {
      await execFileAsync('git', ['branch', '-D', branchName], {
        cwd: projectPath,
      })
    } catch { /* Ignore branch cleanup errors. */
    }
  }
}
