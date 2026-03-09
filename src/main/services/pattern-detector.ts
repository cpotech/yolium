/**
 * @module src/main/services/pattern-detector
 * Detect patterns in specialist run history and recommend escalation actions.
 */

import { getRecentRuns } from '@main/stores/run-history-store';
import type { PatternAction } from '@shared/types/schedule';

/** Number of recent runs to analyze for patterns */
const DETECTION_WINDOW = 20;

/** Threshold for consecutive same-outcome detection */
const CONSECUTIVE_THRESHOLD = 3;

/** Cost spike multiplier threshold (2x rolling average) */
const COST_SPIKE_MULTIPLIER = 2;

/**
 * Detect patterns in a specialist's recent run history.
 * Returns recommended escalation actions.
 */
export function detectPatterns(specialistId: string): PatternAction[] {
  const runs = getRecentRuns(specialistId, DETECTION_WINDOW);
  if (runs.length === 0) return [];

  const actions: PatternAction[] = [];

  // Check for consecutive no-action runs (last N runs)
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

    // Check for consecutive failures
    const allFailed = lastRuns.every(r => r.outcome === 'failed');
    if (allFailed) {
      actions.push({
        action: 'alert_user',
        reason: `${CONSECUTIVE_THRESHOLD} consecutive failures`,
        specialistId,
      });
    }
  }

  // Check for cost spike
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
