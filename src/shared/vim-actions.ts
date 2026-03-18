/**
 * @module src/shared/vim-actions
 * Centralized manifest of all vim keyboard actions across zones.
 * Single source of truth for shortcuts — used by KeyboardShortcutsDialog and tests.
 */

import type { VimZone } from '@renderer/hooks/useVimMode';

export type VimActionZone = VimZone | 'global' | 'dialog';

export interface VimAction {
  id: string;
  key: string;
  zone: VimActionZone;
  mode: 'NORMAL';
  description: string;
  testId?: string;
}

export const VIM_ACTIONS: VimAction[] = [
  // Zone switching (global — work in any zone when no dialog is open)
  { id: 'zone-sidebar', key: 'e', zone: 'global', mode: 'NORMAL', description: 'Focus sidebar' },
  { id: 'zone-tabs', key: 't', zone: 'global', mode: 'NORMAL', description: 'Focus tab bar' },
  { id: 'zone-content', key: 'c', zone: 'global', mode: 'NORMAL', description: 'Focus content' },
  { id: 'zone-status', key: 's', zone: 'global', mode: 'NORMAL', description: 'Focus status bar' },
  { id: 'zone-cycle-forward', key: 'Tab', zone: 'global', mode: 'NORMAL', description: 'Cycle zones forward' },
  { id: 'zone-cycle-backward', key: 'Shift+Tab', zone: 'global', mode: 'NORMAL', description: 'Cycle zones backward' },

  // Content zone — Kanban board
  { id: 'card-down', key: 'j', zone: 'content', mode: 'NORMAL', description: 'Next card' },
  { id: 'card-up', key: 'k', zone: 'content', mode: 'NORMAL', description: 'Previous card' },
  { id: 'col-left', key: 'h', zone: 'content', mode: 'NORMAL', description: 'Previous column' },
  { id: 'col-right', key: 'l', zone: 'content', mode: 'NORMAL', description: 'Next column' },
  { id: 'card-first', key: 'gg', zone: 'content', mode: 'NORMAL', description: 'First card' },
  { id: 'card-last', key: 'G', zone: 'content', mode: 'NORMAL', description: 'Last card' },
  { id: 'card-open', key: 'Enter', zone: 'content', mode: 'NORMAL', description: 'Open card' },
  { id: 'card-delete', key: 'x', zone: 'content', mode: 'NORMAL', description: 'Delete focused card', testId: 'kanban-card-delete' },
  { id: 'new-item', key: 'n', zone: 'content', mode: 'NORMAL', description: 'New item', testId: 'new-item-button' },
  { id: 'refresh', key: 'r', zone: 'content', mode: 'NORMAL', description: 'Refresh board', testId: 'refresh-button' },
  { id: 'search', key: '/', zone: 'content', mode: 'NORMAL', description: 'Search' },
  { id: 'help', key: '?', zone: 'content', mode: 'NORMAL', description: 'Keyboard shortcuts' },
  { id: 'select-all', key: 'Ctrl+A', zone: 'content', mode: 'NORMAL', description: 'Select all items' },
  { id: 'delete-selected', key: 'Delete', zone: 'content', mode: 'NORMAL', description: 'Delete selected items' },
  { id: 'visual-select', key: 'v', zone: 'content', mode: 'NORMAL', description: 'Visual select' },
  { id: 'clear-selection', key: 'Escape', zone: 'content', mode: 'NORMAL', description: 'Clear selection / close search' },

  // Tab bar zone
  { id: 'tab-next', key: 'l', zone: 'tabs', mode: 'NORMAL', description: 'Next tab' },
  { id: 'tab-prev', key: 'h', zone: 'tabs', mode: 'NORMAL', description: 'Previous tab' },
  { id: 'tab-activate', key: 'Enter', zone: 'tabs', mode: 'NORMAL', description: 'Activate tab' },
  { id: 'tab-close', key: 'x', zone: 'tabs', mode: 'NORMAL', description: 'Close tab' },
  { id: 'tab-first', key: 'Home', zone: 'tabs', mode: 'NORMAL', description: 'First tab' },
  { id: 'tab-last', key: 'End', zone: 'tabs', mode: 'NORMAL', description: 'Last tab' },
  { id: 'tab-new', key: '+', zone: 'tabs', mode: 'NORMAL', description: 'New tab' },

  // Sidebar zone
  { id: 'project-down', key: 'j', zone: 'sidebar', mode: 'NORMAL', description: 'Next project' },
  { id: 'project-up', key: 'k', zone: 'sidebar', mode: 'NORMAL', description: 'Previous project' },
  { id: 'project-open', key: 'Enter', zone: 'sidebar', mode: 'NORMAL', description: 'Open project' },
  { id: 'project-remove', key: 'x', zone: 'sidebar', mode: 'NORMAL', description: 'Remove project' },
  { id: 'project-add', key: 'a', zone: 'sidebar', mode: 'NORMAL', description: 'Add project', testId: 'add-project-button' },
  { id: 'project-add-alt', key: '+', zone: 'sidebar', mode: 'NORMAL', description: 'Add project (alt)' },
  { id: 'project-scheduled', key: 'h', zone: 'sidebar', mode: 'NORMAL', description: 'Scheduled agents' },

  // Status bar zone
  { id: 'status-next', key: 'l', zone: 'status-bar', mode: 'NORMAL', description: 'Next button' },
  { id: 'status-prev', key: 'h', zone: 'status-bar', mode: 'NORMAL', description: 'Previous button' },
  { id: 'status-activate', key: 'Enter', zone: 'status-bar', mode: 'NORMAL', description: 'Activate button' },
  { id: 'status-settings', key: ',', zone: 'status-bar', mode: 'NORMAL', description: 'Settings', testId: 'settings-button' },
  { id: 'status-project', key: 'p', zone: 'status-bar', mode: 'NORMAL', description: 'Project settings', testId: 'project-settings-button' },
  { id: 'status-stop', key: 'q', zone: 'status-bar', mode: 'NORMAL', description: 'Stop container', testId: 'stop-button' },
  { id: 'status-record', key: 'w', zone: 'status-bar', mode: 'NORMAL', description: 'Toggle recording' },
  { id: 'status-theme', key: 'L', zone: 'status-bar', mode: 'NORMAL', description: 'Toggle theme', testId: 'theme-toggle' },

  // Dialog zone — ItemDetailDialog
  { id: 'field-down', key: 'j', zone: 'dialog', mode: 'NORMAL', description: 'Next field' },
  { id: 'field-up', key: 'k', zone: 'dialog', mode: 'NORMAL', description: 'Previous field' },
  { id: 'field-first', key: 'gg', zone: 'dialog', mode: 'NORMAL', description: 'First field' },
  { id: 'field-last', key: 'G', zone: 'dialog', mode: 'NORMAL', description: 'Last field' },
  { id: 'field-edit', key: 'i', zone: 'dialog', mode: 'NORMAL', description: 'Edit field' },
  { id: 'dialog-close', key: 'Escape', zone: 'dialog', mode: 'NORMAL', description: 'Close dialog' },
  { id: 'dialog-save', key: 'Ctrl+Enter', zone: 'dialog', mode: 'NORMAL', description: 'Save item' },
  { id: 'dialog-delete', key: 'Ctrl+Delete', zone: 'dialog', mode: 'NORMAL', description: 'Delete item' },
];

export function getActionsForZone(zone: VimActionZone): VimAction[] {
  return VIM_ACTIONS.filter(a => a.zone === zone);
}
