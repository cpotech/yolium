import React, { useEffect, useState, useRef, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import type { ActionLogEntry } from '@shared/types/schedule';
import { formatActionTimestamp, getActionSummary, getActionContent, getExtraFields } from './action-helpers';

interface ActionsViewProps {
  specialistIds: string[];
  specialistNames: Record<string, string>;
  initialSpecialist?: string | null;
  isVimActive?: boolean;
}

export function ActionsView({
  specialistIds,
  specialistNames,
  initialSpecialist,
  isVimActive = false,
}: ActionsViewProps): React.ReactElement {
  const [actions, setActions] = useState<ActionLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterSpecialist, setFilterSpecialist] = useState<string>(initialSpecialist ?? 'all');
  const [filterActionType, setFilterActionType] = useState<string>('all');
  const [focusedActionIndex, setFocusedActionIndex] = useState(0);
  const gPendingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

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

  const actionTypes = [...new Set(actions.map((a) => a.action))].sort();

  const filteredActions = actions.filter((action) => {
    if (filterSpecialist !== 'all' && action.specialistId !== filterSpecialist) return false;
    if (filterActionType !== 'all' && action.action !== filterActionType) return false;
    return true;
  });

  // Clamp focusedActionIndex when filteredActions changes
  useEffect(() => {
    if (filteredActions.length === 0) {
      setFocusedActionIndex(0);
    } else if (focusedActionIndex >= filteredActions.length) {
      setFocusedActionIndex(filteredActions.length - 1);
    }
  }, [filteredActions.length, focusedActionIndex]);

  // Auto-scroll focused card into view
  useEffect(() => {
    if (!isVimActive || filteredActions.length === 0) return;
    const card = containerRef.current?.querySelector('[data-vim-focused="true"]') as HTMLElement | null;
    card?.scrollIntoView({ block: 'nearest' });
  }, [focusedActionIndex, isVimActive, filteredActions.length]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;
    if (!isVimActive || filteredActions.length === 0) return;

    if (e.key === 'j' || e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedActionIndex((focusedActionIndex + 1) % filteredActions.length);
      gPendingRef.current = false;
      return;
    }
    if (e.key === 'k' || e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedActionIndex((focusedActionIndex - 1 + filteredActions.length) % filteredActions.length);
      gPendingRef.current = false;
      return;
    }
    if (e.key === 'g') {
      if (gPendingRef.current) {
        e.preventDefault();
        setFocusedActionIndex(0);
        gPendingRef.current = false;
        return;
      } else {
        gPendingRef.current = true;
        return;
      }
    }
    if (e.key === 'G') {
      e.preventDefault();
      setFocusedActionIndex(filteredActions.length - 1);
      gPendingRef.current = false;
      return;
    }
  }, [isVimActive, filteredActions, focusedActionIndex]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8" data-testid="actions-view-loading">
        <RefreshCw className="w-5 h-5 text-[var(--color-text-muted)] animate-spin" />
      </div>
    );
  }

  if (actions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[var(--color-text-muted)]" data-testid="actions-view-empty">
        <p className="text-sm">No actions recorded yet</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="p-3 outline-none" data-testid="actions-view" tabIndex={0} onKeyDown={handleKeyDown}>
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
        {filteredActions.map((action, index) => {
          const dryRun = action.data.dryRun === true;
          const externalId =
            typeof action.data.externalId === 'string'
              ? action.data.externalId
              : typeof action.data.tweetId === 'string'
                ? action.data.tweetId
                : null;
          const summary = getActionSummary(action.data);
          const content = getActionContent(action.data);
          const extraFields = getExtraFields(action.data);
          const hasExtraFields = Object.keys(extraFields).length > 0;
          const isFocused = isVimActive && focusedActionIndex === index;

          return (
            <div
              key={action.id}
              className={`rounded border bg-[var(--color-bg-secondary)] p-2 ${
                isFocused
                  ? 'border-[var(--color-accent-primary)] ring-2 ring-[var(--color-accent-primary)] ring-offset-1 ring-offset-[var(--color-bg-primary)]'
                  : 'border-[var(--color-border-primary)]'
              }`}
              data-testid={`action-card-${action.id}`}
              data-vim-focused={isFocused ? 'true' : undefined}
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
              {content && (
                <div
                  className="mt-1.5 pl-2.5 border-l-2 border-[var(--color-accent-primary)]/30 bg-[var(--color-bg-tertiary)] rounded-r px-2 py-1.5"
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
    </div>
  );
}
