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

/**
 * Hook to fetch and poll Claude OAuth usage data.
 * Polls every 60 seconds and on window focus.
 */
export function useClaudeUsage(): ClaudeUsageState {
  const [state, setState] = useState<ClaudeUsageState>(INITIAL_STATE);
  const lastReadyUsageRef = useRef<ClaudeUsageData | null>(null);

  const fetchUsage = useCallback(async () => {
    try {
      const snapshot = await window.electronAPI.usage.getClaude();
      if (snapshot.usage) {
        lastReadyUsageRef.current = snapshot.usage;
      }
      setState(toClaudeUsageState(snapshot));
    } catch {
      setState(() => {
        if (lastReadyUsageRef.current) {
          return { status: 'ready', hasOAuth: true, usage: lastReadyUsageRef.current };
        }

        return { status: 'unavailable', hasOAuth: true, usage: null };
      });
    }
  }, []);

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

  return state;
}
