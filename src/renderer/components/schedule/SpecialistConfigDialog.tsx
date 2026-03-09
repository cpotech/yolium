import React, { useState, useCallback, useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface ScheduleConfig {
  type: string;
  cron: string;
  enabled: boolean;
}

interface SpecialistConfig {
  name: string;
  description: string;
  model: string;
  schedules: ScheduleConfig[];
  memory: { strategy: string; maxEntries: number; retentionDays: number };
  escalation: { onFailure?: string; onPattern?: string };
}

interface SpecialistConfigDialogProps {
  isOpen: boolean;
  specialistId: string | null;
  onClose: () => void;
}

export function SpecialistConfigDialog({
  isOpen,
  specialistId,
  onClose,
}: SpecialistConfigDialogProps): React.ReactElement | null {
  const [config, setConfig] = useState<SpecialistConfig | null>(null);
  const [stats, setStats] = useState<{
    totalRuns: number;
    successRate: number;
    weeklyCost: number;
    averageTokensPerRun: number;
    averageDurationMs: number;
  } | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen || !specialistId) return;

    // Load specialist config
    window.electronAPI.schedule.getSpecialists().then((specialists) => {
      const spec = specialists[specialistId];
      if (spec) setConfig(spec as SpecialistConfig);
    }).catch(() => {});

    // Load stats
    window.electronAPI.schedule.getStats(specialistId).then(setStats).catch(() => {});
  }, [isOpen, specialistId]);

  useEffect(() => {
    if (isOpen) {
      dialogRef.current?.focus();
    }
  }, [isOpen]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose]
  );

  if (!isOpen || !specialistId) return null;

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onKeyDown={handleKeyDown}
      onClick={handleBackdropClick}
      tabIndex={-1}
    >
      <div
        className="bg-[var(--color-bg-secondary)] rounded-lg shadow-xl border border-[var(--color-border-primary)] p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto"
        data-testid="specialist-config-dialog"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
            {config?.name || specialistId}
          </h2>
          <button
            onClick={onClose}
            data-testid="specialist-config-close"
            className="p-1 rounded hover:bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]"
          >
            <X size={16} />
          </button>
        </div>

        {config && (
          <div className="space-y-4">
            {/* Description */}
            <div>
              <label className="block text-xs text-[var(--color-text-secondary)] mb-1">Description</label>
              <p className="text-sm text-[var(--color-text-primary)]">{config.description}</p>
            </div>

            {/* Model */}
            <div>
              <label className="block text-xs text-[var(--color-text-secondary)] mb-1">Model</label>
              <span className="text-sm text-[var(--color-text-primary)] font-mono">{config.model}</span>
            </div>

            {/* Schedules */}
            <div>
              <label className="block text-xs text-[var(--color-text-secondary)] mb-2">Schedules</label>
              <div className="space-y-1">
                {config.schedules.map((s, i) => (
                  <div key={i} className="flex items-center justify-between py-1 px-2 rounded bg-[var(--color-bg-tertiary)]">
                    <div className="flex items-center gap-2">
                      <span className={`inline-block w-2 h-2 rounded-full ${s.enabled ? 'bg-green-500' : 'bg-gray-500'}`} />
                      <span className="text-sm text-[var(--color-text-primary)]">{s.type}</span>
                    </div>
                    <span className="text-xs text-[var(--color-text-secondary)] font-mono">{s.cron}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Memory Config */}
            <div>
              <label className="block text-xs text-[var(--color-text-secondary)] mb-1">Memory</label>
              <div className="text-sm text-[var(--color-text-primary)] space-y-0.5">
                <div>Strategy: <span className="font-mono">{config.memory.strategy}</span></div>
                <div>Max entries: {config.memory.maxEntries}</div>
                <div>Retention: {config.memory.retentionDays} days</div>
              </div>
            </div>

            {/* Escalation */}
            <div>
              <label className="block text-xs text-[var(--color-text-secondary)] mb-1">Escalation</label>
              <div className="text-sm text-[var(--color-text-primary)] space-y-0.5">
                {config.escalation.onFailure && (
                  <div>On failure: <span className="font-mono">{config.escalation.onFailure}</span></div>
                )}
                {config.escalation.onPattern && (
                  <div>On pattern: <span className="font-mono">{config.escalation.onPattern}</span></div>
                )}
              </div>
            </div>

            {/* Stats */}
            {stats && stats.totalRuns > 0 && (
              <div>
                <label className="block text-xs text-[var(--color-text-secondary)] mb-1">Statistics</label>
                <div className="grid grid-cols-2 gap-2 text-sm text-[var(--color-text-primary)]">
                  <div>Total runs: {stats.totalRuns}</div>
                  <div>Success rate: {stats.successRate.toFixed(1)}%</div>
                  <div>Weekly cost: ${stats.weeklyCost.toFixed(4)}</div>
                  <div>Avg tokens: {Math.round(stats.averageTokensPerRun)}</div>
                  <div>Avg duration: {formatDuration(stats.averageDurationMs)}</div>
                </div>
              </div>
            )}
          </div>
        )}

        {!config && (
          <p className="text-sm text-[var(--color-text-secondary)]">Loading specialist configuration...</p>
        )}

        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-md transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
