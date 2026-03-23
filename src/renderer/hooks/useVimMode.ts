/**
 * @module src/hooks/useVimMode
 * Core modal state machine for vim-style TUI navigation.
 * Manages NORMAL/INSERT modes, zone tracking, leader-key state, and keydown handling.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type { VimActionZone } from '@shared/vim-actions';

export type VimMode = 'NORMAL' | 'INSERT' | 'VISUAL';
export type VimZone = 'sidebar' | 'tabs' | 'content' | 'status-bar' | 'schedule';

const ZONE_KEYS: Record<string, VimZone> = {
  e: 'sidebar',
  t: 'tabs',
  c: 'content',
  s: 'status-bar',
  a: 'schedule',
};

const LEADER_TIMEOUT_MS = 2000;

export interface UseVimModeOptions {
  /** When true, vim navigation is suspended (keys pass through) */
  dialogOpen?: boolean;
  /** Called when the active zone changes */
  onZoneChange?: (zone: VimZone) => void;
  /** Whether the active tab is a terminal (auto-INSERT) */
  isTerminalActive?: boolean;
  /** Called when 'b' is pressed to navigate to kanban board */
  onGoToKanban?: () => void;
  /** Called when '?' is pressed to show keyboard shortcuts dialog */
  onShowShortcuts?: () => void;
}

export interface UseVimModeResult {
  mode: VimMode;
  activeZone: VimZone;
  handleKeyDown: (event: KeyboardEvent) => void;
  setActiveZone: (zone: VimZone) => void;
  enterInsertMode: () => void;
  enterVisualMode: () => void;
  exitToNormal: () => void;
  /** Whether the leader key (Space) has been pressed and is awaiting a follow-up key */
  leaderPending: boolean;
  /** The zone that was active when leader was triggered (may be a dialog zone) */
  leaderZone: VimActionZone | null;
  /** Clear leader state (dismiss which-key popup) */
  clearLeader: () => void;
  /** Trigger leader mode for an arbitrary zone (used by dialogs to bypass dialogOpen guard) */
  triggerLeader: (zone: VimActionZone) => void;
}

export function useVimMode(options: UseVimModeOptions = {}): UseVimModeResult {
  const { dialogOpen = false, onZoneChange, isTerminalActive = false, onGoToKanban, onShowShortcuts } = options;
  const [mode, setMode] = useState<VimMode>('NORMAL');
  const [activeZone, setActiveZoneState] = useState<VimZone>('content');
  const [leaderPending, setLeaderPending] = useState(false);
  const [leaderZone, setLeaderZone] = useState<VimActionZone | null>(null);
  const onZoneChangeRef = useRef(onZoneChange);
  onZoneChangeRef.current = onZoneChange;
  const onGoToKanbanRef = useRef(onGoToKanban);
  onGoToKanbanRef.current = onGoToKanban;
  const onShowShortcutsRef = useRef(onShowShortcuts);
  onShowShortcutsRef.current = onShowShortcuts;
  const leaderTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearLeader = useCallback(() => {
    setLeaderPending(false);
    setLeaderZone(null);
    if (leaderTimeoutRef.current) {
      clearTimeout(leaderTimeoutRef.current);
      leaderTimeoutRef.current = null;
    }
  }, []);

  const triggerLeader = useCallback((zone: VimActionZone) => {
    if (leaderPending) {
      clearLeader();
    } else {
      setLeaderPending(true);
      setLeaderZone(zone);
    }
  }, [leaderPending, clearLeader]);

  // Auto-clear leader after timeout
  useEffect(() => {
    if (leaderPending) {
      leaderTimeoutRef.current = setTimeout(() => {
        setLeaderPending(false);
        setLeaderZone(null);
        leaderTimeoutRef.current = null;
      }, LEADER_TIMEOUT_MS);
      return () => {
        if (leaderTimeoutRef.current) {
          clearTimeout(leaderTimeoutRef.current);
          leaderTimeoutRef.current = null;
        }
      };
    }
  }, [leaderPending]);

  const setActiveZone = useCallback((zone: VimZone) => {
    setActiveZoneState(zone);
    onZoneChangeRef.current?.(zone);
  }, []);

  const enterInsertMode = useCallback(() => {
    setMode('INSERT');
  }, []);

  const enterVisualMode = useCallback(() => {
    setMode('VISUAL');
  }, []);

  const exitToNormal = useCallback(() => {
    setMode('NORMAL');
  }, []);

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // Don't intercept keys with Ctrl/Meta modifiers (let existing shortcuts work)
    if (event.ctrlKey || event.metaKey || event.altKey) {
      // Exception: Ctrl+[ exits to NORMAL (vim escape equivalent)
      if (event.ctrlKey && event.key === '[') {
        event.preventDefault();
        setMode('NORMAL');
      }
      return;
    }

    // In INSERT mode, only Escape exits — always allowed, even when dialog open
    if (mode === 'INSERT') {
      if (event.key === 'Escape') {
        event.preventDefault();
        setMode('NORMAL');
      }
      return;
    }

    // VISUAL mode key handling
    if (mode === 'VISUAL') {
      const key = event.key;

      if (key === 'Escape') {
        event.preventDefault();
        setMode('NORMAL');
        return;
      }
      if (key === 'v') {
        event.preventDefault();
        setMode('NORMAL');
        return;
      }
      if (key === 'i') {
        event.preventDefault();
        setMode('INSERT');
        return;
      }
      // Zone keys exit visual and switch zone
      if (key in ZONE_KEYS) {
        event.preventDefault();
        setMode('NORMAL');
        setActiveZone(ZONE_KEYS[key]);
        return;
      }
      // All other keys (j, k, h, l, g, G, Enter, Delete, etc.) pass through
      // to the component's own keyDown handler
      return;
    }

    // NORMAL mode key handling
    const key = event.key;

    // Mode switching — always allowed, even when dialog open
    if (key === 'i') {
      event.preventDefault();
      setMode('INSERT');
      return;
    }

    // Block zone switching and Tab cycling when dialogs are open
    if (dialogOpen) return;

    // Leader key (Space) — toggle leader state
    if (key === ' ') {
      event.preventDefault();
      if (leaderPending) {
        // Toggle off
        clearLeader();
      } else {
        setLeaderPending(true);
        setLeaderZone(activeZone);
      }
      return;
    }

    // Show keyboard shortcuts dialog (?)
    if (key === '?') {
      event.preventDefault();
      onShowShortcutsRef.current?.();
      return;
    }

    // Enter visual mode with v
    if (key === 'v') {
      event.preventDefault();
      setMode('VISUAL');
      return;
    }

    // Zone switching with single keys
    if (key in ZONE_KEYS) {
      event.preventDefault();
      const zone = ZONE_KEYS[key];
      setActiveZone(zone);
      return;
    }

    // Go to kanban board
    if (key === 'b') {
      event.preventDefault();
      onGoToKanbanRef.current?.();
      setActiveZone('content');
      return;
    }

  }, [dialogOpen, mode, activeZone, setActiveZone, leaderPending, clearLeader]);

  return {
    mode,
    activeZone,
    handleKeyDown,
    setActiveZone,
    enterInsertMode,
    enterVisualMode,
    exitToNormal,
    leaderPending,
    leaderZone,
    clearLeader,
    triggerLeader,
  };
}
