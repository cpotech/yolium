/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { isCloseShortcut } from '@renderer/lib/dialog-shortcuts';

describe('isCloseShortcut', () => {
  it('should return true for Ctrl+Q', () => {
    const event = new KeyboardEvent('keydown', { key: 'q', ctrlKey: true });
    expect(isCloseShortcut(event)).toBe(true);
  });

  it('should return true for Meta+Q (macOS Cmd+Q)', () => {
    const event = new KeyboardEvent('keydown', { key: 'q', metaKey: true });
    expect(isCloseShortcut(event)).toBe(true);
  });

  it('should return true for Ctrl+Q with uppercase key', () => {
    const event = new KeyboardEvent('keydown', { key: 'Q', ctrlKey: true });
    expect(isCloseShortcut(event)).toBe(true);
  });

  it('should return false for Q without modifier', () => {
    const event = new KeyboardEvent('keydown', { key: 'q' });
    expect(isCloseShortcut(event)).toBe(false);
  });

  it('should return false for Ctrl+W', () => {
    const event = new KeyboardEvent('keydown', { key: 'w', ctrlKey: true });
    expect(isCloseShortcut(event)).toBe(false);
  });

  it('should return false for Escape', () => {
    const event = new KeyboardEvent('keydown', { key: 'Escape', ctrlKey: false });
    expect(isCloseShortcut(event)).toBe(false);
  });

  it('should return false for Escape with ctrlKey', () => {
    const event = new KeyboardEvent('keydown', { key: 'Escape', ctrlKey: true });
    expect(isCloseShortcut(event)).toBe(false);
  });
});
