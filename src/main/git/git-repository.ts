import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { generateGitignore } from '@main/services/project-onboarding'
import type { ProjectType } from '@shared/types/onboarding'

function getBranchNameValidationError(branchName: string): string | null {
  if (!branchName.trim()) {
    return 'Branch name cannot be empty'
  }

  try {
    execFileSync('git', ['check-ref-format', '--branch', branchName], { stdio: 'ignore' })
    return null
  } catch {
    return 'Invalid branch name: does not match git branch naming rules'
  }
}

export function sanitizeBranchName(branchName: string): string {
  return branchName
    .replace(/:/g, '/')
    .replace(/\/\/+/g, '/')
    .replace(/\/$/g, '')
}

export function validateBranchName(branchName: string): void {
  const error = getBranchNameValidationError(branchName)
  if (error) {
    throw new Error(error)
  }
}

export function validateBranchNameForUi(branchName: string): { valid: boolean; error: string | null } {
  const error = getBranchNameValidationError(branchName)
  return { valid: !error, error }
}

export function initGitRepo(folderPath: string): boolean {
  if (isGitRepo(folderPath)) {
    return false
  }

  try {
    execFileSync('git', ['init'], {
      cwd: folderPath,
      stdio: 'pipe',
    })
    return true
  } catch (err) {
    const error = err as { stderr?: Buffer; message?: string }
    const stderr = error.stderr?.toString() || error.message || 'Unknown error'
    throw new Error(`Failed to initialize git repository: ${stderr}`)
  }
}

export interface InitGitRepoWithDefaultsResult {
  initialized: boolean
  hasCommits: boolean
}

function ensureGitIdentity(folderPath: string): void {
  try {
    execFileSync('git', ['config', 'user.name'], {
      cwd: folderPath,
      stdio: 'ignore',
    })
  } catch {
    execFileSync('git', ['config', 'user.name', 'Developer'], {
      cwd: folderPath,
      stdio: 'ignore',
    })
  }

  try {
    execFileSync('git', ['config', 'user.email'], {
      cwd: folderPath,
      stdio: 'ignore',
    })
  } catch {
    execFileSync('git', ['config', 'user.email', 'developer@localhost'], {
      cwd: folderPath,
      stdio: 'ignore',
    })
  }
}

export function initGitRepoWithDefaults(
  folderPath: string,
  projectTypes: ProjectType[] = [],
): InitGitRepoWithDefaultsResult {
  const initialized = initGitRepo(folderPath)

  if (!initialized) {
    return {
      initialized: false,
      hasCommits: hasCommits(folderPath),
    }
  }

  const gitignorePath = path.join(folderPath, '.gitignore')
  if (!fs.existsSync(gitignorePath)) {
    fs.writeFileSync(gitignorePath, generateGitignore(projectTypes), 'utf-8')
  }

  try {
    execFileSync('git', ['add', '.gitignore'], {
      cwd: folderPath,
      stdio: 'ignore',
    })
  } catch {
    // Best effort.
  }

  ensureGitIdentity(folderPath)

  execFileSync('git', ['commit', '--allow-empty', '-m', 'chore: initial commit'], {
    cwd: folderPath,
    stdio: 'ignore',
  })

  return {
    initialized: true,
    hasCommits: true,
  }
}

export function isGitRepo(folderPath: string): boolean {
  try {
    execFileSync('git', ['rev-parse', '--is-inside-work-tree'], {
      cwd: folderPath,
      stdio: 'ignore',
    })
    return true
  } catch {
    return false
  }
}

export function hasCommits(folderPath: string): boolean {
  try {
    execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: folderPath,
      stdio: 'ignore',
    })
    return true
  } catch {
    return false
  }
}

export function getDefaultBranch(projectPath: string): string {
  try {
    const output = execFileSync('git', ['symbolic-ref', 'refs/remotes/origin/HEAD'], {
      cwd: projectPath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    })
    const parts = output.trim().split('/')
    return parts[parts.length - 1]
  } catch {
    // Fall through.
  }

  try {
    execFileSync('git', ['rev-parse', '--verify', 'main'], {
      cwd: projectPath,
      stdio: 'ignore',
    })
    return 'main'
  } catch {
    // Fall through.
  }

  try {
    execFileSync('git', ['rev-parse', '--verify', 'master'], {
      cwd: projectPath,
      stdio: 'ignore',
    })
    return 'master'
  } catch {
    return 'main'
  }
}
