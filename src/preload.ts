/**
 * @module src/preload
 * Electron preload script exposing namespaced IPC API to renderer process.
 */

import { contextBridge, ipcRenderer } from 'electron';
import type { CleanupFunction, ElectronAPI } from '@shared/types';

function invoke(channel: string) {
  return (...args: unknown[]) => ipcRenderer.invoke(channel, ...args);
}

function send(channel: string) {
  return (...args: unknown[]) => {
    ipcRenderer.send(channel, ...args);
  };
}

function listen<Args extends unknown[]>(
  channel: string,
  callback: (...args: Args) => void,
): CleanupFunction {
  const handler = (_event: Electron.IpcRendererEvent, ...args: Args) => callback(...args);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

const app: ElectronAPI['app'] = {
  getVersion: invoke('app:get-version') as ElectronAPI['app']['getVersion'],
  getHomeDir: invoke('app:get-home-dir') as ElectronAPI['app']['getHomeDir'],
  openExternal: invoke('app:open-external') as ElectronAPI['app']['openExternal'],
  forceQuit: invoke('app:force-quit') as ElectronAPI['app']['forceQuit'],
  onQuitRequest: (callback) => listen('app:quit-request', callback),
};

const terminal: ElectronAPI['terminal'] = {
  create: invoke('terminal:create') as ElectronAPI['terminal']['create'],
  write: send('terminal:write') as ElectronAPI['terminal']['write'],
  resize: send('terminal:resize') as ElectronAPI['terminal']['resize'],
  close: invoke('terminal:close') as ElectronAPI['terminal']['close'],
  hasRunningChildren: invoke(
    'terminal:has-running-children',
  ) as ElectronAPI['terminal']['hasRunningChildren'],
  onData: (callback) => listen('terminal:data', callback),
  onExit: (callback) => listen('terminal:exit', callback),
};

const tabs: ElectronAPI['tabs'] = {
  showContextMenu: invoke('tab:context-menu') as ElectronAPI['tabs']['showContextMenu'],
  onNew: (callback) => listen('tab:new', callback),
  onClose: (callback) => listen('tab:close', callback),
  onNext: (callback) => listen('tab:next', callback),
  onPrev: (callback) => listen('tab:prev', callback),
  onCloseSpecific: (callback) => listen('tab:close-specific', callback),
  onCloseOthers: (callback) => listen('tab:close-others', callback),
  onCloseAll: (callback) => listen('tab:close-all', callback),
};

const events: ElectronAPI['events'] = {
  onShortcutsShow: (callback) => listen('shortcuts:show', callback),
  onGitSettingsShow: (callback) => listen('git-settings:show', callback),
  onProjectOpen: (callback) => listen('project:open', callback),
  onRecordingToggle: (callback) => listen('recording:toggle', callback),
  onScheduleShow: (callback) => listen('schedule:show', callback),
  onUsageRefresh: (callback) => listen('usage:refresh', callback),
};

const dialog: ElectronAPI['dialog'] = {};

const fs: ElectronAPI['fs'] = {
  listDirectory: invoke('fs:list-directory') as ElectronAPI['fs']['listDirectory'],
  createDirectory: invoke('fs:create-directory') as ElectronAPI['fs']['createDirectory'],
  readFile: invoke('fs:read-file') as ElectronAPI['fs']['readFile'],
};

const git: ElectronAPI['git'] = {
  loadConfig: invoke('git-config:load') as ElectronAPI['git']['loadConfig'],
  saveConfig: invoke('git-config:save') as ElectronAPI['git']['saveConfig'],
  isRepo: invoke('git:is-repo') as ElectronAPI['git']['isRepo'],
  getBranch: invoke('git:get-branch') as ElectronAPI['git']['getBranch'],
  init: invoke('git:init') as ElectronAPI['git']['init'],
  clone: invoke('git:clone') as ElectronAPI['git']['clone'],
  validateBranch: invoke('git:validate-branch') as ElectronAPI['git']['validateBranch'],
  mergeBranch: invoke('git:merge-branch') as ElectronAPI['git']['mergeBranch'],
  worktreeDiffStats: invoke(
    'git:worktree-diff-stats',
  ) as ElectronAPI['git']['worktreeDiffStats'],
  cleanupWorktree: invoke('git:cleanup-worktree') as ElectronAPI['git']['cleanupWorktree'],
  checkMergeConflicts: invoke(
    'git:check-merge-conflicts',
  ) as ElectronAPI['git']['checkMergeConflicts'],
  mergeAndPushPR: invoke('git:merge-and-push-pr') as ElectronAPI['git']['mergeAndPushPR'],
  approvePR: invoke('git:approve-pr') as ElectronAPI['git']['approvePR'],
  mergePR: invoke('git:merge-pr') as ElectronAPI['git']['mergePR'],
  worktreeChangedFiles: invoke(
    'git:worktree-changed-files',
  ) as ElectronAPI['git']['worktreeChangedFiles'],
  worktreeFileDiff: invoke('git:worktree-file-diff') as ElectronAPI['git']['worktreeFileDiff'],
  detectNestedRepos: invoke(
    'git:detect-nested-repos',
  ) as ElectronAPI['git']['detectNestedRepos'],
  rebaseOntoDefault: invoke(
    'git:rebase-onto-default',
  ) as ElectronAPI['git']['rebaseOntoDefault'],
};

const onboarding: ElectronAPI['onboarding'] = {
  validate: invoke('onboarding:validate') as ElectronAPI['onboarding']['validate'],
  detectProject: invoke(
    'onboarding:detect-project',
  ) as ElectronAPI['onboarding']['detectProject'],
};

const docker: ElectronAPI['docker'] = {
  isAvailable: invoke('docker:available') as ElectronAPI['docker']['isAvailable'],
  ensureImage: invoke('docker:ensure-image') as ElectronAPI['docker']['ensureImage'],
  detectState: invoke('docker:detect-state') as ElectronAPI['docker']['detectState'],
  startDesktop: invoke('docker:start-desktop') as ElectronAPI['docker']['startDesktop'],
  startEngine: invoke('docker:start-engine') as ElectronAPI['docker']['startEngine'],
  removeAllContainers: invoke(
    'docker:remove-all-containers',
  ) as ElectronAPI['docker']['removeAllContainers'],
  removeImage: invoke('docker:remove-image') as ElectronAPI['docker']['removeImage'],
  getImageInfo: invoke('docker:get-image-info') as ElectronAPI['docker']['getImageInfo'],
  onBuildProgress: (callback) => listen('docker:build-progress', callback),
};

const container: ElectronAPI['container'] = {
  create: invoke('yolium:create') as ElectronAPI['container']['create'],
  write: send('yolium:write') as ElectronAPI['container']['write'],
  resize: send('yolium:resize') as ElectronAPI['container']['resize'],
  stop: invoke('yolium:stop') as ElectronAPI['container']['stop'],
  getWorktreeInfo: invoke(
    'yolium:get-worktree-info',
  ) as ElectronAPI['container']['getWorktreeInfo'],
  getPortMappings: invoke(
    'container:get-port-mappings',
  ) as ElectronAPI['container']['getPortMappings'],
  onData: (callback) => listen('container:data', callback),
  onExit: (callback) => listen('container:exit', callback),
};

const kanban: ElectronAPI['kanban'] = {
  getBoard: invoke('kanban:get-board') as ElectronAPI['kanban']['getBoard'],
  addItem: invoke('kanban:add-item') as ElectronAPI['kanban']['addItem'],
  updateItem: invoke('kanban:update-item') as ElectronAPI['kanban']['updateItem'],
  addComment: invoke('kanban:add-comment') as ElectronAPI['kanban']['addComment'],
  deleteItem: invoke('kanban:delete-item') as ElectronAPI['kanban']['deleteItem'],
  deleteItems: invoke('kanban:delete-items') as ElectronAPI['kanban']['deleteItems'],
  deleteBoard: invoke('kanban:delete-board') as ElectronAPI['kanban']['deleteBoard'],
  addAttachment: invoke('kanban:add-attachment') as ElectronAPI['kanban']['addAttachment'],
  listAttachments: invoke('kanban:list-attachments') as ElectronAPI['kanban']['listAttachments'],
  readAttachment: invoke('kanban:read-attachment') as ElectronAPI['kanban']['readAttachment'],
  deleteAttachment: invoke('kanban:delete-attachment') as ElectronAPI['kanban']['deleteAttachment'],
  onBoardUpdated: (callback) => listen('kanban:board-updated', callback),
};

const agent: ElectronAPI['agent'] = {
  start: invoke('agent:start') as ElectronAPI['agent']['start'],
  resume: invoke('agent:resume') as ElectronAPI['agent']['resume'],
  answer: invoke('agent:answer') as ElectronAPI['agent']['answer'],
  stop: invoke('agent:stop') as ElectronAPI['agent']['stop'],
  getActiveSession: invoke(
    'agent:get-active-session',
  ) as ElectronAPI['agent']['getActiveSession'],
  recover: invoke('agent:recover') as ElectronAPI['agent']['recover'],
  listDefinitions: invoke(
    'agent:list-definitions',
  ) as ElectronAPI['agent']['listDefinitions'],
  saveDefinition: invoke(
    'agent:save-definition',
  ) as ElectronAPI['agent']['saveDefinition'],
  deleteDefinition: invoke(
    'agent:delete-definition',
  ) as ElectronAPI['agent']['deleteDefinition'],
  loadFullDefinition: invoke(
    'agent:load-full-definition',
  ) as ElectronAPI['agent']['loadFullDefinition'],
  readLog: invoke('agent:read-log') as ElectronAPI['agent']['readLog'],
  clearLog: invoke('agent:clear-log') as ElectronAPI['agent']['clearLog'],
  getPortMappings: invoke(
    'agent:get-container-port-mappings',
  ) as ElectronAPI['agent']['getPortMappings'],
  detectDevCommand: invoke(
    'agent:detect-dev-command',
  ) as ElectronAPI['agent']['detectDevCommand'],
  startDevServer: invoke(
    'agent:start-dev-server',
  ) as ElectronAPI['agent']['startDevServer'],
  onOutput: (callback) => listen('agent:output', callback),
  onQuestion: (callback) => listen('agent:question', callback),
  onItemCreated: (callback) => listen('agent:item-created', callback),
  onComplete: (callback) => listen('agent:complete', callback),
  onError: (callback) => listen('agent:error', callback),
  onProgress: (callback) => listen('agent:progress', callback),
  onExit: (callback) => listen('agent:exit', callback),
  onCostUpdate: (callback) => listen('agent:cost-update', callback),
};

const cache: ElectronAPI['cache'] = {
  list: invoke('cache:list') as ElectronAPI['cache']['list'],
  stats: invoke('cache:stats') as ElectronAPI['cache']['stats'],
  delete: invoke('cache:delete') as ElectronAPI['cache']['delete'],
  cleanupOrphaned: invoke(
    'cache:cleanup-orphaned',
  ) as ElectronAPI['cache']['cleanupOrphaned'],
  cleanupStale: invoke('cache:cleanup-stale') as ElectronAPI['cache']['cleanupStale'],
};

const whisper: ElectronAPI['whisper'] = {
  listModels: invoke('whisper:list-models') as ElectronAPI['whisper']['listModels'],
  isModelDownloaded: invoke(
    'whisper:is-model-downloaded',
  ) as ElectronAPI['whisper']['isModelDownloaded'],
  downloadModel: invoke('whisper:download-model') as ElectronAPI['whisper']['downloadModel'],
  deleteModel: invoke('whisper:delete-model') as ElectronAPI['whisper']['deleteModel'],
  isBinaryAvailable: invoke(
    'whisper:is-binary-available',
  ) as ElectronAPI['whisper']['isBinaryAvailable'],
  installBinary: invoke('whisper:install-binary') as ElectronAPI['whisper']['installBinary'],
  onInstallProgress: (callback) => listen('whisper:install-progress', callback),
  transcribe: invoke('whisper:transcribe') as ElectronAPI['whisper']['transcribe'],
  getSelectedModel: invoke(
    'whisper:get-selected-model',
  ) as ElectronAPI['whisper']['getSelectedModel'],
  saveSelectedModel: invoke(
    'whisper:save-selected-model',
  ) as ElectronAPI['whisper']['saveSelectedModel'],
  onDownloadProgress: (callback) => listen('whisper:download-progress', callback),
};

const projectConfig: ElectronAPI['projectConfig'] = {
  load: invoke('project-config:load') as ElectronAPI['projectConfig']['load'],
  save: invoke('project-config:save') as ElectronAPI['projectConfig']['save'],
  checkDirs: invoke('project-config:check-dirs') as ElectronAPI['projectConfig']['checkDirs'],
};

const report: ElectronAPI['report'] = {
  openFile: invoke('report:open-file') as ElectronAPI['report']['openFile'],
};

const usage: ElectronAPI['usage'] = {
  getClaude: invoke('usage:get-claude') as ElectronAPI['usage']['getClaude'],
  refreshClaude: invoke('usage:refresh-claude') as ElectronAPI['usage']['refreshClaude'],
};

const schedule: ElectronAPI['schedule'] = {
  getState: invoke('schedule:get-state') as ElectronAPI['schedule']['getState'],
  toggleSpecialist: invoke(
    'schedule:toggle-specialist',
  ) as ElectronAPI['schedule']['toggleSpecialist'],
  toggleGlobal: invoke('schedule:toggle-global') as ElectronAPI['schedule']['toggleGlobal'],
  triggerRun: invoke('schedule:trigger-run') as ElectronAPI['schedule']['triggerRun'],
  getHistory: invoke('schedule:get-history') as ElectronAPI['schedule']['getHistory'],
  getStats: invoke('schedule:get-stats') as ElectronAPI['schedule']['getStats'],
  reload: invoke('schedule:reload') as ElectronAPI['schedule']['reload'],
  getSpecialists: invoke(
    'schedule:get-specialists',
  ) as ElectronAPI['schedule']['getSpecialists'],
  getTemplate: invoke('schedule:get-template') as ElectronAPI['schedule']['getTemplate'],
  scaffold: invoke('schedule:scaffold') as ElectronAPI['schedule']['scaffold'],
  updateDefinition: invoke(
    'schedule:update-definition',
  ) as ElectronAPI['schedule']['updateDefinition'],
  getRawDefinition: invoke(
    'schedule:get-raw-definition',
  ) as ElectronAPI['schedule']['getRawDefinition'],
  getCredentials: invoke(
    'schedule:get-credentials',
  ) as ElectronAPI['schedule']['getCredentials'],
  saveCredentials: invoke(
    'schedule:save-credentials',
  ) as ElectronAPI['schedule']['saveCredentials'],
  deleteCredentials: invoke(
    'schedule:delete-credentials',
  ) as ElectronAPI['schedule']['deleteCredentials'],
  getRunLog: invoke('schedule:get-run-log') as ElectronAPI['schedule']['getRunLog'],
  getAllActions: invoke('schedule:get-all-actions') as ElectronAPI['schedule']['getAllActions'],
  getActions: invoke('schedule:get-actions') as ElectronAPI['schedule']['getActions'],
  getRunActions: invoke(
    'schedule:get-run-actions',
  ) as ElectronAPI['schedule']['getRunActions'],
  getActionStats: invoke(
    'schedule:get-action-stats',
  ) as ElectronAPI['schedule']['getActionStats'],
  resetSpecialist: invoke(
    'schedule:reset-specialist',
  ) as ElectronAPI['schedule']['resetSpecialist'],
  deleteSpecialist: invoke(
    'schedule:delete-specialist',
  ) as ElectronAPI['schedule']['deleteSpecialist'],
  getRunning: invoke('schedule:get-running') as ElectronAPI['schedule']['getRunning'],
  onAlert: (callback) => listen('schedule:alert', callback),
  onStateChanged: (callback) => listen('schedule:state-changed', callback),
};

const electronAPI: ElectronAPI = {
  app,
  terminal,
  tabs,
  events,
  dialog,
  fs,
  git,
  onboarding,
  docker,
  container,
  kanban,
  agent,
  cache,
  whisper,
  projectConfig,
  report,
  usage,
  schedule,
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
