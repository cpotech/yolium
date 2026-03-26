/**
 * UI selectors for Yolium E2E tests.
 *
 * Uses data-testid attributes for reliable element selection.
 * These need to be added to the corresponding React components.
 */

export const selectors = {
  // App states
  loadingSpinner: '[data-testid="loading-spinner"]',
  emptyState: '[data-testid="empty-state"]',

  // Tab bar
  tabBar: '[data-testid="tab-bar"]',
  newTabButton: '[data-testid="new-tab-button"]',
  tab: (id?: string) => id ? `[data-testid="tab-${id}"]` : '[role="tab"]',
  tabCloseButton: (id?: string) => id ? `[data-testid="tab-close-${id}"]` : '[data-testid^="tab-close-"]',
  activeTab: '[role="tab"][data-active="true"]',

  // Path input dialog
  pathDialog: '[data-testid="path-dialog"]',
  pathInput: '[data-testid="path-input"]',
  pathConfirmButton: '[data-testid="path-confirm"]',  // Legacy alias
  pathNextButton: '[data-testid="path-next"]',
  pathCancelButton: '[data-testid="path-cancel"]',
  pathAutocomplete: '[data-testid="path-autocomplete"]',
  pathAutocompleteItem: '[data-testid^="path-autocomplete-item-"]',

  // Agent select dialog
  agentDialog: '[data-testid="agent-dialog"]',
  agentOption: (agent: 'claude' | 'opencode' | 'codex' | 'shell') => `[data-testid="agent-option-${agent}"]`,
  gsdToggle: '[data-testid="gsd-toggle"]',
  worktreeToggle: '[data-testid="worktree-toggle"]',
  branchNameInput: '[data-testid="branch-name-input"]',
  worktreeBranchHelper: '[data-testid="worktree-branch-helper"]',
  worktreeBranchError: '[data-testid="worktree-branch-error"]',
  agentConfirmButton: '[data-testid="agent-confirm"]',  // Legacy alias
  agentStartButton: '[data-testid="agent-start"]',
  agentCancelButton: '[data-testid="agent-cancel"]',  // Legacy alias
  agentBackButton: '[data-testid="agent-back"]',

  // Docker setup dialog
  dockerSetupDialog: '[data-testid="docker-setup-dialog"]',
  dockerStartButton: '[data-testid="docker-start-button"]',
  dockerRetryButton: '[data-testid="docker-retry-button"]',

  // Terminal
  terminal: '[data-testid="terminal"]',
  terminalContainer: '[data-testid="terminal-container"]',

  // Status bar
  statusBar: '[data-testid="status-bar"]',
  statusPath: '[data-testid="status-path"]',
  statusBranch: '[data-testid="status-branch"]',
  statusContainerState: '[data-testid="status-container-state"]',
  stopButton: '[data-testid="stop-button"]',
  settingsButton: '[data-testid="settings-button"]',
  shortcutsButton: '[data-testid="shortcuts-button"]',
  themeToggle: '[data-testid="theme-toggle"]',

  // Settings dialog (formerly Git Settings)
  gitConfigDialog: '[data-testid="git-config-dialog"]',
  gitNameInput: '[data-testid="git-name-input"]',
  gitEmailInput: '[data-testid="git-email-input"]',
  gitPatInput: '[data-testid="git-pat-input"]',
  openaiKeyInput: '[data-testid="openai-key-input"]',
  anthropicKeyInput: '[data-testid="anthropic-key-input"]',
  gitConfigHeader: '[data-testid="git-config-header"]',
  gitConfigBody: '[data-testid="git-config-body"]',
  gitConfigFooter: '[data-testid="git-config-footer"]',
  gitConfigSaveButton: '[data-testid="git-config-save"]',
  gitConfigCancelButton: '[data-testid="git-config-cancel"]',

  // Speech-to-text / Whisper
  speechToTextButton: '[data-testid="speech-to-text-button"]',
  speechModelSelect: '[data-testid="speech-model-select"]',
  whisperModelDialog: '[data-testid="whisper-model-dialog"]',
  whisperModelClose: '[data-testid="whisper-model-close"]',
  whisperModel: (size: 'small' | 'medium' | 'large') => `[data-testid="whisper-model-${size}"]`,
  whisperDownload: (size: 'small' | 'medium' | 'large') => `[data-testid="whisper-download-${size}"]`,
  whisperDelete: (size: 'small' | 'medium' | 'large') => `[data-testid="whisper-delete-${size}"]`,
  recordingHint: '[data-testid="recording-hint"]',

  // Keyboard shortcuts dialog
  shortcutsDialog: '[data-testid="shortcuts-dialog"]',
  shortcutsCloseButton: '[data-testid="shortcuts-close"]',

  // Vim mode indicator
  vimModeIndicator: '[data-testid="vim-mode-indicator"]',

  // Schedule panel
  schedulePanel: '[data-testid="schedule-panel"]',
  scheduleShortcutsOverlay: '[data-testid="schedule-shortcuts-overlay"]',

  // Build progress overlay
  buildProgressOverlay: '[data-testid="build-progress-overlay"]',
  buildProgressText: '[data-testid="build-progress-text"]',
  buildCancelButton: '[data-testid="build-cancel-button"]',

  // Sidebar
  sidebar: '[data-testid="sidebar"]',
  sidebarCollapseToggle: '[data-testid="collapse-toggle"]',
  sidebarSchedule: '[data-testid="sidebar-schedule"]',
  openProjectButton: '[data-testid="open-project-button"]',
  projectItem: (path: string) => `[data-testid="project-item-${path}"]`,
  removeProjectButton: (path: string) => `[data-testid="remove-project-${path}"]`,
  statusDot: (itemId: string) => `[data-testid="status-dot-${itemId}"]`,
  statusPopover: (itemId: string) => `[data-testid="status-popover-${itemId}"]`,
  statusPopoverQuestion: (itemId: string) => `[data-testid="status-popover-question-${itemId}"]`,
  statusPopoverOption: (itemId: string, index: number) => `[data-testid="status-popover-option-${itemId}-${index}"]`,

  // Kanban - Agent controls
  runCodeAgentButton: '[data-testid="run-code-agent-button"]',
  runPlanAgentButton: '[data-testid="run-plan-agent-button"]',
  stopAgentButton: '[data-testid="stop-agent-button"]',
  agentProgressDetail: '[data-testid="agent-progress-detail"]',
  modelDisplay: '[data-testid="model-display"]',

  // Kanban
  kanbanView: '[data-testid="kanban-view"]',
  kanbanEmptyState: '[data-testid="kanban-empty-state"]',
  kanbanColumnsContainer: '[data-testid="kanban-columns-container"]',
  kanbanColumn: (id: string) => `[data-testid="kanban-column-${id}"]`,
  kanbanCard: '[data-testid="kanban-card"]',
  kanbanNewItemButton: '[data-testid="new-item-button"]',
  kanbanRefreshButton: '[data-testid="refresh-button"]',
  projectPathDisplay: '[data-testid="project-path-display"]',
  columnEmptyState: '[data-testid="column-empty-state"]',

  // New Item Dialog
  newItemDialog: '[data-testid="new-item-dialog"]',
  newItemTitle: '[data-testid="new-item-dialog"] [data-testid="title-input"]',
  newItemDescription: '[data-testid="new-item-dialog"] [data-testid="description-input"]',
  newItemBranch: '[data-testid="new-item-dialog"] [data-testid="branch-input"]',
  newItemAgentProvider: '[data-testid="new-item-dialog"] [data-testid="agent-provider-select"]',
  newItemCreate: '[data-testid="new-item-dialog"] [data-testid="create-button"]',
  newItemCancel: '[data-testid="new-item-dialog"] [data-testid="cancel-button"]',

  // Item Detail Dialog
  itemDetailDialog: '[data-testid="item-detail-dialog"]',
  gitDiffDialog: '[data-testid="git-diff-dialog"]',
  diffDialogClose: '[data-testid="diff-dialog-close"]',
  detailTitle: '[data-testid="item-detail-dialog"] [data-testid="title-input"]',
  detailDescription: '[data-testid="item-detail-dialog"] [data-testid="description-input"]',
  detailColumnSelect: '[data-testid="item-detail-dialog"] [data-testid="column-select"]',
  detailStatusBadge: '[data-testid="item-detail-dialog"] [data-testid="status-badge"]',
  detailDeleteButton: '[data-testid="item-detail-dialog"] [data-testid="delete-button"]',
  detailCloseButton: '[data-testid="item-detail-dialog"] [data-testid="close-button"]',
  detailBranchDisplay: '[data-testid="item-detail-dialog"] [data-testid="branch-display"]',
  detailAgentProvider: '[data-testid="item-detail-dialog"] [data-testid="agent-provider-display"]',
  detailAgentProviderSelect: '[data-testid="item-detail-dialog"] [data-testid="agent-provider-select"]',
  detailCreatedAt: '[data-testid="item-detail-dialog"] [data-testid="created-at"]',
  detailCommentsSection: '[data-testid="item-detail-dialog"] [data-testid="comments-section"]',
  detailNoComments: '[data-testid="item-detail-dialog"] [data-testid="no-comments"]',
  detailModelSelect: '[data-testid="item-detail-dialog"] [data-testid="model-select"]',
  detailVerifiedCheckbox: '[data-testid="item-detail-dialog"] [data-testid="verified-checkbox"]',
  detailAnswerInput: '[data-testid="item-detail-dialog"] [data-testid="answer-input"]',

  // Browser Preview Panel
  browserPreviewPanel: '[data-testid="browser-preview-panel"]',
  browserUrlBar: '[data-testid="browser-url-bar"]',
  browserBackBtn: '[data-testid="browser-back-btn"]',
  browserForwardBtn: '[data-testid="browser-forward-btn"]',
  browserReloadBtn: '[data-testid="browser-reload-btn"]',
  browserWebview: '[data-testid="browser-webview"]',
  browserEmptyState: '[data-testid="browser-empty-state"]',
  browserPortBadge: '[data-testid="browser-port-badge"]',
  shortcutsHintBar: '[data-testid="shortcuts-hint-bar"]',

  // Confirmation dialogs (native, use Electron dialog API in tests)
  // These are handled via electronAPI mocking
} as const;

/**
 * Helper to wait for element and get text content
 */
export async function getTextContent(page: import('@playwright/test').Page, selector: string): Promise<string> {
  const element = await page.waitForSelector(selector);
  const text = await element?.textContent();
  return text ?? '';
}

/**
 * Helper to check if element exists without waiting
 */
export async function elementExists(page: import('@playwright/test').Page, selector: string): Promise<boolean> {
  const element = await page.$(selector);
  return element !== null;
}
