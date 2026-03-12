// Schedule and CRON agent type definitions

/** Schedule frequency types */
export type ScheduleType = 'heartbeat' | 'daily' | 'weekly' | 'custom';

/** Individual schedule configuration */
export interface ScheduleConfig {
  type: ScheduleType;
  cron: string;
  enabled: boolean;
}

/** Memory strategy for run history distillation */
export type MemoryStrategy = 'distill_daily' | 'distill_weekly' | 'raw';

/** Memory configuration for a specialist */
export interface MemoryConfig {
  strategy: MemoryStrategy;
  maxEntries: number;
  retentionDays: number;
}

/** Escalation action types */
export type EscalationAction = 'notify_slack' | 'reduce_frequency' | 'pause' | 'alert_user';

/** Escalation configuration */
export interface EscalationConfig {
  onFailure?: EscalationAction;
  onPattern?: EscalationAction;
}

/** Service integration declared in specialist frontmatter */
export interface ServiceIntegration {
  service: string;
  env: Record<string, string>;
}

/** Per-specialist credentials: serviceId -> key/value pairs */
export type ServiceCredentials = Record<string, Record<string, string>>;

/** Specialist definition extending AgentDefinition with scheduling fields */
export interface SpecialistDefinition {
  name: string;
  description: string;
  model: 'opus' | 'sonnet' | 'haiku';
  tools: string[];
  timeout?: number;
  systemPrompt: string;
  schedules: ScheduleConfig[];
  memory: MemoryConfig;
  escalation: EscalationConfig;
  promptTemplates: Record<string, string>;
  integrations?: ServiceIntegration[];
}

/** Outcome of a scheduled run */
export type RunOutcome = 'completed' | 'no_action' | 'failed' | 'skipped' | 'timeout';

/** A single scheduled run record */
export interface ScheduledRun {
  id: string;
  specialistId: string;
  scheduleType: ScheduleType;
  startedAt: string;
  completedAt: string;
  status: 'running' | 'completed' | 'failed';
  tokensUsed: number;
  costUsd: number;
  summary: string;
  outcome: RunOutcome;
}

/** A single action emitted during a scheduled run */
export interface ActionLogEntry {
  id: string;
  runId: string;
  specialistId: string;
  action: string;
  data: Record<string, unknown>;
  timestamp: string;
}

/** Aggregate action statistics for a specialist */
export interface ActionStats {
  totalActions: number;
  actionCounts: Record<string, number>;
}

/** Status tracking for a specialist */
export interface SpecialistStatus {
  id: string;
  enabled: boolean;
  lastRun?: ScheduledRun;
  nextRun?: string;
  consecutiveNoAction: number;
  consecutiveFailures: number;
  totalRuns: number;
  successRate: number;
  weeklyCost: number;
  /** Run every Nth trigger (1 = normal, 2 = half frequency). Set by reduce_frequency escalation. */
  skipEveryN?: number;
}

/** Global schedule state */
export interface ScheduleState {
  specialists: Record<string, SpecialistStatus>;
  globalEnabled: boolean;
}

/** Pattern detection result */
export interface PatternAction {
  action: EscalationAction;
  reason: string;
  specialistId: string;
}

/** Run statistics computed from history */
export interface RunStats {
  totalRuns: number;
  successRate: number;
  weeklyCost: number;
  averageTokensPerRun: number;
  averageDurationMs: number;
}
