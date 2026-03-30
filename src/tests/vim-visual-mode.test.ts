/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useVimMode } from '@renderer/hooks/useVimMode';

describe('useVimMode VISUAL mode', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should enter VISUAL mode when v is pressed in NORMAL mode', () => {
    const { result } = renderHook(() => useVimMode());

    expect(result.current.mode).toBe('NORMAL');

    act(() => {
      result.current.handleKeyDown(new KeyboardEvent('keydown', { key: 'v' }));
    });

    expect(result.current.mode).toBe('VISUAL');
  });

  it('should exit VISUAL mode to NORMAL when Escape is pressed', () => {
    const { result } = renderHook(() => useVimMode());

    // Enter visual mode
    act(() => {
      result.current.handleKeyDown(new KeyboardEvent('keydown', { key: 'v' }));
    });
    expect(result.current.mode).toBe('VISUAL');

    // Press Escape
    act(() => {
      result.current.handleKeyDown(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(result.current.mode).toBe('NORMAL');
  });

  it('should exit VISUAL mode to NORMAL when v is pressed again', () => {
    const { result } = renderHook(() => useVimMode());

    // Enter visual mode
    act(() => {
      result.current.handleKeyDown(new KeyboardEvent('keydown', { key: 'v' }));
    });
    expect(result.current.mode).toBe('VISUAL');

    // Press v again
    act(() => {
      result.current.handleKeyDown(new KeyboardEvent('keydown', { key: 'v' }));
    });
    expect(result.current.mode).toBe('NORMAL');
  });

  it('should not enter VISUAL mode when dialog is open', () => {
    const { result } = renderHook(() => useVimMode({ dialogOpen: true }));

    act(() => {
      result.current.handleKeyDown(new KeyboardEvent('keydown', { key: 'v' }));
    });

    expect(result.current.mode).toBe('NORMAL');
  });

  it('should not enter VISUAL mode from INSERT mode', () => {
    const { result } = renderHook(() => useVimMode());

    // Enter INSERT mode programmatically
    act(() => {
      result.current.enterInsertMode();
    });
    expect(result.current.mode).toBe('INSERT');

    // Try to press v — should not enter VISUAL
    act(() => {
      result.current.handleKeyDown(new KeyboardEvent('keydown', { key: 'v' }));
    });
    expect(result.current.mode).toBe('INSERT');
  });
});
