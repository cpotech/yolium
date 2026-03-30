/**
 * @module src/shared/vim-actions
 * Centralized manifest of all keyboard actions across zones.
 * Single source of truth for shortcuts — used by KeyboardShortcutsDialog, WhichKeyPopup, and tests.
 */

import type { VimZone } from '@renderer/hooks/useVimMode';

export type VimActionZone =
  | VimZone
  | 'global'
  | 'dialog'
  | 'dialog-diff'
  | 'dialog-sidebar'
  | 'dialog-browser'
  | 'dialog-log'
  | 'dialog-scroll'
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
  /** Leader group key this action belongs to (e.g., 'a' for Agent, 'g' for Git/PR) */
  leaderGroup?: string;
}

export interface LeaderGroup {
  key: string;
  label: string;
  zone: VimActionZone;
}

export const LEADER_GROUPS: LeaderGroup[] = [
  { key: 'a', label: 'Agent', zone: 'dialog-sidebar' },
  { key: 'g', label: 'Git/PR', zone: 'dialog-sidebar' },
];

export const VIM_ACTIONS: VimAction[] = [
  // --- Vim Modes (zone: mode) ---
  { id: 'mode-normal', key: 'Escape', zone: 'mode', mode: 'INSERT', category: 'vim', group: 'Vim Modes', description: 'Return to NORMAL mode' },
  { id: 'mode-normal-alt', key: 'Ctrl+[', zone: 'mode', mode: 'INSERT', category: 'vim', group: 'Vim Modes', description: 'Return to NORMAL mode (alt)' },

  // --- Zone switching (global) ---
  { id: 'zone-sidebar', key: 'e', zone: 'global', mode: 'NORMAL', category: 'vim', group: 'Zone Switching', description: 'Focus sidebar' },
  { id: 'zone-tabs', key: 't', zone: 'global', mode: 'NORMAL', category: 'vim', group: 'Zone Switching', description: 'Focus tab bar' },
  { id: 'zone-content', key: 'c', zone: 'global', mode: 'NORMAL', category: 'vim', group: 'Zone Switching', description: 'Focus content' },
  { id: 'zone-status', key: 's', zone: 'global', mode: 'NORMAL', category: 'vim', group: 'Zone Switching', description: 'Focus status bar' },
  { id: 'go-to-kanban', key: 'b', zone: 'global', mode: 'NORMAL', category: 'vim', group: 'Zone Switching', description: 'Go to kanban board' },
  { id: 'leader-key', key: 'Space', zone: 'global', mode: 'NORMAL', category: 'vim', group: 'Zone Switching', description: 'Leader key (which-key)' },
  { id: 'show-shortcuts-dialog', key: '?', zone: 'global', mode: 'NORMAL', category: 'vim', group: 'Zone Switching', description: 'Keyboard shortcuts dialog' },

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
  { id: 'select-all', key: 'Ctrl+A', zone: 'content', mode: 'NORMAL', category: 'vim', group: 'Content (Kanban)', description: 'Select all items' },
  { id: 'delete-selected', key: 'Delete', zone: 'content', mode: 'NORMAL', category: 'vim', group: 'Content (Kanban)', description: 'Delete selected items' },
  { id: 'visual-select', key: 'v', zone: 'content', mode: 'NORMAL', category: 'vim', group: 'Content (Kanban)', description: 'Visual select' },
  { id: 'clear-selection', key: 'Escape', zone: 'content', mode: 'NORMAL', category: 'vim', group: 'Content (Kanban)', description: 'Clear selection / close search' },
  { id: 'go-schedule', key: 'H', zone: 'content', mode: 'NORMAL', category: 'vim', group: 'Content (Kanban)', description: 'Scheduled agents' },

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
  { id: 'project-open-dialog', key: 'a', zone: 'sidebar', mode: 'NORMAL', category: 'vim', group: 'Sidebar', description: 'Open project', testId: 'open-project-button' },
  { id: 'project-open-dialog-alt', key: '+', zone: 'sidebar', mode: 'NORMAL', category: 'vim', group: 'Sidebar', description: 'Open project (alt)' },
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
  // Sub-view keys (Run History: j/k/gg/G/Enter/Escape, Actions: j/k/gg/G) reuse the same
  // bindings as the specialist grid — context determines which handler runs.
  // Documented in SchedulePanel shortcuts overlay under "Sub-view Navigation".
  { id: 'specialist-delete', key: 'x', zone: 'schedule', mode: 'NORMAL', category: 'vim', group: 'Schedule (Agents)', description: 'Delete specialist' },
  { id: 'specialist-reload', key: 'R', zone: 'schedule', mode: 'NORMAL', category: 'vim', group: 'Schedule (Agents)', description: 'Reload specialists' },
  { id: 'specialist-back', key: 'Escape', zone: 'schedule', mode: 'NORMAL', category: 'vim', group: 'Schedule (Agents)', description: 'Back to specialists (from actions)' },
  { id: 'run-back', key: 'Backspace', zone: 'schedule', mode: 'NORMAL', category: 'vim', group: 'Schedule (Agents)', description: 'Back (from history/detail)' },
  { id: 'go-kanban', key: 'K', zone: 'schedule', mode: 'NORMAL', category: 'vim', group: 'Schedule (Agents)', description: 'Go to kanban board' },

  // --- Status bar zone ---
  { id: 'status-next', key: 'l', zone: 'status-bar', mode: 'NORMAL', category: 'vim', group: 'Status Bar', description: 'Next button' },
  { id: 'status-prev', key: 'h', zone: 'status-bar', mode: 'NORMAL', category: 'vim', group: 'Status Bar', description: 'Previous button' },
  { id: 'status-activate', key: 'Enter', zone: 'status-bar', mode: 'NORMAL', category: 'vim', group: 'Status Bar', description: 'Activate button' },
  { id: 'status-settings', key: ',', zone: 'status-bar', mode: 'NORMAL', category: 'vim', group: 'Status Bar', description: 'Settings', testId: 'settings-button' },
  { id: 'status-project', key: 'p', zone: 'status-bar', mode: 'NORMAL', category: 'vim', group: 'Status Bar', description: 'Project settings', testId: 'project-settings-button' },
  { id: 'status-stop', key: 'q', zone: 'status-bar', mode: 'NORMAL', category: 'vim', group: 'Status Bar', description: 'Stop container', testId: 'stop-button' },
  { id: 'status-record', key: 'w', zone: 'status-bar', mode: 'NORMAL', category: 'vim', group: 'Status Bar', description: 'Toggle recording' },
  { id: 'status-refresh-usage', key: 'u', zone: 'status-bar', mode: 'NORMAL', category: 'vim', group: 'Status Bar', description: 'Refresh usage' },
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
  { id: 'dialog-visual', key: 'V', zone: 'dialog', mode: 'NORMAL', category: 'vim', group: 'Dialog (Work Item)', description: 'Visual mode (select & yank)' },
  { id: 'dialog-yank', key: 'y', zone: 'dialog', mode: 'NORMAL', category: 'vim', group: 'Dialog (Work Item)', description: 'Yank (copy) selected text' },
  { id: 'dialog-close-ctrl-q', key: 'Ctrl+Q', zone: 'dialog', mode: 'ANY', category: 'vim', group: 'Dialog (Work Item)', description: 'Close dialog' },
  { id: 'dialog-comment-search', key: '/', zone: 'dialog', mode: 'NORMAL', category: 'vim', group: 'Dialog (Work Item)', description: 'Search comments' },

  // --- Dialog Diff zone ---
  { id: 'diff-file-down', key: 'j', zone: 'dialog-diff', mode: 'NORMAL', category: 'vim', group: 'Dialog (Diff)', description: 'Next file' },
  { id: 'diff-file-up', key: 'k', zone: 'dialog-diff', mode: 'NORMAL', category: 'vim', group: 'Dialog (Diff)', description: 'Previous file' },
  { id: 'diff-close', key: 'Ctrl+Q', zone: 'dialog-diff', mode: 'ANY', category: 'vim', group: 'Dialog (Diff)', description: 'Close dialog' },

  // --- Dialog scrolling — scrollable settings/shortcuts dialogs ---
  { id: 'dialog-scroll-down', key: 'j', zone: 'dialog-scroll', mode: 'NORMAL', category: 'vim', group: 'Dialog Scrolling', description: 'Scroll down' },
  { id: 'dialog-scroll-up', key: 'k', zone: 'dialog-scroll', mode: 'NORMAL', category: 'vim', group: 'Dialog Scrolling', description: 'Scroll up' },

  // --- Dialog sidebar — numbered agent shortcuts (1-9) + PR/merge shortcuts + log toggle ---
  // Agent actions (leader group 'a')
  { id: 'agent-1-sidebar', key: '1', zone: 'dialog-sidebar', mode: 'NORMAL', category: 'vim', group: 'Sidebar Focus (Work Item)', description: 'Agent 1 (by order)', leaderGroup: 'a' },
  { id: 'agent-2-sidebar', key: '2', zone: 'dialog-sidebar', mode: 'NORMAL', category: 'vim', group: 'Sidebar Focus (Work Item)', description: 'Agent 2 (by order)', leaderGroup: 'a' },
  { id: 'agent-3-sidebar', key: '3', zone: 'dialog-sidebar', mode: 'NORMAL', category: 'vim', group: 'Sidebar Focus (Work Item)', description: 'Agent 3 (by order)', leaderGroup: 'a' },
  { id: 'agent-4-sidebar', key: '4', zone: 'dialog-sidebar', mode: 'NORMAL', category: 'vim', group: 'Sidebar Focus (Work Item)', description: 'Agent 4 (by order)', leaderGroup: 'a' },
  { id: 'agent-5-sidebar', key: '5', zone: 'dialog-sidebar', mode: 'NORMAL', category: 'vim', group: 'Sidebar Focus (Work Item)', description: 'Agent 5 (by order)', leaderGroup: 'a' },
  { id: 'agent-6-sidebar', key: '6', zone: 'dialog-sidebar', mode: 'NORMAL', category: 'vim', group: 'Sidebar Focus (Work Item)', description: 'Agent 6 (by order)', leaderGroup: 'a' },
  { id: 'agent-7-sidebar', key: '7', zone: 'dialog-sidebar', mode: 'NORMAL', category: 'vim', group: 'Sidebar Focus (Work Item)', description: 'Agent 7 (by order)', leaderGroup: 'a' },
  { id: 'agent-8-sidebar', key: '8', zone: 'dialog-sidebar', mode: 'NORMAL', category: 'vim', group: 'Sidebar Focus (Work Item)', description: 'Agent 8 (by order)', leaderGroup: 'a' },
  { id: 'agent-9-sidebar', key: '9', zone: 'dialog-sidebar', mode: 'NORMAL', category: 'vim', group: 'Sidebar Focus (Work Item)', description: 'Agent 9 (by order)', leaderGroup: 'a' },
  { id: 'agent-stop-sidebar', key: 'x', zone: 'dialog-sidebar', mode: 'NORMAL', category: 'vim', group: 'Sidebar Focus (Work Item)', description: 'Stop Agent (sidebar)', leaderGroup: 'a' },
  { id: 'agent-resume-sidebar', key: 'R', zone: 'dialog-sidebar', mode: 'NORMAL', category: 'vim', group: 'Sidebar Focus (Work Item)', description: 'Resume Agent (sidebar)', leaderGroup: 'a' },
  // Browser toggle (direct action, no leader group)
  { id: 'browser-toggle', key: 'b', zone: 'dialog-sidebar', mode: 'NORMAL', category: 'vim', group: 'Sidebar Focus (Work Item)', description: 'Toggle browser preview' },
  // Direct actions (no leader group)
  { id: 'item-delete-sidebar', key: 'd', zone: 'dialog-sidebar', mode: 'NORMAL', category: 'vim', group: 'Sidebar Focus (Work Item)', description: 'Delete Item (sidebar)' },
  // Git/PR actions (leader group 'g')
  { id: 'dialog-compare-changes', key: 'f', zone: 'dialog-sidebar', mode: 'NORMAL', category: 'vim', group: 'Sidebar Focus (Work Item)', description: 'Compare Changes (diff)', leaderGroup: 'g' },
  { id: 'dialog-rebase', key: 'r', zone: 'dialog-sidebar', mode: 'NORMAL', category: 'vim', group: 'Sidebar Focus (Work Item)', description: 'Pull Latest (Rebase)', leaderGroup: 'g' },
  { id: 'dialog-check-conflicts', key: 'k', zone: 'dialog-sidebar', mode: 'NORMAL', category: 'vim', group: 'Sidebar Focus (Work Item)', description: 'Check Conflicts', leaderGroup: 'g' },
  { id: 'dialog-merge-push-pr', key: 'm', zone: 'dialog-sidebar', mode: 'NORMAL', category: 'vim', group: 'Sidebar Focus (Work Item)', description: 'Squash, Merge & Push PR', leaderGroup: 'g' },
  { id: 'dialog-approve-pr', key: 'a', zone: 'dialog-sidebar', mode: 'NORMAL', category: 'vim', group: 'Sidebar Focus (Work Item)', description: 'Approve PR', leaderGroup: 'g' },
  { id: 'dialog-merge-pr', key: 'w', zone: 'dialog-sidebar', mode: 'NORMAL', category: 'vim', group: 'Sidebar Focus (Work Item)', description: 'Merge PR (finalize)', leaderGroup: 'g' },
  { id: 'dialog-open-pr', key: 'o', zone: 'dialog-sidebar', mode: 'NORMAL', category: 'vim', group: 'Sidebar Focus (Work Item)', description: 'Open PR (external)', leaderGroup: 'g' },
  // Direct actions (no leader group)
  { id: 'log-toggle-sidebar', key: 'l', zone: 'dialog-sidebar', mode: 'NORMAL', category: 'vim', group: 'Sidebar Focus (Work Item)', description: 'Toggle log panel (sidebar)' },
  { id: 'toggle-verified-sidebar', key: 'V', zone: 'dialog-sidebar', mode: 'NORMAL', category: 'vim', group: 'Sidebar Focus (Work Item)', description: 'Toggle Verified (sidebar)' },
  { id: 'cycle-provider-sidebar', key: '1', zone: 'dialog-sidebar', mode: 'NORMAL', category: 'vim', group: 'Sidebar Focus (Work Item)', description: 'Cycle Provider (sidebar)' },
  { id: 'cycle-model-sidebar', key: '2', zone: 'dialog-sidebar', mode: 'NORMAL', category: 'vim', group: 'Sidebar Focus (Work Item)', description: 'Cycle Model (sidebar)' },
  { id: 'cycle-column-sidebar', key: '3', zone: 'dialog-sidebar', mode: 'NORMAL', category: 'vim', group: 'Sidebar Focus (Work Item)', description: 'Cycle Column (sidebar)' },

  // --- Dialog log — log panel navigation ---
  { id: 'log-down', key: 'j', zone: 'dialog-log', mode: 'NORMAL', category: 'vim', group: 'Log Panel Navigation', description: 'Scroll down log panel' },
  { id: 'log-up', key: 'k', zone: 'dialog-log', mode: 'NORMAL', category: 'vim', group: 'Log Panel Navigation', description: 'Scroll up log panel' },
  { id: 'log-exit', key: 'Escape', zone: 'dialog-log', mode: 'NORMAL', category: 'vim', group: 'Log Panel Navigation', description: 'Exit log focus mode' },

  // --- Dialog browser — browser preview panel shortcuts ---
  { id: 'browser-reload', key: 'r', zone: 'dialog-browser', mode: 'NORMAL', category: 'vim', group: 'Browser Preview', description: 'Reload page' },
  { id: 'browser-back', key: 'h', zone: 'dialog-browser', mode: 'NORMAL', category: 'vim', group: 'Browser Preview', description: 'Navigate back' },
  { id: 'browser-forward', key: 'l', zone: 'dialog-browser', mode: 'NORMAL', category: 'vim', group: 'Browser Preview', description: 'Navigate forward' },
  { id: 'browser-url', key: 'u', zone: 'dialog-browser', mode: 'NORMAL', category: 'vim', group: 'Browser Preview', description: 'Focus URL bar' },
  { id: 'browser-exit', key: 'Escape', zone: 'dialog-browser', mode: 'NORMAL', category: 'vim', group: 'Browser Preview', description: 'Exit browser focus' },

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
  { id: 'electron-open-project', key: 'Ctrl+Shift+N', zone: 'electron-app', mode: 'ANY', category: 'electron', group: 'Application', description: 'Open project' },
  { id: 'electron-scheduled', key: 'Ctrl+Shift+H', zone: 'electron-app', mode: 'ANY', category: 'electron', group: 'Application', description: 'Scheduled agents' },
  { id: 'electron-record', key: 'Ctrl+Shift+R', zone: 'electron-app', mode: 'ANY', category: 'electron', group: 'Application', description: 'Toggle recording' },
  { id: 'electron-refresh-usage', key: 'Ctrl+Shift+U', zone: 'electron-app', mode: 'ANY', category: 'electron', group: 'Application', description: 'Refresh usage' },

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
  'Dialog (Diff)',
  'Dialog Scrolling',
  'Sidebar Focus (Work Item)',
  'Log Panel Navigation',
  'Browser Preview',
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

/** Get leader groups defined for a zone. */
export function getLeaderGroupsForZone(zone: VimActionZone): LeaderGroup[] {
  return LEADER_GROUPS.filter(g => g.zone === zone);
}

/** Get actions in a zone that have no leaderGroup (direct leader actions). */
export function getDirectLeaderActions(zone: VimActionZone): VimAction[] {
  return VIM_ACTIONS.filter(a =>
    a.zone === zone &&
    a.category === 'vim' &&
    a.mode === 'NORMAL' &&
    !a.leaderGroup &&
    !a.key.includes('+') &&
    a.key.length <= 2
  );
}

/** Get actions in a zone that belong to a specific leader group. */
export function getGroupedLeaderActions(zone: VimActionZone, groupKey: string): VimAction[] {
  return VIM_ACTIONS.filter(a =>
    a.zone === zone &&
    a.leaderGroup === groupKey
  );
}
