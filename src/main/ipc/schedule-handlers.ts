/**
 * @module src/main/ipc/schedule-handlers
 * IPC handlers for the schedule namespace.
 */

import type { IpcMain } from 'electron';
import { scheduler } from '@main/services/scheduler';
import {
  getScheduleState,
  saveScheduleState,
  toggleSpecialist,
  toggleGlobal,
} from '@main/stores/schedule-store';
import { getRecentRuns, getRunStats } from '@main/stores/run-history-store';
import { scaffoldSpecialist, getDefaultTemplate } from '@main/services/specialist-scaffold';
import { loadSpecialistRaw } from '@main/services/specialist-loader';
import {
  loadRedactedCredentials,
  saveCredentials,
  deleteCredentials,
} from '@main/stores/specialist-credentials-store';
import type { ScheduleType } from '@shared/types/schedule';

export function registerScheduleHandlers(ipcMain: IpcMain): void {
  // Get full schedule state (all specialists + statuses)
  ipcMain.handle('schedule:get-state', () => {
    return getScheduleState();
  });

  // Toggle individual specialist enabled/disabled
  ipcMain.handle('schedule:toggle-specialist', (_event, id: string, enabled: boolean) => {
    let state = getScheduleState();
    state = toggleSpecialist(state, id, enabled);
    saveScheduleState(state);
    scheduler.reload();
    return state;
  });

  // Toggle global scheduling on/off
  ipcMain.handle('schedule:toggle-global', (_event, enabled: boolean) => {
    let state = getScheduleState();
    state = toggleGlobal(state, enabled);
    saveScheduleState(state);
    scheduler.reload();
    return state;
  });

  // Manual trigger: run a specialist now
  ipcMain.handle('schedule:trigger-run', (_event, id: string, type: ScheduleType) => {
    return scheduler.triggerRun(id, type);
  });

  // Get run history for a specialist
  ipcMain.handle('schedule:get-history', (_event, id: string, limit: number) => {
    return getRecentRuns(id, limit || 50);
  });

  // Get run statistics for a specialist
  ipcMain.handle('schedule:get-stats', (_event, id: string) => {
    return getRunStats(id);
  });

  // Reload specialist definitions
  ipcMain.handle('schedule:reload', () => {
    scheduler.reload();
    return getScheduleState();
  });

  // Get loaded specialist definitions
  ipcMain.handle('schedule:get-specialists', () => {
    const specialists = scheduler.getSpecialists();
    // Convert Map to plain object for IPC serialization
    const result: Record<string, unknown> = {};
    for (const [id, def] of specialists) {
      result[id] = {
        name: def.name,
        description: def.description,
        model: def.model,
        schedules: def.schedules,
        memory: def.memory,
        escalation: def.escalation,
      };
    }
    return result;
  });

  // Get rendered default template for a specialist name
  ipcMain.handle('schedule:get-template', (_event, name: string, description?: string) => {
    return getDefaultTemplate(name, description);
  });

  // Scaffold a new specialist definition
  ipcMain.handle('schedule:scaffold', (_event, name: string, options?: { description?: string; content?: string }) => {
    const filePath = scaffoldSpecialist(name, options);
    scheduler.reload();
    return { filePath };
  });

  // Get raw markdown content of an existing specialist (for cloning)
  ipcMain.handle('schedule:get-raw-definition', (_event, name: string) => {
    return loadSpecialistRaw(name);
  });

  // Get redacted credentials for a specialist (has-secret flags, never raw values)
  ipcMain.handle('schedule:get-credentials', (_event, specialistId: string) => {
    return loadRedactedCredentials(specialistId);
  });

  // Save credentials for a specialist service
  ipcMain.handle('schedule:save-credentials', (_event, specialistId: string, serviceId: string, credentials: Record<string, string>) => {
    saveCredentials(specialistId, serviceId, credentials);
  });

  // Delete all credentials for a specialist
  ipcMain.handle('schedule:delete-credentials', (_event, specialistId: string) => {
    deleteCredentials(specialistId);
  });
}
