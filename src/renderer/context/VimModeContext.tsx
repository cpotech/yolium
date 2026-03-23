/**
 * @module src/context/VimModeContext
 * React context provider for vim-style modal navigation.
 * Wraps the app and provides mode/zone state to all children.
 */

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useVimMode, type VimMode, type VimZone, type UseVimModeOptions } from '@renderer/hooks/useVimMode';
import type { VimActionZone } from '@shared/vim-actions';

interface VimModeContextValue {
  mode: VimMode;
  activeZone: VimZone;
  setActiveZone: (zone: VimZone) => void;
  enterInsertMode: () => void;
  enterVisualMode: () => void;
  exitToNormal: () => void;
  suspendNavigation: () => () => void;
  /** Whether the leader key (Space) has been pressed and is awaiting a follow-up key */
  leaderPending: boolean;
  /** The zone that was active when leader was triggered (may be a dialog zone) */
  leaderZone: VimActionZone | null;
  /** Clear leader state (dismiss which-key popup) */
  clearLeader: () => void;
  /** Trigger leader mode for an arbitrary zone (used by dialogs to bypass dialogOpen guard) */
  triggerLeader: (zone: VimActionZone) => void;
}

const VimModeContext = createContext<VimModeContextValue | null>(null);
const noopRelease = () => {};

interface VimModeProviderProps {
  children: React.ReactNode;
  dialogOpen?: boolean;
  isTerminalActive?: boolean;
  onZoneChange?: UseVimModeOptions['onZoneChange'];
  onGoToKanban?: UseVimModeOptions['onGoToKanban'];
  onShowShortcuts?: UseVimModeOptions['onShowShortcuts'];
}

export function VimModeProvider({
  children,
  dialogOpen = false,
  isTerminalActive = false,
  onZoneChange,
  onGoToKanban,
  onShowShortcuts,
}: VimModeProviderProps): React.ReactElement {
  const [dialogSuspensionCount, setDialogSuspensionCount] = useState(0);
  const nextSuspensionIdRef = useRef(0);
  const suspensionIdsRef = useRef<Set<number>>(new Set());

  const suspendNavigation = useCallback(() => {
    const suspensionId = nextSuspensionIdRef.current++;
    suspensionIdsRef.current.add(suspensionId);
    setDialogSuspensionCount(suspensionIdsRef.current.size);

    return () => {
      if (!suspensionIdsRef.current.delete(suspensionId)) {
        return;
      }
      setDialogSuspensionCount(suspensionIdsRef.current.size);
    };
  }, []);

  const effectiveDialogOpen = dialogOpen || dialogSuspensionCount > 0;
  const vim = useVimMode({ dialogOpen: effectiveDialogOpen, isTerminalActive, onZoneChange, onGoToKanban, onShowShortcuts });

  // Stable ref for the handler so we register the listener once
  const vimRef = useRef(vim);
  vimRef.current = vim;

  // Attach global keydown listener once (ref-based to avoid re-registration)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const v = vimRef.current;
      // If a zone-specific handler already processed this key, don't override
      if (e.defaultPrevented) return;
      // Don't intercept keys when focus is on an input/textarea/select
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        // Still allow Escape to exit to NORMAL from any element
        if (e.key === 'Escape' && v.mode === 'INSERT') {
          v.handleKeyDown(e);
        }
        return;
      }
      v.handleKeyDown(e);
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  return (
    <VimModeContext.Provider
      value={{
        mode: vim.mode,
        activeZone: vim.activeZone,
        setActiveZone: vim.setActiveZone,
        enterInsertMode: vim.enterInsertMode,
        enterVisualMode: vim.enterVisualMode,
        exitToNormal: vim.exitToNormal,
        suspendNavigation,
        leaderPending: vim.leaderPending,
        leaderZone: vim.leaderZone,
        clearLeader: vim.clearLeader,
        triggerLeader: vim.triggerLeader,
      }}
    >
      {children}
    </VimModeContext.Provider>
  );
}

export function useSuspendVimNavigation(isActive: boolean): void {
  const suspendNavigation = useContext(VimModeContext)?.suspendNavigation;

  useEffect(() => {
    if (!isActive || !suspendNavigation) {
      return;
    }

    return suspendNavigation();
  }, [isActive, suspendNavigation]);
}

export function useVimModeContext(): VimModeContextValue {
  const context = useContext(VimModeContext);
  if (!context) {
    // Return a no-op fallback when used outside provider (e.g., in tests or without vim mode)
    return {
      mode: 'NORMAL',
      activeZone: 'content',
      setActiveZone: () => {},
      enterInsertMode: () => {},
      enterVisualMode: () => {},
      exitToNormal: () => {},
      suspendNavigation: () => noopRelease,
      leaderPending: false,
      leaderZone: null,
      clearLeader: () => {},
      triggerLeader: () => {},
    };
  }
  return context;
}
