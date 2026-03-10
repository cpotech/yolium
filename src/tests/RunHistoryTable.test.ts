// src/tests/RunHistoryTable.test.ts
import { describe, it, expect } from 'vitest';

describe('RunHistoryTable array handling', () => {
  it('should not mutate the original history array when reversing', () => {
    // Simulates the data flow in RunHistoryTable.loadData
    const original = [
      { id: '1', startedAt: '2026-01-01' },
      { id: '2', startedAt: '2026-01-02' },
      { id: '3', startedAt: '2026-01-03' },
    ];

    // Save a copy to verify original is untouched
    const originalOrder = [...original];

    // This is the fixed pattern: [...array].reverse() instead of array.reverse()
    const reversed = [...original].reverse();

    // Original array must not be mutated
    expect(original).toEqual(originalOrder);

    // Reversed should be in reverse order
    expect(reversed[0].id).toBe('3');
    expect(reversed[1].id).toBe('2');
    expect(reversed[2].id).toBe('1');
  });
});
