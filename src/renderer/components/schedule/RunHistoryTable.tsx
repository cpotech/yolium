import React, { useEffect, useState, useCallback, useRef } from 'react';
import { RefreshCw, ArrowLeft } from 'lucide-react';

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

const OUTCOME_COLORS: Record<string, string> = {
  completed: 'text-green-400',
  no_action: 'text-[var(--color-text-muted)]',
  failed: 'text-[var(--color-status-error)]',
  skipped: 'text-[var(--color-text-muted)]',
  timeout: 'text-[var(--color-status-warning)]',
};

const OUTCOME_BADGE: Record<string, string> = {
  completed: 'bg-green-500/20 text-green-400',
  no_action: 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)]',
  failed: 'bg-[var(--color-status-error)]/20 text-[var(--color-status-error)]',
  skipped: 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)]',
  timeout: 'bg-[var(--color-status-warning)]/20 text-[var(--color-status-warning)]',
};

const TYPE_COLORS: Record<string, string> = {
  heartbeat: 'bg-blue-500/20 text-blue-400',
  daily: 'bg-green-500/20 text-green-400',
  weekly: 'bg-purple-500/20 text-purple-400',
  custom: 'bg-orange-500/20 text-orange-400',
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
  const [isLoadingLog, setIsLoadingLog] = useState(true);
  const logRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    setIsLoadingLog(true);
    window.electronAPI.schedule.getRunLog(specialistId, run.id)
      .then((log) => {
        setLogContent(log);
      })
      .catch((err) => {
        console.error('Failed to fetch run log:', err);
        setLogContent('');
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

  return (
    <div className="flex flex-col h-full" data-testid="run-detail-view">
      {/* Header */}
      <div className="flex items-center gap-2 p-3 border-b border-[var(--color-border-primary)]">
        <button
          data-testid="run-detail-back"
          onClick={onBack}
          className="flex items-center gap-1 px-2 py-1 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] rounded transition-colors"
        >
          <ArrowLeft size={14} />
          Back
        </button>
        <span className="text-sm font-medium text-[var(--color-text-primary)]">
          {new Date(run.startedAt).toLocaleString(undefined, {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
          })}
        </span>
        <span className={`px-1.5 py-0.5 rounded text-[10px] ${OUTCOME_BADGE[run.outcome] || 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]'}`}>
          {run.outcome}
        </span>
        <span className={`px-1.5 py-0.5 rounded text-[10px] ${TYPE_COLORS[run.scheduleType] || TYPE_COLORS.custom}`}>
          {run.scheduleType}
        </span>
      </div>

      {/* Stats bar */}
      <div className="flex gap-5 px-3 py-2 bg-[var(--color-bg-secondary)] border-b border-[var(--color-border-primary)]">
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] text-[var(--color-text-muted)]">Tokens</span>
          <span className="text-xs text-[var(--color-text-primary)]">{run.tokensUsed.toLocaleString()}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] text-[var(--color-text-muted)]">Cost</span>
          <span className="text-xs text-[var(--color-text-primary)]">${run.costUsd.toFixed(4)}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] text-[var(--color-text-muted)]">Duration</span>
          <span className="text-xs text-[var(--color-text-primary)]">{formatDuration(run.startedAt, run.completedAt)}</span>
        </div>
      </div>

      {/* Summary */}
      <div className="px-3 py-2 border-b border-[var(--color-border-primary)]">
        <span className="text-[10px] text-[var(--color-text-muted)]">Summary</span>
        <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{run.summary}</p>
      </div>

      {/* Log panel */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        <div className="px-3 py-1.5 text-[10px] text-[var(--color-text-muted)] border-b border-[var(--color-border-primary)]">
          Agent Log
        </div>
        {isLoadingLog ? (
          <div className="flex-1 flex items-center justify-center" data-testid="run-detail-log-loading">
            <RefreshCw className="w-4 h-4 text-[var(--color-text-muted)] animate-spin" />
          </div>
        ) : logContent ? (
          <pre
            ref={logRef}
            className="flex-1 min-h-0 overflow-auto p-3 text-xs font-mono leading-relaxed text-[var(--color-text-secondary)] whitespace-pre-wrap break-words"
            data-testid="run-detail-log"
          >
            {logContent}
          </pre>
        ) : (
          <div className="flex-1 flex items-center justify-center text-xs text-[var(--color-text-muted)]" data-testid="run-detail-log-empty">
            No log data available for this run
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

  const filteredRuns = runs.filter(run => {
    if (filterType !== 'all' && run.scheduleType !== filterType) return false;
    if (filterOutcome !== 'all' && run.outcome !== filterOutcome) return false;
    return true;
  });

  if (selectedRun) {
    return (
      <RunDetailView
        run={selectedRun}
        specialistId={specialistId}
        onBack={() => setSelectedRun(null)}
      />
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8" data-testid="run-history-loading">
        <RefreshCw className="w-5 h-5 text-[var(--color-text-muted)] animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-3" data-testid="run-history-table">
      {/* Stats summary */}
      {stats && (
        <div className="grid grid-cols-4 gap-3 mb-4">
          <div className="rounded bg-[var(--color-bg-secondary)] p-2">
            <span className="text-xs text-[var(--color-text-muted)]">Total Runs</span>
            <span className="block text-sm font-medium text-[var(--color-text-primary)]">{stats.totalRuns}</span>
          </div>
          <div className="rounded bg-[var(--color-bg-secondary)] p-2">
            <span className="text-xs text-[var(--color-text-muted)]">Success Rate</span>
            <span className="block text-sm font-medium text-[var(--color-text-primary)]">{stats.successRate.toFixed(1)}%</span>
          </div>
          <div className="rounded bg-[var(--color-bg-secondary)] p-2">
            <span className="text-xs text-[var(--color-text-muted)]">Weekly Cost</span>
            <span className="block text-sm font-medium text-[var(--color-text-primary)]">${stats.weeklyCost.toFixed(2)}</span>
          </div>
          <div className="rounded bg-[var(--color-bg-secondary)] p-2">
            <span className="text-xs text-[var(--color-text-muted)]">Avg Tokens</span>
            <span className="block text-sm font-medium text-[var(--color-text-primary)]">{Math.round(stats.averageTokensPerRun)}</span>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-2 mb-3">
        <select
          data-testid="filter-type"
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          className="text-xs bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] border border-[var(--color-border-primary)] rounded px-2 py-1"
        >
          <option value="all">All Types</option>
          <option value="heartbeat">Heartbeat</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
        </select>
        <select
          data-testid="filter-outcome"
          value={filterOutcome}
          onChange={e => setFilterOutcome(e.target.value)}
          className="text-xs bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] border border-[var(--color-border-primary)] rounded px-2 py-1"
        >
          <option value="all">All Outcomes</option>
          <option value="completed">Completed</option>
          <option value="no_action">No Action</option>
          <option value="failed">Failed</option>
          <option value="skipped">Skipped</option>
          <option value="timeout">Timeout</option>
        </select>
        <span className="text-xs text-[var(--color-text-muted)] ml-auto">
          {filteredRuns.length} runs
        </span>
      </div>

      {/* Table */}
      {filteredRuns.length === 0 ? (
        <div className="text-center py-8 text-[var(--color-text-muted)] text-sm">
          No run history yet
        </div>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[var(--color-text-muted)] border-b border-[var(--color-border-primary)]">
              <th className="text-left py-1.5 px-2 font-medium">Time</th>
              <th className="text-left py-1.5 px-2 font-medium">Type</th>
              <th className="text-left py-1.5 px-2 font-medium">Outcome</th>
              <th className="text-right py-1.5 px-2 font-medium">Tokens</th>
              <th className="text-right py-1.5 px-2 font-medium">Cost</th>
              <th className="text-left py-1.5 px-2 font-medium">Summary</th>
            </tr>
          </thead>
          <tbody>
            {filteredRuns.map(run => (
              <tr
                key={run.id}
                data-testid={`run-row-${run.id}`}
                onClick={() => setSelectedRun(run)}
                className="border-b border-[var(--color-border-primary)]/50 hover:bg-[var(--color-bg-tertiary)] hover:border-l-2 hover:border-l-[var(--color-accent-primary)] transition-colors cursor-pointer"
              >
                <td className="py-1.5 px-2 text-[var(--color-text-secondary)] whitespace-nowrap">
                  {new Date(run.startedAt).toLocaleString(undefined, {
                    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                  })}
                </td>
                <td className="py-1.5 px-2">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] ${TYPE_COLORS[run.scheduleType] || TYPE_COLORS.custom}`}>
                    {run.scheduleType}
                  </span>
                </td>
                <td className={`py-1.5 px-2 ${OUTCOME_COLORS[run.outcome] || 'text-[var(--color-text-secondary)]'}`}>
                  {run.outcome}
                </td>
                <td className="py-1.5 px-2 text-right text-[var(--color-text-secondary)]">
                  {run.tokensUsed.toLocaleString()}
                </td>
                <td className="py-1.5 px-2 text-right text-[var(--color-text-secondary)]">
                  ${run.costUsd.toFixed(4)}
                </td>
                <td className="py-1.5 px-2 text-[var(--color-text-secondary)] max-w-xs truncate">
                  {run.summary}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
