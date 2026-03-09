/**
 * @module src/main/services/escalation
 * Handle escalation actions triggered by pattern detection.
 */

import { BrowserWindow } from 'electron';
import { createLogger } from '@main/lib/logger';
import { getScheduleState, updateSpecialistStatus, saveScheduleState } from '@main/stores/schedule-store';
import type { EscalationAction } from '@shared/types/schedule';

const logger = createLogger('escalation');

/**
 * Handle an escalation action for a specialist.
 */
export function handleEscalation(
  action: EscalationAction,
  specialistId: string,
  context: { reason: string }
): void {
  logger.info('Handling escalation', { action, specialistId, reason: context.reason });

  switch (action) {
    case 'alert_user':
      alertUser(specialistId, context.reason);
      break;
    case 'reduce_frequency':
      reduceFrequency(specialistId, context.reason);
      break;
    case 'pause':
      pauseSpecialist(specialistId, context.reason);
      break;
    case 'notify_slack':
      logger.info('Slack notification stub', { specialistId, reason: context.reason });
      // Stub: Slack webhook integration for future implementation
      break;
  }
}

/**
 * Reduce a specialist's effective frequency by doubling skipEveryN.
 * Also alerts the user about the change.
 */
function reduceFrequency(specialistId: string, reason: string): void {
  let state = getScheduleState();
  const status = state.specialists[specialistId];
  if (!status) return;

  const currentSkip = status.skipEveryN ?? 1;
  const newSkip = currentSkip * 2;

  state = updateSpecialistStatus(state, specialistId, { skipEveryN: newSkip });
  saveScheduleState(state);

  logger.info('Reduced frequency', { specialistId, from: currentSkip, to: newSkip });
  alertUser(specialistId, `Frequency reduced (now running every ${newSkip} triggers): ${reason}`);
}

/**
 * Pause a specialist by disabling it. Also alerts the user.
 */
function pauseSpecialist(specialistId: string, reason: string): void {
  let state = getScheduleState();
  const status = state.specialists[specialistId];
  if (!status) return;

  state = updateSpecialistStatus(state, specialistId, { enabled: false });
  saveScheduleState(state);

  logger.info('Paused specialist', { specialistId });
  alertUser(specialistId, `Specialist paused: ${reason}`);
}

/**
 * Send an alert to the renderer process via IPC.
 */
function alertUser(specialistId: string, message: string): void {
  const windows = BrowserWindow.getAllWindows();
  for (const win of windows) {
    if (!win.isDestroyed()) {
      win.webContents.send('schedule:alert', specialistId, message);
    }
  }
}
