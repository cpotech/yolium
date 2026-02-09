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
 * Fix the .git file in a worktree to use Windows-native paths, and also fix the
 * reverse `gitdir` file in the main repo's `.git/worktrees/<name>/` directory.
 *
 * Git for Windows may write MSYS2-style paths (/c/Users/...) when invoked from
 * a Git Bash/MSYS2 context. These paths break worktree detection for native
 * Windows tools (lazygit, VS Code, etc.) and cause "not a git repository" errors.
 *
 * Two files are fixed:
 * 1. `<worktree>/.git` — contains `gitdir: <path to .git/worktrees/<name>>`
 * 2. `<main-repo>/.git/worktrees/<name>/gitdir` — contains path back to worktree
 */
function fixWorktreeGitFile(worktreePath: string): void {
  // Fix the worktree's .git file (forward reference: worktree → main repo)
  const gitFile = path.join(worktreePath, '.git');
  let resolvedGitdir: string | null = null;
  try {
    const content = fs.readFileSync(gitFile, 'utf-8').trim();
    if (content.startsWith('gitdir: /')) {
      const gitdir = content.replace('gitdir: ', '');
      const fixed = msys2ToWindowsPath(gitdir);
      if (fixed !== gitdir) {
        fs.writeFileSync(gitFile, `gitdir: ${fixed}\n`);
      }
      resolvedGitdir = fixed;
    } else if (content.startsWith('gitdir: ')) {
      resolvedGitdir = content.replace('gitdir: ', '');
    }
  } catch {
    // Best-effort — don't fail worktree creation over this
  }

  // Fix the back-reference gitdir file (reverse reference: main repo → worktree)
  // Located at <main-repo>/.git/worktrees/<name>/gitdir
  if (resolvedGitdir) {
    try {
      const backRefFile = path.join(resolvedGitdir, 'gitdir');
      const backRefContent = fs.readFileSync(backRefFile, 'utf-8').trim();
      if (backRefContent.startsWith('/')) {
        const fixed = msys2ToWindowsPath(backRefContent);
        if (fixed !== backRefContent) {
          fs.writeFileSync(backRefFile, `${fixed}\n`);
        }
      }
    } catch {
      // Best-effort — the back-reference file may not exist yet or be inaccessible
    }
  }
}

/**
 * Sanitize a branch name by replacing characters that are invalid in git ref names.
 * Replaces colons with slashes and collapses consecutive slashes.
 */
export function sanitizeBranchName(branchName: string): string {
  return branchName
    .replace(/:/g, '/')     // colons → slashes
    .replace(/\/\/+/g, '/') // collapse consecutive slashes
    .replace(/\/$/g, '');   // no trailing slash
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

export interface ConflictCheckResult {
  /** Whether the branch can merge cleanly into the default branch */
  clean: boolean;
  /** List of conflicting files (empty if clean) */
  conflictingFiles: string[];
}

/**
 * Check if a branch can merge cleanly into the default branch without modifying the working tree.
 * Uses `git merge-tree` (available in Git 2.38+) for a truly side-effect-free check.
 * Falls back to `git merge --no-commit --no-ff` + abort if merge-tree is unavailable.
 *
 * @param projectPath - The repository path
 * @param branchName - The branch to check
 * @returns ConflictCheckResult with clean status and list of conflicting files
 */
export function checkMergeConflicts(projectPath: string, branchName: string): ConflictCheckResult {
  validateBranchName(branchName);

  const defaultBranch = getDefaultBranch(projectPath);

  // Try git merge-tree first (Git 2.38+ — side-effect-free)
  try {
    const output = execFileSync(
      'git',
      ['merge-tree', '--write-tree', '--no-messages', defaultBranch, branchName],
      { cwd: projectPath, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
    );
    // Exit code 0 = clean merge
    return { clean: true, conflictingFiles: [] };
  } catch (err) {
    const error = err as { status?: number; stdout?: string; stderr?: string };
    if (error.status === 1 && error.stdout) {
      // Exit code 1 = conflicts; stdout lists conflicting files after the tree hash
      const lines = error.stdout.trim().split('\n');
      // Lines after the first (tree hash) are conflict info
      const files = lines.slice(1).filter((l) => l.trim().length > 0);
      return { clean: false, conflictingFiles: files };
    }
    // merge-tree not available or other error — fall back to dry-run merge
  }

  // Fallback: dry-run merge (modifies index temporarily)
  try {
    execFileSync('git', ['checkout', defaultBranch], {
      cwd: projectPath,
      stdio: 'pipe',
    });
  } catch {
    return { clean: false, conflictingFiles: ['(unable to checkout default branch)'] };
  }

  try {
    execFileSync('git', ['merge', '--no-commit', '--no-ff', branchName], {
      cwd: projectPath,
      stdio: 'pipe',
    });
    // Clean merge — abort it to restore state
    try {
      execFileSync('git', ['merge', '--abort'], { cwd: projectPath, stdio: 'ignore' });
    } catch {
      // If abort fails, reset
      try {
        execFileSync('git', ['reset', '--merge'], { cwd: projectPath, stdio: 'ignore' });
      } catch {
        // Best effort
      }
    }
    return { clean: true, conflictingFiles: [] };
  } catch (err) {
    const mergeErr = err as { stderr?: Buffer; stdout?: Buffer };
    const output = (mergeErr.stderr?.toString() || '') + '\n' + (mergeErr.stdout?.toString() || '');

    // Extract conflicting file names from output
    const conflictingFiles: string[] = [];
    const regex = /CONFLICT \([^)]+\): (?:Merge conflict in )?(.+)/g;
    let match;
    while ((match = regex.exec(output)) !== null) {
      conflictingFiles.push(match[1].trim());
    }

    // Abort the failed merge
    try {
      execFileSync('git', ['merge', '--abort'], { cwd: projectPath, stdio: 'ignore' });
    } catch {
      try {
        execFileSync('git', ['reset', '--merge'], { cwd: projectPath, stdio: 'ignore' });
      } catch {
        // Best effort
      }
    }

    return {
      clean: false,
      conflictingFiles: conflictingFiles.length > 0 ? conflictingFiles : ['(unknown files)'],
    };
  }
}

export interface RebaseResult {
  /** Whether the rebase succeeded */
  success: boolean;
  /** Error message if rebase failed */
  error?: string;
  /** Whether the failure was due to conflicts */
  conflict?: boolean;
  /** List of conflicting files */
  conflictingFiles?: string[];
}

/**
 * Rebase a branch onto the latest default branch.
 * This should be called on the worktree where the branch is checked out.
 *
 * @param worktreePath - The worktree path where the branch is checked out
 * @param projectPath - The main repository path (for fetching)
 * @returns RebaseResult
 */
export function rebaseBranchOntoDefault(worktreePath: string, projectPath: string): RebaseResult {
  const defaultBranch = getDefaultBranch(projectPath);

  // Fetch latest from remote into the main repo so worktree sees it
  try {
    execFileSync('git', ['fetch', 'origin'], {
      cwd: projectPath,
      stdio: 'pipe',
    });
  } catch {
    // No remote or network error — continue with local state
  }

  // Rebase the worktree branch onto the latest default
  // Use origin/<default> if available, otherwise local <default>
  let rebaseTarget: string;
  try {
    execFileSync('git', ['rev-parse', '--verify', `origin/${defaultBranch}`], {
      cwd: projectPath,
      stdio: 'ignore',
    });
    rebaseTarget = `origin/${defaultBranch}`;
  } catch {
    rebaseTarget = defaultBranch;
  }

  try {
    execFileSync('git', ['rebase', rebaseTarget], {
      cwd: worktreePath,
      stdio: 'pipe',
    });
    return { success: true };
  } catch (err) {
    const error = err as { stderr?: Buffer; stdout?: Buffer; message?: string };
    const stderr = error.stderr?.toString() || '';
    const stdout = error.stdout?.toString() || '';
    const output = stderr + '\n' + stdout;

    // Extract conflicting files
    const conflictingFiles: string[] = [];
    const regex = /CONFLICT \([^)]+\): (?:Merge conflict in )?(.+)/g;
    let match;
    while ((match = regex.exec(output)) !== null) {
      conflictingFiles.push(match[1].trim());
    }

    // Abort the rebase
    try {
      execFileSync('git', ['rebase', '--abort'], {
        cwd: worktreePath,
        stdio: 'ignore',
      });
    } catch {
      // Best effort
    }

    if (output.includes('CONFLICT') || output.includes('could not apply')) {
      return {
        success: false,
        conflict: true,
        error: 'Rebase conflicts detected. The branch cannot be automatically rebased onto the latest default.',
        conflictingFiles: conflictingFiles.length > 0 ? conflictingFiles : undefined,
      };
    }

    return {
      success: false,
      error: `Rebase failed: ${output || error.message || 'Unknown error'}`,
    };
  }
}

export interface MergeAndPushResult {
  success: boolean;
  prUrl?: string;
  prBranch?: string;
  error?: string;
  conflict?: boolean;
  conflictingFiles?: string[];
  rebased?: boolean;
}

/**
 * Generate a well-named PR branch from the worktree branch name.
 * Strips the 'yolium-{timestamp}-{hash}' prefix and creates a clean name.
 * If the original branch already has a descriptive name, use it directly.
 */
export function generatePrBranchName(worktreeBranch: string, itemTitle: string): string {
  // If the branch is an auto-generated yolium branch, derive from item title
  if (/^yolium-\d+-[a-f0-9]+$/.test(worktreeBranch)) {
    const slug = itemTitle
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 50);
    return `yolium/${slug || 'changes'}`;
  }
  // Otherwise use the existing branch name as-is (user-specified)
  return worktreeBranch;
}

/**
 * Merge a worktree branch into the latest default branch, push to remote, and create a PR.
 *
 * Steps:
 * 1. Fetch latest default branch from remote
 * 2. Rebase the worktree branch onto the latest default (catches conflicts early, keeps history linear)
 * 3. Checkout default branch and pull latest
 * 4. Create a new well-named PR branch from the default branch
 * 5. Squash merge the rebased worktree branch into the PR branch
 * 6. Push the PR branch to remote
 * 7. Create a PR using `gh pr create`
 * 8. On success, clean up worktree and old worktree branch
 *
 * @param projectPath - The repository path (main worktree)
 * @param worktreeBranch - The worktree branch to merge
 * @param worktreePath - The worktree directory path
 * @param itemTitle - The kanban item title (used for PR title and branch name)
 * @param itemDescription - The kanban item description (used for PR body)
 */
export function mergeBranchAndPushPR(
  projectPath: string,
  worktreeBranch: string,
  worktreePath: string,
  itemTitle: string,
  itemDescription: string,
): MergeAndPushResult {
  validateBranchName(worktreeBranch);

  const defaultBranch = getDefaultBranch(projectPath);
  const prBranch = generatePrBranchName(worktreeBranch, itemTitle);

  // Step 1: Fetch latest from remote
  try {
    execFileSync('git', ['fetch', 'origin'], {
      cwd: projectPath,
      stdio: 'pipe',
    });
  } catch {
    // Fetch may fail if no remote configured — continue anyway
  }

  // Step 2: Auto-rebase the worktree branch onto the latest default
  // This catches conflicts early and keeps the history linear
  const rebaseResult = rebaseBranchOntoDefault(worktreePath, projectPath);
  if (!rebaseResult.success) {
    if (rebaseResult.conflict) {
      return {
        success: false,
        conflict: true,
        conflictingFiles: rebaseResult.conflictingFiles,
        error: rebaseResult.error || 'Rebase conflicts detected. Please resolve manually.',
      };
    }
    return { success: false, error: rebaseResult.error || 'Rebase failed' };
  }

  // Step 3: Checkout default branch and pull latest
  try {
    execFileSync('git', ['checkout', defaultBranch], {
      cwd: projectPath,
      stdio: 'pipe',
    });
  } catch (err) {
    const error = err as { stderr?: Buffer; message?: string };
    const stderr = error.stderr?.toString() || error.message || 'Unknown error';
    return { success: false, error: `Failed to checkout ${defaultBranch}: ${stderr}` };
  }

  try {
    execFileSync('git', ['pull', '--ff-only', 'origin', defaultBranch], {
      cwd: projectPath,
      stdio: 'pipe',
    });
  } catch {
    // Pull may fail if no remote or if diverged — continue with local state
  }

  // Step 4: Create the PR branch from default branch
  try {
    execFileSync('git', ['checkout', '-B', prBranch], {
      cwd: projectPath,
      stdio: 'pipe',
    });
  } catch (err) {
    const error = err as { stderr?: Buffer; message?: string };
    const stderr = error.stderr?.toString() || error.message || 'Unknown error';
    return { success: false, error: `Failed to create PR branch: ${stderr}` };
  }

  // Step 5: Squash merge the rebased worktree branch into the PR branch
  // After a successful rebase, this squash merge is guaranteed to be clean
  try {
    execFileSync('git', ['merge', '--squash', worktreeBranch], {
      cwd: projectPath,
      stdio: 'pipe',
    });
    execFileSync('git', ['commit', '-m', `Squash merge branch '${worktreeBranch}' for: ${itemTitle}`], {
      cwd: projectPath,
      stdio: 'pipe',
    });
  } catch (err) {
    const error = err as { stderr?: Buffer; stdout?: Buffer; message?: string };
    const stderr = error.stderr?.toString() || '';
    const stdout = error.stdout?.toString() || '';
    const output = stderr + stdout;

    if (output.includes('CONFLICT') || output.includes('Automatic merge failed')) {
      try {
        execFileSync('git', ['merge', '--abort'], { cwd: projectPath, stdio: 'ignore' });
      } catch {
        // Ignore
      }
      try {
        execFileSync('git', ['checkout', defaultBranch], { cwd: projectPath, stdio: 'pipe' });
        execFileSync('git', ['branch', '-D', prBranch], { cwd: projectPath, stdio: 'pipe' });
      } catch {
        // Best effort
      }
      return { success: false, conflict: true, error: 'Merge conflicts detected. Please resolve manually.' };
    }

    try {
      execFileSync('git', ['checkout', defaultBranch], { cwd: projectPath, stdio: 'pipe' });
      execFileSync('git', ['branch', '-D', prBranch], { cwd: projectPath, stdio: 'pipe' });
    } catch {
      // Best effort
    }
    return { success: false, error: `Merge failed: ${output || error.message || 'Unknown error'}` };
  }

  // Step 6: Push the PR branch to remote
  try {
    execFileSync('git', ['push', '-u', 'origin', prBranch], {
      cwd: projectPath,
      stdio: 'pipe',
    });
  } catch (err) {
    const error = err as { stderr?: Buffer; message?: string };
    const stderr = error.stderr?.toString() || error.message || 'Unknown error';
    // Clean up: go back to default branch
    try {
      execFileSync('git', ['checkout', defaultBranch], {
        cwd: projectPath,
        stdio: 'pipe',
      });
      execFileSync('git', ['branch', '-D', prBranch], {
        cwd: projectPath,
        stdio: 'pipe',
      });
    } catch {
      // Best effort
    }
    return { success: false, error: `Failed to push branch: ${stderr}` };
  }

  // Step 7: Create a PR using gh CLI
  let prUrl: string | undefined;
  try {
    const prBody = itemDescription || itemTitle;
    const output = execFileSync('gh', ['pr', 'create', '--title', itemTitle, '--body', prBody, '--base', defaultBranch, '--head', prBranch], {
      cwd: projectPath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    // gh pr create outputs the PR URL
    prUrl = output.trim();
  } catch (err) {
    const error = err as { stderr?: Buffer; message?: string };
    const stderr = error.stderr?.toString() || error.message || 'Unknown error';
    // Branch was pushed successfully — PR creation failed but that's not fatal
    // User can create PR manually
    return {
      success: true,
      prBranch,
      error: `Branch pushed but PR creation failed: ${stderr}. Create the PR manually.`,
    };
  }

  // Step 8: Clean up worktree and old branch, return to default branch
  try {
    execFileSync('git', ['checkout', defaultBranch], {
      cwd: projectPath,
      stdio: 'pipe',
    });
  } catch {
    // Best effort
  }

  cleanupWorktreeAndBranch(projectPath, worktreePath, worktreeBranch);

  return { success: true, prUrl, prBranch, rebased: true };
}
