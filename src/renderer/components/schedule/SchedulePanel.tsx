import React, { useEffect, useState, useCallback } from 'react';
import { Clock, Play, History, Settings, Power, PowerOff, RefreshCw, AlertTriangle, ChevronDown, Plus } from 'lucide-react';
import { RunHistoryTable } from './RunHistoryTable';
import { SpecialistConfigDialog } from './SpecialistConfigDialog';
import { AddSpecialistDialog } from './AddSpecialistDialog';

interface SpecialistInfo {
  name: string;
  description: string;
  model: string;
  schedules: Array<{ type: string; cron: string; enabled: boolean }>;
  memory: { strategy: string; maxEntries: number; retentionDays: number };
  escalation: { onFailure?: string; onPattern?: string };
}

interface SpecialistStatus {
  id: string;
  enabled: boolean;
  consecutiveNoAction: number;
  consecutiveFailures: number;
  totalRuns: number;
  successRate: number;
  weeklyCost: number;
  skipEveryN?: number;
}

interface ScheduleState {
  specialists: Record<string, SpecialistStatus>;
  globalEnabled: boolean;
}

export function SchedulePanel(): React.ReactElement {
  const [state, setState] = useState<ScheduleState | null>(null);
  const [specialists, setSpecialists] = useState<Record<string, SpecialistInfo>>({});
  const [selectedSpecialist, setSelectedSpecialist] = useState<string | null>(null);
  const [configSpecialist, setConfigSpecialist] = useState<string | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingSpecialistId, setEditingSpecialistId] = useState<string | null>(null);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [runTypeMenu, setRunTypeMenu] = useState<string | null>(null);

  const loadState = useCallback(async () => {
    try {
      const [scheduleState, specialistDefs] = await Promise.all([
        window.electronAPI.schedule.getState(),
        window.electronAPI.schedule.getSpecialists(),
      ]);
      setState(scheduleState);
      setSpecialists(specialistDefs);
    } catch (err) {
      console.error('Failed to load schedule state:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadState();
    const cleanupAlert = window.electronAPI.schedule.onAlert((_specialistId, message) => {
      setAlertMessage(message);
      setTimeout(() => setAlertMessage(null), 10000);
    });
    const cleanupState = window.electronAPI.schedule.onStateChanged(() => {
      loadState();
    });
    return () => {
      cleanupAlert();
      cleanupState();
    };
  }, [loadState]);

  // Close run type menu when clicking outside
  useEffect(() => {
    if (!runTypeMenu) return;
    const handleClick = () => setRunTypeMenu(null);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [runTypeMenu]);

  const handleToggleGlobal = useCallback(async () => {
    if (!state) return;
    await window.electronAPI.schedule.toggleGlobal(!state.globalEnabled);
    loadState();
  }, [state, loadState]);

  const handleToggleSpecialist = useCallback(async (id: string, enabled: boolean) => {
    await window.electronAPI.schedule.toggleSpecialist(id, enabled);
    loadState();
  }, [loadState]);

  const handleTriggerRun = useCallback(async (id: string, type: string) => {
    setRunTypeMenu(null);
    const result = await window.electronAPI.schedule.triggerRun(id, type);
    if (result.skipped) {
      setAlertMessage(`Run skipped: ${result.reason}`);
      setTimeout(() => setAlertMessage(null), 5000);
    }
    loadState();
  }, [loadState]);

  const handleReload = useCallback(async () => {
    setIsLoading(true);
    await window.electronAPI.schedule.reload();
    await loadState();
  }, [loadState]);

  const handleSpecialistCreated = useCallback(() => {
    loadState();
    setShowAddDialog(false);
    setEditingSpecialistId(null);
    setConfigSpecialist(null);
  }, [loadState]);

  const handleCloseEditor = useCallback(() => {
    setShowAddDialog(false);
    setEditingSpecialistId(null);
  }, []);

  const handleEditSpecialist = useCallback(() => {
    if (!configSpecialist) return;
    setEditingSpecialistId(configSpecialist);
    setShowAddDialog(false);
    setConfigSpecialist(null);
  }, [configSpecialist]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center" data-testid="schedule-panel-loading">
        <RefreshCw className="w-6 h-6 text-[var(--color-text-muted)] animate-spin" />
      </div>
    );
  }

  if (selectedSpecialist) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden" data-testid="schedule-panel-history">
        <div className="flex items-center gap-2 p-3 border-b border-[var(--color-border-primary)]">
          <button
            onClick={() => setSelectedSpecialist(null)}
            className="px-2 py-1 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] rounded transition-colors"
          >
            &larr; Back
          </button>
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
            {selectedSpecialist} — Run History
          </h2>
        </div>
        <div className="flex-1 min-h-0 overflow-auto">
          <RunHistoryTable specialistId={selectedSpecialist} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden" data-testid="schedule-panel">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-[var(--color-border-primary)]">
        <div className="flex items-center gap-2">
          <Clock size={16} className="text-[var(--color-accent-primary)]" />
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Scheduled Agents</h2>
          <span className="text-xs text-[var(--color-text-muted)]">
            ({Object.keys(specialists).length} specialists)
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            data-testid="add-specialist-btn"
            onClick={() => {
              setEditingSpecialistId(null);
              setShowAddDialog(true);
            }}
            className="flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-primary)]"
          >
            <Plus size={12} />
            Add
          </button>
          <button
            data-testid="schedule-reload-btn"
            onClick={handleReload}
            className="p-1.5 rounded text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)] transition-colors"
            title="Reload specialist definitions"
          >
            <RefreshCw size={14} />
          </button>
          <button
            data-testid="schedule-global-toggle"
            onClick={handleToggleGlobal}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
              state?.globalEnabled
                ? 'bg-[var(--color-accent-primary)] text-white'
                : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]'
            }`}
          >
            {state?.globalEnabled ? <Power size={12} /> : <PowerOff size={12} />}
            {state?.globalEnabled ? 'Enabled' : 'Disabled'}
          </button>
        </div>
      </div>

      {/* Alert banner */}
      {alertMessage && (
        <div className="mx-3 mt-2 p-2 bg-[var(--color-status-warning)]/10 border border-[var(--color-status-warning)]/30 rounded flex items-center gap-2 text-xs text-[var(--color-status-warning)]">
          <AlertTriangle size={14} />
          <span>{alertMessage}</span>
          <button onClick={() => setAlertMessage(null)} className="ml-auto text-xs hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Specialist cards */}
      <div className="flex-1 min-h-0 overflow-auto p-3">
        {Object.keys(specialists).length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-[var(--color-text-muted)]">
            <Clock size={48} className="mb-3 opacity-30" />
            <p className="text-sm">No specialists found</p>
            <button
              type="button"
              onClick={() => {
                setEditingSpecialistId(null);
                setShowAddDialog(true);
              }}
              className="mt-3 rounded bg-[var(--color-accent-primary)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
            >
              Add Specialist
            </button>
          </div>
        ) : (
          <div className="grid gap-3 grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
            {Object.entries(specialists).map(([id, spec]) => {
              const status = state?.specialists[id];
              const enabledSchedules = spec.schedules.filter(s => s.enabled);
              return (
                <div
                  key={id}
                  data-testid={`specialist-card-${id}`}
                  className="rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] p-3"
                >
                  {/* Card header */}
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="text-sm font-medium text-[var(--color-text-primary)]">{spec.name}</h3>
                      <p className="text-xs text-[var(--color-text-muted)] mt-0.5 line-clamp-2">{spec.description}</p>
                    </div>
                    <button
                      data-testid={`toggle-${id}`}
                      onClick={() => handleToggleSpecialist(id, !(status?.enabled ?? true))}
                      className={`px-2 py-0.5 rounded text-xs transition-colors ${
                        (status?.enabled ?? true)
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)]'
                      }`}
                    >
                      {(status?.enabled ?? true) ? 'On' : 'Off'}
                    </button>
                  </div>

                  {/* Schedule badges */}
                  <div className="flex flex-wrap gap-1 mb-2">
                    {spec.schedules.map((s, i) => (
                      <span
                        key={i}
                        className={`text-[10px] px-1.5 py-0.5 rounded ${
                          s.enabled
                            ? 'bg-[var(--color-accent-primary)]/10 text-[var(--color-accent-primary)]'
                            : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)]'
                        }`}
                      >
                        {s.type}
                      </span>
                    ))}
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)]">
                      {spec.model}
                    </span>
                    {(status?.skipEveryN ?? 1) > 1 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-status-warning)]/10 text-[var(--color-status-warning)]">
                        1/{status!.skipEveryN} freq
                      </span>
                    )}
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-2 text-xs mb-2">
                    <div>
                      <span className="text-[var(--color-text-muted)]">Runs</span>
                      <span className="block text-[var(--color-text-primary)]">{status?.totalRuns || 0}</span>
                    </div>
                    <div>
                      <span className="text-[var(--color-text-muted)]">Success</span>
                      <span className="block text-[var(--color-text-primary)]">{(status?.successRate || 0).toFixed(0)}%</span>
                    </div>
                    <div>
                      <span className="text-[var(--color-text-muted)]">$/wk</span>
                      <span className="block text-[var(--color-text-primary)]">${(status?.weeklyCost || 0).toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Warning indicators */}
                  {(status?.consecutiveFailures || 0) >= 3 && (
                    <div className="text-[10px] text-[var(--color-status-error)] mb-2 flex items-center gap-1">
                      <AlertTriangle size={10} />
                      {status!.consecutiveFailures} consecutive failures
                    </div>
                  )}
                  {(status?.consecutiveNoAction || 0) >= 3 && (
                    <div className="text-[10px] text-[var(--color-status-warning)] mb-2 flex items-center gap-1">
                      <AlertTriangle size={10} />
                      {status!.consecutiveNoAction} consecutive no-action runs
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex gap-1.5 mt-2 pt-2 border-t border-[var(--color-border-primary)]">
                    {/* Run Now with schedule type dropdown */}
                    <div className="relative">
                      <div className="flex">
                        <button
                          data-testid={`run-now-${id}`}
                          onClick={() => handleTriggerRun(id, enabledSchedules[0]?.type || 'daily')}
                          className="flex items-center gap-1 px-2 py-1 text-xs rounded-l bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-border-primary)] transition-colors"
                        >
                          <Play size={10} />
                          Run
                        </button>
                        {enabledSchedules.length > 1 && (
                          <button
                            data-testid={`run-type-menu-${id}`}
                            onClick={(e) => { e.stopPropagation(); setRunTypeMenu(runTypeMenu === id ? null : id); }}
                            className="flex items-center px-1 py-1 text-xs rounded-r border-l border-[var(--color-border-primary)] bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-border-primary)] transition-colors"
                          >
                            <ChevronDown size={10} />
                          </button>
                        )}
                      </div>
                      {runTypeMenu === id && enabledSchedules.length > 1 && (
                        <div className="absolute left-0 top-full mt-1 z-10 bg-[var(--color-bg-secondary)] border border-[var(--color-border-primary)] rounded shadow-lg py-1 min-w-[100px]">
                          {enabledSchedules.map((s) => (
                            <button
                              key={s.type}
                              data-testid={`run-type-${id}-${s.type}`}
                              onClick={(e) => { e.stopPropagation(); handleTriggerRun(id, s.type); }}
                              className="block w-full text-left px-3 py-1 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)]"
                            >
                              {s.type}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      data-testid={`history-${id}`}
                      onClick={() => setSelectedSpecialist(id)}
                      className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-border-primary)] transition-colors"
                    >
                      <History size={10} />
                      History
                    </button>
                    <button
                      data-testid={`configure-${id}`}
                      onClick={() => setConfigSpecialist(id)}
                      className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-border-primary)] transition-colors"
                    >
                      <Settings size={10} />
                      Configure
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Specialist Config Dialog */}
      <SpecialistConfigDialog
        isOpen={configSpecialist !== null}
        specialistId={configSpecialist}
        onClose={() => setConfigSpecialist(null)}
        onEdit={handleEditSpecialist}
      />
      <AddSpecialistDialog
        isOpen={showAddDialog || editingSpecialistId !== null}
        editingSpecialistId={editingSpecialistId}
        onClose={handleCloseEditor}
        onCreated={handleSpecialistCreated}
      />
    </div>
  );
}
