/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useVimMode } from '@renderer/hooks/useVimMode';

describe('useVimMode ? shortcut for shortcuts dialog', () => {
  let onShowShortcuts: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onShowShortcuts = vi.fn();
  });

  it('should call onShowShortcuts when ? is pressed in NORMAL mode with no dialog open', () => {
    const { result } = renderHook(() =>
      useVimMode({ dialogOpen: false, onShowShortcuts })
    );

    const event = new KeyboardEvent('keydown', { key: '?' });
    Object.defineProperty(event, 'preventDefault', { value: vi.fn() });

    act(() => {
      result.current.handleKeyDown(event);
    });

    expect(onShowShortcuts).toHaveBeenCalledTimes(1);
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('should call onShowShortcuts when ? is pressed in NORMAL mode with dialog open', () => {
    const { result } = renderHook(() =>
      useVimMode({ dialogOpen: true, onShowShortcuts })
    );

    const event = new KeyboardEvent('keydown', { key: '?' });
    Object.defineProperty(event, 'preventDefault', { value: vi.fn() });

    act(() => {
      result.current.handleKeyDown(event);
    });

    expect(onShowShortcuts).toHaveBeenCalledTimes(1);
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('should not call onShowShortcuts when ? is pressed in INSERT mode', () => {
    const { result } = renderHook(() =>
      useVimMode({ dialogOpen: false, onShowShortcuts })
    );

    // Enter INSERT mode
    act(() => {
      result.current.enterInsertMode();
    });

    const event = new KeyboardEvent('keydown', { key: '?' });
    Object.defineProperty(event, 'preventDefault', { value: vi.fn() });

    act(() => {
      result.current.handleKeyDown(event);
    });

    expect(onShowShortcuts).not.toHaveBeenCalled();
  });
});
