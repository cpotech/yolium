/**
 * @module src/context/VimModeContext
 * React context provider for vim-style modal navigation.
 * Wraps the app and provides mode/zone state to all children.
 */

import React, { createContext, useContext, useEffect } from 'react';
import { useVimMode, type VimMode, type VimZone, type UseVimModeOptions } from '@renderer/hooks/useVimMode';

interface VimModeContextValue {
  mode: VimMode;
  activeZone: VimZone;
  setActiveZone: (zone: VimZone) => void;
  enterInsertMode: () => void;
  exitToNormal: () => void;
}

const VimModeContext = createContext<VimModeContextValue | null>(null);

interface VimModeProviderProps {
  children: React.ReactNode;
  dialogOpen?: boolean;
  isTerminalActive?: boolean;
  onZoneChange?: UseVimModeOptions['onZoneChange'];
}

export function VimModeProvider({
  children,
  dialogOpen = false,
  isTerminalActive = false,
  onZoneChange,
}: VimModeProviderProps): React.ReactElement {
  const vim = useVimMode({ dialogOpen, isTerminalActive, onZoneChange });

  // Attach global keydown listener
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't intercept keys when focus is on an input/textarea/select
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        // Still allow Escape to exit to NORMAL from any element
        if (e.key === 'Escape' && vim.mode === 'INSERT') {
          vim.handleKeyDown(e);
        }
        return;
      }
      vim.handleKeyDown(e);
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [vim]);

  return (
    <VimModeContext.Provider
      value={{
        mode: vim.mode,
        activeZone: vim.activeZone,
        setActiveZone: vim.setActiveZone,
        enterInsertMode: vim.enterInsertMode,
        exitToNormal: vim.exitToNormal,
      }}
    >
      {children}
    </VimModeContext.Provider>
  );
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
      exitToNormal: () => {},
    };
  }
  return context;
}
