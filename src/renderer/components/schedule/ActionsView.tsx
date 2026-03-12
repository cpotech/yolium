import React, { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { ActionLogEntry } from '@shared/types/schedule';
import { formatActionTimestamp, getActionSummary, getExtraFields } from './action-helpers';

interface ActionsViewProps {
  specialistIds: string[];
  specialistNames: Record<string, string>;
  initialSpecialist?: string | null;
}

export function ActionsView({
  specialistIds,
  specialistNames,
  initialSpecialist,
}: ActionsViewProps): React.ReactElement {
  const [actions, setActions] = useState<ActionLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterSpecialist, setFilterSpecialist] = useState<string>(initialSpecialist ?? 'all');
  const [filterActionType, setFilterActionType] = useState<string>('all');

  useEffect(() => {
    setIsLoading(true);
    window.electronAPI.schedule
      .getAllActions(specialistIds, 200)
      .then((result) => {
        setActions(result);
      })
      .catch((err) => {
        console.error('Failed to fetch actions:', err);
        setActions([]);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [specialistIds]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8" data-testid="actions-view-loading">
        <RefreshCw className="w-5 h-5 text-[var(--color-text-muted)] animate-spin" />
      </div>
    );
  }

  const actionTypes = [...new Set(actions.map((a) => a.action))].sort();

  const filteredActions = actions.filter((action) => {
    if (filterSpecialist !== 'all' && action.specialistId !== filterSpecialist) return false;
    if (filterActionType !== 'all' && action.action !== filterActionType) return false;
    return true;
  });

  if (actions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[var(--color-text-muted)]" data-testid="actions-view-empty">
        <p className="text-sm">No actions recorded yet</p>
      </div>
    );
  }

  return (
    <div className="p-3" data-testid="actions-view">
      {/* Filters */}
      <div className="flex items-center gap-2 mb-3">
        <select
          data-testid="actions-filter-specialist"
          value={filterSpecialist}
          onChange={(e) => setFilterSpecialist(e.target.value)}
          className="text-xs bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] border border-[var(--color-border-primary)] rounded px-2 py-1"
        >
          <option value="all">All Specialists</option>
          {specialistIds.map((id) => (
            <option key={id} value={id}>
              {specialistNames[id] || id}
            </option>
          ))}
        </select>
        <select
          data-testid="actions-filter-action-type"
          value={filterActionType}
          onChange={(e) => setFilterActionType(e.target.value)}
          className="text-xs bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] border border-[var(--color-border-primary)] rounded px-2 py-1"
        >
          <option value="all">All Action Types</option>
          {actionTypes.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
        <span className="text-xs text-[var(--color-text-muted)] ml-auto">
          {filteredActions.length} actions
        </span>
      </div>

      {/* Action cards */}
      <div className="space-y-2">
        {filteredActions.map((action) => {
          const dryRun = action.data.dryRun === true;
          const externalId =
            typeof action.data.externalId === 'string'
              ? action.data.externalId
              : typeof action.data.tweetId === 'string'
                ? action.data.tweetId
                : null;
          const summary = getActionSummary(action.data);
          const extraFields = getExtraFields(action.data);
          const hasExtraFields = Object.keys(extraFields).length > 0;

          return (
            <div
              key={action.id}
              className="rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] p-2"
              data-testid={`action-card-${action.id}`}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] text-[var(--color-text-muted)]">
                  {formatActionTimestamp(action.timestamp)}
                </span>
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-purple-500/20 text-purple-400">
                  {specialistNames[action.specialistId] || action.specialistId}
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
                <p className="mt-1 text-xs text-[var(--color-text-secondary)] break-words">
                  {summary}
                </p>
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
    </div>
  );
}
