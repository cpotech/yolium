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
  integrations?: Array<{ service: string; env: Record<string, string> }>;
}

interface SpecialistConfigDialogProps {
  isOpen: boolean;
  specialistId: string | null;
  onClose: () => void;
  onEdit?: () => void;
}

function mergeCredentialState(
  credentials: Record<string, Record<string, boolean>>,
  integrations?: Array<{ service: string; env: Record<string, string> }>
): Record<string, Record<string, boolean>> {
  const merged: Record<string, Record<string, boolean>> = { ...credentials };

  if (!integrations) {
    return merged;
  }

  for (const integration of integrations) {
    if (!integration.service) continue;
    if (!merged[integration.service]) {
      merged[integration.service] = {};
    }
    for (const key of Object.keys(integration.env)) {
      if (!(key in merged[integration.service])) {
        merged[integration.service][key] = false;
      }
    }
  }

  return merged;
}

export function SpecialistConfigDialog({
  isOpen,
  specialistId,
  onClose,
  onEdit,
}: SpecialistConfigDialogProps): React.ReactElement | null {
  const [config, setConfig] = useState<SpecialistConfig | null>(null);
  const [stats, setStats] = useState<{
    totalRuns: number;
    successRate: number;
    weeklyCost: number;
    averageTokensPerRun: number;
    averageDurationMs: number;
  } | null>(null);
  const [credentials, setCredentials] = useState<Record<string, Record<string, boolean>>>({});
  const [editingCreds, setEditingCreds] = useState<Record<string, Record<string, string>>>({});
  const [savingCreds, setSavingCreds] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  const buildEditingState = useCallback((mergedCredentials: Record<string, Record<string, boolean>>) => {
    const editing: Record<string, Record<string, string>> = {};
    for (const [serviceId, keys] of Object.entries(mergedCredentials)) {
      editing[serviceId] = {};
      for (const key of Object.keys(keys)) {
        editing[serviceId][key] = '';
      }
    }
    return editing;
  }, []);

  const refreshConfig = useCallback(async (currentSpecialistId: string) => {
    const [specialists, creds, runStats] = await Promise.all([
      window.electronAPI.schedule.getSpecialists(),
      window.electronAPI.schedule.getCredentials(currentSpecialistId),
      window.electronAPI.schedule.getStats(currentSpecialistId),
    ]);

    const spec = specialists[currentSpecialistId] as SpecialistConfig | undefined;
    if (spec) {
      setConfig(spec);
    }
    setStats(runStats);

    const merged = mergeCredentialState(creds, spec?.integrations);
    setCredentials(merged);
    setEditingCreds(buildEditingState(merged));
  }, [buildEditingState]);

  useEffect(() => {
    if (!isOpen || !specialistId) return;

    // Reset state immediately to avoid showing stale data from previous specialist
    setConfig(null);
    setStats(null);
    setCredentials({});
    setEditingCreds({});

    refreshConfig(specialistId).catch(() => {});
  }, [isOpen, refreshConfig, specialistId]);

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
          <div>
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
              {config?.name || specialistId}
            </h2>
            {onEdit && (
              <button
                type="button"
                data-testid="specialist-config-edit"
                onClick={onEdit}
                className="mt-1 text-xs text-[var(--color-accent-primary)] hover:underline"
              >
                Edit definition
              </button>
            )}
          </div>
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

            {/* Service Credentials (shows saved credentials + declared integrations) */}
            {Object.keys(credentials).length > 0 && (
              <div>
                <label className="block text-xs text-[var(--color-text-secondary)] mb-2">Service Credentials</label>
                {Object.entries(credentials).map(([serviceId, keys]) => (
                  <div key={serviceId} className="mb-2 rounded border border-[var(--color-border-secondary)] bg-[var(--color-bg-primary)] p-3">
                    <div className="text-xs font-medium text-[var(--color-text-primary)] mb-2">{serviceId}</div>
                    {Object.entries(keys).map(([key, hasValue]) => (
                      <div key={key} className="flex items-center gap-2 mb-1.5">
                        <span className="text-xs text-[var(--color-text-secondary)] shrink-0 font-mono">{key}</span>
                        {hasValue ? (
                          <span className="text-[10px] text-green-500 bg-green-500/10 px-1.5 py-0.5 rounded">configured</span>
                        ) : (
                          <span className="text-[10px] text-[var(--color-text-muted)] bg-[var(--color-bg-tertiary)] px-1.5 py-0.5 rounded">not set</span>
                        )}
                        <input
                          type="password"
                          value={editingCreds[serviceId]?.[key] || ''}
                          onChange={(e) => {
                            setEditingCreds(prev => ({
                              ...prev,
                              [serviceId]: { ...prev[serviceId], [key]: e.target.value },
                            }));
                          }}
                          placeholder="Enter new value"
                          className="flex-1 rounded border border-[var(--color-border-secondary)] bg-[var(--color-bg-secondary)] px-2 py-1 text-xs text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent-primary)]"
                        />
                      </div>
                    ))}
                    <button
                      type="button"
                      disabled={savingCreds}
                      onClick={async () => {
                        if (!specialistId) return;
                        const creds = editingCreds[serviceId];
                        if (!creds) return;
                        const filledCreds: Record<string, string> = {};
                        let hasChanges = false;
                        for (const [k, v] of Object.entries(creds)) {
                          if (v) {
                            filledCreds[k] = v;
                            hasChanges = true;
                          }
                        }
                        if (!hasChanges) return;
                        setSavingCreds(true);
                        try {
                          await window.electronAPI.schedule.saveCredentials(specialistId, serviceId, filledCreds);
                          const updated = await window.electronAPI.schedule.getCredentials(specialistId);
                          const merged = mergeCredentialState(updated, config?.integrations);
                          setCredentials(merged);
                          setEditingCreds(prev => ({
                            ...prev,
                            [serviceId]: Object.fromEntries(Object.keys(prev[serviceId] || {}).map(k => [k, ''])),
                          }));
                        } finally {
                          setSavingCreds(false);
                        }
                      }}
                      className="mt-1 text-[11px] text-[var(--color-accent-primary)] hover:underline disabled:opacity-50"
                    >
                      Save credentials
                    </button>
                  </div>
                ))}
              </div>
            )}

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
