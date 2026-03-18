/**
 * @module src/shared/vim-actions
 * Centralized manifest of all keyboard actions across zones.
 * Single source of truth for shortcuts — used by KeyboardShortcutsDialog and tests.
 */

import type { VimZone } from '@renderer/hooks/useVimMode';

export type VimActionZone =
  | VimZone
  | 'global'
  | 'dialog'
  | 'dialog-sidebar'
  | 'mode'
  | 'electron-tabs'
  | 'electron-app'
  | 'electron-view'
  | 'terminal'
  | 'mouse';

export interface VimAction {
  id: string;
  key: string;
  zone: VimActionZone;
  mode: 'NORMAL' | 'INSERT' | 'ANY';
  category: 'vim' | 'electron' | 'terminal' | 'mouse';
  group: string;
  description: string;
  testId?: string;
}

export const VIM_ACTIONS: VimAction[] = [
  // --- Vim Modes (zone: mode) ---
  { id: 'mode-insert', key: 'i', zone: 'mode', mode: 'NORMAL', category: 'vim', group: 'Vim Modes', description: 'Enter INSERT mode' },
  { id: 'mode-normal', key: 'Escape', zone: 'mode', mode: 'INSERT', category: 'vim', group: 'Vim Modes', description: 'Return to NORMAL mode' },
  { id: 'mode-normal-alt', key: 'Ctrl+[', zone: 'mode', mode: 'INSERT', category: 'vim', group: 'Vim Modes', description: 'Return to NORMAL mode (alt)' },

  // --- Zone switching (global) ---
  { id: 'zone-sidebar', key: 'e', zone: 'global', mode: 'NORMAL', category: 'vim', group: 'Zone Switching', description: 'Focus sidebar' },
  { id: 'zone-tabs', key: 't', zone: 'global', mode: 'NORMAL', category: 'vim', group: 'Zone Switching', description: 'Focus tab bar' },
  { id: 'zone-content', key: 'c', zone: 'global', mode: 'NORMAL', category: 'vim', group: 'Zone Switching', description: 'Focus content' },
  { id: 'zone-status', key: 's', zone: 'global', mode: 'NORMAL', category: 'vim', group: 'Zone Switching', description: 'Focus status bar' },
  { id: 'zone-cycle-forward', key: 'Tab', zone: 'global', mode: 'NORMAL', category: 'vim', group: 'Zone Switching', description: 'Cycle zones forward' },
  { id: 'zone-cycle-backward', key: 'Shift+Tab', zone: 'global', mode: 'NORMAL', category: 'vim', group: 'Zone Switching', description: 'Cycle zones backward' },
  { id: 'go-to-kanban', key: 'b', zone: 'global', mode: 'NORMAL', category: 'vim', group: 'Zone Switching', description: 'Go to kanban board' },

  // --- Content zone — Kanban board ---
  { id: 'card-down', key: 'j', zone: 'content', mode: 'NORMAL', category: 'vim', group: 'Content (Kanban)', description: 'Next card' },
  { id: 'card-up', key: 'k', zone: 'content', mode: 'NORMAL', category: 'vim', group: 'Content (Kanban)', description: 'Previous card' },
  { id: 'col-left', key: 'h', zone: 'content', mode: 'NORMAL', category: 'vim', group: 'Content (Kanban)', description: 'Previous column' },
  { id: 'col-right', key: 'l', zone: 'content', mode: 'NORMAL', category: 'vim', group: 'Content (Kanban)', description: 'Next column' },
  { id: 'card-first', key: 'gg', zone: 'content', mode: 'NORMAL', category: 'vim', group: 'Content (Kanban)', description: 'First card' },
  { id: 'card-last', key: 'G', zone: 'content', mode: 'NORMAL', category: 'vim', group: 'Content (Kanban)', description: 'Last card' },
  { id: 'card-open', key: 'Enter', zone: 'content', mode: 'NORMAL', category: 'vim', group: 'Content (Kanban)', description: 'Open card' },
  { id: 'card-delete', key: 'x', zone: 'content', mode: 'NORMAL', category: 'vim', group: 'Content (Kanban)', description: 'Delete focused card', testId: 'kanban-card-delete' },
  { id: 'new-item', key: 'n', zone: 'content', mode: 'NORMAL', category: 'vim', group: 'Content (Kanban)', description: 'New item', testId: 'new-item-button' },
  { id: 'refresh', key: 'r', zone: 'content', mode: 'NORMAL', category: 'vim', group: 'Content (Kanban)', description: 'Refresh board', testId: 'refresh-button' },
  { id: 'search', key: '/', zone: 'content', mode: 'NORMAL', category: 'vim', group: 'Content (Kanban)', description: 'Search' },
  { id: 'help', key: '?', zone: 'content', mode: 'NORMAL', category: 'vim', group: 'Content (Kanban)', description: 'Keyboard shortcuts' },
  { id: 'select-all', key: 'Ctrl+A', zone: 'content', mode: 'NORMAL', category: 'vim', group: 'Content (Kanban)', description: 'Select all items' },
  { id: 'delete-selected', key: 'Delete', zone: 'content', mode: 'NORMAL', category: 'vim', group: 'Content (Kanban)', description: 'Delete selected items' },
  { id: 'visual-select', key: 'v', zone: 'content', mode: 'NORMAL', category: 'vim', group: 'Content (Kanban)', description: 'Visual select' },
  { id: 'clear-selection', key: 'Escape', zone: 'content', mode: 'NORMAL', category: 'vim', group: 'Content (Kanban)', description: 'Clear selection / close search' },

  // --- Tab bar zone ---
  { id: 'tab-next', key: 'l', zone: 'tabs', mode: 'NORMAL', category: 'vim', group: 'Tab Bar', description: 'Next tab' },
  { id: 'tab-prev', key: 'h', zone: 'tabs', mode: 'NORMAL', category: 'vim', group: 'Tab Bar', description: 'Previous tab' },
  { id: 'tab-activate', key: 'Enter', zone: 'tabs', mode: 'NORMAL', category: 'vim', group: 'Tab Bar', description: 'Activate tab' },
  { id: 'tab-close', key: 'x', zone: 'tabs', mode: 'NORMAL', category: 'vim', group: 'Tab Bar', description: 'Close tab' },
  { id: 'tab-first', key: 'Home', zone: 'tabs', mode: 'NORMAL', category: 'vim', group: 'Tab Bar', description: 'First tab' },
  { id: 'tab-last', key: 'End', zone: 'tabs', mode: 'NORMAL', category: 'vim', group: 'Tab Bar', description: 'Last tab' },
  { id: 'tab-new', key: '+', zone: 'tabs', mode: 'NORMAL', category: 'vim', group: 'Tab Bar', description: 'New tab' },

  // --- Sidebar zone ---
  { id: 'project-down', key: 'j', zone: 'sidebar', mode: 'NORMAL', category: 'vim', group: 'Sidebar', description: 'Next project' },
  { id: 'project-up', key: 'k', zone: 'sidebar', mode: 'NORMAL', category: 'vim', group: 'Sidebar', description: 'Previous project' },
  { id: 'project-open', key: 'Enter', zone: 'sidebar', mode: 'NORMAL', category: 'vim', group: 'Sidebar', description: 'Open project' },
  { id: 'project-remove', key: 'x', zone: 'sidebar', mode: 'NORMAL', category: 'vim', group: 'Sidebar', description: 'Remove project' },
  { id: 'project-add', key: 'a', zone: 'sidebar', mode: 'NORMAL', category: 'vim', group: 'Sidebar', description: 'Add project', testId: 'add-project-button' },
  { id: 'project-add-alt', key: '+', zone: 'sidebar', mode: 'NORMAL', category: 'vim', group: 'Sidebar', description: 'Add project (alt)' },
  { id: 'project-scheduled', key: 'h', zone: 'sidebar', mode: 'NORMAL', category: 'vim', group: 'Sidebar', description: 'Scheduled agents' },

  // --- Schedule zone — Scheduled Agents panel ---
  { id: 'specialist-down', key: 'j', zone: 'schedule', mode: 'NORMAL', category: 'vim', group: 'Schedule (Agents)', description: 'Next specialist' },
  { id: 'specialist-up', key: 'k', zone: 'schedule', mode: 'NORMAL', category: 'vim', group: 'Schedule (Agents)', description: 'Previous specialist' },
  { id: 'specialist-first', key: 'gg', zone: 'schedule', mode: 'NORMAL', category: 'vim', group: 'Schedule (Agents)', description: 'First specialist' },
  { id: 'specialist-last', key: 'G', zone: 'schedule', mode: 'NORMAL', category: 'vim', group: 'Schedule (Agents)', description: 'Last specialist' },
  { id: 'specialist-run', key: 'r', zone: 'schedule', mode: 'NORMAL', category: 'vim', group: 'Schedule (Agents)', description: 'Trigger run' },
  { id: 'specialist-toggle', key: 't', zone: 'schedule', mode: 'NORMAL', category: 'vim', group: 'Schedule (Agents)', description: 'Toggle enabled' },
  { id: 'specialist-history', key: 'Enter', zone: 'schedule', mode: 'NORMAL', category: 'vim', group: 'Schedule (Agents)', description: 'Open history' },
  { id: 'specialist-configure', key: 'c', zone: 'schedule', mode: 'NORMAL', category: 'vim', group: 'Schedule (Agents)', description: 'Configure specialist' },
  { id: 'specialist-add', key: 'n', zone: 'schedule', mode: 'NORMAL', category: 'vim', group: 'Schedule (Agents)', description: 'Add specialist' },
  { id: 'specialist-view-specialists', key: '1', zone: 'schedule', mode: 'NORMAL', category: 'vim', group: 'Schedule (Agents)', description: 'Specialists view' },
  { id: 'specialist-view-actions', key: '2', zone: 'schedule', mode: 'NORMAL', category: 'vim', group: 'Schedule (Agents)', description: 'Actions view' },
  { id: 'schedule-help', key: '?', zone: 'schedule', mode: 'NORMAL', category: 'vim', group: 'Schedule (Agents)', description: 'Keyboard shortcuts' },

  // --- Status bar zone ---
  { id: 'status-next', key: 'l', zone: 'status-bar', mode: 'NORMAL', category: 'vim', group: 'Status Bar', description: 'Next button' },
  { id: 'status-prev', key: 'h', zone: 'status-bar', mode: 'NORMAL', category: 'vim', group: 'Status Bar', description: 'Previous button' },
  { id: 'status-activate', key: 'Enter', zone: 'status-bar', mode: 'NORMAL', category: 'vim', group: 'Status Bar', description: 'Activate button' },
  { id: 'status-settings', key: ',', zone: 'status-bar', mode: 'NORMAL', category: 'vim', group: 'Status Bar', description: 'Settings', testId: 'settings-button' },
  { id: 'status-project', key: 'p', zone: 'status-bar', mode: 'NORMAL', category: 'vim', group: 'Status Bar', description: 'Project settings', testId: 'project-settings-button' },
  { id: 'status-stop', key: 'q', zone: 'status-bar', mode: 'NORMAL', category: 'vim', group: 'Status Bar', description: 'Stop container', testId: 'stop-button' },
  { id: 'status-record', key: 'w', zone: 'status-bar', mode: 'NORMAL', category: 'vim', group: 'Status Bar', description: 'Toggle recording' },
  { id: 'status-theme', key: 'L', zone: 'status-bar', mode: 'NORMAL', category: 'vim', group: 'Status Bar', description: 'Toggle theme', testId: 'theme-toggle' },

  // --- Dialog zone — ItemDetailDialog ---
  { id: 'field-down', key: 'j', zone: 'dialog', mode: 'NORMAL', category: 'vim', group: 'Dialog (Work Item)', description: 'Next field' },
  { id: 'field-up', key: 'k', zone: 'dialog', mode: 'NORMAL', category: 'vim', group: 'Dialog (Work Item)', description: 'Previous field' },
  { id: 'field-first', key: 'gg', zone: 'dialog', mode: 'NORMAL', category: 'vim', group: 'Dialog (Work Item)', description: 'First field' },
  { id: 'field-last', key: 'G', zone: 'dialog', mode: 'NORMAL', category: 'vim', group: 'Dialog (Work Item)', description: 'Last field' },
  { id: 'field-edit', key: 'i', zone: 'dialog', mode: 'NORMAL', category: 'vim', group: 'Dialog (Work Item)', description: 'Edit field' },
  { id: 'dialog-close', key: 'Escape', zone: 'dialog', mode: 'NORMAL', category: 'vim', group: 'Dialog (Work Item)', description: 'Close dialog' },
  { id: 'dialog-save', key: 'Ctrl+Enter', zone: 'dialog', mode: 'NORMAL', category: 'vim', group: 'Dialog (Work Item)', description: 'Save item' },
  { id: 'dialog-delete', key: 'Ctrl+Delete', zone: 'dialog', mode: 'NORMAL', category: 'vim', group: 'Dialog (Work Item)', description: 'Delete item' },
  { id: 'dialog-toggle-focus', key: 'Tab', zone: 'dialog', mode: 'NORMAL', category: 'vim', group: 'Dialog (Work Item)', description: 'Toggle Editor/Sidebar focus' },
  { id: 'dialog-close-ctrl-q', key: 'Ctrl+Q', zone: 'dialog', mode: 'ANY', category: 'vim', group: 'Dialog (Work Item)', description: 'Close dialog' },

  // --- Dialog sidebar — single-key agent shortcuts ---
  { id: 'agent-plan-sidebar', key: 'p', zone: 'dialog-sidebar', mode: 'NORMAL', category: 'vim', group: 'Sidebar Focus (Work Item)', description: 'Plan Agent (sidebar)' },
  { id: 'agent-code-sidebar', key: 'c', zone: 'dialog-sidebar', mode: 'NORMAL', category: 'vim', group: 'Sidebar Focus (Work Item)', description: 'Code Agent (sidebar)' },
  { id: 'agent-verify-sidebar', key: 'v', zone: 'dialog-sidebar', mode: 'NORMAL', category: 'vim', group: 'Sidebar Focus (Work Item)', description: 'Verify Agent (sidebar)' },
  { id: 'agent-scout-sidebar', key: 's', zone: 'dialog-sidebar', mode: 'NORMAL', category: 'vim', group: 'Sidebar Focus (Work Item)', description: 'Scout Agent (sidebar)' },
  { id: 'agent-design-sidebar', key: 'D', zone: 'dialog-sidebar', mode: 'NORMAL', category: 'vim', group: 'Sidebar Focus (Work Item)', description: 'Design Agent (sidebar)' },
  { id: 'agent-marketing-sidebar', key: 'm', zone: 'dialog-sidebar', mode: 'NORMAL', category: 'vim', group: 'Sidebar Focus (Work Item)', description: 'Marketing Agent (sidebar)' },
  { id: 'agent-stop-sidebar', key: 'x', zone: 'dialog-sidebar', mode: 'NORMAL', category: 'vim', group: 'Sidebar Focus (Work Item)', description: 'Stop Agent (sidebar)' },
  { id: 'item-delete-sidebar', key: 'd', zone: 'dialog-sidebar', mode: 'NORMAL', category: 'vim', group: 'Sidebar Focus (Work Item)', description: 'Delete Item (sidebar)' },
  { id: 'dialog-compare-changes', key: 'f', zone: 'dialog-sidebar', mode: 'NORMAL', category: 'vim', group: 'Sidebar Focus (Work Item)', description: 'Compare Changes (diff)' },
  { id: 'dialog-rebase', key: 'r', zone: 'dialog-sidebar', mode: 'NORMAL', category: 'vim', group: 'Sidebar Focus (Work Item)', description: 'Pull Latest (Rebase)' },
  { id: 'dialog-check-conflicts', key: 'k', zone: 'dialog-sidebar', mode: 'NORMAL', category: 'vim', group: 'Sidebar Focus (Work Item)', description: 'Check Conflicts' },
  { id: 'dialog-merge-push-pr', key: 'g', zone: 'dialog-sidebar', mode: 'NORMAL', category: 'vim', group: 'Sidebar Focus (Work Item)', description: 'Squash, Merge & Push PR' },
  { id: 'dialog-approve-pr', key: 'a', zone: 'dialog-sidebar', mode: 'NORMAL', category: 'vim', group: 'Sidebar Focus (Work Item)', description: 'Approve PR' },
  { id: 'dialog-merge-pr', key: 'w', zone: 'dialog-sidebar', mode: 'NORMAL', category: 'vim', group: 'Sidebar Focus (Work Item)', description: 'Merge PR (finalize)' },
  { id: 'dialog-open-pr', key: 'o', zone: 'dialog-sidebar', mode: 'NORMAL', category: 'vim', group: 'Sidebar Focus (Work Item)', description: 'Open PR (external)' },

  // --- Agent Controls — Ctrl+Shift shortcuts ---
  { id: 'agent-plan', key: 'Ctrl+Shift+P', zone: 'dialog', mode: 'NORMAL', category: 'vim', group: 'Agent Controls (Work Item)', description: 'Plan Agent' },
  { id: 'agent-code', key: 'Ctrl+Shift+C', zone: 'dialog', mode: 'NORMAL', category: 'vim', group: 'Agent Controls (Work Item)', description: 'Code Agent' },
  { id: 'agent-verify', key: 'Ctrl+Shift+V', zone: 'dialog', mode: 'NORMAL', category: 'vim', group: 'Agent Controls (Work Item)', description: 'Verify Agent' },
  { id: 'agent-scout', key: 'Ctrl+Shift+S', zone: 'dialog', mode: 'NORMAL', category: 'vim', group: 'Agent Controls (Work Item)', description: 'Scout Agent' },
  { id: 'agent-design', key: 'Ctrl+Shift+D', zone: 'dialog', mode: 'NORMAL', category: 'vim', group: 'Agent Controls (Work Item)', description: 'Design Agent' },
  { id: 'agent-marketing', key: 'Ctrl+Shift+M', zone: 'dialog', mode: 'NORMAL', category: 'vim', group: 'Agent Controls (Work Item)', description: 'Marketing Agent' },

  // --- Electron Tabs ---
  { id: 'electron-tab-new', key: 'Ctrl+Shift+T', zone: 'electron-tabs', mode: 'ANY', category: 'electron', group: 'Tab Management', description: 'New tab' },
  { id: 'electron-tab-close', key: 'Ctrl+Shift+W', zone: 'electron-tabs', mode: 'ANY', category: 'electron', group: 'Tab Management', description: 'Close tab' },
  { id: 'electron-tab-next', key: 'Ctrl+Shift+]', zone: 'electron-tabs', mode: 'ANY', category: 'electron', group: 'Tab Management', description: 'Next tab' },
  { id: 'electron-tab-prev', key: 'Ctrl+Shift+[', zone: 'electron-tabs', mode: 'ANY', category: 'electron', group: 'Tab Management', description: 'Previous tab' },
  { id: 'electron-tab-next-alt', key: 'Ctrl+PageDown', zone: 'electron-tabs', mode: 'ANY', category: 'electron', group: 'Tab Management', description: 'Next tab (alt)' },
  { id: 'electron-tab-prev-alt', key: 'Ctrl+PageUp', zone: 'electron-tabs', mode: 'ANY', category: 'electron', group: 'Tab Management', description: 'Previous tab (alt)' },

  // --- Electron App ---
  { id: 'electron-shortcuts', key: 'Ctrl+?', zone: 'electron-app', mode: 'ANY', category: 'electron', group: 'Application', description: 'Keyboard shortcuts' },
  { id: 'electron-settings', key: 'Ctrl+Shift+,', zone: 'electron-app', mode: 'ANY', category: 'electron', group: 'Application', description: 'Settings' },
  { id: 'electron-new-project', key: 'Ctrl+Shift+N', zone: 'electron-app', mode: 'ANY', category: 'electron', group: 'Application', description: 'New project' },
  { id: 'electron-scheduled', key: 'Ctrl+Shift+H', zone: 'electron-app', mode: 'ANY', category: 'electron', group: 'Application', description: 'Scheduled agents' },
  { id: 'electron-record', key: 'Ctrl+Shift+R', zone: 'electron-app', mode: 'ANY', category: 'electron', group: 'Application', description: 'Toggle recording' },

  // --- Electron View ---
  { id: 'electron-devtools', key: 'Ctrl+Shift+I', zone: 'electron-view', mode: 'ANY', category: 'electron', group: 'View', description: 'Developer tools' },
  { id: 'electron-zoom-in', key: 'Ctrl++', zone: 'electron-view', mode: 'ANY', category: 'electron', group: 'View', description: 'Zoom in' },
  { id: 'electron-zoom-out', key: 'Ctrl+-', zone: 'electron-view', mode: 'ANY', category: 'electron', group: 'View', description: 'Zoom out' },
  { id: 'electron-zoom-reset', key: 'Ctrl+0', zone: 'electron-view', mode: 'ANY', category: 'electron', group: 'View', description: 'Reset zoom' },
  { id: 'electron-fullscreen', key: 'F11', zone: 'electron-view', mode: 'ANY', category: 'electron', group: 'View', description: 'Toggle fullscreen' },

  // --- Terminal ---
  { id: 'terminal-copy', key: 'Ctrl+C', zone: 'terminal', mode: 'ANY', category: 'terminal', group: 'Terminal', description: 'Copy (with selection) / SIGINT' },
  { id: 'terminal-paste', key: 'Ctrl+V', zone: 'terminal', mode: 'ANY', category: 'terminal', group: 'Terminal', description: 'Paste' },

  // --- Mouse ---
  { id: 'mouse-multi-select', key: 'Ctrl+Click', zone: 'mouse', mode: 'ANY', category: 'mouse', group: 'Kanban Selection', description: 'Multi-select items' },
  { id: 'mouse-range-select', key: 'Shift+Click', zone: 'mouse', mode: 'ANY', category: 'mouse', group: 'Kanban Selection', description: 'Range select items' },
];

/** Display order for shortcut groups in KeyboardShortcutsDialog. */
export const SHORTCUT_GROUP_ORDER: string[] = [
  'Vim Modes',
  'Zone Switching',
  'Content (Kanban)',
  'Tab Bar',
  'Sidebar',
  'Schedule (Agents)',
  'Status Bar',
  'Dialog (Work Item)',
  'Sidebar Focus (Work Item)',
  'Agent Controls (Work Item)',
  'Kanban Selection',
  'Tab Management',
  'Terminal',
  'View',
  'Application',
];

export function getActionsForZone(zone: VimActionZone): VimAction[] {
  return VIM_ACTIONS.filter(a => a.zone === zone);
}

export function getActionsByGroup(): Map<string, VimAction[]> {
  const map = new Map<string, VimAction[]>();
  for (const action of VIM_ACTIONS) {
    const list = map.get(action.group);
    if (list) {
      list.push(action);
    } else {
      map.set(action.group, [action]);
    }
  }
  return map;
}
