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

  const handleNavKeys = useCallback(
    (e: KeyboardEvent | React.KeyboardEvent): boolean => {
      if (!enabled || itemCount === 0) return false;

      const key = e.key;

      if (key === 'j' || key === 'ArrowDown') {
        gPendingRef.current = false;
        const next = wrap
          ? (currentIndex + 1) % itemCount
          : Math.min(currentIndex + 1, itemCount - 1);
        onIndexChange(next);
        return true;
      }

      if (key === 'k' || key === 'ArrowUp') {
        gPendingRef.current = false;
        const prev = wrap
          ? (currentIndex - 1 + itemCount) % itemCount
          : Math.max(currentIndex - 1, 0);
        onIndexChange(prev);
        return true;
      }

      if (key === 'g') {
        if (gPendingRef.current) {
          gPendingRef.current = false;
          onIndexChange(0);
          return true;
        } else {
          gPendingRef.current = true;
          return true;
        }
      }

      if (key === 'G') {
        gPendingRef.current = false;
        onIndexChange(itemCount - 1);
        return true;
      }

      // Non-nav key: reset gPending
      gPendingRef.current = false;
      return false;
    },
    [enabled, itemCount, currentIndex, onIndexChange, wrap],
  );

  return { handleNavKeys, gPending: gPendingRef.current };
}
