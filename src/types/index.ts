// Barrel export for all shared types
export type { ContainerState, Tab, TabState, TabAction } from './tabs';
export type { ContainerSession, ProjectCacheInfo, CacheStats, CleanupResult, DockerState, SetupStage } from './docker';
export type { GitConfig, GitConfigWithPat } from './git';
export type { AgentType } from './agent';
export type { ThemeTokens, ThemeName } from './theme';
export type { WhisperModelSize, WhisperModel, WhisperDownloadProgress, WhisperRecordingState, WhisperTranscription, WhisperConfig } from './whisper';
export { WHISPER_MODELS, WHISPER_MODEL_BASE_URL } from './whisper';
export type { AgentStatus, KanbanColumn, CommentSource, KanbanComment, KanbanItem, KanbanBoard } from './kanban';
