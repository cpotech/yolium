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
  agentOption: (agent: 'claude' | 'opencode' | 'shell') => `[data-testid="agent-option-${agent}"]`,
  gsdToggle: '[data-testid="gsd-toggle"]',
  worktreeToggle: '[data-testid="worktree-toggle"]',
  branchNameInput: '[data-testid="branch-name-input"]',
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

  // Git config dialog
  gitConfigDialog: '[data-testid="git-config-dialog"]',
  gitNameInput: '[data-testid="git-name-input"]',
  gitEmailInput: '[data-testid="git-email-input"]',
  gitPatInput: '[data-testid="git-pat-input"]',
  gitConfigSaveButton: '[data-testid="git-config-save"]',
  gitConfigCancelButton: '[data-testid="git-config-cancel"]',

  // Keyboard shortcuts dialog
  shortcutsDialog: '[data-testid="shortcuts-dialog"]',
  shortcutsCloseButton: '[data-testid="shortcuts-close"]',

  // Build progress overlay
  buildProgressOverlay: '[data-testid="build-progress-overlay"]',
  buildProgressText: '[data-testid="build-progress-text"]',

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
