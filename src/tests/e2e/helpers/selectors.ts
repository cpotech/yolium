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

  // Build progress overlay
  buildProgressOverlay: '[data-testid="build-progress-overlay"]',
  buildProgressText: '[data-testid="build-progress-text"]',

  // Code review dialog
  codeReviewButton: '[data-testid="code-review-button"]',
  codeReviewDialog: '[data-testid="code-review-dialog"]',
  reviewRepoInput: '[data-testid="review-repo-input"]',
  reviewFetchButton: '[data-testid="review-fetch-button"]',
  reviewBranchSelect: '[data-testid="review-branch-select"]',
  reviewBranchInput: '[data-testid="review-branch-input"]',
  reviewAgentClaude: '[data-testid="review-agent-claude"]',
  reviewAgentOpencode: '[data-testid="review-agent-opencode"]',
  reviewAgentCodex: '[data-testid="review-agent-codex"]',
  reviewCancelButton: '[data-testid="review-cancel-button"]',
  reviewStartButton: '[data-testid="start-review-button"]',
  reviewCredentialsWarning: '[data-testid="review-credentials-warning"]',
  reviewAgentWarning: '[data-testid="review-agent-warning"]',
  reviewStatus: '[data-testid="review-status"]',
  reviewBranchError: '[data-testid="review-branch-error"]',

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
