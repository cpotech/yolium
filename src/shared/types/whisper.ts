// Whisper speech-to-text type definitions

/** Available whisper.cpp model sizes */
export type WhisperModelSize = 'small' | 'medium' | 'large';

/** Information about a downloaded whisper model */
export interface WhisperModel {
  size: WhisperModelSize;
  name: string;
  fileName: string;
  /** Size in bytes (approximate) */
  sizeBytes: number;
  /** Whether the model file exists locally */
  downloaded: boolean;
  /** Local file path (when downloaded) */
  path?: string;
}

/** Progress during model download */
export interface WhisperDownloadProgress {
  modelSize: WhisperModelSize;
  /** Bytes downloaded so far */
  downloadedBytes: number;
  /** Total bytes to download */
  totalBytes: number;
  /** Progress percentage 0-100 */
  percent: number;
}

/** State of the speech-to-text recording */
export type WhisperRecordingState = 'idle' | 'recording' | 'transcribing';

/** Result from a transcription */
export interface WhisperTranscription {
  text: string;
  /** Duration of the audio in seconds */
  durationSeconds: number;
}

/** Configuration for whisper speech-to-text */
export interface WhisperConfig {
  /** Selected model size */
  modelSize: WhisperModelSize;
  /** Language code (e.g., 'en') or 'auto' for auto-detect */
  language: string;
}

/** Metadata about each available model */
export const WHISPER_MODELS: Record<WhisperModelSize, { name: string; fileName: string; sizeBytes: number; description: string }> = {
  small: {
    name: 'Small',
    fileName: 'ggml-small.bin',
    sizeBytes: 488_000_000, // ~466 MB
    description: 'Fast, good for quick dictation',
  },
  medium: {
    name: 'Medium',
    fileName: 'ggml-medium.bin',
    sizeBytes: 1_530_000_000, // ~1.5 GB
    description: 'Balanced speed and accuracy',
  },
  large: {
    name: 'Large',
    fileName: 'ggml-large-v3-turbo.bin',
    sizeBytes: 3_090_000_000, // ~3.1 GB
    description: 'Best accuracy, slower',
  },
};

/** Base URL for downloading whisper models from Hugging Face */
export const WHISPER_MODEL_BASE_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main';

/** whisper.cpp release version for binary downloads */
export const WHISPER_CPP_VERSION = 'v1.8.3';

/** GitHub release download base URL for whisper.cpp binaries */
export const WHISPER_CPP_RELEASE_URL = `https://github.com/ggml-org/whisper.cpp/releases/download/${WHISPER_CPP_VERSION}`;
