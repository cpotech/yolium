/**
 * @module src/ipc/whisper-handlers
 * Whisper speech-to-text IPC handlers.
 */

import type { IpcMain } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import { createLogger } from '@main/lib/logger';
import {
  listModels,
  isModelDownloaded,
  downloadModel,
  deleteModel,
  transcribeAudio,
  isWhisperBinaryAvailable,
  installWhisperBinary,
  getSelectedModel,
  saveSelectedModel,
  isValidModelSize,
} from '@main/services/whisper-manager';
import type { WhisperModelSize } from '@shared/types/whisper';

const logger = createLogger('whisper-handlers');

/**
 * Register Whisper IPC handlers.
 * @param ipcMain - Electron IPC main instance
 */
export function registerWhisperHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('whisper:list-models', () => {
    logger.info('IPC: whisper:list-models');
    return listModels();
  });

  ipcMain.handle('whisper:is-model-downloaded', (_event, modelSize: WhisperModelSize) => {
    if (!isValidModelSize(modelSize)) throw new Error(`Invalid model size: ${modelSize}`);
    return isModelDownloaded(modelSize);
  });

  ipcMain.handle('whisper:download-model', (event, modelSize: WhisperModelSize) => {
    if (!isValidModelSize(modelSize)) throw new Error(`Invalid model size: ${modelSize}`);
    logger.info('IPC: whisper:download-model', { modelSize });
    return downloadModel(modelSize, event.sender);
  });

  ipcMain.handle('whisper:delete-model', (_event, modelSize: WhisperModelSize) => {
    if (!isValidModelSize(modelSize)) throw new Error(`Invalid model size: ${modelSize}`);
    logger.info('IPC: whisper:delete-model', { modelSize });
    return deleteModel(modelSize);
  });

  ipcMain.handle('whisper:is-binary-available', () => {
    return isWhisperBinaryAvailable();
  });

  ipcMain.handle('whisper:install-binary', async (event) => {
    logger.info('IPC: whisper:install-binary');
    return installWhisperBinary(event.sender);
  });

  ipcMain.handle('whisper:transcribe', async (_event, audioData: number[], modelSize: WhisperModelSize) => {
    if (!isValidModelSize(modelSize)) throw new Error(`Invalid model size: ${modelSize}`);
    logger.info('IPC: whisper:transcribe', { modelSize, audioDataLength: audioData.length });

    // Write audio data to a temp file
    const tempDir = path.join(os.tmpdir(), 'yolium-whisper');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    const tempPath = path.join(tempDir, `audio-${crypto.randomUUID()}.wav`);
    fs.writeFileSync(tempPath, Buffer.from(audioData));

    try {
      const result = await transcribeAudio(tempPath, modelSize);
      return result;
    } finally {
      // Clean up temp file
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    }
  });

  ipcMain.handle('whisper:get-selected-model', () => {
    return getSelectedModel();
  });

  ipcMain.handle('whisper:save-selected-model', (_event, modelSize: WhisperModelSize) => {
    if (!isValidModelSize(modelSize)) throw new Error(`Invalid model size: ${modelSize}`);
    saveSelectedModel(modelSize);
  });
}
