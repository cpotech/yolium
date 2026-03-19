/// <reference path="./electron-api.d.ts" />

// Barrel export for all shared types
export type { ContainerState, Tab, TabState, TabAction } from './tabs';
export type { ContainerSession, ProjectCacheInfo, CacheStats, CleanupResult, DockerState, SetupStage } from './docker';
export type { GitConfig, GitConfigWithPat } from './git';
export type { AgentProvider, KanbanAgentProvider, ProgressMessage } from './agent';
export type { ThemeTokens, ThemeName } from './theme';
export type { WhisperModelSize, WhisperModel, WhisperDownloadProgress, WhisperRecordingState, WhisperTranscription, WhisperConfig } from './whisper';
export { WHISPER_MODELS, WHISPER_MODEL_BASE_URL } from './whisper';
export type { AgentStatus, KanbanColumn, CommentSource, KanbanComment, KanbanItem, KanbanBoard } from './kanban';
export type { ProjectType, PackageManager, PreFlightResult } from './onboarding';
export type {
  ActiveAgentSession,
  AgentAPI,
  AgentProgressPayload,
  AgentQuestionPayload,
  AgentStartParams,
  AgentStartResult,
  AppAPI,
  CacheAPI,
  CleanupFunction,
  ContainerAPI,
  ContainerCreateGitConfig,
  ContainerWorktreeInfo,
  DialogAPI,
  DockerAPI,
  DockerImageInfo,
  ElectronAPI,
  EventsAPI,
  FilesystemAPI,
  FilesystemCreateDirectoryResult,
  FilesystemDirectoryEntry,
  FilesystemListDirectoryResult,
  FilesystemReadFileResult,
  GitAPI,
  GitBranchValidationResult,
  GitChangedFile,
  GitChangedFilesResult,
  GitCloneResult,
  GitConfigSaveInput,
  GitDiffStats,
  GitFileDiffResult,
  GitFileStatus,
  GitInitResult,
  GitMergeAndPushPrResult,
  GitMergeBranchResult,
  GitMergeConflictCheck,
  GitNestedRepo,
  GitNestedReposResult,
  GitOperationResult,
  GitRebaseResult,
  GitRepoStatus,
  KanbanAPI,
  NewKanbanItemParams,
  OnboardingAPI,
  ProjectConfigAPI,
  ProjectConfigData,
  RedactedServiceCredentials,
  ReportAPI,
  ReportOpenResult,
  ScheduleAPI,
  ScheduleSpecialistMap,
  ScheduleSpecialistSummary,
  ScheduleTriggerResult,
  TabsAPI,
  TerminalAPI,
  UsageAPI,
  WhisperAPI,
} from './electron-api';
