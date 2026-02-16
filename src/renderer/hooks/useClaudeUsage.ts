import { useEffect, useState, useCallback } from 'react';
import type { ClaudeUsageData } from '@shared/types/agent';

const POLL_INTERVAL_MS = 60 * 1000; // 60 seconds

/**
 * Hook to fetch and poll Claude OAuth usage data.
 * Returns usage data or null if not available (no OAuth, API error, etc.)
 * Polls every 60 seconds and on window focus.
 */
export function useClaudeUsage(): ClaudeUsageData | null {
  const [usageData, setUsageData] = useState<ClaudeUsageData | null>(null);

  const fetchUsage = useCallback(async () => {
    try {
      const data = await window.electronAPI.usage.getClaude();
      setUsageData(data);
    } catch {
      // Silent fail - hide usage indicator on error
      setUsageData(null);
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

  return usageData;
}
