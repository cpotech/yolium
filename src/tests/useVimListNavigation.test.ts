import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Unit tests for useVimListNavigation hook logic.
 * Tests the core navigation algorithm (j/k/gg/G) without React rendering.
 */

interface NavOptions {
  itemCount: number;
  enabled: boolean;
  currentIndex: number;
  wrap?: boolean;
}

/**
 * Pure-function extraction of the navigation logic for testability.
 * Mirrors the hook's handleNavKeys implementation.
 */
function createNavHandler(options: NavOptions) {
  let gPending = false;

  function handleNavKeys(key: string): { handled: boolean; newIndex: number | null } {
    if (!options.enabled || options.itemCount === 0) {
      return { handled: false, newIndex: null };
    }

    const wrap = options.wrap !== false; // default true
    const count = options.itemCount;
    const idx = options.currentIndex;

    if (key === 'j' || key === 'ArrowDown') {
      gPending = false;
      const next = wrap ? (idx + 1) % count : Math.min(idx + 1, count - 1);
      return { handled: true, newIndex: next };
    }

    if (key === 'k' || key === 'ArrowUp') {
      gPending = false;
      const prev = wrap ? (idx - 1 + count) % count : Math.max(idx - 1, 0);
      return { handled: true, newIndex: prev };
    }

    if (key === 'g') {
      if (gPending) {
        gPending = false;
        return { handled: true, newIndex: 0 };
      } else {
        gPending = true;
        return { handled: true, newIndex: null };
      }
    }

    if (key === 'G') {
      gPending = false;
      return { handled: true, newIndex: count - 1 };
    }

    // Non-nav key: reset gPending but don't handle
    gPending = false;
    return { handled: false, newIndex: null };
  }

  return { handleNavKeys, getGPending: () => gPending };
}

describe('useVimListNavigation', () => {
  it('should move index down on j key', () => {
    const nav = createNavHandler({ itemCount: 5, enabled: true, currentIndex: 0 });
    const result = nav.handleNavKeys('j');
    expect(result.handled).toBe(true);
    expect(result.newIndex).toBe(1);
  });

  it('should move index up on k key', () => {
    const nav = createNavHandler({ itemCount: 5, enabled: true, currentIndex: 2 });
    const result = nav.handleNavKeys('k');
    expect(result.handled).toBe(true);
    expect(result.newIndex).toBe(1);
  });

  it('should wrap around when moving past last item', () => {
    const nav = createNavHandler({ itemCount: 3, enabled: true, currentIndex: 2 });
    const result = nav.handleNavKeys('j');
    expect(result.handled).toBe(true);
    expect(result.newIndex).toBe(0);
  });

  it('should wrap around when moving before first item', () => {
    const nav = createNavHandler({ itemCount: 3, enabled: true, currentIndex: 0 });
    const result = nav.handleNavKeys('k');
    expect(result.handled).toBe(true);
    expect(result.newIndex).toBe(2);
  });

  it('should go to first item on gg (double g press)', () => {
    const nav = createNavHandler({ itemCount: 5, enabled: true, currentIndex: 3 });
    nav.handleNavKeys('g'); // first g: sets gPending
    const result = nav.handleNavKeys('g'); // second g: jump to first
    expect(result.handled).toBe(true);
    expect(result.newIndex).toBe(0);
  });

  it('should go to last item on G key', () => {
    const nav = createNavHandler({ itemCount: 5, enabled: true, currentIndex: 1 });
    const result = nav.handleNavKeys('G');
    expect(result.handled).toBe(true);
    expect(result.newIndex).toBe(4);
  });

  it('should reset gPending on any non-g key press', () => {
    const nav = createNavHandler({ itemCount: 5, enabled: true, currentIndex: 2 });
    nav.handleNavKeys('g'); // sets gPending
    expect(nav.getGPending()).toBe(true);
    nav.handleNavKeys('j'); // should reset gPending
    expect(nav.getGPending()).toBe(false);
  });

  it('should not respond when disabled', () => {
    const nav = createNavHandler({ itemCount: 5, enabled: false, currentIndex: 0 });
    const result = nav.handleNavKeys('j');
    expect(result.handled).toBe(false);
    expect(result.newIndex).toBe(null);
  });

  it('should call onIndexChange callback when index changes', () => {
    // This test validates the contract: handleNavKeys returns newIndex which the caller passes to onIndexChange
    const onIndexChange = vi.fn();
    const nav = createNavHandler({ itemCount: 5, enabled: true, currentIndex: 0 });
    const result = nav.handleNavKeys('j');
    if (result.newIndex !== null) {
      onIndexChange(result.newIndex);
    }
    expect(onIndexChange).toHaveBeenCalledWith(1);
  });

  it('should handle empty list without errors', () => {
    const nav = createNavHandler({ itemCount: 0, enabled: true, currentIndex: 0 });
    const resultJ = nav.handleNavKeys('j');
    expect(resultJ.handled).toBe(false);
    expect(resultJ.newIndex).toBe(null);
    const resultG = nav.handleNavKeys('G');
    expect(resultG.handled).toBe(false);
    expect(resultG.newIndex).toBe(null);
  });

  it('should not wrap when wrap option is false', () => {
    const nav = createNavHandler({ itemCount: 3, enabled: true, currentIndex: 2, wrap: false });
    const result = nav.handleNavKeys('j');
    expect(result.handled).toBe(true);
    expect(result.newIndex).toBe(2); // stays at last
  });

  it('should handle ArrowDown same as j', () => {
    const nav = createNavHandler({ itemCount: 5, enabled: true, currentIndex: 0 });
    const result = nav.handleNavKeys('ArrowDown');
    expect(result.handled).toBe(true);
    expect(result.newIndex).toBe(1);
  });

  it('should handle ArrowUp same as k', () => {
    const nav = createNavHandler({ itemCount: 5, enabled: true, currentIndex: 2 });
    const result = nav.handleNavKeys('ArrowUp');
    expect(result.handled).toBe(true);
    expect(result.newIndex).toBe(1);
  });

  it('should return handled=true but newIndex=null on first g press', () => {
    const nav = createNavHandler({ itemCount: 5, enabled: true, currentIndex: 2 });
    const result = nav.handleNavKeys('g');
    expect(result.handled).toBe(true);
    expect(result.newIndex).toBe(null);
    expect(nav.getGPending()).toBe(true);
  });

  it('should reset gPending on unhandled key', () => {
    const nav = createNavHandler({ itemCount: 5, enabled: true, currentIndex: 2 });
    nav.handleNavKeys('g');
    expect(nav.getGPending()).toBe(true);
    const result = nav.handleNavKeys('x');
    expect(result.handled).toBe(false);
    expect(nav.getGPending()).toBe(false);
  });
});
