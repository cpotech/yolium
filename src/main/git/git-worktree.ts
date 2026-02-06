import { execFileSync } from 'node:child_process';
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
function getBranchNameValidationError(branchName: string): string | null {
  if (!branchName.trim()) {
    return 'Branch name cannot be empty';
  }

  try {
    execFileSync('git', ['check-ref-format', '--branch', branchName], { stdio: 'ignore' });
    return null;
  } catch {
    return 'Invalid branch name: does not match git branch naming rules';
  }
}

/**
 * Convert an MSYS2-style path (/c/Users/...) to a Windows-native path (C:/Users/...).
 * Returns the path unchanged if it's not in MSYS2 format.
 */
function msys2ToWindowsPath(p: string): string {
  const match = p.match(/^\/([a-zA-Z])\//);
  if (match) {
    return `${match[1].toUpperCase()}:/${p.slice(3)}`;
  }
  return p;
}

/**
 * Fix the .git file in a worktree to use Windows-native paths.
 * Git for Windows may write MSYS2-style paths (/c/Users/...) when invoked from
 * a Git Bash/MSYS2 context. These paths break worktree detection for native
 * Windows tools (lazygit, VS Code, etc.).
 */
function fixWorktreeGitFile(worktreePath: string): void {
  const gitFile = path.join(worktreePath, '.git');
  try {
    const content = fs.readFileSync(gitFile, 'utf-8').trim();
    if (content.startsWith('gitdir: /')) {
      const gitdir = content.replace('gitdir: ', '');
      const fixed = msys2ToWindowsPath(gitdir);
      if (fixed !== gitdir) {
        fs.writeFileSync(gitFile, `gitdir: ${fixed}\n`);
      }
    }
  } catch {
    // Best-effort — don't fail worktree creation over this
  }
}

export function validateBranchName(branchName: string): void {
  const error = getBranchNameValidationError(branchName);
  if (error) {
    throw new Error(error);
  }
}

export function validateBranchNameForUi(branchName: string): { valid: boolean; error: string | null } {
  const error = getBranchNameValidationError(branchName);
  return { valid: !error, error };
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
    execFileSync('git', ['init'], {
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
    execFileSync('git', ['rev-parse', '--is-inside-work-tree'], {
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
    execFileSync('git', ['rev-parse', 'HEAD'], {
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
    execFileSync('git', ['worktree', 'prune'], {
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
      const output = execFileSync('git', ['worktree', 'list', '--porcelain'], {
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
        // Still fix paths — worktree may have been created before the MSYS2 fix
        if (process.platform === 'win32') {
          fixWorktreeGitFile(worktreePath);
        }
        return worktreePath;
      }
    } catch {
      // Fall through to remove and recreate
    }

    // Remove stale directory
    fs.rmSync(worktreePath, { recursive: true, force: true, maxRetries: 3, retryDelay: 500 });
  }

  // Check if branch already exists
  let branchExists = false;
  try {
    execFileSync('git', ['rev-parse', '--verify', branchName], {
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
      execFileSync('git', ['worktree', 'add', worktreePath, branchName], {
        cwd: projectPath,
        stdio: 'pipe',
      });
    } else {
      // Create new branch from current HEAD
      execFileSync('git', ['worktree', 'add', '-b', branchName, worktreePath], {
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

  // On Windows, git may write MSYS2-style paths (/c/Users/...) in the worktree's
  // .git file when invoked from a Git Bash context. These paths aren't resolved by
  // native Windows git, breaking worktree detection. Rewrite to Windows-native paths.
  if (process.platform === 'win32') {
    fixWorktreeGitFile(worktreePath);
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
    execFileSync('git', ['worktree', 'remove', worktreePath, '--force'], {
      cwd: projectPath,
      stdio: 'pipe',
    });
  } catch {
    // If git worktree remove fails, manually prune and remove directory
    try {
    execFileSync('git', ['worktree', 'prune'], {
      cwd: projectPath,
      stdio: 'ignore',
    });
    } catch {
      // Ignore prune errors
    }

    // Remove the directory if it still exists
    if (fs.existsSync(worktreePath)) {
      fs.rmSync(worktreePath, { recursive: true, force: true, maxRetries: 3, retryDelay: 500 });
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
    const output = execFileSync('git', ['status', '--porcelain'], {
      cwd: worktreePath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'], // Suppress stderr
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
    const output = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: worktreePath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'], // Suppress stderr
    });
    return output.trim();
  } catch {
    return null;
  }
}

/**
 * Detect the default branch of a repository (main, master, etc.).
 *
 * @param projectPath - The repository path
 * @returns The default branch name
 */
export function getDefaultBranch(projectPath: string): string {
  // Try symbolic-ref first (works when origin is configured)
  try {
    const output = execFileSync('git', ['symbolic-ref', 'refs/remotes/origin/HEAD'], {
      cwd: projectPath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    // Output is like "refs/remotes/origin/main"
    const parts = output.trim().split('/');
    return parts[parts.length - 1];
  } catch {
    // Fall through
  }

  // Check if 'main' branch exists
  try {
    execFileSync('git', ['rev-parse', '--verify', 'main'], {
      cwd: projectPath,
      stdio: 'ignore',
    });
    return 'main';
  } catch {
    // Fall through
  }

  // Check if 'master' branch exists
  try {
    execFileSync('git', ['rev-parse', '--verify', 'master'], {
      cwd: projectPath,
      stdio: 'ignore',
    });
    return 'master';
  } catch {
    // Fall through
  }

  // Default to 'main'
  return 'main';
}

/**
 * Merge a branch into the default branch using --no-ff.
 *
 * @param projectPath - The repository path (main worktree)
 * @param branchName - The branch to merge
 * @throws Error with 'conflict' in message if merge conflicts occur
 */
export function mergeWorktreeBranch(projectPath: string, branchName: string): void {
  validateBranchName(branchName);

  const defaultBranch = getDefaultBranch(projectPath);

  // Ensure we're on the default branch
  try {
    execFileSync('git', ['checkout', defaultBranch], {
      cwd: projectPath,
      stdio: 'pipe',
    });
  } catch (err) {
    const error = err as { stderr?: Buffer; message?: string };
    const stderr = error.stderr?.toString() || error.message || 'Unknown error';
    throw new Error(`Failed to checkout ${defaultBranch}: ${stderr}`);
  }

  // Attempt the merge
  try {
    execFileSync('git', ['merge', branchName, '--no-ff', '-m', `Merge branch '${branchName}'`], {
      cwd: projectPath,
      stdio: 'pipe',
    });
  } catch (err) {
    const error = err as { stderr?: Buffer; stdout?: Buffer; message?: string };
    const stderr = error.stderr?.toString() || '';
    const stdout = error.stdout?.toString() || '';
    const output = stderr + stdout;

    // Check if it's a merge conflict
    if (output.includes('CONFLICT') || output.includes('Automatic merge failed')) {
      // Abort the merge to leave the repo clean
      try {
        execFileSync('git', ['merge', '--abort'], {
          cwd: projectPath,
          stdio: 'ignore',
        });
      } catch {
        // Ignore abort errors
      }
      throw new Error('conflict: Merge conflicts detected. Please resolve manually.');
    }

    throw new Error(`Failed to merge branch: ${output || error.message || 'Unknown error'}`);
  }
}

/**
 * Get diff statistics between the default branch and a feature branch.
 *
 * @param projectPath - The repository path
 * @param branchName - The feature branch to compare
 * @returns Diff statistics
 */
export function getWorktreeDiffStats(projectPath: string, branchName: string): {
  filesChanged: number;
  insertions: number;
  deletions: number;
} {
  validateBranchName(branchName);

  const defaultBranch = getDefaultBranch(projectPath);

  try {
    const output = execFileSync('git', ['diff', `${defaultBranch}...${branchName}`, '--stat', '--stat-width=999'], {
      cwd: projectPath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    });

    // Parse the last line: " N files changed, M insertions(+), D deletions(-)"
    const lines = output.trim().split('\n');
    const summaryLine = lines[lines.length - 1] || '';

    const filesMatch = summaryLine.match(/(\d+) files? changed/);
    const insertionsMatch = summaryLine.match(/(\d+) insertions?\(\+\)/);
    const deletionsMatch = summaryLine.match(/(\d+) deletions?\(-\)/);

    return {
      filesChanged: filesMatch ? parseInt(filesMatch[1], 10) : 0,
      insertions: insertionsMatch ? parseInt(insertionsMatch[1], 10) : 0,
      deletions: deletionsMatch ? parseInt(deletionsMatch[1], 10) : 0,
    };
  } catch {
    return { filesChanged: 0, insertions: 0, deletions: 0 };
  }
}

/**
 * Clean up a worktree and optionally delete its branch.
 *
 * @param projectPath - The original project repository path
 * @param worktreePath - The path to the worktree to remove
 * @param branchName - The branch to delete after worktree removal
 */
export function cleanupWorktreeAndBranch(projectPath: string, worktreePath: string, branchName: string): void {
  validateBranchName(branchName);

  // Delete the worktree
  deleteWorktree(projectPath, worktreePath);

  // Delete the branch (use -d for safe delete — only deletes if fully merged)
  try {
    execFileSync('git', ['branch', '-d', branchName], {
      cwd: projectPath,
      stdio: 'pipe',
    });
  } catch {
    // Branch may already be deleted or not fully merged — that's OK
    // Force delete if needed (branch was merged via --no-ff so -d should work)
    try {
      execFileSync('git', ['branch', '-D', branchName], {
        cwd: projectPath,
        stdio: 'pipe',
      });
    } catch {
      // Ignore — branch cleanup is best-effort
    }
  }
}
