export {
  getDefaultBranch,
  hasCommits,
  initGitRepo,
  initGitRepoWithDefaults,
  isGitRepo,
  sanitizeBranchName,
  validateBranchName,
  validateBranchNameForUi,
} from './git-repository'
export type { InitGitRepoWithDefaultsResult } from './git-repository'

export {
  fixWorktreeGitFile,
  generateBranchName,
  getWorktreePath,
} from './git-worktree-paths'

export {
  cleanupWorktreeAndBranch,
  createWorktree,
  deleteWorktree,
  getWorktreeBranch,
  hasUncommittedChanges,
} from './git-worktree-lifecycle'

export {
  checkMergeConflicts,
  getWorktreeChangedFiles,
  getWorktreeDiffStats,
  getWorktreeFileDiff,
  mergeWorktreeBranch,
  rebaseBranchOntoDefault,
} from './git-branch-operations'
export type { ConflictCheckResult, RebaseResult } from './git-branch-operations'

export {
  _resetGhCliCache,
  approvePR,
  checkGhCliAvailable,
  generatePrBranchName,
  mergeBranchAndPushPR,
  mergePR,
} from './git-github-pr'
export type {
  ApprovePRResult,
  MergeAndPushResult,
  MergePRResult,
} from './git-github-pr'

export {
  cloneRepository,
  extractRepoNameFromUrl,
} from './git-clone'
export type { GitCloneResult } from './git-clone'
