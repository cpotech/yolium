import React, { useCallback, useRef, useEffect, useState } from 'react';
import { Download, Trash2, Check, Loader2, HardDrive, Copy, ClipboardCheck, Wrench } from 'lucide-react';
import type { WhisperModelSize } from '@shared/types/whisper';
import { WHISPER_MODELS } from '@shared/types/whisper';
import { isCloseShortcut } from '@renderer/lib/dialog-shortcuts';
import { useSuspendVimNavigation } from '@renderer/context/VimModeContext';

interface WhisperModelDialogProps {
  isOpen: boolean;
  selectedModel: WhisperModelSize;
  downloadProgress: number | null;
  downloadingModel: WhisperModelSize | null;
  onSelectModel: (model: WhisperModelSize) => void;
  onDownloadModel: (model: WhisperModelSize) => void;
  onDeleteModel: (model: WhisperModelSize) => void;
  onClose: () => void;
}

interface ModelInfo {
  size: WhisperModelSize;
  name: string;
  fileName: string;
  sizeBytes: number;
  downloaded: boolean;
  description: string;
  path?: string;
}

function CopyPathButton({ path }: { path: string }): React.ReactElement {
  const [copied, setCopied] = useState(false);
  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(path).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button
      onClick={handleCopy}
      className="flex-shrink-0 p-0.5 rounded text-[var(--color-text-disabled)] hover:text-[var(--color-text-secondary)] transition-colors"
    >
      {copied ? <ClipboardCheck size={10} /> : <Copy size={10} />}
    </button>
  );
}

function formatSize(bytes: number): string {
  if (bytes >= 1_000_000_000) {
    return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
  }
  return `${(bytes / 1_000_000).toFixed(0)} MB`;
}

export function WhisperModelDialog({
  isOpen,
  selectedModel,
  downloadProgress,
  downloadingModel,
  onSelectModel,
  onDownloadModel,
  onDeleteModel,
  onClose,
}: WhisperModelDialogProps): React.ReactElement | null {
  useSuspendVimNavigation(isOpen);

  const dialogRef = useRef<HTMLDivElement>(null);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [binaryAvailable, setBinaryAvailable] = useState<boolean | null>(null);
  const [installingBinary, setInstallingBinary] = useState(false);
  const [installProgress, setInstallProgress] = useState<string | null>(null);
  const [installError, setInstallError] = useState<string | null>(null);

  const prevDownloadProgressRef = useRef<number | null>(null);

  // Load model + binary status on open
  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    Promise.all([
      window.electronAPI.whisper.listModels(),
      window.electronAPI.whisper.isBinaryAvailable(),
    ]).then(([modelList, binAvailable]) => {
      const infos: ModelInfo[] = modelList.map((m) => ({
        size: m.size as WhisperModelSize,
        name: m.name,
        fileName: m.fileName,
        sizeBytes: m.sizeBytes,
        downloaded: m.downloaded,
        description: WHISPER_MODELS[m.size as WhisperModelSize]?.description || '',
        path: m.path,
      }));
      setModels(infos);
      setBinaryAvailable(binAvailable);
      setLoading(false);
    });
  }, [isOpen]);

  // Listen for install progress events
  useEffect(() => {
    const cleanup = window.electronAPI.whisper.onInstallProgress((message: string) => {
      setInstallProgress(message);
    });
    return cleanup;
  }, []);

  const handleInstallBinary = useCallback(async () => {
    setInstallingBinary(true);
    setInstallError(null);
    setInstallProgress('Starting installation...');
    try {
      await window.electronAPI.whisper.installBinary();
      setBinaryAvailable(true);
      setInstallProgress(null);
    } catch (err) {
      setInstallError(err instanceof Error ? err.message : 'Installation failed');
      setInstallProgress(null);
    } finally {
      setInstallingBinary(false);
    }
  }, []);

  // Re-fetch models when a download completes (progress transitions from non-null to null)
  useEffect(() => {
    const wasDownloading = prevDownloadProgressRef.current !== null;
    prevDownloadProgressRef.current = downloadProgress;
    if (isOpen && wasDownloading && downloadProgress === null) {
      window.electronAPI.whisper.listModels().then((modelList) => {
        const infos: ModelInfo[] = modelList.map((m) => ({
          size: m.size as WhisperModelSize,
          name: m.name,
          fileName: m.fileName,
          sizeBytes: m.sizeBytes,
          downloaded: m.downloaded,
          description: WHISPER_MODELS[m.size as WhisperModelSize]?.description || '',
          path: m.path,
        }));
        setModels(infos);
      });
    }
  }, [downloadProgress, isOpen]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (isCloseShortcut(e)) {
        e.preventDefault();
        onClose();
      }
    },
    [onClose]
  );

  // Auto-focus dialog when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => dialogRef.current?.focus(), 50);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60"
      onKeyDown={handleKeyDown}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      tabIndex={-1}
    >
      <div
        data-testid="whisper-model-dialog"
        onClick={(e) => e.stopPropagation()}
        className="bg-[var(--color-bg-primary)] rounded-lg shadow-xl border border-[var(--color-border-primary)] p-6 max-w-lg w-full mx-4"
      >
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">
          Speech-to-Text Models
        </h2>
        <p className="text-sm text-[var(--color-text-secondary)] mb-4">
          Select a whisper.cpp model for speech recognition. Larger models are more accurate but slower.
        </p>

        {/* Binary installation status */}
        {!loading && binaryAvailable === false && (
          <div
            data-testid="whisper-binary-banner"
            className="mb-4 p-3 rounded-md bg-[var(--color-status-warning)]/10 border border-[var(--color-status-warning)]/30"
          >
            <div className="flex items-center gap-2 mb-1">
              <Wrench size={14} className="text-[var(--color-status-warning)]" />
              <span className="text-sm font-medium text-[var(--color-text-primary)]">
                whisper.cpp not installed
              </span>
            </div>
            <p className="text-xs text-[var(--color-text-secondary)] mb-2">
              {navigator.platform.toLowerCase().includes('win')
                ? 'Download and install the whisper.cpp binary to enable speech-to-text.'
                : 'Download, build, and install whisper.cpp from source. Requires cmake, make, and a C++ compiler.'}
            </p>
            {installError && (
              <p className="text-xs text-[var(--color-status-error)] mb-2">{installError}</p>
            )}
            {installingBinary ? (
              <div className="flex items-center gap-2">
                <Loader2 size={12} className="animate-spin text-[var(--color-text-muted)]" />
                <span className="text-xs text-[var(--color-text-muted)]">{installProgress || 'Installing...'}</span>
              </div>
            ) : (
              <button
                data-testid="whisper-install-binary"
                onClick={handleInstallBinary}
                className="flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium bg-[var(--color-accent-primary)] text-white hover:bg-[var(--color-accent-hover)] transition-colors"
              >
                <Download size={12} />
                Install whisper.cpp
              </button>
            )}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={24} className="animate-spin text-[var(--color-text-muted)]" />
          </div>
        ) : (
          <div className="space-y-2">
            {models.map((model) => {
              const isSelected = model.size === selectedModel;
              const isDownloading = downloadProgress !== null;
              const isThisModelDownloading = isDownloading && downloadingModel === model.size;

              return (
                <div
                  key={model.size}
                  data-testid={`whisper-model-${model.size}`}
                  className={`flex items-center gap-3 p-3 rounded-md transition-colors ${
                    isSelected
                      ? 'bg-[var(--color-accent-bg)] ring-2 ring-[var(--color-accent-primary)]'
                      : 'bg-[var(--color-bg-secondary)] hover:bg-[var(--color-bg-tertiary)]'
                  }`}
                >
                  {/* Model info */}
                  <button
                    onClick={() => {
                      if (model.downloaded) {
                        onSelectModel(model.size);
                      }
                    }}
                    disabled={!model.downloaded}
                    className="flex-1 text-left disabled:opacity-50"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[var(--color-text-primary)] font-medium">
                        {model.name}
                      </span>
                      {isSelected && model.downloaded && (
                        <Check size={14} className="text-[var(--color-status-success)]" />
                      )}
                    </div>
                    <div className="text-[var(--color-text-muted)] text-xs mt-0.5">
                      {model.description}
                    </div>
                    <div className="flex items-center gap-2 text-[var(--color-text-muted)] text-xs mt-1">
                      <HardDrive size={10} />
                      <span>{formatSize(model.sizeBytes)}</span>
                      {model.downloaded && (
                        <span className="text-[var(--color-status-success)]">Downloaded</span>
                      )}
                    </div>
                    {model.downloaded && model.path && (
                      <div className="flex items-center gap-1 mt-0.5 max-w-xs">
                        <span className="text-[var(--color-text-disabled)] text-[10px] font-mono truncate">{model.path}</span>
                        <CopyPathButton path={model.path} />
                      </div>
                    )}
                  </button>

                  {/* Download/delete actions */}
                  <div className="flex items-center gap-1">
                    {!model.downloaded && (
                      <button
                        data-testid={`whisper-download-${model.size}`}
                        onClick={() => onDownloadModel(model.size)}
                        disabled={isDownloading}
                        className="flex items-center gap-1 px-2 py-1 rounded text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)] transition-colors disabled:opacity-50"
                      >
                        {isThisModelDownloading ? (
                          <>
                            <Loader2 size={12} className="animate-spin" />
                            <span>{downloadProgress}%</span>
                          </>
                        ) : (
                          <>
                            <Download size={12} />
                            <span>Download</span>
                          </>
                        )}
                      </button>
                    )}
                    {model.downloaded && (
                      <button
                        data-testid={`whisper-delete-${model.size}`}
                        onClick={() => onDeleteModel(model.size)}
                        className="flex items-center gap-1 px-2 py-1 rounded text-xs text-[var(--color-text-muted)] hover:text-[var(--color-status-error)] hover:bg-[var(--color-bg-tertiary)] transition-colors"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Download progress bar */}
        {downloadProgress !== null && (
          <div className="mt-3">
            <div className="w-full bg-[var(--color-bg-tertiary)] rounded-full h-1.5">
              <div
                className="bg-[var(--color-accent-primary)] h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${downloadProgress}%` }}
              />
            </div>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">
              Downloading... {downloadProgress}%
            </p>
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <button
            data-testid="whisper-model-close"
            onClick={onClose}
            className="px-4 py-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors flex items-center gap-2"
          >
            Close
            <kbd className="text-xs bg-[var(--color-bg-tertiary)] px-1.5 py-0.5 rounded text-[var(--color-text-muted)]">
              Ctrl+Q
            </kbd>
          </button>
        </div>
      </div>
    </div>
  );
}
