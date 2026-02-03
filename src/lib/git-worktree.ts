import { execFileSync, execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';

/**
 * Validate that a branch name is safe for use in shell commands and file paths.
 * This prevents command injection attacks via malicious branch names.
 *
 * Valid branch names contain only alphanumeric characters, hyphens, underscores,
 * forward slashes, and dots. They cannot start with a hyphen or contain consecutive dots.
 *
 * @throws Error if the branch name contains unsafe characters
 */
function validateBranchName(branchName: string): void {
  try {
    execFileSync('git', ['check-ref-format', '--branch', branchName], { stdio: 'ignore' });
  } catch {
    throw new Error('Invalid branch name: does not match git branch naming rules');
  }
}

/**
 * Initialize a git repository in a folder.
 * @returns true if successful, false if already a repo
 * @throws Error if initialization fails
 */
export function initGitRepo(folderPath: string): boolean {
  // Check if already a repo
  if (isGitRepo(folderPath)) {
    return false;
  }

  try {
    execSync('git init', {
      cwd: folderPath,
      stdio: 'pipe',
    });
    return true;
  } catch (err) {
    const error = err as { stderr?: Buffer; message?: string };
    const stderr = error.stderr?.toString() || error.message || 'Unknown error';
    throw new Error(`Failed to initialize git repository: ${stderr}`);
  }
}

/**
 * Check if a folder is a git repository.
 */
export function isGitRepo(folderPath: string): boolean {
  try {
    execSync('git rev-parse --is-inside-work-tree', {
      cwd: folderPath,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a git repository has at least one commit.
 */
export function hasCommits(folderPath: string): boolean {
  try {
    execSync('git rev-parse HEAD', {
      cwd: folderPath,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Generate a unique branch name for a worktree.
 */
export function generateBranchName(): string {
  return `yolium-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
}

/**
 * Get the worktree path for a project and branch.
 * Stored at ~/.yolium/worktrees/yolium-{project-hash}/{branch-name}
 */
export function getWorktreePath(projectPath: string, branchName: string): string {
  validateBranchName(branchName);
  const absolutePath = path.resolve(projectPath);
  const hash = crypto.createHash('sha256').update(absolutePath).digest('hex').substring(0, 12);
  return path.join(os.homedir(), '.yolium', 'worktrees', `yolium-${hash}`, branchName);
}

/**
 * Create a git worktree for the project.
 * Creates a new branch from the current HEAD.
 *
 * @param projectPath - The original project repository path
 * @param branchName - The branch name for the worktree
 * @returns The path to the created worktree
 * @throws Error if worktree creation fails
 */
export function createWorktree(projectPath: string, branchName: string): string {
  // Validate branch name to prevent command injection
  validateBranchName(branchName);

  // Check if repo has at least one commit
  if (!hasCommits(projectPath)) {
    throw new Error('Cannot create worktree: repository has no commits yet. Please make an initial commit first.');
  }

  // Prune stale worktree references (directories deleted but still registered)
  try {
    execSync('git worktree prune', {
      cwd: projectPath,
      stdio: 'ignore',
    });
  } catch {
    // Ignore prune errors - not critical
  }

  const worktreePath = getWorktreePath(projectPath, branchName);

  // Ensure parent directory exists
  const worktreeDir = path.dirname(worktreePath);
  fs.mkdirSync(worktreeDir, { recursive: true });

  // Check if worktree already exists at this path
  if (fs.existsSync(worktreePath)) {
    // Verify it's a valid worktree for this repo
    try {
      const output = execSync('git worktree list --porcelain', {
        cwd: projectPath,
        encoding: 'utf-8',
      });
      const normalizedTarget = path.resolve(worktreePath);
      const hasMatch = output
        .split('\n')
        .filter((line) => line.startsWith('worktree '))
        .some((line) => path.resolve(line.replace('worktree ', '').trim()) === normalizedTarget);
      if (hasMatch) {
        // Worktree exists and is valid, reuse it
        return worktreePath;
      }
    } catch {
      // Fall through to remove and recreate
    }

    // Remove stale directory
    fs.rmSync(worktreePath, { recursive: true, force: true });
  }

  // Check if branch already exists
  let branchExists = false;
  try {
    execSync(`git rev-parse --verify "${branchName}"`, {
      cwd: projectPath,
      stdio: 'ignore',
    });
    branchExists = true;
  } catch {
    branchExists = false;
  }

  // Create the worktree
  try {
    if (branchExists) {
      // Use existing branch (will fail if branch is checked out elsewhere)
      execSync(`git worktree add "${worktreePath}" "${branchName}"`, {
        cwd: projectPath,
        stdio: 'pipe',
      });
    } else {
      // Create new branch from current HEAD
      execSync(`git worktree add -b "${branchName}" "${worktreePath}"`, {
        cwd: projectPath,
        stdio: 'pipe',
      });
    }
  } catch (err) {
    const error = err as { stderr?: Buffer; message?: string };
    const stderr = error.stderr?.toString() || error.message || 'Unknown error';

    // Check for "already checked out" error
    if (stderr.includes('already checked out') || stderr.includes('is already used by')) {
      throw new Error(`Branch "${branchName}" is already checked out in another worktree. Please use a different branch name.`);
    }

    throw new Error(`Failed to create worktree: ${stderr}`);
  }

  return worktreePath;
}

/**
 * Delete a git worktree.
 *
 * @param projectPath - The original project repository path
 * @param worktreePath - The path to the worktree to remove
 */
export function deleteWorktree(projectPath: string, worktreePath: string): void {
  try {
    // First try the clean git worktree remove
    execSync(`git worktree remove "${worktreePath}" --force`, {
      cwd: projectPath,
      stdio: 'pipe',
    });
  } catch {
    // If git worktree remove fails, manually prune and remove directory
    try {
      execSync('git worktree prune', {
        cwd: projectPath,
        stdio: 'ignore',
      });
    } catch {
      // Ignore prune errors
    }

    // Remove the directory if it still exists
    if (fs.existsSync(worktreePath)) {
      fs.rmSync(worktreePath, { recursive: true, force: true });
    }
  }
}

/**
 * Check if a worktree has uncommitted changes.
 *
 * @param worktreePath - The path to the worktree
 * @returns true if there are uncommitted changes
 */
export function hasUncommittedChanges(worktreePath: string): boolean {
  try {
    const output = execSync('git status --porcelain', {
      cwd: worktreePath,
      encoding: 'utf-8',
    });
    return output.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * Get the branch name of a worktree.
 *
 * @param worktreePath - The path to the worktree
 * @returns The branch name or null if not found
 */
export function getWorktreeBranch(worktreePath: string): string | null {
  try {
    const output = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: worktreePath,
      encoding: 'utf-8',
    });
    return output.trim();
  } catch {
    return null;
  }
}
