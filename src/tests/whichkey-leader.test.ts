/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useVimMode } from '@renderer/hooks/useVimMode';

describe('WhichKey leader zone assignment', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should set leaderZone to current activeZone when Space is pressed (not hardcoded sidebar)', () => {
    const { result } = renderHook(() => useVimMode());

    // Default activeZone is 'content'
    expect(result.current.activeZone).toBe('content');

    // Press Space
    act(() => {
      result.current.handleKeyDown(new KeyboardEvent('keydown', { key: ' ' }));
    });

    expect(result.current.leaderPending).toBe(true);
    expect(result.current.leaderZone).toBe('content');
  });

  it('should set leaderZone to "content" when Space is pressed while activeZone is "content"', () => {
    const { result } = renderHook(() => useVimMode());

    act(() => {
      result.current.setActiveZone('content');
    });

    act(() => {
      result.current.handleKeyDown(new KeyboardEvent('keydown', { key: ' ' }));
    });

    expect(result.current.leaderZone).toBe('content');
  });

  it('should set leaderZone to "tabs" when Space is pressed while activeZone is "tabs"', () => {
    const { result } = renderHook(() => useVimMode());

    act(() => {
      result.current.setActiveZone('tabs');
    });

    act(() => {
      result.current.handleKeyDown(new KeyboardEvent('keydown', { key: ' ' }));
    });

    expect(result.current.leaderZone).toBe('tabs');
  });

  it('should set leaderZone to "schedule" when Space is pressed while activeZone is "schedule"', () => {
    const { result } = renderHook(() => useVimMode());

    act(() => {
      result.current.setActiveZone('schedule');
    });

    act(() => {
      result.current.handleKeyDown(new KeyboardEvent('keydown', { key: ' ' }));
    });

    expect(result.current.leaderZone).toBe('schedule');
  });

  it('should set leaderZone to "status-bar" when Space is pressed while activeZone is "status-bar"', () => {
    const { result } = renderHook(() => useVimMode());

    act(() => {
      result.current.setActiveZone('status-bar');
    });

    act(() => {
      result.current.handleKeyDown(new KeyboardEvent('keydown', { key: ' ' }));
    });

    expect(result.current.leaderZone).toBe('status-bar');
  });

  it('should toggle leaderPending off when Space is pressed while leaderPending is true', () => {
    const { result } = renderHook(() => useVimMode());

    // First Space: leader on
    act(() => {
      result.current.handleKeyDown(new KeyboardEvent('keydown', { key: ' ' }));
    });
    expect(result.current.leaderPending).toBe(true);

    // Second Space: leader off
    act(() => {
      result.current.handleKeyDown(new KeyboardEvent('keydown', { key: ' ' }));
    });
    expect(result.current.leaderPending).toBe(false);
    expect(result.current.leaderZone).toBeNull();
  });

  it('should auto-clear leader state after LEADER_TIMEOUT_MS', () => {
    const { result } = renderHook(() => useVimMode());

    act(() => {
      result.current.handleKeyDown(new KeyboardEvent('keydown', { key: ' ' }));
    });
    expect(result.current.leaderPending).toBe(true);

    // Advance time past timeout (2000ms)
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(result.current.leaderPending).toBe(false);
    expect(result.current.leaderZone).toBeNull();
  });
});
