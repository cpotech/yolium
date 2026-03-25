import { useCallback, useRef } from 'react';

export interface UseVimListNavigationOptions {
  itemCount: number;
  enabled: boolean;
  onIndexChange: (index: number) => void;
  currentIndex: number;
  wrap?: boolean;
}

export interface UseVimListNavigationResult {
  handleNavKeys: (e: KeyboardEvent | React.KeyboardEvent) => boolean;
  gPending: boolean;
}

export function useVimListNavigation({
  itemCount,
  enabled,
  onIndexChange,
  currentIndex,
  wrap = true,
}: UseVimListNavigationOptions): UseVimListNavigationResult {
  const gPendingRef = useRef(false);
  const currentIndexRef = useRef(currentIndex);
  currentIndexRef.current = currentIndex;

  const handleNavKeys = useCallback(
    (e: KeyboardEvent | React.KeyboardEvent): boolean => {
      if (!enabled || itemCount === 0) return false;

      const key = e.key;
      const idx = currentIndexRef.current;

      if (key === 'j' || key === 'ArrowDown') {
        gPendingRef.current = false;
        const next = wrap
          ? (idx + 1) % itemCount
          : Math.min(idx + 1, itemCount - 1);
        currentIndexRef.current = next;
        onIndexChange(next);
        return true;
      }

      if (key === 'k' || key === 'ArrowUp') {
        gPendingRef.current = false;
        const prev = wrap
          ? (idx - 1 + itemCount) % itemCount
          : Math.max(idx - 1, 0);
        currentIndexRef.current = prev;
        onIndexChange(prev);
        return true;
      }

      if (key === 'g') {
        if (gPendingRef.current) {
          gPendingRef.current = false;
          currentIndexRef.current = 0;
          onIndexChange(0);
          return true;
        } else {
          gPendingRef.current = true;
          return true;
        }
      }

      if (key === 'G') {
        gPendingRef.current = false;
        currentIndexRef.current = itemCount - 1;
        onIndexChange(itemCount - 1);
        return true;
      }

      // Non-nav key: reset gPending
      gPendingRef.current = false;
      return false;
    },
    [enabled, itemCount, onIndexChange, wrap],
  );

  return { handleNavKeys, gPending: gPendingRef.current };
}
