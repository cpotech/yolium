import { describe, expect, it } from 'vitest';
import { getActionContent } from '@renderer/components/schedule/action-helpers';

describe('getActionContent', () => {
  it('should return null when data has no content fields', () => {
    expect(getActionContent({ foo: 'bar' })).toBeNull();
  });

  it('should return null when data has text but no summary (text already shown as summary)', () => {
    expect(getActionContent({ text: 'Some tweet content' })).toBeNull();
  });

  it('should return null when data has summary but no text or tweetText', () => {
    expect(getActionContent({ summary: 'Posted a tweet' })).toBeNull();
  });

  it('should return text when data has both summary and text', () => {
    expect(
      getActionContent({ summary: 'Posted a tweet about TypeScript', text: 'Here is the actual tweet content...' }),
    ).toBe('Here is the actual tweet content...');
  });

  it('should return tweetText when data has both summary and tweetText', () => {
    expect(
      getActionContent({ summary: 'Posted a tweet', tweetText: 'The tweet body text' }),
    ).toBe('The tweet body text');
  });

  it('should prefer text over tweetText when both exist alongside summary', () => {
    expect(
      getActionContent({ summary: 'Posted a tweet', text: 'From text field', tweetText: 'From tweetText field' }),
    ).toBe('From text field');
  });

  it('should return null when text is identical to summary (avoid duplication)', () => {
    expect(
      getActionContent({ summary: 'Same content', text: 'Same content' }),
    ).toBeNull();
  });

  it('should return null when tweetText is identical to summary (avoid duplication)', () => {
    expect(
      getActionContent({ summary: 'Same content', tweetText: 'Same content' }),
    ).toBeNull();
  });
});
