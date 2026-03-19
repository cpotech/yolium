import * as os from 'node:os'
import * as path from 'node:path'
import { cleanupWorktreeAndBranch } from './git-worktree-lifecycle'
import { deleteBranchBestEffortAsync, execFileAsync, gitRefExists, removeWorktreeBestEffortAsync } from './git-internal'
import { getDefaultBranch, validateBranchName } from './git-repository'

let ghCliAvailable: boolean | null = null

export async function checkGhCliAvailable(): Promise<boolean> {
  if (ghCliAvailable !== null) {
    return ghCliAvailable
  }

  try {
    await execFileAsync('gh', ['--version'])
    ghCliAvailable = true
  } catch { /* gh CLI is not installed or not on PATH. */
    ghCliAvailable = false
  }

  return ghCliAvailable
}

export function _resetGhCliCache(): void {
  ghCliAvailable = null
}

export async function isGitHubRemote(projectPath: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync('git', ['remote', 'get-url', 'origin'], {
      cwd: projectPath,
      encoding: 'utf-8',
    })
    const url = stdout.trim().toLowerCase()
    return url.includes('github.com')
  } catch { /* Remote URL lookup failed (no remote, no git repo, etc.) — treat as non-GitHub. */
    return false
  }
}

export interface MergeAndPushResult {
  success: boolean
  prUrl?: string
  prBranch?: string
  error?: string
  conflict?: boolean
  conflictingFiles?: string[]
}

export function generatePrBranchName(worktreeBranch: string, itemTitle: string): string {
  if (/^yolium-\d+-[a-f0-9]+$/.test(worktreeBranch)) {
    const slug = itemTitle
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 50)
    return `yolium/${slug || 'changes'}`
  }

  return worktreeBranch
}

export async function mergeBranchAndPushPR(
  projectPath: string,
  worktreeBranch: string,
  worktreePath: string,
  itemTitle: string,
  itemDescription: string,
): Promise<MergeAndPushResult> {
  validateBranchName(worktreeBranch)

  const defaultBranch = getDefaultBranch(projectPath)
  const prBranch = generatePrBranchName(worktreeBranch, itemTitle)

  try {
    await execFileAsync('git', ['fetch', 'origin'], {
      cwd: projectPath,
    })
  } catch { /* Continue without remote updates. */
  }

  const baseRef = gitRefExists(projectPath, `origin/${defaultBranch}`)
    ? `origin/${defaultBranch}`
    : defaultBranch

  try {
    await execFileAsync('git', ['branch', '-D', prBranch], { cwd: projectPath }).catch(() => {})
    await execFileAsync('git', ['branch', prBranch, baseRef], {
      cwd: projectPath,
    })
  } catch (err) { /* intentionally ignored */
    const error = err as { stderr?: string; message?: string }
    const stderr = error.stderr || error.message || 'Unknown error'
    return { success: false, error: `Failed to create PR branch: ${stderr}` }
  }

  const tempWorktreePath = path.join(os.tmpdir(), `yolium-merge-${Date.now()}`)

  try {
    await execFileAsync('git', ['worktree', 'add', tempWorktreePath, prBranch], {
      cwd: projectPath,
    })
  } catch (err) { /* intentionally ignored */
    const error = err as { stderr?: string; message?: string }
    const stderr = error.stderr || error.message || 'Unknown error'
    await deleteBranchBestEffortAsync(projectPath, prBranch)
    return { success: false, error: `Failed to create temporary worktree: ${stderr}` }
  }

  const cleanupTemp = async (): Promise<void> => {
    await removeWorktreeBestEffortAsync(projectPath, tempWorktreePath)
    await deleteBranchBestEffortAsync(projectPath, prBranch)
  }

  try {
    await execFileAsync('git', ['merge', '--squash', worktreeBranch], {
      cwd: tempWorktreePath,
    })
    await execFileAsync('git', ['commit', '-m', itemTitle], {
      cwd: tempWorktreePath,
    })
  } catch (err) { /* intentionally ignored */
    const error = err as { stderr?: string; stdout?: string; message?: string }
    const output = (error.stderr || '') + (error.stdout || '')

    if (output.includes('CONFLICT') || output.includes('Automatic merge failed')) {
      try {
        await execFileAsync('git', ['merge', '--abort'], { cwd: tempWorktreePath })
      } catch { /* Ignore abort errors. */
      }
      await cleanupTemp()
      return { success: false, conflict: true, error: 'Merge conflicts detected. Please resolve manually.' }
    }

    await cleanupTemp()
    return { success: false, error: `Merge failed: ${output || error.message || 'Unknown error'}` }
  }

  try {
    await execFileAsync('git', ['push', '-u', 'origin', prBranch], {
      cwd: tempWorktreePath,
    })
  } catch (err) { /* intentionally ignored */
    const error = err as { stderr?: string; message?: string }
    const stderr = error.stderr || error.message || 'Unknown error'
    await cleanupTemp()
    return { success: false, error: `Failed to push branch: ${stderr}` }
  }

  const isGitHub = await isGitHubRemote(projectPath)
  if (!isGitHub) {
    await removeWorktreeBestEffortAsync(projectPath, tempWorktreePath)
    return {
      success: true,
      prBranch,
      error: `Branch "${prBranch}" pushed to origin. This remote is not GitHub — create the pull request in your provider's UI.`,
    }
  }

  const ghAvailable = await checkGhCliAvailable()
  if (!ghAvailable) {
    await removeWorktreeBestEffortAsync(projectPath, tempWorktreePath)
    return {
      success: true,
      prBranch,
      error: 'GitHub CLI (gh) is not installed. Install it from https://cli.github.com to create PRs automatically. Branch was pushed — create the PR manually.',
    }
  }

  let prUrl: string | undefined
  try {
    const prBody = itemDescription || itemTitle
    const { stdout } = await execFileAsync(
      'gh',
      ['pr', 'create', '--title', itemTitle, '--body', prBody, '--base', defaultBranch, '--head', prBranch],
      {
        cwd: projectPath,
        encoding: 'utf-8',
      },
    )
    prUrl = stdout.trim()
  } catch (err) { /* intentionally ignored */
    const error = err as { stderr?: string; message?: string }
    const stderr = error.stderr || error.message || 'Unknown error'
    await removeWorktreeBestEffortAsync(projectPath, tempWorktreePath)
    return {
      success: true,
      prBranch,
      error: `Branch pushed but PR creation failed: ${stderr}. Create the PR manually.`,
    }
  }

  await removeWorktreeBestEffortAsync(projectPath, tempWorktreePath)

  try {
    await cleanupWorktreeAndBranch(projectPath, worktreePath, worktreeBranch)
  } catch { /* Best effort after a successful PR. */
  }

  return { success: true, prUrl, prBranch }
}

export interface ApprovePRResult {
  success: boolean
  error?: string
}

export async function approvePR(projectPath: string, prUrl: string): Promise<ApprovePRResult> {
  const ghAvailable = await checkGhCliAvailable()
  if (!ghAvailable) {
    return { success: false, error: 'GitHub CLI (gh) is not installed. Install it from https://cli.github.com to approve PRs.' }
  }

  try {
    await execFileAsync('gh', ['pr', 'review', prUrl, '--approve'], {
      cwd: projectPath,
    })
    return { success: true }
  } catch (err) { /* intentionally ignored */
    const error = err as { stderr?: string; message?: string }
    const stderr = error.stderr || error.message || 'Unknown error'
    return { success: false, error: `Failed to approve PR: ${stderr}` }
  }
}

export interface MergePRResult {
  success: boolean
  error?: string
}

export async function mergePR(projectPath: string, prUrl: string): Promise<MergePRResult> {
  const ghAvailable = await checkGhCliAvailable()
  if (!ghAvailable) {
    return { success: false, error: 'GitHub CLI (gh) is not installed. Install it from https://cli.github.com to merge PRs.' }
  }

  try {
    await execFileAsync('gh', ['pr', 'merge', prUrl, '--squash', '--delete-branch'], {
      cwd: projectPath,
    })
    return { success: true }
  } catch (err) { /* intentionally ignored */
    const error = err as { stderr?: string; message?: string }
    const stderr = error.stderr || error.message || 'Unknown error'
    return { success: false, error: `Failed to merge PR: ${stderr}` }
  }
}
