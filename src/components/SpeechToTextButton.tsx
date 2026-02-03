import React from 'react';
import { Mic, MicOff, Loader2, ChevronDown } from 'lucide-react';
import type { WhisperRecordingState, WhisperModelSize } from '../types/whisper';
import { WHISPER_MODELS } from '../types/whisper';

interface SpeechToTextButtonProps {
  recordingState: WhisperRecordingState;
  selectedModel: WhisperModelSize;
  onToggleRecording: () => void;
  onOpenModelDialog: () => void;
}

export function SpeechToTextButton({
  recordingState,
  selectedModel,
  onToggleRecording,
  onOpenModelDialog,
}: SpeechToTextButtonProps): React.ReactElement {
  const isRecording = recordingState === 'recording';
  const isTranscribing = recordingState === 'transcribing';
  const isIdle = recordingState === 'idle';

  return (
    <div className="flex items-center gap-0.5">
      {/* Main mic button */}
      <button
        data-testid="speech-to-text-button"
        onClick={onToggleRecording}
        disabled={isTranscribing}
        className={`flex items-center gap-1 px-2 py-0.5 rounded transition-colors ${
          isRecording
            ? 'text-[var(--color-status-error)] bg-[var(--color-status-error)]/10 hover:bg-[var(--color-status-error)]/20'
            : isTranscribing
            ? 'text-[var(--color-text-muted)] cursor-wait'
            : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)]'
        } disabled:opacity-50`}
        title={
          isRecording
            ? 'Stop recording (Ctrl+Shift+R)'
            : isTranscribing
            ? 'Transcribing...'
            : 'Start speech-to-text (Ctrl+Shift+R)'
        }
      >
        {isTranscribing ? (
          <Loader2 size={12} className="animate-spin" />
        ) : isRecording ? (
          <MicOff size={12} className="animate-pulse" />
        ) : (
          <Mic size={12} />
        )}
        {isRecording && <span className="text-xs">Rec</span>}
        {isTranscribing && <span className="text-xs">...</span>}
        {isIdle && <span data-testid="recording-hint" className="text-[10px] text-[var(--color-text-disabled)] ml-0.5">Ctrl+Shift+R</span>}
      </button>

      {/* Model selector dropdown trigger */}
      {isIdle && (
        <button
          data-testid="speech-model-select"
          onClick={onOpenModelDialog}
          className="flex items-center gap-0.5 px-1 py-0.5 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] transition-colors"
          title={`Model: ${WHISPER_MODELS[selectedModel].name} (click to change)`}
        >
          <span className="text-xs">{WHISPER_MODELS[selectedModel].name}</span>
          <ChevronDown size={10} />
        </button>
      )}
    </div>
  );
}
