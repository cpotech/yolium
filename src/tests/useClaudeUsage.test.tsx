/**
 * @vitest-environment jsdom
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useClaudeUsage, FEEDBACK_DURATION_MS } from '@renderer/hooks/useClaudeUsage';
import type { ClaudeUsageData, ClaudeUsageSnapshot } from '@shared/types/agent';

const mockGetClaude = vi.fn();
const mockRefreshClaude = vi.fn();

const sampleUsage: ClaudeUsageData = {
  fiveHour: { utilization: 42, resetsAt: '2026-03-12T12:00:00.000Z' },
  sevenDay: { utilization: 18, resetsAt: '2026-03-18T12:00:00.000Z' },
};

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

describe('useClaudeUsage', () => {
  let visibilityState = 'visible';

  beforeEach(() => {
    vi.clearAllMocks();
    visibilityState = 'visible';

    Object.defineProperty(window, 'electronAPI', {
      value: {
        usage: {
          getClaude: mockGetClaude,
          refreshClaude: mockRefreshClaude,
        },
        events: {
          onUsageRefresh: vi.fn(() => vi.fn()),
        },
      },
      writable: true,
    });

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => visibilityState,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should expose status loading before the initial usage request resolves', () => {
    const deferred = createDeferred<ClaudeUsageSnapshot>();
    mockGetClaude.mockReturnValueOnce(deferred.promise);

    const { result } = renderHook(() => useClaudeUsage());

    expect(result.current.state).toEqual({
      status: 'loading',
      hasOAuth: true,
      usage: null,
    });
  });

  it('should return state and refresh function', async () => {
    mockGetClaude.mockResolvedValueOnce({
      hasOAuth: true,
      usage: sampleUsage,
    });

    const { result } = renderHook(() => useClaudeUsage());

    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });

    expect(typeof result.current.refresh).toBe('function');
  });

  it('should return status ready with usage data when usage:get-claude resolves with usage', async () => {
    mockGetClaude.mockResolvedValueOnce({
      hasOAuth: true,
      usage: sampleUsage,
    });

    const { result } = renderHook(() => useClaudeUsage());

    await waitFor(() => {
      expect(result.current.state).toEqual({
        status: 'ready',
        hasOAuth: true,
        usage: sampleUsage,
      });
    });
  });

  it('should return status unavailable when usage:get-claude resolves with hasOAuth true and usage null', async () => {
    mockGetClaude.mockResolvedValueOnce({
      hasOAuth: true,
      usage: null,
    });

    const { result } = renderHook(() => useClaudeUsage());

    await waitFor(() => {
      expect(result.current.state).toEqual({
        status: 'unavailable',
        hasOAuth: true,
        usage: null,
      });
    });
  });

  it('should return status no-oauth when usage:get-claude resolves with hasOAuth false', async () => {
    mockGetClaude.mockResolvedValueOnce({
      hasOAuth: false,
      usage: null,
    });

    const { result } = renderHook(() => useClaudeUsage());

    await waitFor(() => {
      expect(result.current.state).toEqual({
        status: 'no-oauth',
        hasOAuth: false,
        usage: null,
      });
    });
  });

  it('should preserve the last successful usage data when a later refresh rejects', async () => {
    vi.useFakeTimers();
    mockGetClaude
      .mockResolvedValueOnce({
        hasOAuth: true,
        usage: sampleUsage,
      })
      .mockRejectedValueOnce(new Error('network down'));

    const { result } = renderHook(() => useClaudeUsage());

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.state).toEqual({
        status: 'ready',
        hasOAuth: true,
        usage: sampleUsage,
    });

    await act(async () => {
      vi.advanceTimersByTime(60_000);
      await Promise.resolve();
    });

    expect(mockGetClaude).toHaveBeenCalledTimes(2);

    expect(result.current.state).toEqual({
      status: 'ready',
      hasOAuth: true,
      usage: sampleUsage,
    });
  });

  it('should preserve last-known-good usage when API returns null usage with hasOAuth true', async () => {
    vi.useFakeTimers();

    // First call succeeds with usage data
    mockGetClaude
      .mockResolvedValueOnce({ hasOAuth: true, usage: sampleUsage })
      // Second call returns null usage (e.g., expired token -> 401 on backend)
      .mockResolvedValueOnce({ hasOAuth: true, usage: null });

    const { result } = renderHook(() => useClaudeUsage());

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.state).toEqual({
      status: 'ready',
      hasOAuth: true,
      usage: sampleUsage,
    });

    // Advance to next poll
    await act(async () => {
      vi.advanceTimersByTime(60_000);
      await Promise.resolve();
    });

    expect(mockGetClaude).toHaveBeenCalledTimes(2);
    // Should preserve the previous usage rather than showing unavailable
    expect(result.current.state).toEqual({
      status: 'ready',
      hasOAuth: true,
      usage: sampleUsage,
    });
  });

  it('should show unavailable only when no previous ready state exists', async () => {
    // First and only call returns null usage — no previous good data to preserve
    mockGetClaude.mockResolvedValueOnce({ hasOAuth: true, usage: null });

    const { result } = renderHook(() => useClaudeUsage());

    await waitFor(() => {
      expect(result.current.state).toEqual({
        status: 'unavailable',
        hasOAuth: true,
        usage: null,
      });
    });
  });

  it('should update to new usage data when API returns valid data after stale period', async () => {
    vi.useFakeTimers();

    const updatedUsage: ClaudeUsageData = {
      fiveHour: { utilization: 80, resetsAt: '2026-03-12T18:00:00.000Z' },
      sevenDay: { utilization: 50, resetsAt: '2026-03-18T18:00:00.000Z' },
    };

    mockGetClaude
      .mockResolvedValueOnce({ hasOAuth: true, usage: sampleUsage })
      .mockResolvedValueOnce({ hasOAuth: true, usage: null }) // stale period
      .mockResolvedValueOnce({ hasOAuth: true, usage: updatedUsage }); // fresh data

    const { result } = renderHook(() => useClaudeUsage());

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.state.status === 'ready' && result.current.state.usage).toEqual(sampleUsage);

    // Advance to second poll — null usage, should preserve stale data
    await act(async () => {
      vi.advanceTimersByTime(60_000);
      await Promise.resolve();
    });

    expect(result.current.state.status === 'ready' && result.current.state.usage).toEqual(sampleUsage);

    // Advance to third poll — new valid data
    await act(async () => {
      vi.advanceTimersByTime(60_000);
      await Promise.resolve();
    });

    expect(result.current.state.status === 'ready' && result.current.state.usage).toEqual(updatedUsage);
  });

  it('should still show no-oauth when hasOAuth is false even with cached usage', async () => {
    vi.useFakeTimers();

    mockGetClaude
      .mockResolvedValueOnce({ hasOAuth: true, usage: sampleUsage })
      .mockResolvedValueOnce({ hasOAuth: false, usage: null });

    const { result } = renderHook(() => useClaudeUsage());

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.state.status).toBe('ready');

    // Advance to next poll — hasOAuth is now false (user logged out)
    await act(async () => {
      vi.advanceTimersByTime(60_000);
      await Promise.resolve();
    });

    // Should show no-oauth even though we have cached usage
    expect(result.current.state).toEqual({
      status: 'no-oauth',
      hasOAuth: false,
      usage: null,
    });
  });

  it('should refetch Claude usage when the document becomes visible again', async () => {
    mockGetClaude
      .mockResolvedValueOnce({
        hasOAuth: true,
        usage: sampleUsage,
      })
      .mockResolvedValueOnce({
        hasOAuth: true,
        usage: sampleUsage,
      });

    renderHook(() => useClaudeUsage());

    await waitFor(() => {
      expect(mockGetClaude).toHaveBeenCalledTimes(1);
    });

    visibilityState = 'hidden';
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(mockGetClaude).toHaveBeenCalledTimes(1);

    visibilityState = 'visible';
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    await waitFor(() => {
      expect(mockGetClaude).toHaveBeenCalledTimes(2);
    });
  });

  // --- New test specs for manual refresh ---

  it('should set status to loading during manual refresh', async () => {
    mockGetClaude.mockResolvedValueOnce({ hasOAuth: true, usage: sampleUsage });

    const { result } = renderHook(() => useClaudeUsage());

    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });

    // Start refresh but don't resolve yet
    const deferred = createDeferred<ClaudeUsageSnapshot>();
    mockRefreshClaude.mockReturnValueOnce(deferred.promise);

    act(() => {
      result.current.refresh();
    });

    expect(result.current.state.status).toBe('loading');

    // Resolve
    await act(async () => {
      deferred.resolve({ hasOAuth: true, usage: sampleUsage });
    });

    expect(result.current.state.status).toBe('ready');
  });

  it('should update state after successful manual refresh', async () => {
    mockGetClaude.mockResolvedValueOnce({ hasOAuth: true, usage: sampleUsage });

    const { result } = renderHook(() => useClaudeUsage());

    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });

    const updatedUsage: ClaudeUsageData = {
      fiveHour: { utilization: 80, resetsAt: '2026-02-01T00:00:00Z' },
      sevenDay: { utilization: 50, resetsAt: '2026-02-07T00:00:00Z' },
    };
    mockRefreshClaude.mockResolvedValueOnce({ hasOAuth: true, usage: updatedUsage });

    await act(async () => {
      result.current.refresh();
    });

    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
      if (result.current.state.status === 'ready') {
        expect(result.current.state.usage.fiveHour.utilization).toBe(80);
      }
    });
  });

  it('should preserve last-known-good data during failed refresh', async () => {
    mockGetClaude.mockResolvedValueOnce({ hasOAuth: true, usage: sampleUsage });

    const { result } = renderHook(() => useClaudeUsage());

    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });

    // Refresh fails (returns unavailable)
    mockRefreshClaude.mockResolvedValueOnce({ hasOAuth: true, usage: null });

    await act(async () => {
      result.current.refresh();
    });

    await waitFor(() => {
      // Should preserve last-known-good data
      expect(result.current.state.status).toBe('ready');
      if (result.current.state.status === 'ready') {
        expect(result.current.state.usage.fiveHour.utilization).toBe(42);
      }
    });
  });

  // --- refreshResult feedback tests ---

  it('should return refreshResult success when refresh resolves with valid usage data', async () => {
    vi.useFakeTimers();
    mockGetClaude.mockResolvedValueOnce({ hasOAuth: true, usage: sampleUsage });

    const { result } = renderHook(() => useClaudeUsage());

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.state.status).toBe('ready');
    expect(result.current.refreshResult).toBeNull();

    mockRefreshClaude.mockResolvedValueOnce({ hasOAuth: true, usage: sampleUsage });

    await act(async () => {
      result.current.refresh();
      await Promise.resolve();
    });

    expect(result.current.refreshResult).toBe('success');
  });

  it('should return refreshResult error when refresh resolves with null usage (API failure)', async () => {
    vi.useFakeTimers();
    mockGetClaude.mockResolvedValueOnce({ hasOAuth: true, usage: sampleUsage });

    const { result } = renderHook(() => useClaudeUsage());

    await act(async () => {
      await Promise.resolve();
    });

    mockRefreshClaude.mockResolvedValueOnce({ hasOAuth: true, usage: null });

    await act(async () => {
      result.current.refresh();
      await Promise.resolve();
    });

    expect(result.current.refreshResult).toBe('error');
  });

  it('should return refreshResult error when refresh rejects (IPC error)', async () => {
    vi.useFakeTimers();
    mockGetClaude.mockResolvedValueOnce({ hasOAuth: true, usage: sampleUsage });

    const { result } = renderHook(() => useClaudeUsage());

    await act(async () => {
      await Promise.resolve();
    });

    mockRefreshClaude.mockRejectedValueOnce(new Error('IPC error'));

    await act(async () => {
      result.current.refresh();
      await Promise.resolve();
    });

    expect(result.current.refreshResult).toBe('error');
  });

  it('should clear refreshResult back to null after FEEDBACK_DURATION_MS', async () => {
    vi.useFakeTimers();
    mockGetClaude.mockResolvedValueOnce({ hasOAuth: true, usage: sampleUsage });

    const { result } = renderHook(() => useClaudeUsage());

    await act(async () => {
      await Promise.resolve();
    });

    mockRefreshClaude.mockResolvedValueOnce({ hasOAuth: true, usage: sampleUsage });

    await act(async () => {
      result.current.refresh();
      await Promise.resolve();
    });

    expect(result.current.refreshResult).toBe('success');

    await act(async () => {
      vi.advanceTimersByTime(FEEDBACK_DURATION_MS);
    });

    expect(result.current.refreshResult).toBeNull();
  });

  it('should not clear refreshResult if a new refresh starts before timeout expires', async () => {
    vi.useFakeTimers();
    mockGetClaude.mockResolvedValueOnce({ hasOAuth: true, usage: sampleUsage });

    const { result } = renderHook(() => useClaudeUsage());

    await act(async () => {
      await Promise.resolve();
    });

    // First refresh succeeds
    mockRefreshClaude.mockResolvedValueOnce({ hasOAuth: true, usage: sampleUsage });

    await act(async () => {
      result.current.refresh();
      await Promise.resolve();
    });

    expect(result.current.refreshResult).toBe('success');

    // Advance partway through the timeout
    await act(async () => {
      vi.advanceTimersByTime(FEEDBACK_DURATION_MS / 2);
    });

    // Second refresh fails before first timeout clears
    mockRefreshClaude.mockResolvedValueOnce({ hasOAuth: true, usage: null });

    await act(async () => {
      result.current.refresh();
      await Promise.resolve();
    });

    expect(result.current.refreshResult).toBe('error');

    // Advance past original timeout — should NOT have cleared to null
    await act(async () => {
      vi.advanceTimersByTime(FEEDBACK_DURATION_MS / 2 + 100);
    });

    // Still 'error' because the second refresh reset the timer
    expect(result.current.refreshResult).toBe('error');

    // Advance remaining time for second timer
    await act(async () => {
      vi.advanceTimersByTime(FEEDBACK_DURATION_MS);
    });

    expect(result.current.refreshResult).toBeNull();
  });

  it('should preserve last-known-good usage on failed refresh (existing behavior still works)', async () => {
    vi.useFakeTimers();
    mockGetClaude.mockResolvedValueOnce({ hasOAuth: true, usage: sampleUsage });

    const { result } = renderHook(() => useClaudeUsage());

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.state.status).toBe('ready');

    // Refresh returns null usage
    mockRefreshClaude.mockResolvedValueOnce({ hasOAuth: true, usage: null });

    await act(async () => {
      result.current.refresh();
      await Promise.resolve();
    });

    // State should still show ready with old data
    expect(result.current.state.status).toBe('ready');
    if (result.current.state.status === 'ready') {
      expect(result.current.state.usage).toEqual(sampleUsage);
    }
    // But refreshResult should indicate error
    expect(result.current.refreshResult).toBe('error');
  });

  it('should poll automatically every 60 seconds', async () => {
    vi.useFakeTimers();

    mockGetClaude
      .mockResolvedValueOnce({ hasOAuth: true, usage: sampleUsage })
      .mockResolvedValueOnce({ hasOAuth: true, usage: sampleUsage })
      .mockResolvedValueOnce({ hasOAuth: true, usage: sampleUsage });

    renderHook(() => useClaudeUsage());

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockGetClaude).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(60_000);
      await Promise.resolve();
    });

    expect(mockGetClaude).toHaveBeenCalledTimes(2);

    await act(async () => {
      vi.advanceTimersByTime(60_000);
      await Promise.resolve();
    });

    expect(mockGetClaude).toHaveBeenCalledTimes(3);
  });
});
