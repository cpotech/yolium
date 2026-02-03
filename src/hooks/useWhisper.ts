// React hook for whisper speech-to-text functionality
// Manages recording state, audio capture, and transcription via IPC

import { useReducer, useCallback, useRef, useEffect } from 'react';
import type { WhisperModelSize, WhisperRecordingState, WhisperDownloadProgress } from '../types/whisper';
import { convertBlobToWav } from '../lib/audio-utils';

// ============================================================================
// State and reducer (tested in useWhisper.test.ts)
// ============================================================================

export interface WhisperState {
  recordingState: WhisperRecordingState;
  selectedModel: WhisperModelSize;
  transcribedText: string | null;
  error: string | null;
  isModelDialogOpen: boolean;
  downloadProgress: number | null;
  downloadingModel: WhisperModelSize | null;
}

export type WhisperAction =
  | { type: 'SET_MODEL'; payload: WhisperModelSize }
  | { type: 'START_RECORDING' }
  | { type: 'STOP_RECORDING' }
  | { type: 'TRANSCRIPTION_COMPLETE'; payload: string }
  | { type: 'TRANSCRIPTION_ERROR'; payload: string }
  | { type: 'CLEAR_TRANSCRIPTION' }
  | { type: 'OPEN_MODEL_DIALOG' }
  | { type: 'CLOSE_MODEL_DIALOG' }
  | { type: 'SET_DOWNLOAD_PROGRESS'; payload: { progress: number | null; model: WhisperModelSize | null } }
  | { type: 'RESET' };

const initialState: WhisperState = {
  recordingState: 'idle',
  selectedModel: 'small',
  transcribedText: null,
  error: null,
  isModelDialogOpen: false,
  downloadProgress: null,
  downloadingModel: null,
};

/** Map DOMException names from getUserMedia to user-friendly messages */
export function micErrorMessage(err: DOMException): string {
  switch (err.name) {
    case 'NotFoundError':
      return 'No microphone found. Connect a microphone and check Windows Settings > Privacy > Microphone.';
    case 'NotAllowedError':
      return 'Microphone access denied. Allow microphone in Windows Settings > Privacy > Microphone > "Let desktop apps access your microphone".';
    case 'NotReadableError':
      return 'Microphone is in use by another application. Close other apps using the mic and try again.';
    case 'AbortError':
      return 'Microphone access was interrupted. Please try again.';
    default:
      return `Microphone error: ${err.message}`;
  }
}

export function whisperReducer(state: WhisperState, action: WhisperAction): WhisperState {
  switch (action.type) {
    case 'SET_MODEL':
      return { ...state, selectedModel: action.payload };

    case 'START_RECORDING':
      if (state.recordingState !== 'idle') return state;
      return { ...state, recordingState: 'recording', error: null, transcribedText: null };

    case 'STOP_RECORDING':
      if (state.recordingState !== 'recording') return state;
      return { ...state, recordingState: 'transcribing' };

    case 'TRANSCRIPTION_COMPLETE':
      return { ...state, recordingState: 'idle', transcribedText: action.payload };

    case 'TRANSCRIPTION_ERROR':
      return { ...state, recordingState: 'idle', error: action.payload };

    case 'CLEAR_TRANSCRIPTION':
      return { ...state, transcribedText: null, error: null };

    case 'OPEN_MODEL_DIALOG':
      return { ...state, isModelDialogOpen: true };

    case 'CLOSE_MODEL_DIALOG':
      return { ...state, isModelDialogOpen: false };

    case 'SET_DOWNLOAD_PROGRESS':
      return {
        ...state,
        downloadProgress: action.payload.progress,
        // Only update downloadingModel when explicitly provided (non-null)
        downloadingModel: action.payload.model !== null ? action.payload.model : (action.payload.progress === null ? null : state.downloadingModel),
      };

    case 'RESET':
      return { ...initialState, selectedModel: state.selectedModel };

    default:
      return state;
  }
}

// ============================================================================
// Hook
// ============================================================================

export interface UseWhisperReturn {
  state: WhisperState;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  toggleRecording: () => Promise<void>;
  setModel: (model: WhisperModelSize) => void;
  openModelDialog: () => void;
  closeModelDialog: () => void;
  clearTranscription: () => void;
  downloadModel: (modelSize: WhisperModelSize) => Promise<void>;
}

export function useWhisper(): UseWhisperReturn {
  const [state, dispatch] = useReducer(whisperReducer, initialState);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Load saved model preference on mount
  useEffect(() => {
    window.electronAPI.whisperGetSelectedModel().then((model) => {
      dispatch({ type: 'SET_MODEL', payload: model });
    });
  }, []);

  // Listen for download progress from main process
  useEffect(() => {
    const cleanup = window.electronAPI.onWhisperDownloadProgress((progress: WhisperDownloadProgress) => {
      dispatch({ type: 'SET_DOWNLOAD_PROGRESS', payload: { progress: progress.percent, model: null } });
    });
    return cleanup;
  }, []);

  const startRecording = useCallback(async () => {
    if (state.recordingState !== 'idle') return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(100); // Collect data every 100ms
      dispatch({ type: 'START_RECORDING' });
    } catch (err) {
      const message = err instanceof DOMException
        ? micErrorMessage(err)
        : err instanceof Error ? err.message : 'Failed to access microphone';
      dispatch({ type: 'TRANSCRIPTION_ERROR', payload: message });
    }
  }, [state.recordingState]);

  const stopRecording = useCallback(async () => {
    if (state.recordingState !== 'recording' || !mediaRecorderRef.current) return;

    dispatch({ type: 'STOP_RECORDING' });

    const mediaRecorder = mediaRecorderRef.current;
    mediaRecorderRef.current = null;

    // Wait for the final data to be collected
    await new Promise<void>((resolve) => {
      mediaRecorder.onstop = () => resolve();
      mediaRecorder.stop();
    });

    // Stop all audio tracks
    mediaRecorder.stream.getTracks().forEach(track => track.stop());

    // Convert WebM audio to WAV (16-bit PCM, 16kHz mono) for whisper.cpp
    const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
    const audioData = await convertBlobToWav(audioBlob);

    try {
      // Send audio to main process for transcription
      const result = await window.electronAPI.whisperTranscribe(
        Array.from(audioData),
        state.selectedModel
      );
      dispatch({ type: 'TRANSCRIPTION_COMPLETE', payload: result.text });
    } catch (err) {
      dispatch({
        type: 'TRANSCRIPTION_ERROR',
        payload: err instanceof Error ? err.message : 'Transcription failed',
      });
    }
  }, [state.recordingState, state.selectedModel]);

  const toggleRecording = useCallback(async () => {
    if (state.recordingState === 'idle') {
      await startRecording();
    } else if (state.recordingState === 'recording') {
      await stopRecording();
    }
    // Do nothing if transcribing
  }, [state.recordingState, startRecording, stopRecording]);

  const setModel = useCallback((model: WhisperModelSize) => {
    dispatch({ type: 'SET_MODEL', payload: model });
    window.electronAPI.whisperSaveSelectedModel(model);
  }, []);

  const openModelDialog = useCallback(() => {
    dispatch({ type: 'OPEN_MODEL_DIALOG' });
  }, []);

  const closeModelDialog = useCallback(() => {
    dispatch({ type: 'CLOSE_MODEL_DIALOG' });
  }, []);

  const clearTranscription = useCallback(() => {
    dispatch({ type: 'CLEAR_TRANSCRIPTION' });
  }, []);

  const downloadModelFn = useCallback(async (modelSize: WhisperModelSize) => {
    dispatch({ type: 'SET_DOWNLOAD_PROGRESS', payload: { progress: 0, model: modelSize } });
    try {
      await window.electronAPI.whisperDownloadModel(modelSize);
      dispatch({ type: 'SET_DOWNLOAD_PROGRESS', payload: { progress: null, model: null } });
    } catch (err) {
      dispatch({ type: 'SET_DOWNLOAD_PROGRESS', payload: { progress: null, model: null } });
      dispatch({
        type: 'TRANSCRIPTION_ERROR',
        payload: err instanceof Error ? err.message : 'Download failed',
      });
    }
  }, []);

  return {
    state,
    startRecording,
    stopRecording,
    toggleRecording,
    setModel,
    openModelDialog,
    closeModelDialog,
    clearTranscription,
    downloadModel: downloadModelFn,
  };
}
