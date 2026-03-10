/**
 * @module src/main/services/scheduler
 * CRON scheduling service for specialist agents.
 */

import cron from 'node-cron';
import { BrowserWindow } from 'electron';
import { createLogger } from '@main/lib/logger';
import { listSpecialists, loadSpecialist } from '@main/services/specialist-loader';
import { startScheduledAgent } from '@main/services/agent-runner';
import { getScheduleState, saveScheduleState, updateSpecialistStatus } from '@main/stores/schedule-store';
import { appendRun, getRecentRuns, getRunStats } from '@main/stores/run-history-store';
import { detectPatterns } from '@main/services/pattern-detector';
import { handleEscalation } from '@main/services/escalation';
import { distillDaily, distillWeekly, writeDigest } from '@main/services/memory-distiller';
import type { SpecialistDefinition, ScheduledRun, ScheduleType, RunOutcome, ScheduleState } from '@shared/types/schedule';

const logger = createLogger('scheduler');

interface CronJob {
  stop: () => void;
}

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
      // Record the skipped run
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

    // Execute the run asynchronously (manual trigger bypasses skipEveryN)
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

    // Run pattern detection
    const patterns = detectPatterns(specialistId);
    for (const pattern of patterns) {
      handleEscalation(pattern.action, specialistId, { reason: pattern.reason });
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

  // ─── Private ──────────────────────────────────────────────────────────────

  private loadSpecialists(): void {
    const names = listSpecialists();
    for (const name of names) {
      try {
        const specialist = loadSpecialist(name);
        this.specialists.set(name, specialist);

        // Ensure specialist has a status entry
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

    // Check skipEveryN for frequency reduction (skip for cron-triggered runs, not manual)
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

    // Build memory context from recent run history
    const memoryContext = this.buildMemoryContext(specialistId);

    // Generate runId before starting so log file and run record share the same ID
    const runId = generateRunId();

    // Start the agent container (headless — no renderer window)
    startScheduledAgent({ specialist, scheduleType, memoryContext, runId })
      .then((result) => {
        const completedAt = new Date().toISOString();

        // Record the run
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

        // Update state and trigger pattern detection
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

  /**
   * Run memory distillation for all specialists.
   * Called daily at 23:59 UTC.
   */
  private runDistillation(): void {
    logger.info('Running memory distillation');

    for (const [id, specialist] of this.specialists) {
      try {
        if (specialist.memory.strategy === 'distill_daily') {
          const dailySummary = distillDaily(id);
          if (dailySummary) {
            writeDigest(id, dailySummary);
            logger.info('Daily distillation complete', { specialistId: id });
          }
        } else if (specialist.memory.strategy === 'distill_weekly') {
          // Weekly distillation only runs on Sundays
          if (new Date().getDay() === 0) {
            const weeklySummary = distillWeekly(id);
            if (weeklySummary) {
              writeDigest(id, weeklySummary);
              logger.info('Weekly distillation complete', { specialistId: id });
            }
          }
        }
      } catch (err) {
        logger.error('Distillation failed', { specialistId: id, error: err instanceof Error ? err.message : String(err) });
      }
    }
  }

  private countJobs(): number {
    let count = 0;
    for (const jobList of this.jobs.values()) {
      count += jobList.length;
    }
    return count;
  }
}

/** Singleton scheduler instance */
export const scheduler = new CronScheduler();
