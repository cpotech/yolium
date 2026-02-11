import type { IpcMain } from 'electron';
import { createLogger } from '@main/lib/logger';
import { detectProjectTypes, validatePreFlight } from '@main/services/project-onboarding';

const logger = createLogger('onboarding-handlers');

const ONBOARDING_CHANNELS = {
  validate: 'onboarding:validate',
  detectProject: 'onboarding:detect-project',
} as const;

export function registerOnboardingHandlers(ipcMain: IpcMain): void {
  ipcMain.handle(ONBOARDING_CHANNELS.validate, (_event, folderPath: string) => {
    logger.info('IPC: onboarding:validate', { folderPath });
    return validatePreFlight(folderPath);
  });

  ipcMain.handle(ONBOARDING_CHANNELS.detectProject, (_event, folderPath: string) => {
    logger.info('IPC: onboarding:detect-project', { folderPath });
    return detectProjectTypes(folderPath);
  });
}
