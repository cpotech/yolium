import { describe, it, expect } from 'vitest';
import { formatTokenCount } from '@renderer/utils/formatTokens';

describe('formatTokenCount', () => {
  it('returns raw number for values under 1k', () => {
    expect(formatTokenCount(0)).toBe('0');
    expect(formatTokenCount(12)).toBe('12');
    expect(formatTokenCount(999)).toBe('999');
  });

  it('formats thousands with k suffix', () => {
    expect(formatTokenCount(1000)).toBe('1k');
    expect(formatTokenCount(1200)).toBe('1.2k');
    expect(formatTokenCount(12_345)).toBe('12.3k');
  });

  it('formats millions with M suffix', () => {
    expect(formatTokenCount(1_000_000)).toBe('1M');
    expect(formatTokenCount(2_500_000)).toBe('2.5M');
  });

  it('formats billions with B suffix', () => {
    expect(formatTokenCount(3_200_000_000)).toBe('3.2B');
  });
});
