// Whisper speech-to-text manager
// Handles model downloads, binary setup, and transcription via whisper.cpp

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as https from 'node:https';
import { spawn, execSync } from 'node:child_process';
import { createLogger } from './lib/logger';
import type { WhisperModelSize, WhisperModel, WhisperDownloadProgress, WhisperTranscription } from './types/whisper';
import { WHISPER_MODELS, WHISPER_MODEL_BASE_URL } from './types/whisper';
import { BrowserWindow } from 'electron';

const logger = createLogger('whisper-manager');

// ============================================================================
// Pure utility functions (tested in whisper-manager.test.ts)
// ============================================================================

/** Get the directory where whisper models are stored. */
export function getModelsDir(): string {
  return path.join(os.homedir(), '.yolium', 'whisper-models');
}

/** Get the full file path for a specific model. */
export function getModelPath(modelSize: WhisperModelSize): string {
  const model = WHISPER_MODELS[modelSize];
  return path.join(getModelsDir(), model.fileName);
}

/** Get the download URL for a specific model. */
export function getModelDownloadUrl(modelSize: WhisperModelSize): string {
  const model = WHISPER_MODELS[modelSize];
  return `${WHISPER_MODEL_BASE_URL}/${model.fileName}`;
}

/** Format bytes to a human-readable string. */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/** Validate a model size string. */
export function isValidModelSize(size: string): size is WhisperModelSize {
  return size === 'small' || size === 'medium' || size === 'large';
}

/** Get the directory for whisper.cpp binary. */
export function getWhisperBinaryDir(): string {
  return path.join(os.homedir(), '.yolium', 'whisper-cpp');
}

/** Get the path for the whisper.cpp binary (prefers whisper-cli over deprecated main). */
export function getWhisperBinaryPath(): string {
  const dir = getWhisperBinaryDir();
  // Prefer whisper-cli (newer) over main (deprecated)
  const candidates = process.platform === 'win32'
    ? ['whisper-cli.exe', 'main.exe']
    : ['whisper-cli', 'main'];
  for (const name of candidates) {
    const p = path.join(dir, name);
    if (fs.existsSync(p)) return p;
  }
  // Return first candidate as default (for error messages)
  return path.join(dir, candidates[0]);
}

/** Build the command-line arguments for whisper.cpp transcription. */
export function buildTranscribeArgs(
  modelPath: string,
  audioPath: string,
  language: string = 'en'
): string[] {
  const args = [
    '-m', modelPath,
    '--no-timestamps',
  ];
  if (language !== 'auto') {
    args.push('-l', language);
  }
  // Audio file as positional argument (whisper-cli style)
  args.push(audioPath);
  return args;
}

/** Parse whisper.cpp text output to extract transcription. */
export function parseWhisperOutput(output: string): string {
  const lines = output.split('\n');
  const textLines = lines.filter(line => {
    const trimmed = line.trim();
    if (!trimmed) return false;
    if (trimmed.startsWith('whisper_')) return false;
    if (trimmed.startsWith('main:')) return false;
    if (trimmed.startsWith('system_info:')) return false;
    if (trimmed.match(/^\[[\d:.\s->]+\]/)) return false;
    return true;
  });
  return textLines.join(' ').trim();
}

// ============================================================================
// Side-effectful functions (model management, downloads, transcription)
// ============================================================================

/** Ensure the models directory exists. */
function ensureModelsDir(): void {
  const dir = getModelsDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    logger.info('Created whisper models directory', { path: dir });
  }
}

/** Check if a specific model is downloaded. */
export function isModelDownloaded(modelSize: WhisperModelSize): boolean {
  const modelPath = getModelPath(modelSize);
  return fs.existsSync(modelPath);
}

/** List all models with their download status. */
export function listModels(): WhisperModel[] {
  return (Object.entries(WHISPER_MODELS) as [WhisperModelSize, typeof WHISPER_MODELS[WhisperModelSize]][]).map(
    ([size, meta]) => {
      const modelPath = getModelPath(size);
      const downloaded = fs.existsSync(modelPath);
      return {
        size,
        name: meta.name,
        fileName: meta.fileName,
        sizeBytes: meta.sizeBytes,
        downloaded,
        path: downloaded ? modelPath : undefined,
      };
    }
  );
}

/**
 * Download a whisper model from Hugging Face.
 * Sends progress events to the renderer via IPC.
 */
export function downloadModel(
  modelSize: WhisperModelSize,
  webContents?: Electron.WebContents
): Promise<string> {
  return new Promise((resolve, reject) => {
    ensureModelsDir();

    const modelPath = getModelPath(modelSize);
    const url = getModelDownloadUrl(modelSize);
    const model = WHISPER_MODELS[modelSize];

    logger.info('Starting model download', { modelSize, url });

    if (fs.existsSync(modelPath)) {
      logger.info('Model already exists', { modelSize, path: modelPath });
      resolve(modelPath);
      return;
    }

    // Use a temp file to avoid partial downloads
    const tempPath = `${modelPath}.downloading`;
    const file = fs.createWriteStream(tempPath);

    const makeRequest = (requestUrl: string) => {
      https.get(requestUrl, (response) => {
        // Handle redirects (Hugging Face uses them)
        if (response.statusCode === 301 || response.statusCode === 302) {
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            logger.debug('Following redirect', { from: requestUrl, to: redirectUrl });
            makeRequest(redirectUrl);
            return;
          }
        }

        if (response.statusCode !== 200) {
          file.close();
          fs.unlinkSync(tempPath);
          reject(new Error(`Download failed with status ${response.statusCode}`));
          return;
        }

        const totalBytes = parseInt(response.headers['content-length'] || '0', 10) || model.sizeBytes;
        let downloadedBytes = 0;

        response.on('data', (chunk: Buffer) => {
          downloadedBytes += chunk.length;
          const percent = Math.round((downloadedBytes / totalBytes) * 100);

          // Send progress to renderer
          if (webContents && !webContents.isDestroyed()) {
            const progress: WhisperDownloadProgress = {
              modelSize,
              downloadedBytes,
              totalBytes,
              percent,
            };
            webContents.send('whisper:download-progress', progress);
          }
        });

        response.pipe(file);

        file.on('finish', () => {
          file.close(() => {
            // Rename temp file to final path
            fs.renameSync(tempPath, modelPath);
            logger.info('Model download complete', { modelSize, path: modelPath });
            resolve(modelPath);
          });
        });
      }).on('error', (err) => {
        file.close();
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
        logger.error('Model download failed', { modelSize, error: err.message });
        reject(err);
      });
    };

    makeRequest(url);
  });
}

/** Delete a downloaded model. */
export function deleteModel(modelSize: WhisperModelSize): boolean {
  const modelPath = getModelPath(modelSize);
  if (fs.existsSync(modelPath)) {
    fs.unlinkSync(modelPath);
    logger.info('Deleted whisper model', { modelSize, path: modelPath });
    return true;
  }
  return false;
}

/**
 * Check if the whisper.cpp binary is available.
 * Looks for it in PATH first, then in ~/.yolium/whisper-cpp/
 */
export function isWhisperBinaryAvailable(): boolean {
  // Check if whisper-cpp 'main' binary is in our local directory
  const localBinary = getWhisperBinaryPath();
  if (fs.existsSync(localBinary)) {
    return true;
  }

  // Check if 'whisper-cpp' or 'whisper' is in PATH
  try {
    const cmd = process.platform === 'win32'
      ? 'where whisper-cli 2>nul || where whisper 2>nul'
      : 'which whisper-cpp 2>/dev/null || which whisper 2>/dev/null';
    execSync(cmd, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the path to the whisper binary (local or system).
 */
export function resolveWhisperBinary(): string | null {
  const localBinary = getWhisperBinaryPath();
  if (fs.existsSync(localBinary)) {
    return localBinary;
  }

  try {
    const cmd = process.platform === 'win32'
      ? 'where whisper-cli 2>nul || where whisper 2>nul'
      : 'which whisper-cpp 2>/dev/null || which whisper 2>/dev/null';
    const systemBinary = execSync(cmd, {
      stdio: 'pipe',
      encoding: 'utf-8',
    }).trim().split(/\r?\n/)[0]; // 'where' on Windows may return multiple lines
    if (systemBinary) return systemBinary;
  } catch {
    // Not in PATH
  }

  return null;
}

/**
 * Transcribe a WAV audio file using whisper.cpp.
 * Returns the transcribed text.
 */
export function transcribeAudio(
  audioPath: string,
  modelSize: WhisperModelSize,
  language: string = 'en'
): Promise<WhisperTranscription> {
  return new Promise((resolve, reject) => {
    const binaryPath = resolveWhisperBinary();
    if (!binaryPath) {
      const expectedPath = getWhisperBinaryPath();
      reject(new Error(`whisper.cpp binary not found. Please install whisper.cpp or place the binary at ${expectedPath}`));
      return;
    }

    const modelPath = getModelPath(modelSize);
    if (!fs.existsSync(modelPath)) {
      reject(new Error(`Model '${modelSize}' not downloaded. Please download it first.`));
      return;
    }

    if (!fs.existsSync(audioPath)) {
      reject(new Error(`Audio file not found: ${audioPath}`));
      return;
    }

    const args = buildTranscribeArgs(modelPath, audioPath, language);
    logger.info('Starting transcription', { binaryPath, modelSize, audioPath, language });

    const startTime = Date.now();
    let stdout = '';
    let stderr = '';

    const proc = spawn(binaryPath, args);

    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      const durationSeconds = (Date.now() - startTime) / 1000;

      if (code !== 0) {
        logger.error('Transcription failed', { code, stderr });
        reject(new Error(`Transcription failed (exit code ${code}): ${stderr}`));
        return;
      }

      // Parse the output - whisper.cpp writes to stdout
      const text = parseWhisperOutput(stdout || stderr);
      logger.info('Transcription complete', { durationSeconds, textLength: text.length });

      resolve({ text, durationSeconds });
    });

    proc.on('error', (err) => {
      logger.error('Failed to spawn whisper process', { error: err.message });
      reject(err);
    });
  });
}

/**
 * Get the selected model size from persistent config, defaulting to 'small'.
 */
export function getSelectedModel(): WhisperModelSize {
  const configPath = path.join(os.homedir(), '.yolium', 'whisper-config.json');
  try {
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (isValidModelSize(config.modelSize)) {
        return config.modelSize;
      }
    }
  } catch {
    // Fall through to default
  }
  return 'small';
}

/**
 * Save the selected model size to persistent config.
 */
export function saveSelectedModel(modelSize: WhisperModelSize): void {
  const configDir = path.join(os.homedir(), '.yolium');
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  const configPath = path.join(configDir, 'whisper-config.json');
  const config = { modelSize };
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  logger.info('Saved whisper config', { modelSize });
}
