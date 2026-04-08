/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useVimMode } from '@renderer/hooks/useVimMode';

describe('Tab switch focus (number keys → content zone)', () => {
  it('should set activeZone to content when a number key (1-9) selects a tab', () => {
    const onSelectTab = vi.fn();
    const { result } = renderHook(() => useVimMode({ onSelectTab }));

    // Move away from content zone first
    act(() => {
      result.current.handleKeyDown(new KeyboardEvent('keydown', { key: 'e' }));
    });
    expect(result.current.activeZone).toBe('sidebar');

    // Press '3' to select tab index 2
    act(() => {
      result.current.handleKeyDown(new KeyboardEvent('keydown', { key: '3' }));
    });

    expect(onSelectTab).toHaveBeenCalledWith(2);
    expect(result.current.activeZone).toBe('content');
  });

  it('should set activeZone to content when 0 key selects a tab', () => {
    const onSelectTab = vi.fn();
    const { result } = renderHook(() => useVimMode({ onSelectTab }));

    // Move away from content zone first
    act(() => {
      result.current.handleKeyDown(new KeyboardEvent('keydown', { key: 't' }));
    });
    expect(result.current.activeZone).toBe('tabs');

    // Press '0' to select tab index 9
    act(() => {
      result.current.handleKeyDown(new KeyboardEvent('keydown', { key: '0' }));
    });

    expect(onSelectTab).toHaveBeenCalledWith(9);
    expect(result.current.activeZone).toBe('content');
  });

  it('should call onSelectTab AND switch zone to content on number key press', () => {
    const onSelectTab = vi.fn();
    const onZoneChange = vi.fn();
    const { result } = renderHook(() => useVimMode({ onSelectTab, onZoneChange }));

    // Move to sidebar first
    act(() => {
      result.current.handleKeyDown(new KeyboardEvent('keydown', { key: 'e' }));
    });
    onZoneChange.mockClear();

    // Press '1' to select first tab
    act(() => {
      result.current.handleKeyDown(new KeyboardEvent('keydown', { key: '1' }));
    });

    expect(onSelectTab).toHaveBeenCalledWith(0);
    expect(onZoneChange).toHaveBeenCalledWith('content');
    expect(result.current.activeZone).toBe('content');
  });

  it('should not change zone when number key is pressed but onSelectTab is not provided', () => {
    const { result } = renderHook(() => useVimMode({}));

    // Move to tabs zone
    act(() => {
      result.current.handleKeyDown(new KeyboardEvent('keydown', { key: 't' }));
    });
    expect(result.current.activeZone).toBe('tabs');

    // Press '5' with no onSelectTab — zone should still switch to content
    // because the number key handler always sets zone to content
    act(() => {
      result.current.handleKeyDown(new KeyboardEvent('keydown', { key: '5' }));
    });

    expect(result.current.activeZone).toBe('content');
  });
});
