import type {
  AgentDefinition,
  KanbanAgentProvider,
  AgentTokenUsage,
  AskQuestionMessage,
  ClaudeUsageSnapshot,
  ProgressMessage,
} from './agent';
import type { CacheStats, CleanupResult, DockerState, ProjectCacheInfo } from './docker';
import type { GitConfig, GitConfigWithPat } from './git';
import type {
  CommentSource,
  KanbanBoard,
  KanbanComment,
  KanbanItem,
} from './kanban';
import type { PreFlightResult, ProjectType } from './onboarding';
import type {
  ActionLogEntry,
  ActionStats,
  RunStats,
  ScheduleState,
  ScheduleType,
  ScheduledRun,
  SpecialistDefinition,
} from './schedule';
import type {
  WhisperDownloadProgress,
  WhisperModel,
  WhisperModelSize,
  WhisperTranscription,
} from './whisper';

export type CleanupFunction = () => void;

export interface DialogWorktreeCleanupResult {
  response: number;
}

export interface FilesystemDirectoryEntry {
  name: string;
  path: string;
  isHidden: boolean;
}

export interface FilesystemListDirectoryResult {
  success: boolean;
  basePath: string;
  entries: FilesystemDirectoryEntry[];
  error: string | null;
}

export interface FilesystemCreateDirectoryResult {
  success: boolean;
  path: string | null;
  error: string | null;
}

export interface FilesystemReadFileResult {
  success: boolean;
  content: string | null;
  error: string | null;
}

export type GitConfigSaveInput = Pick<
  GitConfig,
  | 'githubPat'
  | 'openaiApiKey'
  | 'anthropicApiKey'
  | 'useClaudeOAuth'
  | 'useCodexOAuth'
  | 'providerModelDefaults'
  | 'providerModels'
>;

export interface GitRepoStatus {
  isRepo: boolean;
  hasCommits: boolean;
}

export interface GitInitResult {
  success: boolean;
  initialized?: boolean;
  hasCommits?: boolean;
  error?: string;
}

export interface GitCloneResult {
  success: boolean;
  clonedPath: string | null;
  error: string | null;
}

export interface GitBranchValidationResult {
  valid: boolean;
  error: string | null;
}

export interface GitMergeBranchResult {
  success: boolean;
  error?: string;
  conflict?: boolean;
}

export interface GitDiffStats {
  filesChanged: number;
  insertions: number;
  deletions: number;
}

export interface GitMergeConflictCheck {
  clean: boolean;
  conflictingFiles: string[];
}

export interface GitMergeAndPushPrResult {
  success: boolean;
  prUrl?: string;
  prBranch?: string;
  error?: string;
  conflict?: boolean;
  conflictingFiles?: string[];
}

export interface GitOperationResult {
  success: boolean;
  error?: string;
}

export type GitFileStatus = 'M' | 'A' | 'D' | 'R';

export interface GitChangedFile {
  path: string;
  status: GitFileStatus;
}

export interface GitChangedFilesResult {
  files: GitChangedFile[];
  error?: string;
}

export interface GitFileDiffResult {
  diff: string;
  error?: string;
}

export interface GitNestedRepo {
  name: string;
  path: string;
}

export interface GitNestedReposResult {
  isRepo: boolean;
  nestedRepos: GitNestedRepo[];
}

export interface GitRebaseResult {
  success: boolean;
  error?: string;
  conflict?: boolean;
  conflictingFiles?: string[];
}

export type ContainerCreateGitConfig = Pick<GitConfig, 'name' | 'email'>;

export interface ContainerWorktreeInfo {
  worktreePath: string;
  originalPath: string;
  branchName: string;
  hasUncommittedChanges: boolean;
}

export interface DockerImageInfo {
  name: string;
  size: number;
  created: string;
  stale: boolean;
}

export interface NewKanbanItemParams {
  title: string;
  description: string;
  branch?: string;
  agentProvider: KanbanAgentProvider;
  agentType?: string;
  order: number;
  model?: string;
}

export interface AgentStartParams {
  agentName: string;
  projectPath: string;
  itemId: string;
  goal: string;
  agentProvider?: string;
}

export interface AgentStartResult {
  sessionId: string;
  error?: string;
}

export type AgentQuestionPayload = Pick<AskQuestionMessage, 'text' | 'options'>;
export type AgentProgressPayload = Pick<
  ProgressMessage,
  'step' | 'detail' | 'attempt' | 'maxAttempts'
>;

export interface ActiveAgentSession {
  sessionId: string;
  cumulativeUsage: AgentTokenUsage;
}

export interface ProjectConfigData {
  sharedDirs?: string[];
}

export interface ReportOpenResult {
  success: boolean;
  error?: string;
}

export interface ScheduleTriggerResult {
  skipped?: boolean;
  reason?: string;
}

export interface ScheduleSpecialistSummary {
  name: string;
  description: string;
  model: string;
  schedules: SpecialistDefinition['schedules'];
  memory: SpecialistDefinition['memory'];
  escalation: SpecialistDefinition['escalation'];
  integrations?: SpecialistDefinition['integrations'];
}

export type ScheduleSpecialistMap = Record<string, ScheduleSpecialistSummary>;
export type RedactedServiceCredentials = Record<string, Record<string, boolean>>;

export interface AppAPI {
  getVersion: () => Promise<string>;
  getHomeDir: () => Promise<string>;
  openExternal: (url: string) => Promise<void>;
  forceQuit: () => Promise<void>;
  onQuitRequest: (callback: () => void) => CleanupFunction;
}

export interface TerminalAPI {
  create: (cwd?: string) => Promise<string>;
  write: (sessionId: string, data: string) => void;
  resize: (sessionId: string, cols: number, rows: number) => void;
  close: (sessionId: string) => Promise<void>;
  hasRunningChildren: (sessionId: string) => Promise<boolean>;
  onData: (callback: (sessionId: string, data: string) => void) => CleanupFunction;
  onExit: (callback: (sessionId: string, exitCode: number) => void) => CleanupFunction;
}

export interface TabsAPI {
  showContextMenu: (tabId: string, x: number, y: number) => Promise<void>;
  onNew: (callback: () => void) => CleanupFunction;
  onClose: (callback: () => void) => CleanupFunction;
  onNext: (callback: () => void) => CleanupFunction;
  onPrev: (callback: () => void) => CleanupFunction;
  onCloseSpecific: (callback: (tabId: string) => void) => CleanupFunction;
  onCloseOthers: (callback: (keepTabId: string) => void) => CleanupFunction;
  onCloseAll: (callback: () => void) => CleanupFunction;
}

export interface EventsAPI {
  onShortcutsShow: (callback: () => void) => CleanupFunction;
  onGitSettingsShow: (callback: () => void) => CleanupFunction;
  onProjectNew: (callback: () => void) => CleanupFunction;
  onRecordingToggle: (callback: () => void) => CleanupFunction;
  onScheduleShow: (callback: () => void) => CleanupFunction;
}

export interface DialogAPI {
  confirmClose: (message: string) => Promise<boolean>;
  confirmOkCancel: (title: string, message: string) => Promise<boolean>;
  confirmCloseMultiple: (count: number) => Promise<boolean>;
  worktreeCleanup: (
    branchName: string,
    hasUncommittedChanges: boolean,
  ) => Promise<DialogWorktreeCleanupResult>;
  selectFolder: () => Promise<string | null>;
}

export interface FilesystemAPI {
  listDirectory: (path: string) => Promise<FilesystemListDirectoryResult>;
  createDirectory: (
    parentPath: string,
    folderName: string,
  ) => Promise<FilesystemCreateDirectoryResult>;
  readFile: (filePath: string) => Promise<FilesystemReadFileResult>;
}

export interface GitAPI {
  loadConfig: () => Promise<GitConfigWithPat | null>;
  saveConfig: (config: GitConfigSaveInput) => Promise<void>;
  isRepo: (folderPath: string) => Promise<GitRepoStatus>;
  getBranch: (folderPath: string) => Promise<string | null>;
  init: (folderPath: string, projectTypes?: ProjectType[]) => Promise<GitInitResult>;
  clone: (url: string, targetDir: string) => Promise<GitCloneResult>;
  validateBranch: (branchName: string) => Promise<GitBranchValidationResult>;
  mergeBranch: (projectPath: string, branchName: string) => Promise<GitMergeBranchResult>;
  worktreeDiffStats: (projectPath: string, branchName: string) => Promise<GitDiffStats>;
  cleanupWorktree: (projectPath: string, worktreePath: string, branchName: string) => Promise<void>;
  checkMergeConflicts: (
    projectPath: string,
    branchName: string,
  ) => Promise<GitMergeConflictCheck>;
  mergeAndPushPR: (
    projectPath: string,
    branchName: string,
    worktreePath: string,
    itemTitle: string,
    itemDescription: string,
  ) => Promise<GitMergeAndPushPrResult>;
  approvePR: (projectPath: string, prUrl: string) => Promise<GitOperationResult>;
  mergePR: (projectPath: string, prUrl: string) => Promise<GitOperationResult>;
  worktreeChangedFiles: (
    projectPath: string,
    branchName: string,
  ) => Promise<GitChangedFilesResult>;
  worktreeFileDiff: (
    projectPath: string,
    branchName: string,
    filePath: string,
  ) => Promise<GitFileDiffResult>;
  detectNestedRepos: (folderPath: string) => Promise<GitNestedReposResult>;
  rebaseOntoDefault: (
    worktreePath: string,
    projectPath: string,
  ) => Promise<GitRebaseResult>;
}

export interface OnboardingAPI {
  validate: (folderPath: string) => Promise<PreFlightResult>;
  detectProject: (folderPath: string) => Promise<ProjectType[]>;
}

export interface DockerAPI {
  isAvailable: () => Promise<boolean>;
  ensureImage: (imageName?: string) => Promise<void>;
  detectState: () => Promise<DockerState>;
  startDesktop: () => Promise<boolean>;
  startEngine: () => Promise<boolean>;
  removeAllContainers: () => Promise<number>;
  removeImage: () => Promise<void>;
  getImageInfo: () => Promise<DockerImageInfo | null>;
  onBuildProgress: (callback: (message: string) => void) => CleanupFunction;
}

export interface ContainerAPI {
  create: (
    folderPath: string,
    agent?: string,
    gsdEnabled?: boolean,
    gitConfig?: ContainerCreateGitConfig,
    worktreeEnabled?: boolean,
    branchName?: string,
  ) => Promise<string>;
  write: (sessionId: string, data: string) => void;
  resize: (sessionId: string, cols: number, rows: number) => void;
  stop: (sessionId: string, deleteWorktree?: boolean) => Promise<void>;
  getWorktreeInfo: (sessionId: string) => Promise<ContainerWorktreeInfo | null>;
  onData: (callback: (sessionId: string, data: string) => void) => CleanupFunction;
  onExit: (callback: (sessionId: string, exitCode: number) => void) => CleanupFunction;
}

export interface KanbanAPI {
  getBoard: (projectPath: string) => Promise<KanbanBoard>;
  addItem: (projectPath: string, params: NewKanbanItemParams) => Promise<KanbanItem>;
  updateItem: (
    projectPath: string,
    itemId: string,
    updates: Partial<KanbanItem>,
  ) => Promise<KanbanItem | null>;
  addComment: (
    projectPath: string,
    itemId: string,
    source: CommentSource,
    text: string,
  ) => Promise<KanbanComment | null>;
  deleteItem: (projectPath: string, itemId: string) => Promise<boolean>;
  deleteItems: (projectPath: string, itemIds: string[]) => Promise<string[]>;
  deleteBoard: (projectPath: string) => Promise<{ deleted: boolean }>;
  onBoardUpdated: (callback: (projectPath: string) => void) => CleanupFunction;
}

export interface AgentAPI {
  start: (params: AgentStartParams) => Promise<AgentStartResult>;
  resume: (params: AgentStartParams) => Promise<AgentStartResult>;
  answer: (projectPath: string, itemId: string, answer: string) => Promise<void>;
  stop: (sessionId: string) => Promise<void>;
  getActiveSession: (
    projectPath: string,
    itemId: string,
  ) => Promise<ActiveAgentSession | null>;
  recover: (projectPath: string) => Promise<KanbanItem[]>;
  listDefinitions: () => Promise<AgentDefinition[]>;
  readLog: (projectPath: string, itemId: string) => Promise<string>;
  clearLog: (projectPath: string, itemId: string) => Promise<boolean>;
  onOutput: (callback: (sessionId: string, data: string) => void) => CleanupFunction;
  onQuestion: (
    callback: (sessionId: string, question: AgentQuestionPayload) => void,
  ) => CleanupFunction;
  onItemCreated: (
    callback: (sessionId: string, item: KanbanItem) => void,
  ) => CleanupFunction;
  onComplete: (callback: (sessionId: string, summary: string) => void) => CleanupFunction;
  onError: (callback: (sessionId: string, message: string) => void) => CleanupFunction;
  onProgress: (
    callback: (sessionId: string, progress: AgentProgressPayload) => void,
  ) => CleanupFunction;
  onExit: (callback: (sessionId: string, exitCode: number) => void) => CleanupFunction;
  onCostUpdate: (
    callback: (
      sessionId: string,
      projectPath: string,
      itemId: string,
      usage: AgentTokenUsage,
    ) => void,
  ) => CleanupFunction;
}

export interface CacheAPI {
  list: () => Promise<ProjectCacheInfo[]>;
  stats: () => Promise<CacheStats>;
  delete: (dirName: string) => Promise<{ deleted: boolean; error?: string }>;
  cleanupOrphaned: () => Promise<CleanupResult>;
  cleanupStale: (maxAgeDays?: number) => Promise<CleanupResult>;
}

export interface WhisperAPI {
  listModels: () => Promise<WhisperModel[]>;
  isModelDownloaded: (modelSize: WhisperModelSize) => Promise<boolean>;
  downloadModel: (modelSize: WhisperModelSize) => Promise<string>;
  deleteModel: (modelSize: WhisperModelSize) => Promise<boolean>;
  isBinaryAvailable: () => Promise<boolean>;
  installBinary: () => Promise<string>;
  onInstallProgress: (callback: (message: string) => void) => CleanupFunction;
  transcribe: (
    audioData: number[],
    modelSize: WhisperModelSize,
  ) => Promise<WhisperTranscription>;
  getSelectedModel: () => Promise<WhisperModelSize>;
  saveSelectedModel: (modelSize: WhisperModelSize) => Promise<void>;
  onDownloadProgress: (
    callback: (progress: WhisperDownloadProgress) => void,
  ) => CleanupFunction;
}

export interface ProjectConfigAPI {
  load: (projectPath: string) => Promise<ProjectConfigData | null>;
  save: (projectPath: string, config: ProjectConfigData) => Promise<void>;
  checkDirs: (projectPath: string, dirs: string[]) => Promise<Record<string, boolean>>;
}

export interface ReportAPI {
  openFile: (filePath: string) => Promise<ReportOpenResult>;
}

export interface UsageAPI {
  getClaude: () => Promise<ClaudeUsageSnapshot>;
}

export interface ScheduleAPI {
  getState: () => Promise<ScheduleState>;
  toggleSpecialist: (id: string, enabled: boolean) => Promise<ScheduleState>;
  toggleGlobal: (enabled: boolean) => Promise<ScheduleState>;
  triggerRun: (id: string, type: ScheduleType) => Promise<ScheduleTriggerResult>;
  getHistory: (id: string, limit?: number) => Promise<ScheduledRun[]>;
  getStats: (id: string) => Promise<RunStats>;
  reload: () => Promise<ScheduleState>;
  getSpecialists: () => Promise<ScheduleSpecialistMap>;
  getTemplate: (name: string, description?: string) => Promise<string>;
  scaffold: (
    name: string,
    options?: { description?: string; content?: string },
  ) => Promise<{ filePath: string }>;
  updateDefinition: (name: string, content: string) => Promise<{ filePath: string }>;
  getRawDefinition: (name: string) => Promise<string>;
  getCredentials: (specialistId: string) => Promise<RedactedServiceCredentials>;
  saveCredentials: (
    specialistId: string,
    serviceId: string,
    credentials: Record<string, string>,
  ) => Promise<void>;
  deleteCredentials: (specialistId: string) => Promise<void>;
  getRunLog: (specialistId: string, runId: string) => Promise<string>;
  getAllActions: (specialistIds: string[], limit?: number) => Promise<ActionLogEntry[]>;
  getActions: (specialistId: string, limit?: number) => Promise<ActionLogEntry[]>;
  getRunActions: (specialistId: string, runId: string) => Promise<ActionLogEntry[]>;
  getActionStats: (specialistId: string) => Promise<ActionStats>;
  resetSpecialist: (id: string) => Promise<ScheduleState>;
  getRunning: () => Promise<string[]>;
  onAlert: (
    callback: (specialistId: string, message: string) => void,
  ) => CleanupFunction;
  onStateChanged: (callback: (state: ScheduleState) => void) => CleanupFunction;
}

export interface ElectronAPI {
  app: AppAPI;
  terminal: TerminalAPI;
  tabs: TabsAPI;
  events: EventsAPI;
  dialog: DialogAPI;
  fs: FilesystemAPI;
  git: GitAPI;
  onboarding: OnboardingAPI;
  docker: DockerAPI;
  container: ContainerAPI;
  kanban: KanbanAPI;
  agent: AgentAPI;
  cache: CacheAPI;
  whisper: WhisperAPI;
  projectConfig: ProjectConfigAPI;
  report: ReportAPI;
  usage: UsageAPI;
  schedule: ScheduleAPI;
}
