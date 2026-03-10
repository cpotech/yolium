import React from 'react';

export interface CronPreset {
  label: string;
  cron: string;
}

export const CRON_PRESETS: CronPreset[] = [
  { label: 'Every 15 min', cron: '*/15 * * * *' },
  { label: 'Every 30 min', cron: '*/30 * * * *' },
  { label: 'Hourly', cron: '0 * * * *' },
  { label: 'Every 2 hours', cron: '0 */2 * * *' },
  { label: 'Daily at midnight', cron: '0 0 * * *' },
  { label: 'Daily at 8 AM', cron: '0 8 * * *' },
  { label: 'Daily at 9 AM', cron: '0 9 * * *' },
  { label: 'Weekly on Monday', cron: '0 9 * * 1' },
  { label: 'Weekly on Sunday', cron: '0 2 * * 0' },
];

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function formatHour(hour: number): string {
  if (hour === 0) return 'midnight';
  if (hour === 12) return 'noon';
  return hour < 12 ? `${hour}:00 AM` : `${hour - 12}:00 PM`;
}

/**
 * Convert a cron expression to a human-readable description.
 */
export function describeCron(cron: string): string {
  const parts = cron.trim().split(/\s+/);
  if (parts.length < 5) return cron;

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  // Every N minutes: */N * * * *
  if (minute.startsWith('*/') && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    const n = parseInt(minute.slice(2), 10);
    if (!isNaN(n)) return `Every ${n} minutes`;
  }

  // Every N hours: 0 */N * * *
  if (minute === '0' && hour.startsWith('*/') && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    const n = parseInt(hour.slice(2), 10);
    if (!isNaN(n)) return `Every ${n} hours`;
  }

  // Hourly: 0 * * * *
  if (minute === '0' && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return 'Every hour';
  }

  // Daily: 0 H * * *
  if (dayOfMonth === '*' && month === '*' && dayOfWeek === '*' && !minute.includes('/') && !hour.includes('/') && !hour.includes('*')) {
    const h = parseInt(hour, 10);
    if (!isNaN(h)) return `Daily at ${formatHour(h)}`;
  }

  // Weekly: 0 H * * D
  if (dayOfMonth === '*' && month === '*' && dayOfWeek !== '*' && !minute.includes('/') && !hour.includes('/') && !hour.includes('*')) {
    const h = parseInt(hour, 10);
    const d = parseInt(dayOfWeek, 10);
    if (!isNaN(h) && !isNaN(d) && d >= 0 && d <= 6) {
      return `Weekly on ${DAY_NAMES[d]} at ${formatHour(h)}`;
    }
  }

  return cron;
}

interface CronHelperProps {
  value: string;
  onChange: (cron: string) => void;
}

export function CronHelper({ value, onChange }: CronHelperProps): React.ReactElement {
  const description = describeCron(value);
  const isCustom = description === value;

  return (
    <div className="mt-1">
      {value && (
        <p
          data-testid="cron-description"
          className={`text-[10px] mb-1.5 ${isCustom ? 'text-[var(--color-text-muted)]' : 'text-[var(--color-accent-secondary)]'}`}
        >
          {isCustom ? 'Custom schedule' : description}
        </p>
      )}
      <div className="flex flex-wrap gap-1">
        {CRON_PRESETS.map((preset) => (
          <button
            key={preset.cron}
            type="button"
            onClick={() => onChange(preset.cron)}
            className={`rounded-full px-2 py-0.5 text-[10px] border transition-colors ${
              value === preset.cron
                ? 'border-[var(--color-accent-primary)] text-[var(--color-accent-primary)] bg-[var(--color-accent-primary)]/10'
                : 'border-[var(--color-border-secondary)] text-[var(--color-text-muted)] hover:border-[var(--color-accent-primary)] hover:text-[var(--color-accent-primary)]'
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  );
}
