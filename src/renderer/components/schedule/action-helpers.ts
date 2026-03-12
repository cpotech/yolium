export function formatActionTimestamp(timestamp: string): string {
  return new Date(timestamp).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const STANDARD_ACTION_FIELDS = new Set([
  'summary', 'externalId', 'dryRun', 'text', 'tweetText', 'tweetId', 'count',
]);

export function getActionSummary(data: Record<string, unknown>): string | null {
  if (typeof data.summary === 'string') return data.summary;
  if (typeof data.text === 'string') return data.text;
  if (typeof data.tweetText === 'string') return data.tweetText;

  if (typeof data.count === 'number') {
    return `${data.count} items`;
  }

  return null;
}

export function getExtraFields(data: Record<string, unknown>): Record<string, unknown> {
  const extra: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (!STANDARD_ACTION_FIELDS.has(key)) {
      extra[key] = value;
    }
  }
  return extra;
}
