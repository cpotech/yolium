import React, { useCallback, useRef, useEffect, useState } from 'react';
import { trapFocus } from '@shared/lib/focus-trap';

interface ProjectConfigDialogProps {
  isOpen: boolean;
  projectPath: string;
  onClose: () => void;
}

/**
 * Client-side validation for shared directory paths.
 * Mirrors isValidSharedDir from project-config.ts but without fs access.
 */
function isValidPath(dir: string): boolean {
  if (dir.length === 0) return false;
  if (dir.startsWith('/') || dir.startsWith('\\')) return false;
  // Windows absolute paths
  if (/^[A-Za-z]:/.test(dir)) return false;
  // Path traversal
  if (dir === '..') return false;
  if (dir.startsWith('../') || dir.startsWith('..\\')) return false;
  if (dir.includes('/../') || dir.includes('\\..\\')) return false;
  if (dir.endsWith('/..') || dir.endsWith('\\..')) return false;
  return true;
}

export function ProjectConfigDialog({
  isOpen,
  projectPath,
  onClose,
}: ProjectConfigDialogProps): React.ReactElement | null {
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [sharedDirs, setSharedDirs] = useState<string[]>([]);
  const [dirStatus, setDirStatus] = useState<Record<string, boolean>>({});
  const [newDir, setNewDir] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Load config when dialog opens
  useEffect(() => {
    if (!isOpen || !projectPath) return;

    setLoading(true);
    setNewDir('');
    setValidationError(null);

    (async () => {
      try {
        const config = await window.electronAPI.projectConfig.load(projectPath);
        const dirs = config?.sharedDirs ?? [];
        setSharedDirs(dirs);

        if (dirs.length > 0) {
          const status = await window.electronAPI.projectConfig.checkDirs(projectPath, dirs);
          setDirStatus(status);
        } else {
          setDirStatus({});
        }
      } catch (err) {
        console.error('Failed to load project config:', err);
        setSharedDirs([]);
        setDirStatus({});
      } finally {
        setLoading(false);
        // Focus input after loading
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    })();
  }, [isOpen, projectPath]);

  const handleAdd = useCallback(() => {
    const trimmed = newDir.trim();
    if (!trimmed) {
      setValidationError('Path cannot be empty.');
      return;
    }
    if (!isValidPath(trimmed)) {
      setValidationError('Invalid path. Must be relative with no ../ traversal.');
      return;
    }
    if (sharedDirs.includes(trimmed)) {
      setValidationError('Directory already in the list.');
      return;
    }
    setSharedDirs(prev => [...prev, trimmed]);
    // New entry — unknown status until checked
    setDirStatus(prev => ({ ...prev, [trimmed]: false }));
    setNewDir('');
    setValidationError(null);

    // Check existence in background
    window.electronAPI.projectConfig.checkDirs(projectPath, [trimmed]).then(result => {
      setDirStatus(prev => ({ ...prev, ...result }));
    });
  }, [newDir, sharedDirs, projectPath]);

  const handleRemove = useCallback((dir: string) => {
    setSharedDirs(prev => prev.filter(d => d !== dir));
    setDirStatus(prev => {
      const next = { ...prev };
      delete next[dir];
      return next;
    });
  }, []);

  const handleSave = useCallback(async () => {
    await window.electronAPI.projectConfig.save(projectPath, { sharedDirs });
    onClose();
  }, [projectPath, sharedDirs, onClose]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (dialogRef.current) {
        trapFocus(e, dialogRef.current);
      }
    },
    [onClose]
  );

  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAdd();
      }
    },
    [handleAdd]
  );

  if (!isOpen) return null;

  const jsonPreview = JSON.stringify({ sharedDirs }, null, 2);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
      <div
        ref={dialogRef}
        onKeyDown={handleKeyDown}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-config-title"
        data-testid="project-config-dialog"
        className="bg-[var(--color-bg-secondary)] rounded-lg shadow-xl border border-[var(--color-border-primary)] w-full max-w-lg mx-4 flex flex-col max-h-[80vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border-primary)]">
          <div>
            <h2 id="project-config-title" className="text-sm font-semibold text-[var(--color-text-primary)]">
              Project Settings
            </h2>
            <p className="text-xs text-[var(--color-text-muted)] font-mono truncate max-w-[300px]">
              {projectPath}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            data-testid="project-config-close"
            className="rounded-md p-1.5 text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-primary)]"
            aria-label="Close project settings"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {/* Section: Shared Directories */}
          <div className="mb-3">
            <h3 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wide mb-1">
              Shared Directories
            </h3>
            <p className="text-xs text-[var(--color-text-muted)] mb-3">
              Gitignored directories bind-mounted (read-only) into agent containers.
            </p>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)] py-4">
              <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Loading configuration...
            </div>
          ) : (
            <>
              {/* Directory list */}
              {sharedDirs.length === 0 ? (
                <div data-testid="empty-state" className="text-sm text-[var(--color-text-muted)] py-4 text-center border border-dashed border-[var(--color-border-primary)] rounded-md">
                  No shared directories configured. Add gitignored directories that agents should have access to.
                </div>
              ) : (
                <div className="space-y-1.5 mb-3">
                  {sharedDirs.map(dir => (
                    <div
                      key={dir}
                      data-testid={`shared-dir-${dir}`}
                      className="flex items-center gap-2 px-3 py-2 bg-[var(--color-bg-tertiary)] rounded-md"
                    >
                      <span className="flex-1 text-sm font-mono text-[var(--color-text-primary)] truncate">
                        {dir}
                      </span>
                      <span
                        data-testid={`dir-status-${dir}`}
                        className={`text-xs shrink-0 ${dirStatus[dir] ? 'text-green-400' : 'text-yellow-400'}`}
                      >
                        {dirStatus[dir] ? 'exists' : 'not found'}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemove(dir)}
                        data-testid={`remove-dir-${dir}`}
                        className="p-1 text-[var(--color-text-secondary)] hover:text-red-400 transition-colors shrink-0"
                        aria-label={`Remove ${dir}`}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add directory input */}
              <div className="flex gap-2 mb-1">
                <input
                  ref={inputRef}
                  type="text"
                  value={newDir}
                  onChange={(e) => {
                    setNewDir(e.target.value);
                    setValidationError(null);
                  }}
                  onKeyDown={handleInputKeyDown}
                  placeholder="Enter relative path (e.g. fixtures)"
                  data-testid="add-dir-input"
                  className="flex-1 px-3 py-2 bg-[var(--color-bg-primary)] border border-[var(--color-border-secondary)] rounded-md text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <button
                  type="button"
                  onClick={handleAdd}
                  data-testid="add-dir-button"
                  className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-500 transition-colors shrink-0"
                >
                  + Add
                </button>
              </div>

              {validationError && (
                <p data-testid="validation-error" className="text-xs text-red-400 mb-2">
                  {validationError}
                </p>
              )}

              <p className="text-xs text-[var(--color-text-muted)] mb-4">
                Paths must be relative. No absolute paths or ../ traversal.
              </p>

              {/* Divider */}
              <div className="border-t border-[var(--color-border-primary)] mb-3" />

              {/* JSON preview */}
              <div className="mb-1">
                <h3 className="text-xs font-semibold text-[var(--color-text-muted)] mb-2">.yolium.json</h3>
                <pre
                  data-testid="json-preview"
                  className="px-3 py-2 bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-md text-xs text-[var(--color-text-muted)] font-mono overflow-x-auto"
                >
                  {jsonPreview}
                </pre>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-[var(--color-border-primary)]">
          <button
            type="button"
            onClick={onClose}
            data-testid="project-config-cancel"
            className="px-4 py-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            data-testid="project-config-save"
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-500 transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
