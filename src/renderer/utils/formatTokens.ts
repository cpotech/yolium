export function formatTokenCount(value: number): string {
  const abs = Math.abs(value);
  if (abs < 1_000) return `${value}`;
  if (abs < 1_000_000) return formatWithSuffix(value, 1_000, 'k');
  if (abs < 1_000_000_000) return formatWithSuffix(value, 1_000_000, 'M');
  return formatWithSuffix(value, 1_000_000_000, 'B');
}

export function formatUsdCost(value: number): string {
  return `$${value.toFixed(4)}`;
}

function formatWithSuffix(value: number, divisor: number, suffix: string): string {
  const formatted = (value / divisor).toFixed(1).replace(/\.0$/, '');
  return `${formatted}${suffix}`;
}
