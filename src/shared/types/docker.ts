// Docker and container type definitions

export interface ContainerSession {
  id: string;
  containerId: string;
  stream: NodeJS.ReadWriteStream;
  webContentsId: number;
  folderPath: string;
  state: 'starting' | 'running' | 'stopped' | 'crashed';
  // Worktree info (if worktree is enabled)
  worktreePath?: string;
  originalPath?: string;
  branchName?: string;
}

export interface ProjectCacheInfo {
  dirName: string;
  path: string;
  folderName: string;
  lastAccessed: string;
  createdAt: string;
  exists: boolean;           // Whether the original project path still exists
  cacheSizeBytes: number;    // Total size of cache directories
  historySizeBytes: number;  // Size of history directory
}

export interface CacheStats {
  totalProjects: number;
  existingProjects: number;
  orphanedProjects: number;
  totalCacheSizeBytes: number;
  totalHistorySizeBytes: number;
  oldestAccess: string | null;
  newestAccess: string | null;
}

export interface CleanupResult {
  deletedCount: number;
  freedBytes: number;
  errors: string[];
}

/**
 * Docker installation and running state.
 */
export interface DockerState {
  installed: boolean;
  running: boolean;
  desktopPath: string | null;
}

/**
 * Stages of the Docker setup process.
 */
export type SetupStage = 'detecting' | 'starting' | 'ready' | 'failed';

