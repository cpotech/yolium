/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useVimMode } from '@renderer/hooks/useVimMode';

describe('useVimMode', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should start in NORMAL mode by default', () => {
    const { result } = renderHook(() => useVimMode());
    expect(result.current.mode).toBe('NORMAL');
  });

  it('should transition to INSERT mode when i is pressed in NORMAL mode', () => {
    const { result } = renderHook(() => useVimMode());

    act(() => {
      const event = new KeyboardEvent('keydown', { key: 'i' });
      result.current.handleKeyDown(event);
    });

    expect(result.current.mode).toBe('INSERT');
  });

  it('should transition back to NORMAL mode when Escape is pressed in INSERT mode', () => {
    const { result } = renderHook(() => useVimMode());

    // Enter INSERT mode
    act(() => {
      const event = new KeyboardEvent('keydown', { key: 'i' });
      result.current.handleKeyDown(event);
    });
    expect(result.current.mode).toBe('INSERT');

    // Press Escape to return to NORMAL
    act(() => {
      const event = new KeyboardEvent('keydown', { key: 'Escape' });
      result.current.handleKeyDown(event);
    });
    expect(result.current.mode).toBe('NORMAL');
  });

  it('should not process vim keys when a dialog is open', () => {
    const { result } = renderHook(() => useVimMode({ dialogOpen: true }));

    act(() => {
      const event = new KeyboardEvent('keydown', { key: 'e' });
      result.current.handleKeyDown(event);
    });

    // Should remain on default zone, not switch to sidebar
    expect(result.current.activeZone).toBe('content');
  });

  it('should focus sidebar zone when e is pressed in NORMAL mode', () => {
    const { result } = renderHook(() => useVimMode());

    act(() => {
      const event = new KeyboardEvent('keydown', { key: 'e' });
      result.current.handleKeyDown(event);
    });

    expect(result.current.activeZone).toBe('sidebar');
  });

  it('should focus status-bar zone when s is pressed in NORMAL mode', () => {
    const { result } = renderHook(() => useVimMode());

    act(() => {
      const event = new KeyboardEvent('keydown', { key: 's' });
      result.current.handleKeyDown(event);
    });

    expect(result.current.activeZone).toBe('status-bar');
  });

  it('should focus tabs zone when t is pressed in NORMAL mode', () => {
    const { result } = renderHook(() => useVimMode());

    act(() => {
      const event = new KeyboardEvent('keydown', { key: 't' });
      result.current.handleKeyDown(event);
    });

    expect(result.current.activeZone).toBe('tabs');
  });

  it('should focus content zone when c is pressed in NORMAL mode', () => {
    const { result } = renderHook(() => useVimMode());

    // First switch away from content
    act(() => {
      const event = new KeyboardEvent('keydown', { key: 'e' });
      result.current.handleKeyDown(event);
    });
    expect(result.current.activeZone).toBe('sidebar');

    // Now switch to content
    act(() => {
      const event = new KeyboardEvent('keydown', { key: 'c' });
      result.current.handleKeyDown(event);
    });
    expect(result.current.activeZone).toBe('content');
  });

  it('should cycle zones with Tab in NORMAL mode', () => {
    const { result } = renderHook(() => useVimMode());
    // Default is 'content'

    act(() => {
      const event = new KeyboardEvent('keydown', { key: 'Tab' });
      result.current.handleKeyDown(event);
    });
    expect(result.current.activeZone).toBe('status-bar');

    act(() => {
      const event = new KeyboardEvent('keydown', { key: 'Tab' });
      result.current.handleKeyDown(event);
    });
    expect(result.current.activeZone).toBe('schedule');
  });

  it('should reverse-cycle zones with Shift+Tab in NORMAL mode', () => {
    const { result } = renderHook(() => useVimMode());
    // Default is 'content'

    act(() => {
      const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true });
      result.current.handleKeyDown(event);
    });
    expect(result.current.activeZone).toBe('tabs');
  });

  it('should not change zone when already in INSERT mode', () => {
    const { result } = renderHook(() => useVimMode());

    // Enter INSERT mode
    act(() => {
      const event = new KeyboardEvent('keydown', { key: 'i' });
      result.current.handleKeyDown(event);
    });
    expect(result.current.mode).toBe('INSERT');

    // Try zone switch - should not work
    act(() => {
      const event = new KeyboardEvent('keydown', { key: 'e' });
      result.current.handleKeyDown(event);
    });
    expect(result.current.activeZone).toBe('content');
  });

  it('should expose current mode and active zone from the hook return value', () => {
    const { result } = renderHook(() => useVimMode());

    expect(result.current).toHaveProperty('mode');
    expect(result.current).toHaveProperty('activeZone');
    expect(result.current).toHaveProperty('handleKeyDown');
    expect(result.current).toHaveProperty('setActiveZone');
    expect(typeof result.current.mode).toBe('string');
    expect(typeof result.current.activeZone).toBe('string');
  });

  it('should call onZoneChange callback when zone changes', () => {
    const onZoneChange = vi.fn();
    const { result } = renderHook(() => useVimMode({ onZoneChange }));

    act(() => {
      const event = new KeyboardEvent('keydown', { key: 'e' });
      result.current.handleKeyDown(event);
    });

    expect(onZoneChange).toHaveBeenCalledWith('sidebar');
  });

  it('should call onGoToKanban when b is pressed in NORMAL mode', () => {
    const onGoToKanban = vi.fn();
    const { result } = renderHook(() => useVimMode({ onGoToKanban }));

    act(() => {
      const event = new KeyboardEvent('keydown', { key: 'b' });
      result.current.handleKeyDown(event);
    });

    expect(onGoToKanban).toHaveBeenCalledTimes(1);
  });

  it('should not call onGoToKanban when b is pressed in INSERT mode', () => {
    const onGoToKanban = vi.fn();
    const { result } = renderHook(() => useVimMode({ onGoToKanban }));

    // Enter INSERT mode
    act(() => {
      const event = new KeyboardEvent('keydown', { key: 'i' });
      result.current.handleKeyDown(event);
    });
    expect(result.current.mode).toBe('INSERT');

    // Press b - should not trigger
    act(() => {
      const event = new KeyboardEvent('keydown', { key: 'b' });
      result.current.handleKeyDown(event);
    });

    expect(onGoToKanban).not.toHaveBeenCalled();
  });

  it('should not call onGoToKanban when b is pressed with dialog open', () => {
    const onGoToKanban = vi.fn();
    const { result } = renderHook(() => useVimMode({ onGoToKanban, dialogOpen: true }));

    act(() => {
      const event = new KeyboardEvent('keydown', { key: 'b' });
      result.current.handleKeyDown(event);
    });

    expect(onGoToKanban).not.toHaveBeenCalled();
  });

  it('should not call onGoToKanban when b is pressed with Ctrl modifier', () => {
    const onGoToKanban = vi.fn();
    const { result } = renderHook(() => useVimMode({ onGoToKanban }));

    act(() => {
      const event = new KeyboardEvent('keydown', { key: 'b', ctrlKey: true });
      result.current.handleKeyDown(event);
    });

    expect(onGoToKanban).not.toHaveBeenCalled();
  });

  // --- Leader-key state machine tests ---

  it('should set leaderPending=true when Space pressed in NORMAL mode', () => {
    const { result } = renderHook(() => useVimMode());

    act(() => {
      const event = new KeyboardEvent('keydown', { key: ' ' });
      result.current.handleKeyDown(event);
    });

    expect(result.current.leaderPending).toBe(true);
  });

  it('should store leaderZone as current activeZone when entering leader', () => {
    const { result } = renderHook(() => useVimMode());

    // Switch to sidebar first
    act(() => {
      const event = new KeyboardEvent('keydown', { key: 'e' });
      result.current.handleKeyDown(event);
    });
    expect(result.current.activeZone).toBe('sidebar');

    // Press Space to enter leader
    act(() => {
      const event = new KeyboardEvent('keydown', { key: ' ' });
      result.current.handleKeyDown(event);
    });

    expect(result.current.leaderPending).toBe(true);
    expect(result.current.leaderZone).toBe('sidebar');
  });

  it('should clear leader state when clearLeader is called', () => {
    const { result } = renderHook(() => useVimMode());

    // Enter leader
    act(() => {
      const event = new KeyboardEvent('keydown', { key: ' ' });
      result.current.handleKeyDown(event);
    });
    expect(result.current.leaderPending).toBe(true);

    // Clear leader
    act(() => {
      result.current.clearLeader();
    });

    expect(result.current.leaderPending).toBe(false);
    expect(result.current.leaderZone).toBeNull();
  });

  it('should auto-clear leader state after timeout (2s)', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useVimMode());

    // Enter leader
    act(() => {
      const event = new KeyboardEvent('keydown', { key: ' ' });
      result.current.handleKeyDown(event);
    });
    expect(result.current.leaderPending).toBe(true);

    // Advance timer past 2s
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(result.current.leaderPending).toBe(false);
    expect(result.current.leaderZone).toBeNull();

    vi.useRealTimers();
  });

  it('should not enter leader when dialogOpen is true', () => {
    const { result } = renderHook(() => useVimMode({ dialogOpen: true }));

    act(() => {
      const event = new KeyboardEvent('keydown', { key: ' ' });
      result.current.handleKeyDown(event);
    });

    expect(result.current.leaderPending).toBe(false);
  });

  it('should not enter leader in INSERT mode', () => {
    const { result } = renderHook(() => useVimMode());

    // Enter INSERT mode
    act(() => {
      const event = new KeyboardEvent('keydown', { key: 'i' });
      result.current.handleKeyDown(event);
    });
    expect(result.current.mode).toBe('INSERT');

    // Press Space - should not trigger leader
    act(() => {
      const event = new KeyboardEvent('keydown', { key: ' ' });
      result.current.handleKeyDown(event);
    });

    expect(result.current.leaderPending).toBe(false);
  });

  it('should toggle leader off when Space pressed while leaderPending', () => {
    const { result } = renderHook(() => useVimMode());

    // Enter leader
    act(() => {
      const event = new KeyboardEvent('keydown', { key: ' ' });
      result.current.handleKeyDown(event);
    });
    expect(result.current.leaderPending).toBe(true);

    // Press Space again to toggle off
    act(() => {
      const event = new KeyboardEvent('keydown', { key: ' ' });
      result.current.handleKeyDown(event);
    });
    expect(result.current.leaderPending).toBe(false);
  });

  it('should call onShowShortcuts when ? is pressed in NORMAL mode', () => {
    const onShowShortcuts = vi.fn();
    const { result } = renderHook(() => useVimMode({ onShowShortcuts }));

    act(() => {
      const event = new KeyboardEvent('keydown', { key: '?' });
      result.current.handleKeyDown(event);
    });

    expect(onShowShortcuts).toHaveBeenCalledTimes(1);
  });

  it('should not call onShowShortcuts when ? is pressed in INSERT mode', () => {
    const onShowShortcuts = vi.fn();
    const { result } = renderHook(() => useVimMode({ onShowShortcuts }));

    // Enter INSERT mode
    act(() => {
      const event = new KeyboardEvent('keydown', { key: 'i' });
      result.current.handleKeyDown(event);
    });
    expect(result.current.mode).toBe('INSERT');

    // Press ? - should not trigger
    act(() => {
      const event = new KeyboardEvent('keydown', { key: '?' });
      result.current.handleKeyDown(event);
    });

    expect(onShowShortcuts).not.toHaveBeenCalled();
  });

  it('should trigger leader for arbitrary zone via triggerLeader', () => {
    const { result } = renderHook(() => useVimMode());

    act(() => {
      result.current.triggerLeader('dialog-sidebar');
    });

    expect(result.current.leaderPending).toBe(true);
    expect(result.current.leaderZone).toBe('dialog-sidebar');
  });

  it('should toggle leader off when triggerLeader called while leaderPending', () => {
    const { result } = renderHook(() => useVimMode());

    // Enter leader
    act(() => {
      result.current.triggerLeader('dialog-sidebar');
    });
    expect(result.current.leaderPending).toBe(true);

    // Toggle off
    act(() => {
      result.current.triggerLeader('dialog-sidebar');
    });
    expect(result.current.leaderPending).toBe(false);
    expect(result.current.leaderZone).toBeNull();
  });

  it('should allow triggerLeader even when dialogOpen is true', () => {
    const { result } = renderHook(() => useVimMode({ dialogOpen: true }));

    act(() => {
      result.current.triggerLeader('dialog-sidebar');
    });

    expect(result.current.leaderPending).toBe(true);
    expect(result.current.leaderZone).toBe('dialog-sidebar');
  });

  it('should not enter leader in VISUAL mode', () => {
    const { result } = renderHook(() => useVimMode());

    // Enter VISUAL mode
    act(() => {
      const event = new KeyboardEvent('keydown', { key: 'v' });
      result.current.handleKeyDown(event);
    });
    expect(result.current.mode).toBe('VISUAL');

    // Press Space - should not trigger leader
    act(() => {
      const event = new KeyboardEvent('keydown', { key: ' ' });
      result.current.handleKeyDown(event);
    });

    expect(result.current.leaderPending).toBe(false);
  });
});
