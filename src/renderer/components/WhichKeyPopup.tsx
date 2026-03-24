/**
 * @module src/components/WhichKeyPopup
 * Floating which-key popup that shows available shortcuts for the current zone.
 * For dialog-sidebar zone, shows nested leader groups (categories + drill-down).
 * Dismisses on: Space (toggle), Escape, Ctrl+Q, click-outside.
 */

import React, { useEffect, useRef, useMemo } from 'react';
import {
  VIM_ACTIONS,
  LEADER_GROUPS,
  getLeaderGroupsForZone,
  getDirectLeaderActions,
  getGroupedLeaderActions,
  type VimActionZone,
} from '@shared/vim-actions';

interface WhichKeyPopupProps {
  /** The zone to show actions for */
  zone: VimActionZone;
  /** Called when the popup should be dismissed */
  onDismiss: () => void;
  /** The currently selected leader group key (null = level 1) */
  leaderGroupKey?: string | null;
  /** Called when a group category is selected (drill into sub-actions), null to go back */
  onSelectGroup?: (key: string | null) => void;
}

export function WhichKeyPopup({ zone, onDismiss, leaderGroupKey = null, onSelectGroup }: WhichKeyPopupProps): React.ReactElement {
  const popupRef = useRef<HTMLDivElement>(null);

  const leaderGroups = useMemo(() => getLeaderGroupsForZone(zone), [zone]);
  const hasGroups = leaderGroups.length > 0;

  // Level 1: flat actions (zones without groups) or groups + direct actions
  const flatActions = useMemo(() => {
    if (!hasGroups) {
      // Non-grouped zone: show all single-key NORMAL vim actions
      return VIM_ACTIONS.filter(a =>
        a.zone === zone &&
        a.category === 'vim' &&
        a.mode === 'NORMAL' &&
        !a.key.includes('+') &&
        a.key.length <= 2 &&
        a.id !== 'leader-key'
      );
    }
    // Grouped zone level 1: show direct actions only
    return getDirectLeaderActions(zone);
  }, [zone, hasGroups]);

  // Level 2: sub-actions for the selected group
  const groupActions = useMemo(() => {
    if (!leaderGroupKey) return [];
    return getGroupedLeaderActions(zone, leaderGroupKey);
  }, [zone, leaderGroupKey]);

  const groupLabel = useMemo(() => {
    if (!leaderGroupKey) return null;
    return LEADER_GROUPS.find(g => g.key === leaderGroupKey && g.zone === zone)?.label ?? leaderGroupKey;
  }, [leaderGroupKey, zone]);

  // Display-only keyboard handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || (e.ctrlKey && e.key === 'q')) {
        e.preventDefault();
        e.stopPropagation();
        onDismiss();
        return;
      }
      // Space toggle is handled by useVimMode — don't interfere
      if (e.key === ' ') return;
      // Backspace at level 2: return to level 1
      if (e.key === 'Backspace' && hasGroups && leaderGroupKey && onSelectGroup) {
        e.preventDefault();
        e.stopPropagation();
        onSelectGroup(null);
        return;
      }
      // Group key at level 1: drill into group
      if (!leaderGroupKey && hasGroups && onSelectGroup) {
        const groupKeys = leaderGroups.map(g => g.key);
        if (groupKeys.includes(e.key)) {
          e.preventDefault();
          e.stopPropagation();
          onSelectGroup(e.key);
          return;
        }
      }
      // Any other key: ignore (popup persists, key propagates to zone handlers)
    };

    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [onDismiss, hasGroups, leaderGroupKey, onSelectGroup, leaderGroups]);

  // Click outside dismisses
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onDismiss();
      }
    };

    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onDismiss]);

  // Level 2: showing sub-actions for a group
  if (hasGroups && leaderGroupKey) {
    return (
      <div
        ref={popupRef}
        data-testid="which-key-popup"
        className="fixed bottom-10 left-1/2 -translate-x-1/2 z-50 bg-[var(--color-bg-secondary)] border border-[var(--color-border-primary)] rounded-lg shadow-xl p-3 min-w-[280px] max-w-[520px]"
      >
        <div data-testid="which-key-breadcrumb" className="text-[10px] font-medium text-[var(--color-text-muted)] uppercase tracking-wider mb-2">
          Leader &rsaquo; {groupLabel}
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          {groupActions.map(action => (
            <div
              key={action.id}
              data-testid={`which-key-item-${action.id}`}
              className="flex items-center gap-2 text-xs py-0.5"
            >
              <kbd className="inline-flex items-center justify-center min-w-[20px] px-1.5 py-0.5 text-[10px] font-mono font-bold bg-[var(--color-bg-tertiary)] rounded border border-[var(--color-border-primary)] text-[var(--color-accent-primary)]">
                {action.key}
              </kbd>
              <span className="text-[var(--color-text-secondary)] truncate">{action.description}</span>
            </div>
          ))}
        </div>
        {groupActions.length === 0 && (
          <div className="text-xs text-[var(--color-text-muted)] italic">No actions in this group</div>
        )}
      </div>
    );
  }

  // Level 1: show groups (if any) + flat/direct actions
  return (
    <div
      ref={popupRef}
      data-testid="which-key-popup"
      className="fixed bottom-10 left-1/2 -translate-x-1/2 z-50 bg-[var(--color-bg-secondary)] border border-[var(--color-border-primary)] rounded-lg shadow-xl p-3 min-w-[280px] max-w-[520px]"
    >
      <div className="text-[10px] font-medium text-[var(--color-text-muted)] uppercase tracking-wider mb-2">
        Leader
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        {/* Leader group categories */}
        {leaderGroups.map(group => (
          <div
            key={`group-${group.key}`}
            data-testid={`which-key-group-${group.key}`}
            className="flex items-center gap-2 text-xs py-0.5"
          >
            <kbd className="inline-flex items-center justify-center min-w-[20px] px-1.5 py-0.5 text-[10px] font-mono font-bold bg-[var(--color-accent-primary)] rounded border border-[var(--color-accent-primary)] text-[var(--color-bg-primary)]">
              {group.key}
            </kbd>
            <span className="text-[var(--color-text-primary)] font-medium truncate">{group.label}...</span>
          </div>
        ))}
        {/* Direct actions */}
        {flatActions.map(action => (
          <div
            key={action.id}
            data-testid={`which-key-item-${action.id}`}
            className="flex items-center gap-2 text-xs py-0.5"
          >
            <kbd className="inline-flex items-center justify-center min-w-[20px] px-1.5 py-0.5 text-[10px] font-mono font-bold bg-[var(--color-bg-tertiary)] rounded border border-[var(--color-border-primary)] text-[var(--color-accent-primary)]">
              {action.key}
            </kbd>
            <span className="text-[var(--color-text-secondary)] truncate">{action.description}</span>
          </div>
        ))}
      </div>
      {flatActions.length === 0 && leaderGroups.length === 0 && (
        <div className="text-xs text-[var(--color-text-muted)] italic">No shortcuts for this zone</div>
      )}
    </div>
  );
}
