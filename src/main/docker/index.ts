/**
 * @module src/lib/docker
 * Docker container management for Yolium. Re-exports all public APIs.
 */

// Re-export types
export type { ContainerSession, ProjectCacheInfo, CacheStats, CleanupResult } from '@shared/types/docker';
export type { ReviewAgentType } from '@shared/types/agent';
export type { AgentContainerSession } from './shared';
export type { AgentContainerParams, AgentContainerCallbacks } from './agent-container';

// Path utilities
export {
  toDockerPath,
  getContainerProjectPath,
  toContainerHomePath,
  hashProjectPath,
  sanitizeFolderName,
  getProjectDirName,
} from './path-utils';

// Image building and management
export {
  isDockerAvailable,
  ensureImage,
  removeYoliumImage,
  getYoliumImageInfo,
  getDockerDir,
  computeDockerImageHash,
  buildLocalImage,
} from './image-builder';

// Project registry and persistent storage
export {
  registerProject,
  getPersistentPaths,
  ensurePersistentDirs,
  buildPersistentBindMounts,
  getYoliumSshDir,
  getGitCredentialsBind,
} from './project-registry';

// Interactive container lifecycle
export {
  createYolium,
  writeToContainer,
  resizeContainer,
  stopYolium,
  closeAllContainers,
  removeAllYoliumContainers,
  getSessionWorktreeInfo,
  deleteSessionWorktree,
} from './container-lifecycle';

// Agent containers
export {
  createAgentContainer,
  stopAgentContainer,
  getAgentSession,
  getAllAgentSessions,
} from './agent-container';

// Code review
export {
  listRemoteBranches,
  checkAgentAuth,
  createCodeReviewContainer,
} from './code-review';

// Cache management
export {
  listProjectCaches,
  getProjectCacheStats,
  deleteProjectCache,
  cleanupOrphanedCaches,
  cleanupStaleCaches,
} from './cache-manager';
