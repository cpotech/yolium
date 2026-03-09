/**
 * @module src/main/stores/schedule-store
 * Persist schedule state to JSON file at ~/.yolium/schedules/config.json.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { ScheduleState, SpecialistStatus } from '@shared/types/schedule';

function getScheduleDir(): string {
  return path.join(os.homedir(), '.yolium', 'schedules');
}

function getConfigPath(): string {
  return path.join(getScheduleDir(), 'config.json');
}

function createDefaultState(): ScheduleState {
  return {
    specialists: {},
    globalEnabled: false,
  };
}

/**
 * Load schedule state from disk, or create default if not found.
 */
export function getScheduleState(): ScheduleState {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) {
    return createDefaultState();
  }

  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    return JSON.parse(content) as ScheduleState;
  } catch {
    // Corrupted JSON — fall back to defaults
    return createDefaultState();
  }
}

/**
 * Save schedule state to disk.
 */
export function saveScheduleState(state: ScheduleState): void {
  const dir = getScheduleDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(getConfigPath(), JSON.stringify(state, null, 2), 'utf-8');
}

/**
 * Update a specialist's status fields (partial merge).
 */
export function updateSpecialistStatus(
  state: ScheduleState,
  id: string,
  updates: Partial<SpecialistStatus>
): ScheduleState {
  const existing = state.specialists[id];
  if (!existing) return state;

  return {
    ...state,
    specialists: {
      ...state.specialists,
      [id]: { ...existing, ...updates },
    },
  };
}

/**
 * Toggle a specialist's enabled flag.
 */
export function toggleSpecialist(
  state: ScheduleState,
  id: string,
  enabled: boolean
): ScheduleState {
  return updateSpecialistStatus(state, id, { enabled });
}

/**
 * Toggle the global enabled flag.
 */
export function toggleGlobal(
  state: ScheduleState,
  enabled: boolean
): ScheduleState {
  return { ...state, globalEnabled: enabled };
}
