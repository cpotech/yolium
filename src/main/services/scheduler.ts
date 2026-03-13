/**
 * @module src/main/services/scheduler
 * CRON scheduling service for specialist agents.
 * Includes inlined pattern detection, escalation handling, and memory distillation.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import cron from 'node-cron';
import { BrowserWindow } from 'electron';
import { createLogger } from '@main/lib/logger';
import { listSpecialists, loadSpecialist } from '@main/services/specialist-loader';
import { startScheduledAgent } from '@main/services/agent-runner';
import {
  getScheduleState,
  saveScheduleState,
  updateSpecialistStatus,
  appendRun,
  getRecentRuns,
  getRunsSince,
  getRunStats,
} from '@main/stores/schedule-db';
import type {
  SpecialistDefinition,
  ScheduledRun,
  ScheduleType,
  RunOutcome,
  ScheduleState,
  PatternAction,
  EscalationAction,
} from '@shared/types/schedule';

const logger = createLogger('scheduler');

interface CronJob {
  stop: () => void;
}

// ─── Pattern Detection Constants ──────────────────────────────────────────

const DETECTION_WINDOW = 20;
const CONSECUTIVE_THRESHOLD = 3;
const COST_SPIKE_MULTIPLIER = 2;

// ─── Memory Distillation Constants ────────────────────────────────────────

const MAX_SUMMARY_LENGTH = 5000;

/**
 * Broadcast schedule state changes to all renderer windows.
 */
function broadcastStateChanged(state: ScheduleState): void {
  const windows = BrowserWindow.getAllWindows();
  for (const win of windows) {
    if (!win.isDestroyed()) {
      win.webContents.send('schedule:state-changed', state);
    }
  }
}

/**
 * Generate a unique run ID.
 */
function generateRunId(): string {
  return `run-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * CRON scheduler for specialist agents.
 * Manages cron job registration, run execution, and lifecycle.
 * Includes inlined pattern detection, escalation, and memory distillation.
 */
export class CronScheduler {
  private jobs: Map<string, CronJob[]> = new Map();
  private running: Set<string> = new Set();
  private specialists: Map<string, SpecialistDefinition> = new Map();
  private state: ScheduleState;
  private distillationJob: CronJob | null = null;
  private triggerCounts: Map<string, number> = new Map();

  constructor() {
    this.state = getScheduleState();
  }

  /**
   * Start the scheduler: load specialists and register cron jobs.
   */
  start(): void {
    logger.info('Starting CRON scheduler');

    // Load all specialists
    this.loadSpecialists();

    // Register cron jobs for enabled specialists
    if (!this.state.globalEnabled) {
      logger.info('Global scheduling disabled, skipping job registration');
      return;
    }

    for (const [id, specialist] of this.specialists) {
      const status = this.state.specialists[id];
      if (!status || !status.enabled) continue;

      this.registerSpecialist(id, specialist);
    }

    // Schedule memory distillation daily at 23:59 UTC
    this.distillationJob = cron.schedule('59 23 * * *', () => {
      this.runDistillation();
    });

    logger.info('Scheduler started', { specialists: this.specialists.size, jobs: this.countJobs() });
  }

  /**
   * Stop the scheduler: destroy all cron jobs.
   */
  stop(): void {
    logger.info('Stopping CRON scheduler');
    for (const [id, jobList] of this.jobs) {
      for (const job of jobList) {
        job.stop();
      }
      logger.info('Stopped jobs for specialist', { id, count: jobList.length });
    }
    this.jobs.clear();

    if (this.distillationJob) {
      this.distillationJob.stop();
      this.distillationJob = null;
    }
  }

  /**
   * Reload specialist definitions and re-register jobs.
   */
  reload(): void {
    this.stop();
    this.state = getScheduleState();
    this.start();
  }

  /**
   * Manually trigger a run for a specialist.
   * Returns { skipped: true, reason: string } if the specialist is already running.
   */
  triggerRun(
    specialistId: string,
    scheduleType: ScheduleType
  ): { skipped?: boolean; reason?: string } {
    if (this.running.has(specialistId)) {
      const skippedRun: ScheduledRun = {
        id: generateRunId(),
        specialistId,
        scheduleType,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        status: 'completed',
        tokensUsed: 0,
        costUsd: 0,
        summary: 'Skipped: specialist already running',
        outcome: 'skipped',
      };
      appendRun(specialistId, skippedRun);
      return { skipped: true, reason: 'already running' };
    }

    this.executeScheduledRun(specialistId, scheduleType, true);
    return {};
  }

  /**
   * Handle completion of a scheduled run.
   * Updates state with run stats, triggers pattern detection and escalation.
   */
  handleRunComplete(
    specialistId: string,
    result: { outcome: RunOutcome; summary: string; tokensUsed: number; costUsd: number }
  ): void {
    this.running.delete(specialistId);

    // Run pattern detection (inlined)
    const patterns = this.detectPatterns(specialistId);
    for (const pattern of patterns) {
      this.handleEscalation(pattern.action, specialistId, { reason: pattern.reason });
    }

    // Reload state after escalation (escalation handlers may have modified it)
    this.state = getScheduleState();

    // Compute fresh stats from run history
    const stats = getRunStats(specialistId);

    // Update state with run counters and computed stats
    this.state = updateSpecialistStatus(this.state, specialistId, {
      totalRuns: (this.state.specialists[specialistId]?.totalRuns || 0) + 1,
      consecutiveNoAction: result.outcome === 'no_action'
        ? (this.state.specialists[specialistId]?.consecutiveNoAction || 0) + 1
        : 0,
      consecutiveFailures: result.outcome === 'failed'
        ? (this.state.specialists[specialistId]?.consecutiveFailures || 0) + 1
        : 0,
      successRate: stats.successRate,
      weeklyCost: stats.weeklyCost,
    });
    saveScheduleState(this.state);
    broadcastStateChanged(this.state);
  }

  /**
   * Build memory context string for injection into agent prompt.
   */
  buildMemoryContext(specialistId: string): string {
    const recentRuns = getRecentRuns(specialistId, 20);
    if (recentRuns.length === 0) return '';

    const lines: string[] = ['## Recent Run History\n'];
    for (const run of recentRuns) {
      const ts = new Date(run.startedAt).toISOString().slice(0, 16).replace('T', ' ');
      lines.push(`- [${ts}] ${run.outcome}: ${run.summary}`);
    }
    return lines.join('\n');
  }

  /**
   * Set a specialist's running state (for testing).
   */
  setRunning(specialistId: string, isRunning: boolean): void {
    if (isRunning) {
      this.running.add(specialistId);
    } else {
      this.running.delete(specialistId);
    }
  }

  /**
   * Get IDs of currently running specialists.
   */
  getRunningSpecialists(): string[] {
    return Array.from(this.running);
  }

  /**
   * Get loaded specialist definitions.
   */
  getSpecialists(): Map<string, SpecialistDefinition> {
    return this.specialists;
  }

  /**
   * Get current schedule state.
   */
  getState(): ScheduleState {
    return this.state;
  }

  // ─── Private: Core Scheduling ──────────────────────────────────────────

  private loadSpecialists(): void {
    const names = listSpecialists();
    for (const name of names) {
      try {
        const specialist = loadSpecialist(name);
        this.specialists.set(name, specialist);

        if (!this.state.specialists[name]) {
          this.state.specialists[name] = {
            id: name,
            enabled: true,
            consecutiveNoAction: 0,
            consecutiveFailures: 0,
            totalRuns: 0,
            successRate: 0,
            weeklyCost: 0,
          };
        }
      } catch (err) {
        logger.error('Failed to load specialist', { name, error: err instanceof Error ? err.message : String(err) });
      }
    }
    saveScheduleState(this.state);
  }

  private registerSpecialist(id: string, specialist: SpecialistDefinition): void {
    const jobList: CronJob[] = [];

    for (const schedule of specialist.schedules) {
      if (!schedule.enabled) continue;

      const job = cron.schedule(schedule.cron, () => {
        this.executeScheduledRun(id, schedule.type);
      });

      jobList.push(job);
      logger.info('Registered cron job', { specialistId: id, type: schedule.type, cron: schedule.cron });
    }

    this.jobs.set(id, jobList);
  }

  private executeScheduledRun(specialistId: string, scheduleType: ScheduleType, isManual = false): void {
    if (this.running.has(specialistId)) {
      logger.info('Skipping run (already running)', { specialistId, scheduleType });
      appendRun(specialistId, {
        id: generateRunId(),
        specialistId,
        scheduleType,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        status: 'completed',
        tokensUsed: 0,
        costUsd: 0,
        summary: 'Skipped: specialist already running',
        outcome: 'skipped',
      });
      return;
    }

    if (!isManual) {
      const skipEveryN = this.state.specialists[specialistId]?.skipEveryN ?? 1;
      if (skipEveryN > 1) {
        const count = (this.triggerCounts.get(specialistId) ?? 0) + 1;
        this.triggerCounts.set(specialistId, count);
        if (count % skipEveryN !== 0) {
          logger.info('Skipping run (frequency reduced)', { specialistId, scheduleType, skipEveryN, triggerCount: count });
          return;
        }
      }
    }

    const specialist = this.specialists.get(specialistId);
    if (!specialist) {
      logger.error('Specialist not found', { specialistId });
      return;
    }

    this.running.add(specialistId);
    logger.info('Executing scheduled run', { specialistId, scheduleType });
    broadcastStateChanged(this.state);

    const startedAt = new Date().toISOString();
    const memoryContext = this.buildMemoryContext(specialistId);
    const runId = generateRunId();

    startScheduledAgent({ specialist, scheduleType, memoryContext, runId })
      .then((result) => {
        const completedAt = new Date().toISOString();

        const run: ScheduledRun = {
          id: runId,
          specialistId,
          scheduleType,
          startedAt,
          completedAt,
          status: result.outcome === 'failed' || result.outcome === 'timeout' ? 'failed' : 'completed',
          tokensUsed: result.tokensUsed,
          costUsd: result.costUsd,
          summary: result.summary,
          outcome: result.outcome,
        };
        appendRun(specialistId, run);

        this.handleRunComplete(specialistId, result);

        logger.info('Scheduled run completed', {
          specialistId, scheduleType,
          outcome: result.outcome, durationMs: result.durationMs,
          tokensUsed: result.tokensUsed, costUsd: result.costUsd,
        });
      })
      .catch((err) => {
        const completedAt = new Date().toISOString();
        const errorMessage = err instanceof Error ? err.message : String(err);

        const run: ScheduledRun = {
          id: runId,
          specialistId,
          scheduleType,
          startedAt,
          completedAt,
          status: 'failed',
          tokensUsed: 0,
          costUsd: 0,
          summary: `Error: ${errorMessage}`,
          outcome: 'failed',
        };
        appendRun(specialistId, run);

        this.handleRunComplete(specialistId, {
          outcome: 'failed',
          summary: errorMessage,
          tokensUsed: 0,
          costUsd: 0,
        });

        logger.error('Scheduled run failed', { specialistId, scheduleType, error: errorMessage });
      });
  }

  private countJobs(): number {
    let count = 0;
    for (const jobList of this.jobs.values()) {
      count += jobList.length;
    }
    return count;
  }

  // ─── Private: Pattern Detection (inlined from pattern-detector.ts) ─────

  private detectPatterns(specialistId: string): PatternAction[] {
    const runs = getRecentRuns(specialistId, DETECTION_WINDOW);
    if (runs.length === 0) return [];

    const actions: PatternAction[] = [];

    const lastRuns = runs.slice(-CONSECUTIVE_THRESHOLD);
    if (lastRuns.length >= CONSECUTIVE_THRESHOLD) {
      const allNoAction = lastRuns.every(r => r.outcome === 'no_action');
      if (allNoAction) {
        actions.push({
          action: 'reduce_frequency',
          reason: `${CONSECUTIVE_THRESHOLD} consecutive no-action runs`,
          specialistId,
        });
      }

      const allFailed = lastRuns.every(r => r.outcome === 'failed');
      if (allFailed) {
        actions.push({
          action: 'alert_user',
          reason: `${CONSECUTIVE_THRESHOLD} consecutive failures`,
          specialistId,
        });
      }
    }

    if (runs.length > 3) {
      const historicalRuns = runs.slice(0, -1);
      const averageCost = historicalRuns.reduce((sum, r) => sum + r.costUsd, 0) / historicalRuns.length;
      const lastRun = runs[runs.length - 1];

      if (averageCost > 0 && lastRun.costUsd > averageCost * COST_SPIKE_MULTIPLIER) {
        actions.push({
          action: 'alert_user',
          reason: `cost spike detected: $${lastRun.costUsd.toFixed(4)} vs avg $${averageCost.toFixed(4)}`,
          specialistId,
        });
      }
    }

    return actions;
  }

  // ─── Private: Escalation Handling (inlined from escalation.ts) ─────────

  private handleEscalation(
    action: EscalationAction,
    specialistId: string,
    context: { reason: string }
  ): void {
    logger.info('Handling escalation', { action, specialistId, reason: context.reason });

    switch (action) {
      case 'alert_user':
        this.alertUser(specialistId, context.reason);
        break;
      case 'reduce_frequency':
        this.reduceFrequency(specialistId, context.reason);
        break;
      case 'pause':
        this.pauseSpecialist(specialistId, context.reason);
        break;
      case 'notify_slack':
        logger.info('Slack notification stub', { specialistId, reason: context.reason });
        break;
    }
  }

  private reduceFrequency(specialistId: string, reason: string): void {
    let state = getScheduleState();
    const status = state.specialists[specialistId];
    if (!status) return;

    const currentSkip = status.skipEveryN ?? 1;
    const newSkip = currentSkip * 2;

    state = updateSpecialistStatus(state, specialistId, { skipEveryN: newSkip });
    saveScheduleState(state);

    logger.info('Reduced frequency', { specialistId, from: currentSkip, to: newSkip });
    this.alertUser(specialistId, `Frequency reduced (now running every ${newSkip} triggers): ${reason}`);
  }

  private pauseSpecialist(specialistId: string, reason: string): void {
    let state = getScheduleState();
    const status = state.specialists[specialistId];
    if (!status) return;

    state = updateSpecialistStatus(state, specialistId, { enabled: false });
    saveScheduleState(state);

    logger.info('Paused specialist', { specialistId });
    this.alertUser(specialistId, `Specialist paused: ${reason}`);
  }

  private alertUser(specialistId: string, message: string): void {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send('schedule:alert', specialistId, message);
      }
    }
  }

  // ─── Private: Memory Distillation (inlined from memory-distiller.ts) ───

  private runDistillation(): void {
    logger.info('Running memory distillation');

    for (const [id, specialist] of this.specialists) {
      try {
        if (specialist.memory.strategy === 'distill_daily') {
          const dailySummary = this.distillDaily(id);
          if (dailySummary) {
            this.writeDigest(id, dailySummary);
            logger.info('Daily distillation complete', { specialistId: id });
          }
        } else if (specialist.memory.strategy === 'distill_weekly') {
          if (new Date().getDay() === 0) {
            const weeklySummary = this.distillWeekly(id);
            if (weeklySummary) {
              this.writeDigest(id, weeklySummary);
              logger.info('Weekly distillation complete', { specialistId: id });
            }
          }
        }
      } catch (err) {
        logger.error('Distillation failed', { specialistId: id, error: err instanceof Error ? err.message : String(err) });
      }
    }
  }

  private formatRunsSummary(runs: ScheduledRun[]): string {
    if (runs.length === 0) return '';

    const lines: string[] = [];
    for (const run of runs) {
      const ts = new Date(run.startedAt).toISOString().slice(0, 16).replace('T', ' ');
      const summaryTrimmed = run.summary.length > 200 ? run.summary.slice(0, 200) + '...' : run.summary;
      lines.push(`- [${ts}] ${run.outcome}: ${summaryTrimmed} (${run.tokensUsed} tokens, $${run.costUsd.toFixed(4)})`);
    }

    const result = lines.join('\n');
    if (result.length > MAX_SUMMARY_LENGTH) {
      return result.slice(0, MAX_SUMMARY_LENGTH) + '\n... (truncated)';
    }
    return result;
  }

  private distillDaily(specialistId: string): string {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const runs = getRunsSince(specialistId, today);
    return this.formatRunsSummary(runs);
  }

  private distillWeekly(specialistId: string): string {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const runs = getRunsSince(specialistId, oneWeekAgo);
    if (runs.length === 0) return '';

    const header = `# Weekly Digest — ${specialistId}\n\nPeriod: ${oneWeekAgo.toISOString().slice(0, 10)} to ${new Date().toISOString().slice(0, 10)}\nTotal runs: ${runs.length}\n\n`;
    return header + this.formatRunsSummary(runs);
  }

  private writeDigest(specialistId: string, content: string): void {
    const digestPath = path.join(os.homedir(), '.yolium', 'schedules', specialistId, 'digest.md');
    const dir = path.dirname(digestPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(digestPath, content, 'utf-8');
  }
}

/** Singleton scheduler instance */
export const scheduler = new CronScheduler();
