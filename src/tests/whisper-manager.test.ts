import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as path from 'node:path'
import * as os from 'node:os'
import type { WhisperModelSize } from '../types/whisper'
import { WHISPER_MODELS, WHISPER_MODEL_BASE_URL } from '../types/whisper'

// ============================================================================
// Pure utility functions extracted for testing
// These mirror the implementation in whisper-manager.ts
// ============================================================================

/**
 * Get the directory where whisper models are stored.
 */
function getModelsDir(): string {
  return path.join(os.homedir(), '.yolium', 'whisper-models')
}

/**
 * Get the full file path for a specific model.
 */
function getModelPath(modelSize: WhisperModelSize): string {
  const model = WHISPER_MODELS[modelSize]
  return path.join(getModelsDir(), model.fileName)
}

/**
 * Get the download URL for a specific model.
 */
function getModelDownloadUrl(modelSize: WhisperModelSize): string {
  const model = WHISPER_MODELS[modelSize]
  return `${WHISPER_MODEL_BASE_URL}/${model.fileName}`
}

/**
 * Format bytes to a human-readable string.
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  const value = bytes / Math.pow(1024, i)
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

/**
 * Validate a model size string.
 */
function isValidModelSize(size: string): size is WhisperModelSize {
  return size === 'small' || size === 'medium' || size === 'large'
}

/**
 * Get the directory for the whisper.cpp binary.
 */
function getWhisperBinaryDir(): string {
  return path.join(os.homedir(), '.yolium', 'whisper-cpp')
}

/**
 * Build the command-line arguments for whisper.cpp transcription.
 */
function buildTranscribeArgs(
  modelPath: string,
  audioPath: string,
  language: string = 'en'
): string[] {
  const args = [
    '-m', modelPath,
    '--no-timestamps',
  ]
  if (language !== 'auto') {
    args.push('-l', language)
  }
  // Audio file as positional argument (whisper-cli style)
  args.push(audioPath)
  return args
}

/**
 * Parse whisper.cpp text output to extract transcription.
 */
function parseWhisperOutput(output: string): string {
  // whisper.cpp outputs various log lines then the transcription
  // Filter out lines that are log/progress info
  const lines = output.split('\n')
  const textLines = lines.filter(line => {
    const trimmed = line.trim()
    // Skip empty lines
    if (!trimmed) return false
    // Skip whisper.cpp log lines (they start with specific patterns)
    if (trimmed.startsWith('whisper_')) return false
    if (trimmed.startsWith('main:')) return false
    if (trimmed.startsWith('system_info:')) return false
    if (trimmed.match(/^\[[\d:.\s->]+\]/)) return false // timestamp lines like [00:00:00.000 --> 00:00:05.000]
    return true
  })
  return textLines.join(' ').trim()
}

// ============================================================================
// Tests
// ============================================================================

describe('whisper-manager utilities', () => {
  describe('getModelsDir', () => {
    it('returns path under ~/.yolium/whisper-models', () => {
      const dir = getModelsDir()
      expect(dir).toBe(path.join(os.homedir(), '.yolium', 'whisper-models'))
    })
  })

  describe('getModelPath', () => {
    it('returns correct path for small model', () => {
      const modelPath = getModelPath('small')
      expect(modelPath).toBe(path.join(os.homedir(), '.yolium', 'whisper-models', 'ggml-small.bin'))
    })

    it('returns correct path for medium model', () => {
      const modelPath = getModelPath('medium')
      expect(modelPath).toBe(path.join(os.homedir(), '.yolium', 'whisper-models', 'ggml-medium.bin'))
    })

    it('returns correct path for large model', () => {
      const modelPath = getModelPath('large')
      expect(modelPath).toBe(path.join(os.homedir(), '.yolium', 'whisper-models', 'ggml-large-v3-turbo.bin'))
    })
  })

  describe('getModelDownloadUrl', () => {
    it('returns correct URL for small model', () => {
      const url = getModelDownloadUrl('small')
      expect(url).toBe(`${WHISPER_MODEL_BASE_URL}/ggml-small.bin`)
    })

    it('returns correct URL for medium model', () => {
      const url = getModelDownloadUrl('medium')
      expect(url).toBe(`${WHISPER_MODEL_BASE_URL}/ggml-medium.bin`)
    })

    it('returns correct URL for large model', () => {
      const url = getModelDownloadUrl('large')
      expect(url).toBe(`${WHISPER_MODEL_BASE_URL}/ggml-large-v3-turbo.bin`)
    })

    it('all URLs use HTTPS', () => {
      for (const size of ['small', 'medium', 'large'] as WhisperModelSize[]) {
        const url = getModelDownloadUrl(size)
        expect(url.startsWith('https://')).toBe(true)
      }
    })
  })

  describe('formatBytes', () => {
    it('formats 0 bytes', () => {
      expect(formatBytes(0)).toBe('0 B')
    })

    it('formats bytes', () => {
      expect(formatBytes(500)).toBe('500 B')
    })

    it('formats kilobytes', () => {
      expect(formatBytes(1024)).toBe('1.0 KB')
    })

    it('formats megabytes', () => {
      expect(formatBytes(488_000_000)).toBe('465.4 MB')
    })

    it('formats gigabytes', () => {
      expect(formatBytes(1_530_000_000)).toBe('1.4 GB')
    })
  })

  describe('isValidModelSize', () => {
    it('accepts valid model sizes', () => {
      expect(isValidModelSize('small')).toBe(true)
      expect(isValidModelSize('medium')).toBe(true)
      expect(isValidModelSize('large')).toBe(true)
    })

    it('rejects invalid model sizes', () => {
      expect(isValidModelSize('tiny')).toBe(false)
      expect(isValidModelSize('xl')).toBe(false)
      expect(isValidModelSize('')).toBe(false)
      expect(isValidModelSize('SMALL')).toBe(false)
    })
  })

  describe('getWhisperBinaryDir', () => {
    it('returns path under ~/.yolium/whisper-cpp/', () => {
      const binDir = getWhisperBinaryDir()
      expect(binDir).toBe(path.join(os.homedir(), '.yolium', 'whisper-cpp'))
    })
  })

  describe('buildTranscribeArgs', () => {
    it('builds args with model and audio paths', () => {
      const args = buildTranscribeArgs('/path/to/model.bin', '/path/to/audio.wav')
      expect(args).toContain('-m')
      expect(args).toContain('/path/to/model.bin')
      expect(args).toContain('/path/to/audio.wav')
      // Audio file should be last (positional arg)
      expect(args[args.length - 1]).toBe('/path/to/audio.wav')
    })

    it('includes no-timestamps flag', () => {
      const args = buildTranscribeArgs('/model.bin', '/audio.wav')
      expect(args).toContain('--no-timestamps')
    })

    it('includes language flag for specific language', () => {
      const args = buildTranscribeArgs('/model.bin', '/audio.wav', 'en')
      expect(args).toContain('-l')
      expect(args).toContain('en')
    })

    it('omits language flag for auto-detect', () => {
      const args = buildTranscribeArgs('/model.bin', '/audio.wav', 'auto')
      expect(args).not.toContain('-l')
    })

    it('defaults to English language', () => {
      const args = buildTranscribeArgs('/model.bin', '/audio.wav')
      expect(args).toContain('-l')
      expect(args).toContain('en')
    })
  })

  describe('parseWhisperOutput', () => {
    it('extracts transcription text from output', () => {
      const output = `whisper_init_from_file: loading model
main: processing audio
system_info: n_threads = 4
Hello, this is a test of speech to text.`
      expect(parseWhisperOutput(output)).toBe('Hello, this is a test of speech to text.')
    })

    it('filters out timestamp lines', () => {
      const output = `[00:00:00.000 --> 00:00:05.000]  Hello world
This is the actual text.`
      expect(parseWhisperOutput(output)).toBe('This is the actual text.')
    })

    it('handles empty output', () => {
      expect(parseWhisperOutput('')).toBe('')
    })

    it('handles output with only log lines', () => {
      const output = `whisper_init: done
main: done`
      expect(parseWhisperOutput(output)).toBe('')
    })

    it('joins multiple text lines', () => {
      const output = `whisper_init: done
Hello world.
How are you today?
main: done`
      expect(parseWhisperOutput(output)).toBe('Hello world. How are you today?')
    })
  })
})

describe('WHISPER_MODELS metadata', () => {
  it('has all three model sizes', () => {
    expect(WHISPER_MODELS).toHaveProperty('small')
    expect(WHISPER_MODELS).toHaveProperty('medium')
    expect(WHISPER_MODELS).toHaveProperty('large')
  })

  it('all models have required fields', () => {
    for (const [size, model] of Object.entries(WHISPER_MODELS)) {
      expect(model.name).toBeTruthy()
      expect(model.fileName).toBeTruthy()
      expect(model.sizeBytes).toBeGreaterThan(0)
      expect(model.description).toBeTruthy()
      expect(model.fileName).toMatch(/\.bin$/)
    }
  })

  it('models are ordered by size (small < medium < large)', () => {
    expect(WHISPER_MODELS.small.sizeBytes).toBeLessThan(WHISPER_MODELS.medium.sizeBytes)
    expect(WHISPER_MODELS.medium.sizeBytes).toBeLessThan(WHISPER_MODELS.large.sizeBytes)
  })

  it('all model file names are unique', () => {
    const fileNames = Object.values(WHISPER_MODELS).map(m => m.fileName)
    expect(new Set(fileNames).size).toBe(fileNames.length)
  })
})

describe('whisper-manager download behavior', () => {
  // Simulate the download state machine
  interface DownloadState {
    modelSize: WhisperModelSize
    status: 'idle' | 'downloading' | 'complete' | 'error'
    downloadedBytes: number
    totalBytes: number
    error?: string
  }

  function createDownloadState(modelSize: WhisperModelSize): DownloadState {
    return {
      modelSize,
      status: 'idle',
      downloadedBytes: 0,
      totalBytes: WHISPER_MODELS[modelSize].sizeBytes,
      error: undefined,
    }
  }

  function updateProgress(state: DownloadState, bytes: number): DownloadState {
    const downloadedBytes = Math.min(state.downloadedBytes + bytes, state.totalBytes)
    const status = downloadedBytes >= state.totalBytes ? 'complete' : 'downloading'
    return { ...state, downloadedBytes, status }
  }

  function setError(state: DownloadState, error: string): DownloadState {
    return { ...state, status: 'error', error }
  }

  it('creates initial download state', () => {
    const state = createDownloadState('small')
    expect(state.status).toBe('idle')
    expect(state.downloadedBytes).toBe(0)
    expect(state.totalBytes).toBe(WHISPER_MODELS.small.sizeBytes)
  })

  it('tracks download progress', () => {
    let state = createDownloadState('small')
    state = updateProgress(state, 100_000_000)
    expect(state.status).toBe('downloading')
    expect(state.downloadedBytes).toBe(100_000_000)
  })

  it('marks complete when all bytes received', () => {
    let state = createDownloadState('small')
    state = updateProgress(state, WHISPER_MODELS.small.sizeBytes)
    expect(state.status).toBe('complete')
    expect(state.downloadedBytes).toBe(WHISPER_MODELS.small.sizeBytes)
  })

  it('caps downloaded bytes at total', () => {
    let state = createDownloadState('small')
    state = updateProgress(state, WHISPER_MODELS.small.sizeBytes + 1000)
    expect(state.downloadedBytes).toBe(WHISPER_MODELS.small.sizeBytes)
  })

  it('handles download errors', () => {
    let state = createDownloadState('medium')
    state = updateProgress(state, 50_000_000)
    state = setError(state, 'Network error')
    expect(state.status).toBe('error')
    expect(state.error).toBe('Network error')
    expect(state.downloadedBytes).toBe(50_000_000) // preserves progress
  })
})

describe('whisper-manager transcription behavior', () => {
  // Simulate the transcription state machine
  interface TranscribeState {
    status: 'idle' | 'recording' | 'transcribing' | 'done' | 'error'
    audioPath?: string
    result?: string
    error?: string
    durationSeconds: number
  }

  function createTranscribeState(): TranscribeState {
    return { status: 'idle', durationSeconds: 0 }
  }

  function startRecording(state: TranscribeState, audioPath: string): TranscribeState {
    if (state.status !== 'idle') return state
    return { ...state, status: 'recording', audioPath }
  }

  function stopRecording(state: TranscribeState, durationSeconds: number): TranscribeState {
    if (state.status !== 'recording') return state
    return { ...state, status: 'transcribing', durationSeconds }
  }

  function completeTranscription(state: TranscribeState, text: string): TranscribeState {
    if (state.status !== 'transcribing') return state
    return { ...state, status: 'done', result: text }
  }

  function failTranscription(state: TranscribeState, error: string): TranscribeState {
    return { ...state, status: 'error', error }
  }

  function resetState(state: TranscribeState): TranscribeState {
    return createTranscribeState()
  }

  it('starts in idle state', () => {
    const state = createTranscribeState()
    expect(state.status).toBe('idle')
  })

  it('transitions from idle to recording', () => {
    let state = createTranscribeState()
    state = startRecording(state, '/tmp/audio.wav')
    expect(state.status).toBe('recording')
    expect(state.audioPath).toBe('/tmp/audio.wav')
  })

  it('does not start recording when not idle', () => {
    let state = createTranscribeState()
    state = startRecording(state, '/tmp/audio.wav')
    state = startRecording(state, '/tmp/audio2.wav') // should be ignored
    expect(state.audioPath).toBe('/tmp/audio.wav')
  })

  it('transitions from recording to transcribing on stop', () => {
    let state = createTranscribeState()
    state = startRecording(state, '/tmp/audio.wav')
    state = stopRecording(state, 5.2)
    expect(state.status).toBe('transcribing')
    expect(state.durationSeconds).toBe(5.2)
  })

  it('transitions from transcribing to done', () => {
    let state = createTranscribeState()
    state = startRecording(state, '/tmp/audio.wav')
    state = stopRecording(state, 3.0)
    state = completeTranscription(state, 'Hello world')
    expect(state.status).toBe('done')
    expect(state.result).toBe('Hello world')
  })

  it('handles transcription errors', () => {
    let state = createTranscribeState()
    state = startRecording(state, '/tmp/audio.wav')
    state = stopRecording(state, 3.0)
    state = failTranscription(state, 'Model not found')
    expect(state.status).toBe('error')
    expect(state.error).toBe('Model not found')
  })

  it('resets to idle', () => {
    let state = createTranscribeState()
    state = startRecording(state, '/tmp/audio.wav')
    state = stopRecording(state, 3.0)
    state = completeTranscription(state, 'Hello')
    state = resetState(state)
    expect(state.status).toBe('idle')
    expect(state.result).toBeUndefined()
  })
})
