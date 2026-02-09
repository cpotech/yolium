// Whisper speech-to-text manager
// Handles model downloads, binary setup, and transcription via whisper.cpp

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as http from 'node:http';
import * as https from 'node:https';
import { spawn, execSync } from 'node:child_process';
import { createLogger } from '@main/lib/logger';
import type { WhisperModelSize, WhisperModel, WhisperDownloadProgress, WhisperTranscription } from '@shared/types/whisper';
import { WHISPER_MODELS, WHISPER_MODEL_BASE_URL, WHISPER_CPP_VERSION, WHISPER_CPP_RELEASE_URL } from '@shared/types/whisper';
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

/** Get the download URL for the whisper.cpp binary for the current platform. */
export function getWhisperBinaryDownloadUrl(): { url: string; fileName: string } | null {
  if (process.platform === 'win32') {
    return {
      url: `${WHISPER_CPP_RELEASE_URL}/whisper-bin-x64.zip`,
      fileName: 'whisper-bin-x64.zip',
    };
  }
  // Linux and macOS: no official prebuilt binaries, must build from source
  return null;
}

/** Get the source tarball URL for building whisper.cpp from source. */
export function getWhisperSourceUrl(): string {
  return `https://github.com/ggml-org/whisper.cpp/archive/refs/tags/${WHISPER_CPP_VERSION}.tar.gz`;
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
        if ([301, 302, 307, 308].includes(response.statusCode ?? 0)) {
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            logger.debug('Following redirect', { from: requestUrl, to: redirectUrl, statusCode: response.statusCode });
            response.resume(); // Drain the response to free the socket
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

  // Check if whisper binary is in PATH
  try {
    const cmd = process.platform === 'win32'
      ? 'where whisper-cli 2>nul || where whisper 2>nul'
      : 'which whisper-cli 2>/dev/null || which whisper-cpp 2>/dev/null || which whisper 2>/dev/null';
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
      : 'which whisper-cli 2>/dev/null || which whisper-cpp 2>/dev/null || which whisper 2>/dev/null';
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

    const TRANSCRIPTION_TIMEOUT_MS = 120_000; // 2 minutes
    const startTime = Date.now();
    let stdout = '';
    let stderr = '';
    let settled = false;

    const proc = spawn(binaryPath, args);

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        logger.error('Transcription timed out', { timeoutMs: TRANSCRIPTION_TIMEOUT_MS });
        proc.kill('SIGKILL');
        reject(new Error(`Transcription timed out after ${TRANSCRIPTION_TIMEOUT_MS / 1000}s`));
      }
    }, TRANSCRIPTION_TIMEOUT_MS);

    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      clearTimeout(timeout);
      if (settled) return;
      settled = true;

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
      clearTimeout(timeout);
      if (settled) return;
      settled = true;
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

// ============================================================================
// Binary installation
// ============================================================================

/** Follow HTTP/HTTPS redirects and download to a file. */
function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const makeRequest = (requestUrl: string) => {
      const client = requestUrl.startsWith('https') ? https : http;
      client.get(requestUrl, (response) => {
        if ([301, 302, 307, 308].includes(response.statusCode ?? 0)) {
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            response.resume();
            makeRequest(redirectUrl);
            return;
          }
        }
        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error(`Download failed with status ${response.statusCode}`));
          return;
        }
        const file = fs.createWriteStream(destPath);
        response.pipe(file);
        file.on('finish', () => file.close(() => resolve()));
        file.on('error', (err) => {
          fs.unlinkSync(destPath);
          reject(err);
        });
      }).on('error', (err) => {
        if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
        reject(err);
      });
    };
    makeRequest(url);
  });
}

/** Run a shell command and return stdout. Throws on non-zero exit. */
function runCommand(cmd: string, cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.platform === 'win32' ? 'cmd' : 'sh',
      process.platform === 'win32' ? ['/c', cmd] : ['-c', cmd],
      { cwd, stdio: ['ignore', 'pipe', 'pipe'] }
    );
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Command failed (exit ${code}): ${cmd}\n${stderr}`));
      } else {
        resolve(stdout);
      }
    });
    proc.on('error', reject);
  });
}

/**
 * Install the whisper.cpp binary.
 * - Windows: Downloads prebuilt binary from GitHub releases
 * - Linux/macOS: Downloads source tarball, builds with cmake + make
 *
 * Sends progress events to the renderer via webContents.
 */
export async function installWhisperBinary(
  webContents?: Electron.WebContents
): Promise<string> {
  const binDir = getWhisperBinaryDir();

  // Check if already installed
  const existing = resolveWhisperBinary();
  if (existing) {
    logger.info('whisper.cpp binary already available', { path: existing });
    return existing;
  }

  fs.mkdirSync(binDir, { recursive: true });

  const sendProgress = (message: string) => {
    logger.info('whisper binary install progress', { message });
    if (webContents && !webContents.isDestroyed()) {
      webContents.send('whisper:install-progress', message);
    }
  };

  if (process.platform === 'win32') {
    return installWhisperBinaryWindows(binDir, sendProgress);
  } else {
    return installWhisperBinaryUnix(binDir, sendProgress);
  }
}

async function installWhisperBinaryWindows(
  binDir: string,
  sendProgress: (msg: string) => void
): Promise<string> {
  const download = getWhisperBinaryDownloadUrl();
  if (!download) throw new Error('No prebuilt binary available for this platform');

  const zipPath = path.join(binDir, download.fileName);

  sendProgress('Downloading whisper.cpp binary...');
  await downloadFile(download.url, zipPath);

  sendProgress('Extracting whisper.cpp binary...');
  // Use PowerShell to extract zip on Windows
  await runCommand(
    `powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${binDir}' -Force"`,
    binDir
  );

  // Clean up zip
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

  // Find the binary in the extracted files
  const binaryPath = getWhisperBinaryPath();
  if (!fs.existsSync(binaryPath)) {
    throw new Error(`whisper-cli.exe not found after extraction. Check ${binDir}`);
  }

  sendProgress('whisper.cpp installed successfully');
  logger.info('whisper.cpp binary installed (Windows)', { path: binaryPath });
  return binaryPath;
}

/** Check if a command-line tool is available on PATH. */
function isToolAvailable(tool: string): boolean {
  try {
    execSync(`which ${tool}`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/** Get a distro-specific install hint for a missing tool. */
function getInstallHint(tool: string): string {
  const pkgMap: Record<string, Record<string, string>> = {
    make: { arch: 'make', debian: 'make', fedora: 'make' },
    'g++': { arch: 'gcc', debian: 'g++', fedora: 'gcc-c++' },
    cmake: { arch: 'cmake', debian: 'cmake', fedora: 'cmake' },
  };

  let distroId = '';
  try {
    const osRelease = fs.readFileSync('/etc/os-release', 'utf-8');
    const idMatch = osRelease.match(/^ID=(.*)$/m);
    if (idMatch) distroId = idMatch[1].replace(/"/g, '').trim();
    // Also check ID_LIKE for derivatives (e.g. Linux Mint → ubuntu → debian)
    if (!['arch', 'debian', 'ubuntu', 'fedora'].includes(distroId)) {
      const idLikeMatch = osRelease.match(/^ID_LIKE=(.*)$/m);
      if (idLikeMatch) {
        const likes = idLikeMatch[1].replace(/"/g, '').trim().split(/\s+/);
        for (const like of likes) {
          if (['arch', 'debian', 'ubuntu', 'fedora'].includes(like)) {
            distroId = like;
            break;
          }
        }
      }
    }
  } catch {
    // /etc/os-release not available (macOS, etc.)
  }

  const pkg = pkgMap[tool];
  if (!pkg) return `Install '${tool}' using your system package manager.`;

  if (distroId === 'arch') return `sudo pacman -S ${pkg.arch}`;
  if (distroId === 'debian' || distroId === 'ubuntu') return `sudo apt install ${pkg.debian}`;
  if (distroId === 'fedora') return `sudo dnf install ${pkg.fedora}`;
  if (process.platform === 'darwin') return `xcode-select --install`;

  return `Install '${tool}' using your system package manager.`;
}

async function installWhisperBinaryUnix(
  binDir: string,
  sendProgress: (msg: string) => void
): Promise<string> {
  // Pre-check: cmake, make, and g++ are all required for building from source
  const requiredTools = ['cmake', 'make', 'g++'];
  const missingTools = requiredTools.filter(t => !isToolAvailable(t));

  if (missingTools.length > 0) {
    const hints = missingTools.map(t => `  ${t}: ${getInstallHint(t)}`).join('\n');
    throw new Error(
      `Build requires ${missingTools.join(', ')} but ${missingTools.length === 1 ? "it's" : "they're"} not installed.\n\n${hints}`
    );
  }

  const sourceUrl = getWhisperSourceUrl();
  const tarballPath = path.join(binDir, `whisper.cpp-${WHISPER_CPP_VERSION}.tar.gz`);
  // Strip the 'v' prefix from version for the extracted directory name
  const versionNum = WHISPER_CPP_VERSION.replace(/^v/, '');
  const sourceDir = path.join(binDir, `whisper.cpp-${versionNum}`);
  const buildDir = path.join(sourceDir, 'build');

  try {
    sendProgress('Downloading whisper.cpp source...');
    await downloadFile(sourceUrl, tarballPath);

    sendProgress('Extracting source code...');
    await runCommand(`tar -xzf "${tarballPath}" -C "${binDir}"`, binDir);

    sendProgress('Building whisper.cpp (cmake)...');
    fs.mkdirSync(buildDir, { recursive: true });
    await runCommand('cmake .. -DBUILD_SHARED_LIBS=OFF', buildDir);

    sendProgress('Compiling whisper.cpp (this may take a few minutes)...');
    await runCommand('cmake --build . --config Release', buildDir);

    // Find the built binary - check common output locations
    const candidates = [
      path.join(buildDir, 'bin', 'whisper-cli'),
      path.join(buildDir, 'whisper-cli'),
    ];
    let builtBinary: string | null = null;
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        builtBinary = candidate;
        break;
      }
    }

    if (!builtBinary) {
      throw new Error(`whisper-cli not found after build. Checked: ${candidates.join(', ')}`);
    }

    // Copy to bin dir
    const destPath = path.join(binDir, 'whisper-cli');
    fs.copyFileSync(builtBinary, destPath);
    fs.chmodSync(destPath, 0o755);

    sendProgress('whisper.cpp installed successfully');
    logger.info('whisper.cpp binary installed (Unix)', { path: destPath });
    return destPath;
  } finally {
    // Clean up source and tarball
    if (fs.existsSync(tarballPath)) fs.unlinkSync(tarballPath);
    if (fs.existsSync(sourceDir)) {
      fs.rmSync(sourceDir, { recursive: true, force: true });
    }
  }
}
