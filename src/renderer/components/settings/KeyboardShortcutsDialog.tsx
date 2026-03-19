import React, { useCallback, useRef, useEffect } from 'react';
import { isCloseShortcut } from '@renderer/lib/dialog-shortcuts';
import { getActionsByGroup, SHORTCUT_GROUP_ORDER } from '@shared/vim-actions';
import { useSuspendVimNavigation } from '@renderer/context/VimModeContext';
import { useDialogScroll } from '@renderer/hooks/useDialogScroll';

interface KeyboardShortcutsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function KeyboardShortcutsDialog({
  isOpen,
  onClose,
}: KeyboardShortcutsDialogProps): React.ReactElement | null {
  useSuspendVimNavigation(isOpen);
  const dialogRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { handleKeyDown: scrollKeyDown } = useDialogScroll(scrollRef);

  // Auto-focus dialog when opened
  useEffect(() => {
    if (isOpen) {
      dialogRef.current?.focus();
    }
  }, [isOpen]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      scrollKeyDown(e);
      if (isCloseShortcut(e)) {
        onClose();
      }
    },
    [onClose, scrollKeyDown]
  );

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  if (!isOpen) return null;

  const groupMap = getActionsByGroup();

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60"
      onKeyDown={handleKeyDown}
      onClick={handleBackdropClick}
      tabIndex={-1}
    >
      <div className="bg-[var(--color-bg-secondary)] rounded-lg shadow-xl border border-[var(--color-border-primary)] p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto" ref={scrollRef} data-testid="shortcuts-dialog">
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-4">Keyboard Shortcuts</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {SHORTCUT_GROUP_ORDER.map((groupName) => {
            const actions = groupMap.get(groupName);
            if (!actions || actions.length === 0) return null;
            return (
              <div key={groupName}>
                <h3 className="text-sm font-medium text-[var(--color-text-secondary)] mb-2">{groupName}</h3>
                <div className="space-y-1">
                  {actions.map((action) => (
                    <div
                      key={action.id}
                      className="flex items-center justify-between py-1"
                    >
                      <span className="text-[var(--color-text-primary)] text-sm">{action.description}</span>
                      <kbd className="px-2 py-0.5 rounded bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] text-xs font-mono border border-[var(--color-border-secondary)]">
                        {action.key}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-6 flex justify-end items-center gap-2">
          <button
            onClick={onClose}
            data-testid="shortcuts-close"
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-md transition-colors"
          >
            OK
          </button>
          <kbd className="text-xs bg-[var(--color-bg-tertiary)] px-1.5 py-0.5 rounded text-[var(--color-text-muted)]">Ctrl+Q</kbd>
        </div>
      </div>
    </div>
  );
}
