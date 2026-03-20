import { useEffect, useState, useCallback, useRef } from 'react';
import type { ClaudeUsageData, ClaudeUsageSnapshot, ClaudeUsageState } from '@shared/types/agent';

const POLL_INTERVAL_MS = 60 * 1000; // 60 seconds

const INITIAL_STATE: ClaudeUsageState = { status: 'loading', hasOAuth: true, usage: null };

function toClaudeUsageState(snapshot: ClaudeUsageSnapshot): ClaudeUsageState {
  if (!snapshot.hasOAuth) {
    return { status: 'no-oauth', hasOAuth: false, usage: null };
  }

  if (snapshot.usage) {
    return { status: 'ready', hasOAuth: true, usage: snapshot.usage };
  }

  return { status: 'unavailable', hasOAuth: true, usage: null };
}

export interface UseClaudeUsageResult {
  state: ClaudeUsageState;
  refresh: () => void;
}

/**
 * Hook to fetch and poll Claude OAuth usage data.
 * Polls every 60 seconds and on window focus.
 * Returns { state, refresh } where refresh triggers a manual refresh with retries.
 */
export function useClaudeUsage(): UseClaudeUsageResult {
  const [state, setState] = useState<ClaudeUsageState>(INITIAL_STATE);
  const lastReadyUsageRef = useRef<ClaudeUsageData | null>(null);

  const applySnapshot = useCallback((snapshot: ClaudeUsageSnapshot) => {
    if (snapshot.usage) {
      lastReadyUsageRef.current = snapshot.usage;
    }
    const newState = toClaudeUsageState(snapshot);
    // Preserve last-known-good usage on transient unavailable (e.g., expired token -> 401)
    if (newState.status === 'unavailable' && lastReadyUsageRef.current) {
      setState({ status: 'ready', hasOAuth: true, usage: lastReadyUsageRef.current });
    } else {
      setState(newState);
    }
  }, []);

  const fetchUsage = useCallback(async () => {
    try {
      const snapshot = await window.electronAPI.usage.getClaude();
      applySnapshot(snapshot);
    } catch {
      if (lastReadyUsageRef.current) {
        setState({ status: 'ready', hasOAuth: true, usage: lastReadyUsageRef.current });
      } else {
        setState({ status: 'unavailable', hasOAuth: true, usage: null });
      }
    }
  }, [applySnapshot]);

  const refresh = useCallback(() => {
    setState(prev => {
      // Keep last-known-good data while showing loading
      if (prev.status === 'ready') {
        return { status: 'loading', hasOAuth: true, usage: null };
      }
      return { status: 'loading', hasOAuth: true, usage: null };
    });

    window.electronAPI.usage.refreshClaude().then(
      (snapshot) => applySnapshot(snapshot),
      () => {
        if (lastReadyUsageRef.current) {
          setState({ status: 'ready', hasOAuth: true, usage: lastReadyUsageRef.current });
        } else {
          setState({ status: 'unavailable', hasOAuth: true, usage: null });
        }
      },
    );
  }, [applySnapshot]);

  useEffect(() => {
    void fetchUsage();

    const interval = setInterval(() => {
      void fetchUsage();
    }, POLL_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void fetchUsage();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchUsage]);

  return { state, refresh };
}
