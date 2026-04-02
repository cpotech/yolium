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

  it('should NOT enter INSERT mode when i is pressed in NORMAL mode (global handler)', () => {
    const { result } = renderHook(() => useVimMode());

    act(() => {
      const event = new KeyboardEvent('keydown', { key: 'i' });
      result.current.handleKeyDown(event);
    });

    expect(result.current.mode).toBe('NORMAL');
  });

  it('should transition back to NORMAL mode when Escape is pressed in INSERT mode', () => {
    const { result } = renderHook(() => useVimMode());

    // Enter INSERT mode programmatically
    act(() => {
      result.current.enterInsertMode();
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

  it('should NOT cycle zones with Tab in NORMAL mode (Tab is now a no-op)', () => {
    const { result } = renderHook(() => useVimMode());
    // Default is 'content'

    act(() => {
      const event = new KeyboardEvent('keydown', { key: 'Tab' });
      result.current.handleKeyDown(event);
    });
    // Zone should remain unchanged — Tab cycling removed
    expect(result.current.activeZone).toBe('content');
  });

  it('should NOT reverse-cycle zones with Shift+Tab in NORMAL mode', () => {
    const { result } = renderHook(() => useVimMode());
    // Default is 'content'

    act(() => {
      const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true });
      result.current.handleKeyDown(event);
    });
    // Zone should remain unchanged — Shift+Tab cycling removed
    expect(result.current.activeZone).toBe('content');
  });

  it('should not change zone when already in INSERT mode', () => {
    const { result } = renderHook(() => useVimMode());

    // Enter INSERT mode programmatically
    act(() => {
      result.current.enterInsertMode();
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

    // Enter INSERT mode programmatically
    act(() => {
      result.current.enterInsertMode();
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

  // --- Leader-key system removed ---

  it('should NOT have leaderPending, leaderZone, or leaderGroupKey in return value', () => {
    const { result } = renderHook(() => useVimMode());
    expect(result.current).not.toHaveProperty('leaderPending');
    expect(result.current).not.toHaveProperty('leaderZone');
    expect(result.current).not.toHaveProperty('leaderGroupKey');
  });

  it('should not treat Space as a special key (no leader toggle)', () => {
    const { result } = renderHook(() => useVimMode());

    act(() => {
      const event = new KeyboardEvent('keydown', { key: ' ' });
      result.current.handleKeyDown(event);
    });

    // No leader state properties exist
    expect(result.current).not.toHaveProperty('leaderPending');
    // Mode should remain NORMAL (Space is a no-op)
    expect(result.current.mode).toBe('NORMAL');
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

    // Enter INSERT mode programmatically
    act(() => {
      result.current.enterInsertMode();
    });
    expect(result.current.mode).toBe('INSERT');

    // Press ? - should not trigger
    act(() => {
      const event = new KeyboardEvent('keydown', { key: '?' });
      result.current.handleKeyDown(event);
    });

    expect(onShowShortcuts).not.toHaveBeenCalled();
  });

  // --- INSERT mode zone-awareness tests ---

  it('should NOT enter INSERT mode when i is pressed in schedule zone', () => {
    const { result } = renderHook(() => useVimMode());

    // Switch to schedule zone
    act(() => {
      const event = new KeyboardEvent('keydown', { key: 'a' });
      result.current.handleKeyDown(event);
    });
    expect(result.current.activeZone).toBe('schedule');

    // Press i - should NOT enter INSERT
    act(() => {
      const event = new KeyboardEvent('keydown', { key: 'i' });
      result.current.handleKeyDown(event);
    });

    expect(result.current.mode).toBe('NORMAL');
  });

  it('should NOT enter INSERT mode when i is pressed in sidebar zone', () => {
    const { result } = renderHook(() => useVimMode());

    // Switch to sidebar zone
    act(() => {
      const event = new KeyboardEvent('keydown', { key: 'e' });
      result.current.handleKeyDown(event);
    });
    expect(result.current.activeZone).toBe('sidebar');

    // Press i - should NOT enter INSERT
    act(() => {
      const event = new KeyboardEvent('keydown', { key: 'i' });
      result.current.handleKeyDown(event);
    });

    expect(result.current.mode).toBe('NORMAL');
  });

  it('should NOT enter INSERT mode when i is pressed in tabs zone', () => {
    const { result } = renderHook(() => useVimMode());

    // Switch to tabs zone
    act(() => {
      const event = new KeyboardEvent('keydown', { key: 't' });
      result.current.handleKeyDown(event);
    });
    expect(result.current.activeZone).toBe('tabs');

    // Press i - should NOT enter INSERT
    act(() => {
      const event = new KeyboardEvent('keydown', { key: 'i' });
      result.current.handleKeyDown(event);
    });

    expect(result.current.mode).toBe('NORMAL');
  });

  it('should still allow programmatic enterInsertMode()', () => {
    const { result } = renderHook(() => useVimMode());

    act(() => {
      result.current.enterInsertMode();
    });

    expect(result.current.mode).toBe('INSERT');
  });

  it('should still exit INSERT mode with Escape after programmatic entry', () => {
    const { result } = renderHook(() => useVimMode());

    // Enter INSERT mode programmatically
    act(() => {
      result.current.enterInsertMode();
    });
    expect(result.current.mode).toBe('INSERT');

    // Press Escape to exit
    act(() => {
      const event = new KeyboardEvent('keydown', { key: 'Escape' });
      result.current.handleKeyDown(event);
    });

    expect(result.current.mode).toBe('NORMAL');
  });

  it('should NOT enter INSERT mode from i key in VISUAL mode', () => {
    const { result } = renderHook(() => useVimMode());

    // Enter VISUAL mode
    act(() => {
      const event = new KeyboardEvent('keydown', { key: 'v' });
      result.current.handleKeyDown(event);
    });
    expect(result.current.mode).toBe('VISUAL');

    // Press i - should NOT enter INSERT
    act(() => {
      const event = new KeyboardEvent('keydown', { key: 'i' });
      result.current.handleKeyDown(event);
    });

    expect(result.current.mode).toBe('VISUAL');
  });
});
