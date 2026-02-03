import { describe, it, expect } from 'vitest'
import type { WhisperModelSize, WhisperRecordingState } from '../types/whisper'
import { micErrorMessage } from '../hooks/useWhisper'

// ============================================================================
// Extract the reducer logic for testing (mirrors useWhisper.ts)
// ============================================================================

interface WhisperState {
  recordingState: WhisperRecordingState
  selectedModel: WhisperModelSize
  transcribedText: string | null
  error: string | null
  isModelDialogOpen: boolean
  downloadProgress: number | null // percent 0-100
  downloadingModel: WhisperModelSize | null
}

type WhisperAction =
  | { type: 'SET_MODEL'; payload: WhisperModelSize }
  | { type: 'START_RECORDING' }
  | { type: 'STOP_RECORDING' }
  | { type: 'TRANSCRIPTION_COMPLETE'; payload: string }
  | { type: 'TRANSCRIPTION_ERROR'; payload: string }
  | { type: 'CLEAR_TRANSCRIPTION' }
  | { type: 'OPEN_MODEL_DIALOG' }
  | { type: 'CLOSE_MODEL_DIALOG' }
  | { type: 'SET_DOWNLOAD_PROGRESS'; payload: { progress: number | null; model: WhisperModelSize | null } }
  | { type: 'RESET' }

const initialState: WhisperState = {
  recordingState: 'idle',
  selectedModel: 'small',
  transcribedText: null,
  error: null,
  isModelDialogOpen: false,
  downloadProgress: null,
  downloadingModel: null,
}

function whisperReducer(state: WhisperState, action: WhisperAction): WhisperState {
  switch (action.type) {
    case 'SET_MODEL':
      return { ...state, selectedModel: action.payload }

    case 'START_RECORDING':
      if (state.recordingState !== 'idle') return state
      return { ...state, recordingState: 'recording', error: null, transcribedText: null }

    case 'STOP_RECORDING':
      if (state.recordingState !== 'recording') return state
      return { ...state, recordingState: 'transcribing' }

    case 'TRANSCRIPTION_COMPLETE':
      return { ...state, recordingState: 'idle', transcribedText: action.payload }

    case 'TRANSCRIPTION_ERROR':
      return { ...state, recordingState: 'idle', error: action.payload }

    case 'CLEAR_TRANSCRIPTION':
      return { ...state, transcribedText: null, error: null }

    case 'OPEN_MODEL_DIALOG':
      return { ...state, isModelDialogOpen: true }

    case 'CLOSE_MODEL_DIALOG':
      return { ...state, isModelDialogOpen: false }

    case 'SET_DOWNLOAD_PROGRESS':
      return {
        ...state,
        downloadProgress: action.payload.progress,
        downloadingModel: action.payload.model !== null ? action.payload.model : (action.payload.progress === null ? null : state.downloadingModel),
      }

    case 'RESET':
      return { ...initialState, selectedModel: state.selectedModel }

    default:
      return state
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('whisperReducer', () => {
  describe('initial state', () => {
    it('starts in idle recording state', () => {
      expect(initialState.recordingState).toBe('idle')
    })

    it('defaults to small model', () => {
      expect(initialState.selectedModel).toBe('small')
    })

    it('has no transcribed text', () => {
      expect(initialState.transcribedText).toBeNull()
    })

    it('has no error', () => {
      expect(initialState.error).toBeNull()
    })

    it('model dialog is closed', () => {
      expect(initialState.isModelDialogOpen).toBe(false)
    })
  })

  describe('SET_MODEL', () => {
    it('changes the selected model', () => {
      const state = whisperReducer(initialState, { type: 'SET_MODEL', payload: 'large' })
      expect(state.selectedModel).toBe('large')
    })

    it('does not affect other state', () => {
      const state = whisperReducer(initialState, { type: 'SET_MODEL', payload: 'medium' })
      expect(state.recordingState).toBe('idle')
      expect(state.transcribedText).toBeNull()
    })
  })

  describe('START_RECORDING', () => {
    it('transitions from idle to recording', () => {
      const state = whisperReducer(initialState, { type: 'START_RECORDING' })
      expect(state.recordingState).toBe('recording')
    })

    it('clears previous error', () => {
      const stateWithError: WhisperState = { ...initialState, error: 'previous error' }
      const state = whisperReducer(stateWithError, { type: 'START_RECORDING' })
      expect(state.error).toBeNull()
    })

    it('clears previous transcription', () => {
      const stateWithText: WhisperState = { ...initialState, transcribedText: 'old text' }
      const state = whisperReducer(stateWithText, { type: 'START_RECORDING' })
      expect(state.transcribedText).toBeNull()
    })

    it('ignores when already recording', () => {
      const recordingState: WhisperState = { ...initialState, recordingState: 'recording' }
      const state = whisperReducer(recordingState, { type: 'START_RECORDING' })
      expect(state.recordingState).toBe('recording')
    })

    it('ignores when transcribing', () => {
      const transcribingState: WhisperState = { ...initialState, recordingState: 'transcribing' }
      const state = whisperReducer(transcribingState, { type: 'START_RECORDING' })
      expect(state.recordingState).toBe('transcribing')
    })
  })

  describe('STOP_RECORDING', () => {
    it('transitions from recording to transcribing', () => {
      const recordingState: WhisperState = { ...initialState, recordingState: 'recording' }
      const state = whisperReducer(recordingState, { type: 'STOP_RECORDING' })
      expect(state.recordingState).toBe('transcribing')
    })

    it('ignores when idle', () => {
      const state = whisperReducer(initialState, { type: 'STOP_RECORDING' })
      expect(state.recordingState).toBe('idle')
    })

    it('ignores when already transcribing', () => {
      const transcribingState: WhisperState = { ...initialState, recordingState: 'transcribing' }
      const state = whisperReducer(transcribingState, { type: 'STOP_RECORDING' })
      expect(state.recordingState).toBe('transcribing')
    })
  })

  describe('TRANSCRIPTION_COMPLETE', () => {
    it('stores transcribed text and returns to idle', () => {
      const transcribingState: WhisperState = { ...initialState, recordingState: 'transcribing' }
      const state = whisperReducer(transcribingState, {
        type: 'TRANSCRIPTION_COMPLETE',
        payload: 'Hello world',
      })
      expect(state.recordingState).toBe('idle')
      expect(state.transcribedText).toBe('Hello world')
    })
  })

  describe('TRANSCRIPTION_ERROR', () => {
    it('stores error and returns to idle', () => {
      const transcribingState: WhisperState = { ...initialState, recordingState: 'transcribing' }
      const state = whisperReducer(transcribingState, {
        type: 'TRANSCRIPTION_ERROR',
        payload: 'Model not found',
      })
      expect(state.recordingState).toBe('idle')
      expect(state.error).toBe('Model not found')
    })
  })

  describe('CLEAR_TRANSCRIPTION', () => {
    it('clears transcription and error', () => {
      const stateWithData: WhisperState = {
        ...initialState,
        transcribedText: 'some text',
        error: 'some error',
      }
      const state = whisperReducer(stateWithData, { type: 'CLEAR_TRANSCRIPTION' })
      expect(state.transcribedText).toBeNull()
      expect(state.error).toBeNull()
    })
  })

  describe('model dialog', () => {
    it('OPEN_MODEL_DIALOG opens the dialog', () => {
      const state = whisperReducer(initialState, { type: 'OPEN_MODEL_DIALOG' })
      expect(state.isModelDialogOpen).toBe(true)
    })

    it('CLOSE_MODEL_DIALOG closes the dialog', () => {
      const openState: WhisperState = { ...initialState, isModelDialogOpen: true }
      const state = whisperReducer(openState, { type: 'CLOSE_MODEL_DIALOG' })
      expect(state.isModelDialogOpen).toBe(false)
    })
  })

  describe('SET_DOWNLOAD_PROGRESS', () => {
    it('sets download progress and model', () => {
      const state = whisperReducer(initialState, { type: 'SET_DOWNLOAD_PROGRESS', payload: { progress: 45, model: 'medium' } })
      expect(state.downloadProgress).toBe(45)
      expect(state.downloadingModel).toBe('medium')
    })

    it('preserves downloadingModel when model is null and progress is non-null', () => {
      const downloading: WhisperState = { ...initialState, downloadProgress: 30, downloadingModel: 'large' }
      const state = whisperReducer(downloading, { type: 'SET_DOWNLOAD_PROGRESS', payload: { progress: 50, model: null } })
      expect(state.downloadProgress).toBe(50)
      expect(state.downloadingModel).toBe('large')
    })

    it('clears progress and model with null progress', () => {
      const downloading: WhisperState = { ...initialState, downloadProgress: 75, downloadingModel: 'small' }
      const state = whisperReducer(downloading, { type: 'SET_DOWNLOAD_PROGRESS', payload: { progress: null, model: null } })
      expect(state.downloadProgress).toBeNull()
      expect(state.downloadingModel).toBeNull()
    })
  })

  describe('RESET', () => {
    it('resets to initial state but keeps selected model', () => {
      const modifiedState: WhisperState = {
        recordingState: 'transcribing',
        selectedModel: 'large',
        transcribedText: 'text',
        error: 'err',
        isModelDialogOpen: true,
        downloadProgress: 50,
        downloadingModel: 'medium',
      }
      const state = whisperReducer(modifiedState, { type: 'RESET' })
      expect(state.recordingState).toBe('idle')
      expect(state.selectedModel).toBe('large') // preserved
      expect(state.transcribedText).toBeNull()
      expect(state.error).toBeNull()
      expect(state.isModelDialogOpen).toBe(false)
      expect(state.downloadProgress).toBeNull()
    })
  })

  describe('full recording flow', () => {
    it('handles complete recording -> transcription flow', () => {
      let state = initialState

      // Select model
      state = whisperReducer(state, { type: 'SET_MODEL', payload: 'medium' })
      expect(state.selectedModel).toBe('medium')

      // Start recording
      state = whisperReducer(state, { type: 'START_RECORDING' })
      expect(state.recordingState).toBe('recording')

      // Stop recording
      state = whisperReducer(state, { type: 'STOP_RECORDING' })
      expect(state.recordingState).toBe('transcribing')

      // Transcription completes
      state = whisperReducer(state, {
        type: 'TRANSCRIPTION_COMPLETE',
        payload: 'This is a test transcription.',
      })
      expect(state.recordingState).toBe('idle')
      expect(state.transcribedText).toBe('This is a test transcription.')
      expect(state.error).toBeNull()
    })

    it('handles recording -> error flow', () => {
      let state = initialState

      state = whisperReducer(state, { type: 'START_RECORDING' })
      state = whisperReducer(state, { type: 'STOP_RECORDING' })
      state = whisperReducer(state, {
        type: 'TRANSCRIPTION_ERROR',
        payload: 'Audio too short',
      })

      expect(state.recordingState).toBe('idle')
      expect(state.error).toBe('Audio too short')
      expect(state.transcribedText).toBeNull()
    })
  })
})

describe('micErrorMessage', () => {
  it('returns friendly message for NotFoundError', () => {
    const err = new DOMException('', 'NotFoundError')
    expect(micErrorMessage(err)).toContain('No microphone found')
  })

  it('returns friendly message for NotAllowedError', () => {
    const err = new DOMException('', 'NotAllowedError')
    expect(micErrorMessage(err)).toContain('Microphone access denied')
  })

  it('returns friendly message for NotReadableError', () => {
    const err = new DOMException('', 'NotReadableError')
    expect(micErrorMessage(err)).toContain('in use by another application')
  })

  it('returns friendly message for AbortError', () => {
    const err = new DOMException('', 'AbortError')
    expect(micErrorMessage(err)).toContain('interrupted')
  })

  it('returns generic message for unknown DOMException', () => {
    const err = new DOMException('something broke', 'UnknownError')
    expect(micErrorMessage(err)).toContain('something broke')
  })
})
