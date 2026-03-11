import { useEffect, useState, useCallback } from 'react';
import type { ClaudeUsageState } from '@shared/types/agent';

const POLL_INTERVAL_MS = 60 * 1000; // 60 seconds

const DEFAULT_STATE: ClaudeUsageState = { hasOAuth: false, usage: null };

/**
 * Hook to fetch and poll Claude OAuth usage data.
 * Returns { hasOAuth, usage } - always meaningful state:
 * either "no OAuth" or "has OAuth with/without usage data".
 * Polls every 60 seconds and on window focus.
 */
export function useClaudeUsage(): ClaudeUsageState {
  const [state, setState] = useState<ClaudeUsageState>(DEFAULT_STATE);

  const fetchUsage = useCallback(async () => {
    try {
      const data = await window.electronAPI.usage.getClaude();
      setState(data);
    } catch {
      // Silent fail - reset to default on error
      setState(DEFAULT_STATE);
    }
  }, []);

  useEffect(() => {
    // Initial fetch
    fetchUsage();

    // Set up polling interval
    const interval = setInterval(fetchUsage, POLL_INTERVAL_MS);

    // Refetch on window focus
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchUsage();
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
