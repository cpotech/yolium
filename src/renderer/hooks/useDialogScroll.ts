/**
 * @module src/renderer/hooks/useDialogScroll
 * Hook for vim-style j/k scroll in dialogs.
 */

import { useCallback } from 'react';
import { useVimModeContext } from '@renderer/context/VimModeContext';

const DEFAULT_SCROLL_AMOUNT = 48;

export interface UseDialogScrollOptions {
  scrollAmount?: number;
}

export function useDialogScroll(
  containerRef: React.RefObject<HTMLElement | null>,
  options: UseDialogScrollOptions = {}
) {
  const { scrollAmount = DEFAULT_SCROLL_AMOUNT } = options;
  const { mode } = useVimModeContext();

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (mode === 'INSERT') return;
      if (!containerRef.current) return;

      const key = e.key;
      if (key === 'j') {
        e.preventDefault();
        containerRef.current.scrollBy({ top: scrollAmount, behavior: 'smooth' });
      } else if (key === 'k') {
        e.preventDefault();
        containerRef.current.scrollBy({ top: -scrollAmount, behavior: 'smooth' });
      }
    },
    [mode, scrollAmount, containerRef]
  );

  return { handleKeyDown };
}
