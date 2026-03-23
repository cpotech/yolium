/**
 * @module src/components/WhichKeyPopup
 * Floating which-key popup that shows available shortcuts for the current zone.
 * Dismisses on: action executed, Escape, Ctrl+Q, Space (toggle), click-outside, timeout.
 */

import React, { useEffect, useRef, useMemo } from 'react';
import { VIM_ACTIONS, type VimActionZone } from '@shared/vim-actions';

interface WhichKeyPopupProps {
  /** The zone to show actions for */
  zone: VimActionZone;
  /** Called when a valid action key is pressed */
  onAction: (key: string) => void;
  /** Called when the popup should be dismissed */
  onDismiss: () => void;
}

export function WhichKeyPopup({ zone, onAction, onDismiss }: WhichKeyPopupProps): React.ReactElement {
  const popupRef = useRef<HTMLDivElement>(null);

  // Get actions for this zone — vim category, NORMAL mode, single-key only
  const actions = useMemo(() => {
    return VIM_ACTIONS.filter(a =>
      a.zone === zone &&
      a.category === 'vim' &&
      a.mode === 'NORMAL' &&
      !a.key.includes('+') &&
      a.key.length <= 2 &&
      a.id !== 'leader-key'
    );
  }, [zone]);

  // Build a set of valid keys for quick lookup
  const validKeys = useMemo(() => {
    return new Set(actions.map(a => a.key));
  }, [actions]);

  // Keyboard handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ctrl+Q dismisses
      if (e.ctrlKey && e.key === 'q') {
        e.preventDefault();
        e.stopPropagation();
        onDismiss();
        return;
      }

      // Escape dismisses
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onDismiss();
        return;
      }

      // Valid action key — execute and dismiss
      if (validKeys.has(e.key)) {
        e.preventDefault();
        e.stopPropagation();
        onAction(e.key);
        return;
      }
    };

    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [validKeys, onAction, onDismiss]);

  // Click outside dismisses
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onDismiss();
      }
    };

    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onDismiss]);

  return (
    <div
      ref={popupRef}
      data-testid="which-key-popup"
      className="fixed bottom-10 left-1/2 -translate-x-1/2 z-50 bg-[var(--color-bg-secondary)] border border-[var(--color-border-primary)] rounded-lg shadow-xl p-3 min-w-[280px] max-w-[520px]"
    >
      <div className="text-[10px] font-medium text-[var(--color-text-muted)] uppercase tracking-wider mb-2">
        Leader
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        {actions.map(action => (
          <div
            key={action.id}
            data-testid={`which-key-item-${action.id}`}
            className="flex items-center gap-2 text-xs py-0.5"
          >
            <kbd className="inline-flex items-center justify-center min-w-[20px] px-1.5 py-0.5 text-[10px] font-mono font-bold bg-[var(--color-bg-tertiary)] rounded border border-[var(--color-border-primary)] text-[var(--color-accent-primary)]">
              {action.key}
            </kbd>
            <span className="text-[var(--color-text-secondary)] truncate">{action.description}</span>
          </div>
        ))}
      </div>
      {actions.length === 0 && (
        <div className="text-xs text-[var(--color-text-muted)] italic">No shortcuts for this zone</div>
      )}
    </div>
  );
}
