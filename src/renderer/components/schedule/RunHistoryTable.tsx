import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { RefreshCw, ArrowLeft, Clock, Zap, DollarSign, ChevronRight } from 'lucide-react';
import type { ActionLogEntry } from '@shared/types/schedule';
import { formatActionTimestamp, getActionSummary, getActionContent, getExtraFields } from './action-helpers';

interface RunRecord {
  id: string;
  specialistId: string;
  scheduleType: string;
  startedAt: string;
  completedAt: string;
  status: string;
  tokensUsed: number;
  costUsd: number;
  summary: string;
  outcome: string;
}

interface RunStats {
  totalRuns: number;
  successRate: number;
  weeklyCost: number;
  averageTokensPerRun: number;
  averageDurationMs: number;
}

const OUTCOME_BADGE: Record<string, string> = {
  completed: 'bg-[var(--color-status-success)]/15 text-[var(--color-status-success)]',
  no_action: 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)]',
  failed: 'bg-[var(--color-status-error)]/15 text-[var(--color-status-error)]',
  skipped: 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)]',
  timeout: 'bg-[var(--color-status-warning)]/15 text-[var(--color-status-warning)]',
};

const OUTCOME_DOT: Record<string, string> = {
  completed: 'bg-[var(--color-status-success)]',
  no_action: 'bg-[var(--color-text-muted)]',
  failed: 'bg-[var(--color-status-error)]',
  skipped: 'bg-[var(--color-text-muted)]',
  timeout: 'bg-[var(--color-status-warning)]',
};

const TYPE_COLORS: Record<string, string> = {
  heartbeat: 'bg-[var(--color-accent-primary)]/10 text-[var(--color-accent-primary)]',
  daily: 'bg-[var(--color-status-success)]/10 text-[var(--color-status-success)]',
  weekly: 'bg-[var(--color-special-worktree)]/10 text-[var(--color-special-worktree)]',
  custom: 'bg-[var(--color-status-warning)]/10 text-[var(--color-status-warning)]',
};

const OUTCOME_LABELS: Record<string, string> = {
  completed: 'Completed',
  no_action: 'No action',
  failed: 'Failed',
  skipped: 'Skipped',
  timeout: 'Timeout',
};

interface RunHistoryTableProps {
  specialistId: string;
}

function formatDuration(startedAt: string, completedAt: string): string {
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainSec = seconds % 60;
  return `${minutes}m ${remainSec}s`;
}

function formatDurationMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainSec = seconds % 60;
  if (minutes < 60) return remainSec > 0 ? `${minutes}m ${remainSec}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainMin = minutes % 60;
  return remainMin > 0 ? `${hours}h ${remainMin}m` : `${hours}h`;
}

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatAbsoluteTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function PillFilter({
  options,
  value,
  onChange,
  testId,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  testId: string;
}): React.ReactElement {
  return (
    <div className="flex gap-0.5" data-testid={testId} role="radiogroup">
      {options.map((opt) => (
        <button
          key={opt.value}
          role="radio"
          aria-checked={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-2 py-0.5 text-[11px] rounded-full transition-colors ${
            value === opt.value
              ? 'bg-[var(--color-accent-primary)]/15 text-[var(--color-accent-primary)] font-medium'
              : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)]'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function RunDetailView({
  run,
  specialistId,
  onBack,
}: {
  run: RunRecord;
  specialistId: string;
  onBack: () => void;
}): React.ReactElement {
  const [logContent, setLogContent] = useState<string>('');
  const [actions, setActions] = useState<ActionLogEntry[]>([]);
  const [isLoadingLog, setIsLoadingLog] = useState(true);
  const logRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    setIsLoadingLog(true);
    Promise.all([
      window.electronAPI.schedule.getRunLog(specialistId, run.id),
      window.electronAPI.schedule.getRunActions(specialistId, run.id),
    ])
      .then(([log, runActions]) => {
        setLogContent(log);
        setActions(runActions);
      })
      .catch((err) => {
        console.error('Failed to fetch run details:', err);
        setLogContent('');
        setActions([]);
      })
      .finally(() => {
        setIsLoadingLog(false);
      });
  }, [specialistId, run.id]);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logContent]);

  const duration = formatDuration(run.startedAt, run.completedAt);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden" data-testid="run-detail-view">
      {/* Header with back + metadata inline */}
      <div className="flex items-center gap-3 px-3 py-2.5 border-b border-[var(--color-border-primary)]">
        <button
          data-testid="run-detail-back"
          onClick={onBack}
          className="flex items-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
        >
          <ArrowLeft size={13} />
          Back
        </button>
        <span className="w-px h-3.5 bg-[var(--color-border-primary)]" />
        <span className="text-xs text-[var(--color-text-primary)]">
          {formatAbsoluteTime(run.startedAt)}
        </span>
        <span className={`px-1.5 py-0.5 rounded text-[10px] ${OUTCOME_BADGE[run.outcome] || 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]'}`}>
          {OUTCOME_LABELS[run.outcome] || run.outcome}
        </span>
        <span className={`px-1.5 py-0.5 rounded text-[10px] ${TYPE_COLORS[run.scheduleType] || TYPE_COLORS.custom}`}>
          {run.scheduleType}
        </span>
        <span className="ml-auto text-[11px] text-[var(--color-text-muted)] flex items-center gap-3">
          <span title="Duration"><Clock size={10} className="inline mr-0.5 opacity-60" />{duration}</span>
          <span title="Tokens"><Zap size={10} className="inline mr-0.5 opacity-60" />{run.tokensUsed.toLocaleString()}</span>
          <span title="Cost"><DollarSign size={10} className="inline mr-0.5 opacity-60" />{run.costUsd.toFixed(4)}</span>
        </span>
      </div>

      {/* Summary — no separate bordered section, just a line of context */}
      {run.summary && (
        <div className="px-3 py-2">
          <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">{run.summary}</p>
        </div>
      )}

      {/* Actions */}
      <div className="shrink-0 max-h-[40%] overflow-auto yolium-scrollbar" data-testid="run-detail-actions">
        {actions.length === 0 ? (
          <div className="px-3 py-3 text-xs text-[var(--color-text-muted)]" data-testid="run-detail-actions-empty">
            No actions recorded for this run
          </div>
        ) : (
          <div className="px-3 pb-2 space-y-1.5">
            <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] font-medium">
              Actions
            </span>
            {actions.map((action) => {
              const dryRun = action.data.dryRun === true;
              const externalId = typeof action.data.externalId === 'string'
                ? action.data.externalId
                : typeof action.data.tweetId === 'string'
                  ? action.data.tweetId
                  : null;
              const summary = getActionSummary(action.data);
              const content = getActionContent(action.data);
              const extraFields = getExtraFields(action.data);
              const hasExtraFields = Object.keys(extraFields).length > 0;

              return (
                <div
                  key={action.id}
                  className="px-2.5 py-1.5 rounded bg-[var(--color-bg-secondary)]"
                  data-testid={`run-action-${action.id}`}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] text-[var(--color-text-muted)]">
                      {formatActionTimestamp(action.timestamp)}
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-[var(--color-accent-primary)]/10 text-[var(--color-accent-primary)]">
                      {action.action}
                    </span>
                    {dryRun && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-[var(--color-status-warning)]/10 text-[var(--color-status-warning)]">
                        Dry run
                      </span>
                    )}
                    {externalId && (
                      <span className="text-[10px] text-[var(--color-text-secondary)]">
                        id: {externalId}
                      </span>
                    )}
                  </div>
                  {summary && (
                    <p className="mt-0.5 text-xs text-[var(--color-text-secondary)] break-words">
                      {summary}
                    </p>
                  )}
                  {content && (
                    <div
                      className="mt-1.5 px-2.5 py-1.5 rounded bg-[var(--color-bg-primary)]"
                      data-testid={`action-content-${action.id}`}
                    >
                      <p className="text-xs text-[var(--color-text-primary)] whitespace-pre-wrap break-words">
                        {content}
                      </p>
                    </div>
                  )}
                  {hasExtraFields && (
                    <details className="mt-1">
                      <summary className="text-[10px] text-[var(--color-text-muted)] cursor-pointer">
                        Extra fields
                      </summary>
                      <pre className="mt-1 text-[10px] text-[var(--color-text-secondary)] whitespace-pre-wrap break-words">
                        {JSON.stringify(extraFields, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Log panel */}
      <div className="h-0 flex-grow overflow-hidden flex flex-col mt-1">
        <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] font-medium">
          Log
        </div>
        {isLoadingLog ? (
          <div className="flex-1 flex items-center justify-center" data-testid="run-detail-log-loading">
            <RefreshCw className="w-4 h-4 text-[var(--color-text-muted)] animate-spin" />
          </div>
        ) : logContent ? (
          <pre
            ref={logRef}
            className="yolium-scrollbar h-0 flex-grow overflow-y-scroll px-3 pb-3 text-[11px] font-mono leading-relaxed text-[var(--color-text-secondary)] whitespace-pre-wrap break-words"
            data-testid="run-detail-log"
          >
            {logContent}
          </pre>
        ) : (
          <div className="flex-1 flex items-center justify-center text-xs text-[var(--color-text-muted)]" data-testid="run-detail-log-empty">
            No log available
          </div>
        )}
      </div>
    </div>
  );
}

export function RunHistoryTable({ specialistId }: RunHistoryTableProps): React.ReactElement {
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [stats, setStats] = useState<RunStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>('all');
  const [filterOutcome, setFilterOutcome] = useState<string>('all');
  const [selectedRun, setSelectedRun] = useState<RunRecord | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [history, runStats] = await Promise.all([
        window.electronAPI.schedule.getHistory(specialistId, 100),
        window.electronAPI.schedule.getStats(specialistId),
      ]);
      setRuns([...history].reverse()); // newest first
      setStats(runStats);
    } catch (err) {
      console.error('Failed to load run history:', err);
    } finally {
      setIsLoading(false);
    }
  }, [specialistId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const availableTypes = useMemo(() => {
    const types = new Set(runs.map(r => r.scheduleType));
    return ['all', ...Array.from(types).sort()];
  }, [runs]);

  const availableOutcomes = useMemo(() => {
    const outcomes = new Set(runs.map(r => r.outcome));
    return ['all', ...Array.from(outcomes).sort()];
  }, [runs]);

  const filteredRuns = runs.filter(run => {
    if (filterType !== 'all' && run.scheduleType !== filterType) return false;
    if (filterOutcome !== 'all' && run.outcome !== filterOutcome) return false;
    return true;
  });

  if (selectedRun) {
    return (
      <div className="h-full min-h-0 overflow-hidden" data-testid="run-history-detail-shell">
        <RunDetailView
          run={selectedRun}
          specialistId={specialistId}
          onBack={() => setSelectedRun(null)}
        />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8" data-testid="run-history-loading">
        <RefreshCw className="w-5 h-5 text-[var(--color-text-muted)] animate-spin" />
      </div>
    );
  }

  const typeLabels: Record<string, string> = { all: 'All', heartbeat: 'Heartbeat', daily: 'Daily', weekly: 'Weekly', custom: 'Custom' };
  const outcomeLabels: Record<string, string> = { all: 'All', completed: 'Completed', no_action: 'No action', failed: 'Failed', skipped: 'Skipped', timeout: 'Timeout' };

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="run-history-table">
      {/* Compact stats summary — single flowing line, not hero cards */}
      {stats && stats.totalRuns > 0 && (
        <div className="flex shrink-0 items-center gap-4 px-3 pt-3 text-xs text-[var(--color-text-muted)]">
          <span>
            <span className="text-[var(--color-text-primary)] font-medium">{stats.totalRuns}</span> runs
          </span>
          <span>
            <span className="text-[var(--color-text-primary)] font-medium">{stats.successRate.toFixed(0)}%</span> success
          </span>
          <span>
            <span className="text-[var(--color-text-primary)] font-medium">${stats.weeklyCost.toFixed(2)}</span>/wk
          </span>
          <span>
            ~<span className="text-[var(--color-text-primary)] font-medium">{Math.round(stats.averageTokensPerRun).toLocaleString()}</span> tokens/run
          </span>
          {stats.averageDurationMs > 0 && (
            <span>
              ~<span className="text-[var(--color-text-primary)] font-medium">{formatDurationMs(stats.averageDurationMs)}</span>/run
            </span>
          )}
        </div>
      )}

      {/* Pill filters */}
      <div className="flex shrink-0 items-center gap-3 px-3 py-3">
        <PillFilter
          testId="filter-type"
          options={availableTypes.map(t => ({ value: t, label: typeLabels[t] || t }))}
          value={filterType}
          onChange={setFilterType}
        />
        <span className="w-px h-3 bg-[var(--color-border-primary)]" />
        <PillFilter
          testId="filter-outcome"
          options={availableOutcomes.map(o => ({ value: o, label: outcomeLabels[o] || o }))}
          value={filterOutcome}
          onChange={setFilterOutcome}
        />
        <span className="text-[11px] text-[var(--color-text-muted)] ml-auto">
          {filteredRuns.length} {filteredRuns.length === 1 ? 'run' : 'runs'}
        </span>
      </div>

      {/* Run list — timeline style instead of table */}
      <div className="yolium-scrollbar flex-1 min-h-0 overflow-auto px-3 pb-3" data-testid="run-history-list">
        {filteredRuns.length === 0 ? (
          <div className="flex h-full min-h-[12rem] flex-col items-center justify-center text-[var(--color-text-muted)]">
            <Clock size={24} className="mb-2 opacity-15" />
            <p className="text-xs">No runs yet</p>
          </div>
        ) : (
          <div className="space-y-px">
            {filteredRuns.map(run => (
              <button
                key={run.id}
                type="button"
                data-testid={`run-row-${run.id}`}
                onClick={() => setSelectedRun(run)}
                className="w-full cursor-pointer text-left flex items-center gap-2.5 rounded px-2.5 py-2 transition-colors group hover:bg-[var(--color-bg-tertiary)]"
              >
                {/* Outcome dot */}
                <span
                  className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${OUTCOME_DOT[run.outcome] || 'bg-[var(--color-text-muted)]'}`}
                  title={OUTCOME_LABELS[run.outcome] || run.outcome}
                />

                {/* Main content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[var(--color-text-primary)] truncate">
                      {run.summary || OUTCOME_LABELS[run.outcome] || run.outcome}
                    </span>
                    <span className={`flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] ${OUTCOME_BADGE[run.outcome] || 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]'}`}>
                      {OUTCOME_LABELS[run.outcome] || run.outcome}
                    </span>
                    <span className={`flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] ${TYPE_COLORS[run.scheduleType] || TYPE_COLORS.custom}`}>
                      {run.scheduleType}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-[11px] text-[var(--color-text-muted)]">
                    <span title={formatAbsoluteTime(run.startedAt)}>
                      {formatRelativeTime(run.startedAt)}
                    </span>
                    <span>{formatDuration(run.startedAt, run.completedAt)}</span>
                    <span>{run.tokensUsed.toLocaleString()} tokens</span>
                    <span>${run.costUsd.toFixed(4)}</span>
                  </div>
                </div>

                {/* Chevron */}
                <ChevronRight size={13} className="flex-shrink-0 text-[var(--color-text-muted)] opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
