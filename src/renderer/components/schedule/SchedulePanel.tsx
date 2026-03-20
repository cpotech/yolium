import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Clock, Play, History, Settings, Power, PowerOff, RefreshCw, AlertTriangle, ChevronDown, Plus, RotateCcw, Keyboard, X } from 'lucide-react';
import { RunHistoryTable } from './RunHistoryTable';
import { ActionsView } from './ActionsView';
import { AddSpecialistDialog } from './AddSpecialistDialog';
import type { ActionStats, ScheduleType } from '@shared/types/schedule';
import { useVimModeContext } from '@renderer/context/VimModeContext';
import { useConfirmDialog } from '@renderer/hooks/useConfirmDialog';
import { ConfirmDialog } from '@renderer/components/shared/ConfirmDialog';

interface SpecialistInfo {
  name: string;
  description: string;
  model: string;
  schedules: Array<{ type: ScheduleType; cron: string; enabled: boolean }>;
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
  const [actionStats, setActionStats] = useState<Record<string, ActionStats>>({});
  const [selectedSpecialist, setSelectedSpecialist] = useState<string | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingSpecialistId, setEditingSpecialistId] = useState<string | null>(null);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [runTypeMenu, setRunTypeMenu] = useState<string | null>(null);
  const [runningIds, setRunningIds] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<'specialists' | 'actions'>('specialists');
  const [actionsFilterSpecialist, setActionsFilterSpecialist] = useState<string | null>(null);
  const [focusedSpecialistIndex, setFocusedSpecialistIndex] = useState(0);
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  const viewRef = useRef<HTMLDivElement>(null);
  const gPendingRef = useRef(false);
  const { confirm: confirmAction, dialogProps: confirmDialogProps } = useConfirmDialog();
  const vim = useVimModeContext();
  const isVimScheduleActive = vim.mode === 'NORMAL' && vim.activeZone === 'schedule';

  const loadState = useCallback(async () => {
    try {
      const [scheduleState, specialistDefs, running] = await Promise.all([
        window.electronAPI.schedule.getState(),
        window.electronAPI.schedule.getSpecialists(),
        window.electronAPI.schedule.getRunning(),
      ]);
      const actionStatsEntries = await Promise.all(
        Object.keys(specialistDefs).map(async (specialistId) => {
          try {
            const stats = await window.electronAPI.schedule.getActionStats(specialistId);
            return [specialistId, stats] as const;
          } catch (err) {
            console.warn(`Failed to load action stats for ${specialistId}:`, err);
            return [specialistId, { totalActions: 0, actionCounts: {} }] as const;
          }
        })
      );
      setState(scheduleState);
      setSpecialists(specialistDefs);
      setActionStats(Object.fromEntries(actionStatsEntries));
      setRunningIds(running);
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

  useEffect(() => {
    if (vim.activeZone === 'schedule' && !isLoading && viewRef.current) {
      const active = document.activeElement;
      const tag = active?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      viewRef.current.focus();
    }
  }, [vim.activeZone, isLoading]);

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

  const handleTriggerRun = useCallback(async (id: string, type: ScheduleType) => {
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
  }, [loadState]);

  const handleCloseEditor = useCallback(() => {
    setShowAddDialog(false);
    setEditingSpecialistId(null);
  }, []);

  const handleResetSpecialist = useCallback(async (id: string) => {
    const confirmed = await confirmAction({
      title: 'Reset Specialist',
      message: 'This will clear all run history, action logs, and workspace files for this specialist. This cannot be undone.',
      confirmLabel: 'Reset',
    });
    if (!confirmed) return;
    await window.electronAPI.schedule.resetSpecialist(id);
    loadState();
  }, [loadState, confirmAction]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;
    if (showAddDialog || editingSpecialistId !== null) return;

    const specialistIds = Object.keys(specialists);
    const currentIndex = Math.min(focusedSpecialistIndex, Math.max(specialistIds.length - 1, 0));
    const currentId = specialistIds[currentIndex];
    const spec = specialists[currentId];
    const status = state?.specialists[currentId];
    const enabledSchedules = spec?.schedules.filter(s => s.enabled) ?? [];
    const isRunning = runningIds.includes(currentId ?? '');

    if (viewMode === 'specialists' && isVimScheduleActive && specialistIds.length > 0) {
      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedSpecialistIndex((focusedSpecialistIndex + 1) % specialistIds.length);
        gPendingRef.current = false;
        return;
      }
      if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedSpecialistIndex((focusedSpecialistIndex - 1 + specialistIds.length) % specialistIds.length);
        gPendingRef.current = false;
        return;
      }
      if (e.key === 'g') {
        if (gPendingRef.current) {
          e.preventDefault();
          setFocusedSpecialistIndex(0);
          gPendingRef.current = false;
          return;
        } else {
          gPendingRef.current = true;
          return;
        }
      }
      if (e.key === 'G') {
        e.preventDefault();
        setFocusedSpecialistIndex(specialistIds.length - 1);
        gPendingRef.current = false;
        return;
      }
      if (e.key === 'r' && !isRunning && currentId) {
        e.preventDefault();
        handleTriggerRun(currentId, enabledSchedules[0]?.type || 'daily');
        gPendingRef.current = false;
        return;
      }
      if (e.key === 't' && currentId) {
        e.preventDefault();
        handleToggleSpecialist(currentId, !(status?.enabled ?? true));
        gPendingRef.current = false;
        return;
      }
      if (e.key === 'Enter' && currentId) {
        e.preventDefault();
        setSelectedSpecialist(currentId);
        gPendingRef.current = false;
        return;
      }
      if (e.key === 'c' && currentId) {
        e.preventDefault();
        setEditingSpecialistId(currentId);
        gPendingRef.current = false;
        return;
      }
    }

    if (e.key === 'n') {
      e.preventDefault();
      setEditingSpecialistId(null);
      setShowAddDialog(true);
    }
    if (e.key === '1') {
      e.preventDefault();
      setViewMode('specialists');
      setActionsFilterSpecialist(null);
    }
    if (e.key === '2') {
      e.preventDefault();
      setViewMode('actions');
      setActionsFilterSpecialist(null);
    }
    if (e.key === '?') {
      e.preventDefault();
      setShowShortcutsHelp(prev => !prev);
    }
  }, [isVimScheduleActive, specialists, focusedSpecialistIndex, state, runningIds, showAddDialog, editingSpecialistId, viewMode, handleTriggerRun, handleToggleSpecialist]);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center" data-testid="schedule-panel-loading">
        <RefreshCw className="w-6 h-6 text-[var(--color-text-muted)] animate-spin" />
      </div>
    );
  }

  if (selectedSpecialist) {
    return (
      <div className="h-full flex flex-col overflow-hidden outline-none" data-testid="schedule-panel-history" tabIndex={0}>
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
        <div className="flex-1 min-h-0 overflow-hidden">
          <RunHistoryTable
            specialistId={selectedSpecialist}
            isVimActive={isVimScheduleActive}
            onBack={() => setSelectedSpecialist(null)}
          />
        </div>
      </div>
    );
  }

  return (
    <div ref={viewRef} data-testid="schedule-panel" data-vim-zone="schedule" tabIndex={0} onKeyDown={handleKeyDown} className="h-full flex flex-col overflow-hidden outline-none">
      {/* Shortcuts help overlay */}
      {showShortcutsHelp && (
        <div
          data-testid="schedule-shortcuts-help"
          className="px-4 py-3 bg-[var(--color-bg-secondary)] border-b border-[var(--color-border-primary)] text-sm"
        >
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-medium text-[var(--color-text-primary)] flex items-center gap-2">
              <Keyboard size={14} />
              Keyboard Shortcuts
            </h3>
            <button onClick={() => setShowShortcutsHelp(false)} className="p-1 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">
              <X size={14} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[var(--color-text-secondary)]">
            <div><kbd className="px-1.5 py-0.5 text-xs bg-[var(--color-bg-tertiary)] rounded border border-[var(--color-border-primary)]">J</kbd> Next specialist</div>
            <div><kbd className="px-1.5 py-0.5 text-xs bg-[var(--color-bg-tertiary)] rounded border border-[var(--color-border-primary)]">K</kbd> Previous specialist</div>
            <div><kbd className="px-1.5 py-0.5 text-xs bg-[var(--color-bg-tertiary)] rounded border border-[var(--color-border-primary)]">gg</kbd> First specialist</div>
            <div><kbd className="px-1.5 py-0.5 text-xs bg-[var(--color-bg-tertiary)] rounded border border-[var(--color-border-primary)]">G</kbd> Last specialist</div>
            <div><kbd className="px-1.5 py-0.5 text-xs bg-[var(--color-bg-tertiary)] rounded border border-[var(--color-border-primary)]">R</kbd> Trigger run</div>
            <div><kbd className="px-1.5 py-0.5 text-xs bg-[var(--color-bg-tertiary)] rounded border border-[var(--color-border-primary)]">T</kbd> Toggle enabled</div>
            <div><kbd className="px-1.5 py-0.5 text-xs bg-[var(--color-bg-tertiary)] rounded border border-[var(--color-border-primary)]">Enter</kbd> Open history</div>
            <div><kbd className="px-1.5 py-0.5 text-xs bg-[var(--color-bg-tertiary)] rounded border border-[var(--color-border-primary)]">C</kbd> Configure specialist</div>
            <div><kbd className="px-1.5 py-0.5 text-xs bg-[var(--color-bg-tertiary)] rounded border border-[var(--color-border-primary)]">N</kbd> Add specialist</div>
            <div><kbd className="px-1.5 py-0.5 text-xs bg-[var(--color-bg-tertiary)] rounded border border-[var(--color-border-primary)]">1</kbd> Specialists view</div>
            <div><kbd className="px-1.5 py-0.5 text-xs bg-[var(--color-bg-tertiary)] rounded border border-[var(--color-border-primary)]">2</kbd> Actions view</div>
            <div><kbd className="px-1.5 py-0.5 text-xs bg-[var(--color-bg-tertiary)] rounded border border-[var(--color-border-primary)]">?</kbd> Toggle shortcuts</div>
          </div>
          <div className="mt-2 pt-2 border-t border-[var(--color-border-primary)]">
            <h4 className="text-[11px] font-medium text-[var(--color-text-primary)] mb-1">Sub-view Navigation (History / Actions)</h4>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[var(--color-text-secondary)]">
              <div><kbd className="px-1.5 py-0.5 text-xs bg-[var(--color-bg-tertiary)] rounded border border-[var(--color-border-primary)]">Escape</kbd> Back (from history/detail)</div>
              <div><kbd className="px-1.5 py-0.5 text-xs bg-[var(--color-bg-tertiary)] rounded border border-[var(--color-border-primary)]">j/k</kbd> Navigate runs/actions</div>
              <div><kbd className="px-1.5 py-0.5 text-xs bg-[var(--color-bg-tertiary)] rounded border border-[var(--color-border-primary)]">gg/G</kbd> First/last run/action</div>
              <div><kbd className="px-1.5 py-0.5 text-xs bg-[var(--color-bg-tertiary)] rounded border border-[var(--color-border-primary)]">Enter</kbd> Open run detail</div>
            </div>
          </div>
        </div>
      )}
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
          <div className="flex rounded border border-[var(--color-border-primary)]">
            <button
              data-testid="view-toggle-specialists"
              onClick={() => { setViewMode('specialists'); setActionsFilterSpecialist(null); }}
              className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                viewMode === 'specialists'
                  ? 'bg-[var(--color-accent-primary)] text-white'
                  : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
              }`}
            >
              Specialists
            </button>
            <button
              data-testid="view-toggle-actions"
              onClick={() => { setViewMode('actions'); setActionsFilterSpecialist(null); }}
              className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                viewMode === 'actions'
                  ? 'bg-[var(--color-accent-primary)] text-white'
                  : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
              }`}
            >
              Actions
            </button>
          </div>
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

      {/* Main content */}
      {viewMode === 'actions' ? (
        <div className="flex-1 min-h-0 overflow-auto">
          <ActionsView
            specialistIds={Object.keys(specialists)}
            specialistNames={Object.fromEntries(
              Object.entries(specialists).map(([id, spec]) => [id, spec.name])
            )}
            initialSpecialist={actionsFilterSpecialist}
            isVimActive={isVimScheduleActive}
          />
        </div>
      ) : (
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
            {Object.entries(specialists).map(([id, spec], index) => {
              const status = state?.specialists[id];
              const enabledSchedules = spec.schedules.filter(s => s.enabled);
              const isRunning = runningIds.includes(id);
              const isFocused = isVimScheduleActive && focusedSpecialistIndex === index;
              return (
                <div
                  key={id}
                  data-testid={`specialist-card-${id}`}
                  data-vim-focused={isFocused ? 'true' : undefined}
                  className={`rounded-lg border bg-[var(--color-bg-secondary)] p-3 ${
                    isRunning
                      ? 'border-green-500/40'
                      : isFocused
                        ? 'border-[var(--color-accent-primary)] ring-2 ring-[var(--color-accent-primary)] ring-offset-1 ring-offset-[var(--color-bg-primary)]'
                        : 'border-[var(--color-border-primary)]'
                  }`}
                >
                  {/* Card header */}
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="text-sm font-medium text-[var(--color-text-primary)] flex items-center gap-1.5">
                        {isRunning && (
                          <span
                            data-testid={`running-indicator-${id}`}
                            className="inline-block w-2 h-2 rounded-full bg-green-400 animate-pulse"
                          />
                        )}
                        {spec.name}
                      </h3>
                      {isRunning ? (
                        <p className="text-xs text-green-400 mt-0.5">Running...</p>
                      ) : (
                        <p className="text-xs text-[var(--color-text-muted)] mt-0.5 line-clamp-2">{spec.description}</p>
                      )}
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
                  <div className="grid grid-cols-4 gap-2 text-xs mb-2">
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
                    <div>
                      <span className="text-[var(--color-text-muted)]">Actions</span>
                      <span
                        className="block text-[var(--color-accent-primary)] cursor-pointer hover:underline"
                        data-testid={`specialist-actions-${id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setActionsFilterSpecialist(id);
                          setViewMode('actions');
                        }}
                      >
                        {actionStats[id]?.totalActions || 0}
                      </span>
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
                          disabled={isRunning}
                          className={`flex items-center gap-1 px-2 py-1 text-xs rounded-l transition-colors ${
                            isRunning
                              ? 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)] cursor-not-allowed opacity-50'
                              : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-border-primary)]'
                          }`}
                        >
                          <Play size={10} />
                          {isRunning ? 'Running' : 'Run'}
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
                      onClick={() => setEditingSpecialistId(id)}
                      className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-border-primary)] transition-colors"
                    >
                      <Settings size={10} />
                      Configure
                    </button>
                    <button
                      data-testid={`reset-${id}`}
                      onClick={() => handleResetSpecialist(id)}
                      disabled={isRunning}
                      className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${
                        isRunning
                          ? 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)] cursor-not-allowed opacity-50'
                          : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] hover:text-[#ef4444] hover:bg-[rgba(239,68,68,0.15)]'
                      }`}
                      title="Reset specialist: clear history, actions, and workspace"
                    >
                      <RotateCcw size={10} />
                      Reset
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      )}

      <AddSpecialistDialog
        isOpen={showAddDialog || editingSpecialistId !== null}
        editingSpecialistId={editingSpecialistId}
        onClose={handleCloseEditor}
        onCreated={handleSpecialistCreated}
      />

      {/* Confirm dialog */}
      <ConfirmDialog {...confirmDialogProps} />
    </div>
  );
}
