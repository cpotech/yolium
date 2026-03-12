/**
 * @vitest-environment jsdom
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useClaudeUsage } from '@renderer/hooks/useClaudeUsage';
import type { ClaudeUsageData, ClaudeUsageSnapshot } from '@shared/types/agent';

const mockGetClaude = vi.fn();

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

    expect(result.current).toEqual({
      status: 'loading',
      hasOAuth: true,
      usage: null,
    });
  });

  it('should return status ready with usage data when usage:get-claude resolves with usage', async () => {
    mockGetClaude.mockResolvedValueOnce({
      hasOAuth: true,
      usage: sampleUsage,
    });

    const { result } = renderHook(() => useClaudeUsage());

    await waitFor(() => {
      expect(result.current).toEqual({
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
      expect(result.current).toEqual({
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
      expect(result.current).toEqual({
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

    expect(result.current).toEqual({
        status: 'ready',
        hasOAuth: true,
        usage: sampleUsage,
    });

    await act(async () => {
      vi.advanceTimersByTime(60_000);
      await Promise.resolve();
    });

    expect(mockGetClaude).toHaveBeenCalledTimes(2);

    expect(result.current).toEqual({
      status: 'ready',
      hasOAuth: true,
      usage: sampleUsage,
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
});
