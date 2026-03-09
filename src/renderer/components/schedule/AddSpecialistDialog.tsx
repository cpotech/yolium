import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface AddSpecialistDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
}

function sanitizeSpecialistName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function AddSpecialistDialog({
  isOpen,
  onClose,
  onCreated,
}: AddSpecialistDialogProps): React.ReactElement | null {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setName('');
    setDescription('');
    setError(null);
    setIsSubmitting(false);
    setTimeout(() => nameInputRef.current?.focus(), 0);
  }, [isOpen]);

  const canCreate = useMemo(() => name.trim().length > 0 && !isSubmitting, [name, isSubmitting]);

  const handleSubmit = useCallback(async () => {
    const sanitizedName = sanitizeSpecialistName(name);
    if (!sanitizedName) return;

    setName(sanitizedName);
    setError(null);
    setIsSubmitting(true);

    try {
      const options = description.trim() ? { description: description.trim() } : undefined;
      await window.electronAPI.schedule.scaffold(sanitizedName, options);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create specialist.');
    } finally {
      setIsSubmitting(false);
    }
  }, [description, name, onCreated]);

  const handleNameBlur = useCallback(() => {
    setName((previous) => sanitizeSpecialistName(previous));
  }, []);

  const handleBackdropClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }, [onClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  }, [onClose]);

  if (!isOpen) return null;

  return (
    <div
      data-testid="add-specialist-dialog"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      role="dialog"
      aria-modal="true"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      <div className="w-full max-w-lg mx-4 rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] p-5 shadow-xl">
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Add Specialist</h2>
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">
          Create a new scheduled specialist definition in <code>src/agents/cron/</code>.
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--color-text-secondary)]" htmlFor="specialist-name-input">
              Name *
            </label>
            <input
              id="specialist-name-input"
              ref={nameInputRef}
              data-testid="specialist-name-input"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              onBlur={handleNameBlur}
              placeholder="e.g. code-quality"
              className="w-full rounded border border-[var(--color-border-secondary)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent-primary)]"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--color-text-secondary)]" htmlFor="specialist-description-input">
              Description (optional)
            </label>
            <input
              id="specialist-description-input"
              data-testid="specialist-description-input"
              type="text"
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                setError(null);
              }}
              placeholder="What this specialist monitors"
              className="w-full rounded border border-[var(--color-border-secondary)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent-primary)]"
            />
          </div>
        </div>

        {error && (
          <p className="mt-3 text-xs text-[var(--color-status-error)]">{error}</p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            data-testid="specialist-cancel-btn"
            onClick={onClose}
            className="rounded px-3 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-primary)]"
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="specialist-create-btn"
            onClick={handleSubmit}
            disabled={!canCreate}
            className="rounded bg-[var(--color-accent-primary)] px-3 py-1.5 text-xs font-medium text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

