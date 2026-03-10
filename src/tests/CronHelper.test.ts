// src/tests/CronHelper.test.ts
import { describe, it, expect } from 'vitest';
import { describeCron } from '@renderer/components/schedule/CronHelper';

describe('describeCron', () => {
  it('should describe every-N-minutes patterns', () => {
    expect(describeCron('*/15 * * * *')).toBe('Every 15 minutes');
    expect(describeCron('*/30 * * * *')).toBe('Every 30 minutes');
  });

  it('should describe daily patterns', () => {
    expect(describeCron('0 0 * * *')).toBe('Daily at midnight');
    expect(describeCron('0 8 * * *')).toBe('Daily at 8:00 AM');
    expect(describeCron('0 12 * * *')).toBe('Daily at noon');
    expect(describeCron('0 14 * * *')).toBe('Daily at 2:00 PM');
  });

  it('should describe weekly patterns', () => {
    expect(describeCron('0 9 * * 1')).toBe('Weekly on Monday at 9:00 AM');
    expect(describeCron('0 2 * * 0')).toBe('Weekly on Sunday at 2:00 AM');
  });

  it('should return raw cron for unrecognized patterns', () => {
    expect(describeCron('0 0 1 * *')).toBe('0 0 1 * *'); // Monthly
    expect(describeCron('30 9 1,15 * *')).toBe('30 9 1,15 * *'); // Specific days of month
  });
});
