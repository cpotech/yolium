# IPC API Reference

Complete reference for all IPC channels between renderer and main process. The renderer accesses these via `window.electronAPI.<namespace>.<method>()`.

## How IPC Works in Yolium

- **`invoke`/`handle`** — Request-response. Renderer calls, main responds with a value. Returns a `Promise`.
- **`send`/`on`** — Fire-and-forget. Renderer sends data, no response. Used for streaming writes (terminal input, resize).
- **Main→Renderer events** — Main process pushes data to renderer via `webContents.send()`. Renderer listens with `on*` callbacks that return a cleanup function.

### Naming Convention

All channels follow `namespace:action` format (e.g., `kanban:add-item`, `terminal:create`).

### Renderer API Access

```typescript
// All IPC is accessed via the preload bridge:
window.electronAPI.kanban.addItem(projectPath, params)
window.electronAPI.terminal.create(cwd)

// Event listeners return cleanup functions:
const cleanup = window.electronAPI.agent.onOutput((sessionId, data) => { ... });
// Later:
cleanup(); // removes the listener
```

---

## app

App lifecycle and utilities.

| Method | Channel | Direction | Description |
|--------|---------|-----------|-------------|
| `getVersion()` | `app:get-version` | invoke | Returns app version string |
| `getHomeDir()` | `app:get-home-dir` | invoke | Returns user home directory path |
| `openExternal(url)` | `app:open-external` | invoke | Opens URL in system browser |
| `forceQuit()` | `app:force-quit` | invoke | Cleans up PTY/containers, then quits |
| `onQuitRequest(cb)` | `app:quit-request` | event | Main requests renderer to confirm quit |

### Types

```typescript
getVersion(): Promise<string>
getHomeDir(): Promise<string>
openExternal(url: string): Promise<void>
forceQuit(): Promise<void>
onQuitRequest(callback: () => void): CleanupFn
```

---

## terminal

Local PTY terminal sessions (not Docker containers).

| Method | Channel | Direction | Description |
|--------|---------|-----------|-------------|
| `create(cwd?)` | `terminal:create` | invoke | Creates a PTY session, returns session ID |
| `write(sessionId, data)` | `terminal:write` | send | Writes data to PTY stdin |
| `resize(sessionId, cols, rows)` | `terminal:resize` | send | Resizes the PTY |
| `close(sessionId)` | `terminal:close` | invoke | Kills the PTY process |
| `hasRunningChildren(sessionId)` | `terminal:has-running-children` | invoke | Checks for running child processes |
| `onData(cb)` | `terminal:data` | event | PTY stdout data |
| `onExit(cb)` | `terminal:exit` | event | PTY process exited |

### Types

```typescript
create(cwd?: string): Promise<string>  // returns sessionId
write(sessionId: string, data: string): void
resize(sessionId: string, cols: number, rows: number): void
close(sessionId: string): Promise<void>
hasRunningChildren(sessionId: string): Promise<boolean>
onData(callback: (sessionId: string, data: string) => void): CleanupFn
onExit(callback: (sessionId: string, exitCode: number) => void): CleanupFn
```

---

## tabs

Tab management events (triggered by menu and context menu).

| Method | Channel | Direction | Description |
|--------|---------|-----------|-------------|
| `showContextMenu(tabId, x, y)` | `tab:context-menu` | invoke | Shows right-click context menu (Close, Close Others, Close All) |
| `onNew(cb)` | `tab:new` | event | Menu triggered "New Tab" |
| `onClose(cb)` | `tab:close` | event | Menu triggered "Close Tab" |
| `onNext(cb)` | `tab:next` | event | Menu triggered "Next Tab" |
| `onPrev(cb)` | `tab:prev` | event | Menu triggered "Previous Tab" |
| `onCloseSpecific(cb)` | `tab:close-specific` | event | Context menu "Close" on specific tab |
| `onCloseOthers(cb)` | `tab:close-others` | event | Context menu "Close Others" |
| `onCloseAll(cb)` | `tab:close-all` | event | Context menu "Close All" |

### Types

```typescript
showContextMenu(tabId: string, x: number, y: number): Promise<void>
onNew(callback: () => void): CleanupFn
onClose(callback: () => void): CleanupFn
onNext(callback: () => void): CleanupFn
onPrev(callback: () => void): CleanupFn
onCloseSpecific(callback: (tabId: string) => void): CleanupFn
onCloseOthers(callback: (keepTabId: string) => void): CleanupFn
onCloseAll(callback: () => void): CleanupFn
```

---

## events

Menu-triggered application events.

| Method | Channel | Direction | Description |
|--------|---------|-----------|-------------|
| `onShortcutsShow(cb)` | `shortcuts:show` | event | Show keyboard shortcuts dialog |
| `onGitSettingsShow(cb)` | `git-settings:show` | event | Show git settings dialog |
| `onProjectOpen(cb)` | `project:open` | event | Show open project dialog |
| `onRecordingToggle(cb)` | `recording:toggle` | event | Toggle speech recording |

### Types

```typescript
onShortcutsShow(callback: () => void): CleanupFn
onGitSettingsShow(callback: () => void): CleanupFn
onProjectOpen(callback: () => void): CleanupFn
onRecordingToggle(callback: () => void): CleanupFn
```

---

## dialog

Native OS dialogs (confirmations, folder picker).

| Method | Channel | Direction | Description |
|--------|---------|-----------|-------------|
| `confirmClose(message)` | `dialog:confirm-close` | invoke | "Close" / "Cancel" dialog for tabs with running processes |
| `confirmOkCancel(title, message)` | `dialog:confirm-ok-cancel` | invoke | Generic "OK" / "Cancel" dialog |
| `confirmCloseMultiple(count)` | `dialog:confirm-close-multiple` | invoke | Bulk close confirmation |
| `worktreeCleanup(branchName, hasChanges)` | `dialog:worktree-cleanup` | invoke | "Keep Worktree" / "Delete Worktree" / "Cancel" |
| `selectFolder()` | `dialog:select-folder` | invoke | Native folder picker |

### Types

```typescript
confirmClose(message: string): Promise<boolean>
confirmOkCancel(title: string, message: string): Promise<boolean>
confirmCloseMultiple(count: number): Promise<boolean>
worktreeCleanup(branchName: string, hasUncommittedChanges: boolean): Promise<{ response: number }>
  // response: 0 = Keep, 1 = Delete, 2 = Cancel
selectFolder(): Promise<string | null>
```

---

## fs

Filesystem operations for the project directory picker.

| Method | Channel | Direction | Description |
|--------|---------|-----------|-------------|
| `listDirectory(path)` | `fs:list-directory` | invoke | Lists subdirectories (for path autocomplete). Expands `~`. |
| `createDirectory(parentPath, name)` | `fs:create-directory` | invoke | Creates a new directory |

### Types

```typescript
listDirectory(path: string): Promise<{
  success: boolean;
  basePath: string;
  entries: Array<{ name: string; path: string; isHidden: boolean }>;
  error: string | null;
}>

createDirectory(parentPath: string, folderName: string): Promise<{
  success: boolean;
  path: string | null;
  error: string | null;
}>
```

---

## git

Git repository and config operations.

| Method | Channel | Direction | Description |
|--------|---------|-----------|-------------|
| `loadConfig()` | `git-config:load` | invoke | Load git config (name, email, secret flags, OAuth status) |
| `saveConfig(config)` | `git-config:save` | invoke | Save git config (preserves existing secrets if omitted; OAuth and API key are mutually exclusive) |
| `isRepo(folderPath)` | `git:is-repo` | invoke | Check if path is a git repo with commits |
| `getBranch(folderPath)` | `git:get-branch` | invoke | Get current branch name |
| `init(folderPath)` | `git:init` | invoke | Initialize a new git repo |
| `clone(url, targetDir)` | `git:clone` | invoke | Clone a repository into the requested path |
| `validateBranch(branchName)` | `git:validate-branch` | invoke | Validate branch name for UI input |

### Types

```typescript
loadConfig(): Promise<{
  name: string;
  email: string;
  hasPat?: boolean;
  hasOpenaiKey?: boolean;
  hasAnthropicKey?: boolean;
  useClaudeOAuth?: boolean;   // whether the user has enabled Claude Max OAuth
  hasClaudeOAuth?: boolean;   // whether ~/.claude/.credentials.json exists on host
  useCodexOAuth?: boolean;    // whether the user has enabled Codex OAuth (ChatGPT)
  hasCodexOAuth?: boolean;    // whether ~/.codex/auth.json exists on host
} | null>

saveConfig(config: {
  name: string;
  email: string;
  githubPat?: string;        // set to save, omit to preserve existing, empty string to clear
  openaiApiKey?: string;     // same behavior as githubPat
  anthropicApiKey?: string;  // same behavior as githubPat
  useClaudeOAuth?: boolean;  // enable/disable Claude Max OAuth (mutually exclusive with anthropicApiKey)
  useCodexOAuth?: boolean;   // enable/disable Codex OAuth (mutually exclusive with openaiApiKey)
}): Promise<void>

isRepo(folderPath: string): Promise<{ isRepo: boolean; hasCommits: boolean }>
getBranch(folderPath: string): Promise<string | null>
init(folderPath: string): Promise<{ success: boolean; initialized?: boolean; error?: string }>
clone(url: string, targetDir: string): Promise<{
  success: boolean;
  clonedPath: string | null;
  error: string | null;
}>
validateBranch(branchName: string): Promise<{ valid: boolean; error: string | null }>
```

---

## docker

Docker engine and image management.

| Method | Channel | Direction | Description |
|--------|---------|-----------|-------------|
| `isAvailable()` | `docker:available` | invoke | Check if Docker daemon is reachable |
| `ensureImage(imageName?)` | `docker:ensure-image` | invoke | Build/pull the yolium Docker image |
| `detectState()` | `docker:detect-state` | invoke | Detect Docker install + running state |
| `startDesktop()` | `docker:start-desktop` | invoke | Launch Docker Desktop app |
| `startEngine()` | `docker:start-engine` | invoke | Start Docker engine via systemd |
| `removeAllContainers()` | `docker:remove-all-containers` | invoke | Remove all yolium containers |
| `removeImage()` | `docker:remove-image` | invoke | Remove the yolium Docker image |
| `onBuildProgress(cb)` | `docker:build-progress` | event | Image build progress messages |

### Types

```typescript
isAvailable(): Promise<boolean>
ensureImage(imageName?: string): Promise<void>
detectState(): Promise<{ installed: boolean; running: boolean; desktopPath: string | null }>
startDesktop(): Promise<boolean>
startEngine(): Promise<boolean>
removeAllContainers(): Promise<number>  // returns count removed
removeImage(): Promise<void>
onBuildProgress(callback: (message: string) => void): CleanupFn
```

---

## container

Interactive Docker container sessions (user-facing terminal with agent inside).

| Method | Channel | Direction | Description |
|--------|---------|-----------|-------------|
| `create(folderPath, agent?, ...)` | `yolium:create` | invoke | Create an interactive container, returns session ID |
| `write(sessionId, data)` | `yolium:write` | send | Write to container stdin |
| `resize(sessionId, cols, rows)` | `yolium:resize` | send | Resize container TTY |
| `stop(sessionId, deleteWorktree?)` | `yolium:stop` | invoke | Stop container, optionally delete worktree |
| `getWorktreeInfo(sessionId)` | `yolium:get-worktree-info` | invoke | Get worktree details for cleanup prompt |
| `onData(cb)` | `container:data` | event | Container stdout data |
| `onExit(cb)` | `container:exit` | event | Container exited |

### Types

```typescript
create(
  folderPath: string,
  agent?: string,           // 'claude' | 'opencode' | 'codex' | 'shell' (default: 'claude')
  gsdEnabled?: boolean,     // default: true
  gitConfig?: { name: string; email: string },
  worktreeEnabled?: boolean, // default: false
  branchName?: string
): Promise<string>  // returns sessionId

write(sessionId: string, data: string): void
resize(sessionId: string, cols: number, rows: number): void
stop(sessionId: string, deleteWorktree?: boolean): Promise<void>

getWorktreeInfo(sessionId: string): Promise<{
  worktreePath: string;
  originalPath: string;
  branchName: string;
  hasUncommittedChanges: boolean;
} | null>

onData(callback: (sessionId: string, data: string) => void): CleanupFn
onExit(callback: (sessionId: string, exitCode: number) => void): CleanupFn
```

---

## kanban

Kanban board CRUD operations. Boards are keyed by project path.

| Method | Channel | Direction | Description |
|--------|---------|-----------|-------------|
| `getBoard(projectPath)` | `kanban:get-board` | invoke | Get or create board for project |
| `addItem(projectPath, params)` | `kanban:add-item` | invoke | Add a work item to the board |
| `updateItem(projectPath, itemId, updates)` | `kanban:update-item` | invoke | Update an existing item |
| `addComment(projectPath, itemId, source, text)` | `kanban:add-comment` | invoke | Add a comment to an item |
| `deleteItem(projectPath, itemId)` | `kanban:delete-item` | invoke | Delete an item |
| `onBoardUpdated(cb)` | `kanban:board-updated` | event | Board was modified (refresh UI) |

### Types

```typescript
getBoard(projectPath: string): Promise<KanbanBoard>

addItem(projectPath: string, params: {
  title: string;
  description: string;
  branch?: string;
  agentType: 'claude' | 'codex' | 'opencode';
  order: number;
  model?: string;
}): Promise<KanbanItem>

updateItem(projectPath: string, itemId: string, updates: Partial<KanbanItem>): Promise<KanbanItem>
addComment(projectPath: string, itemId: string, source: 'user' | 'agent' | 'system', text: string): Promise<KanbanItem>
deleteItem(projectPath: string, itemId: string): Promise<boolean>
onBoardUpdated(callback: (projectPath: string) => void): CleanupFn
```

### Key Types

```typescript
type KanbanColumn = 'backlog' | 'ready' | 'in-progress' | 'done';
type AgentStatus = 'idle' | 'running' | 'waiting' | 'interrupted' | 'completed' | 'failed';

interface KanbanItem {
  id: string;
  title: string;
  description: string;
  column: KanbanColumn;
  branch?: string;
  agentType: 'claude' | 'codex' | 'opencode';
  order: number;
  model?: string;
  agentStatus: AgentStatus;
  agentQuestion?: string;
  agentQuestionOptions?: string[];
  comments: KanbanComment[];
  createdAt: string;
  updatedAt: string;
}
```

---

## agent

Headless agent execution (no terminal UI — agent runs in background container, communicates via protocol).
Agent containers use `--output-format stream-json` so Claude CLI streams events incrementally. The main process parses these into readable output (assistant text, tool use summaries like `[Read] /path`, `[Bash] command`, and final results with cost).

| Method | Channel | Direction | Description |
|--------|---------|-----------|-------------|
| `start(params)` | `agent:start` | invoke | Start agent on a kanban item |
| `resume(params)` | `agent:resume` | invoke | Resume agent after answering a question or interruption |
| `answer(projectPath, itemId, answer)` | `agent:answer` | invoke | Answer an agent's question |
| `stop(sessionId)` | `agent:stop` | invoke | Stop a running agent |
| `getActiveSession(projectPath, itemId)` | `agent:get-active-session` | invoke | Check if item has an active agent session |
| `recover(projectPath)` | `agent:recover` | invoke | Mark stale "running" items as "interrupted" after app restart |
| `onOutput(cb)` | `agent:output` | event | Parsed agent output (text, tool summaries, results) |
| `onQuestion(cb)` | `agent:question` | event | Agent is asking the user a question |
| `onItemCreated(cb)` | `agent:item-created` | event | Agent created a new kanban item |
| `onComplete(cb)` | `agent:complete` | event | Agent finished successfully |
| `onError(cb)` | `agent:error` | event | Agent encountered an error |
| `onProgress(cb)` | `agent:progress` | event | Agent progress update |
| `onExit(cb)` | `agent:exit` | event | Agent container exited |

### Types

```typescript
start(params: {
  agentName: string;    // 'code-agent' | 'plan-agent'
  projectPath: string;
  itemId: string;
  goal: string;
}): Promise<{ sessionId: string; error?: string }>

resume(params: {
  agentName: string;
  projectPath: string;
  itemId: string;
  goal: string;
}): Promise<{ sessionId: string; error?: string }>

answer(projectPath: string, itemId: string, answer: string): Promise<void>
stop(sessionId: string): Promise<void>
getActiveSession(projectPath: string, itemId: string): Promise<{ sessionId: string } | null>
recover(projectPath: string): Promise<KanbanItem[]>

onOutput(callback: (sessionId: string, data: string) => void): CleanupFn
onQuestion(callback: (sessionId: string, question: { text: string; options?: string[] }) => void): CleanupFn
onItemCreated(callback: (sessionId: string, item: KanbanItem) => void): CleanupFn
onComplete(callback: (sessionId: string, summary: string) => void): CleanupFn
onError(callback: (sessionId: string, message: string) => void): CleanupFn
onProgress(callback: (sessionId: string, progress: {
  step: string;
  detail: string;
  attempt?: number;
  maxAttempts?: number;
}) => void): CleanupFn
onExit(callback: (sessionId: string, exitCode: number) => void): CleanupFn
```

### Agent Lifecycle

```
start() → running → onComplete() → completed
                  → onQuestion() → waiting → answer() → resume() → running
                  → onError() → failed
                  → stop() → interrupted → resume() → running
```

---

## cache

Project cache management (package caches stored at `~/.yolium/`).

| Method | Channel | Direction | Description |
|--------|---------|-----------|-------------|
| `list()` | `cache:list` | invoke | List all project caches |
| `stats()` | `cache:stats` | invoke | Get aggregate cache statistics |
| `delete(dirName)` | `cache:delete` | invoke | Delete a specific project cache |
| `cleanupOrphaned()` | `cache:cleanup-orphaned` | invoke | Remove caches for deleted projects |
| `cleanupStale(maxAgeDays?)` | `cache:cleanup-stale` | invoke | Remove caches not accessed in N days (default: 90) |

### Types

```typescript
list(): Promise<Array<{
  dirName: string;
  path: string;
  folderName: string;
  lastAccessed: string;
  createdAt: string;
  exists: boolean;          // whether original project still exists
  cacheSizeBytes: number;
  historySizeBytes: number;
}>>

stats(): Promise<{
  totalProjects: number;
  existingProjects: number;
  orphanedProjects: number;
  totalCacheSizeBytes: number;
  totalHistorySizeBytes: number;
  oldestAccess: string | null;
  newestAccess: string | null;
}>

delete(dirName: string): Promise<{ deleted: boolean; error?: string }>
cleanupOrphaned(): Promise<{ deletedCount: number; freedBytes: number; errors: string[] }>
cleanupStale(maxAgeDays?: number): Promise<{ deletedCount: number; freedBytes: number; errors: string[] }>
```

---

## onboarding

Project onboarding: pre-flight validation and project type detection.

| Method | Channel | Direction | Description |
|--------|---------|-----------|-------------|
| `validate(folderPath)` | `onboarding:validate` | invoke | Validates pre-flight: directory writable, sufficient disk space (≥1 GB) |
| `detectProject(folderPath)` | `onboarding:detect-project` | invoke | Detects project types (Node.js, Python, Rust, Go, Java Maven/Gradle, .NET) |

### Types

```typescript
validate(folderPath: string): Promise<PreFlightResult>

detectProject(folderPath: string): Promise<ProjectType[]>

interface PreFlightResult {
  success: boolean;
  errors: string[];
  availableDiskBytes: number | null;
}

type ProjectType =
  | 'nodejs' | 'python' | 'rust' | 'go'
  | 'java-maven' | 'java-gradle' | 'dotnet';
```

---

## project-config

Per-project `.yolium.json` configuration management.

| Method | Channel | Direction | Description |
|--------|---------|-----------|-------------|
| `load(projectPath)` | `project-config:load` | invoke | Load project config from `.yolium.json` |
| `save(projectPath, config)` | `project-config:save` | invoke | Save project config, preserving existing keys |
| `checkDirs(projectPath, dirs)` | `project-config:check-dirs` | invoke | Check which shared directories exist on disk |

### Types

```typescript
load(projectPath: string): Promise<ProjectConfig | null>

save(projectPath: string, config: ProjectConfig): Promise<void>

checkDirs(projectPath: string, dirs: string[]): Promise<Record<string, boolean>>

interface ProjectConfig {
  sharedDirs?: string[];  // Relative paths to shared directories
}
```

---

## usage

Usage monitoring and analytics.

| Method | Channel | Direction | Description |
|--------|---------|-----------|-------------|
| `getClaude()` | `usage:get-claude` | invoke | Get Claude OAuth usage state (auth status + usage data) |
| `refreshClaude()` | `usage:refresh-claude` | invoke | Manually refresh Claude usage data with retry logic |

### Types

```typescript
getClaude(): Promise<{
  hasOAuth: boolean;
  usage: ClaudeUsage | null;
}>

refreshClaude(): Promise<{
  hasOAuth: boolean;
  usage: ClaudeUsage | null;
}>
```

---

## report

HTML test report viewer.

| Method | Channel | Direction | Description |
|--------|---------|-----------|-------------|
| `openFile(filePath)` | `report:open-file` | invoke | Opens an HTML test report in a new BrowserWindow |

### Types

```typescript
openFile(filePath: string): Promise<{
  success: boolean;
  error?: string;
}>
```

**Security:** Only `.html`/`.htm` files within the user's home directory are allowed. Path traversal is rejected.

---

## whisper

Speech-to-text via local Whisper models.

| Method | Channel | Direction | Description |
|--------|---------|-----------|-------------|
| `listModels()` | `whisper:list-models` | invoke | List available Whisper models with download status |
| `isModelDownloaded(modelSize)` | `whisper:is-model-downloaded` | invoke | Check if a model is downloaded |
| `downloadModel(modelSize)` | `whisper:download-model` | invoke | Download a Whisper model |
| `deleteModel(modelSize)` | `whisper:delete-model` | invoke | Delete a downloaded model |
| `isBinaryAvailable()` | `whisper:is-binary-available` | invoke | Check if whisper.cpp binary exists |
| `transcribe(audioData, modelSize)` | `whisper:transcribe` | invoke | Transcribe audio data to text |
| `getSelectedModel()` | `whisper:get-selected-model` | invoke | Get user's preferred model size |
| `saveSelectedModel(modelSize)` | `whisper:save-selected-model` | invoke | Save user's preferred model size |
| `onDownloadProgress(cb)` | `whisper:download-progress` | event | Model download progress |

### Types

```typescript
listModels(): Promise<Array<{
  size: string;
  name: string;
  fileName: string;
  sizeBytes: number;
  downloaded: boolean;
  path?: string;
}>>

isModelDownloaded(modelSize: string): Promise<boolean>
downloadModel(modelSize: string): Promise<string>  // returns path
deleteModel(modelSize: string): Promise<boolean>
isBinaryAvailable(): Promise<boolean>
transcribe(audioData: number[], modelSize: string): Promise<{ text: string; durationSeconds: number }>
getSelectedModel(): Promise<string>
saveSelectedModel(modelSize: string): Promise<void>

onDownloadProgress(callback: (progress: {
  modelSize: string;
  downloadedBytes: number;
  totalBytes: number;
  percent: number;
}) => void): CleanupFn
```

---

## schedule

CRON agent scheduling and specialist credential management.

| Method | Channel | Direction | Description |
|--------|---------|-----------|-------------|
| `getState()` | `schedule:get-state` | invoke | Get full schedule state |
| `toggleSpecialist(id, enabled)` | `schedule:toggle-specialist` | invoke | Toggle specialist enabled/disabled |
| `toggleGlobal(enabled)` | `schedule:toggle-global` | invoke | Toggle global scheduling |
| `triggerRun(id, type)` | `schedule:trigger-run` | invoke | Manual trigger: run a specialist now |
| `getHistory(id, limit?)` | `schedule:get-history` | invoke | Get run history for a specialist |
| `getStats(id)` | `schedule:get-stats` | invoke | Get run statistics |
| `reload()` | `schedule:reload` | invoke | Reload specialist definitions |
| `getSpecialists()` | `schedule:get-specialists` | invoke | Get loaded specialist definitions |
| `scaffold(name, options?)` | `schedule:scaffold` | invoke | Create a new specialist definition file |
| `getCredentials(id)` | `schedule:get-credentials` | invoke | Get redacted credentials (has-secret flags) |
| `saveCredentials(id, serviceId, creds)` | `schedule:save-credentials` | invoke | Save credentials for a specialist service |
| `deleteCredentials(id)` | `schedule:delete-credentials` | invoke | Delete all credentials for a specialist |
| `onAlert(cb)` | `schedule:alert` | event | Specialist alert notification |
| `onStateChanged(cb)` | `schedule:state-changed` | event | Schedule state changed |

### Types

```typescript
scaffold(name: string, options?: {
  description?: string;
  content?: string;  // Raw markdown content (validates and writes directly)
}): Promise<{ filePath: string }>

getCredentials(specialistId: string): Promise<Record<string, Record<string, boolean>>>
  // Returns { serviceId: { keyName: hasValue } } — never exposes raw secrets to renderer

saveCredentials(
  specialistId: string,
  serviceId: string,
  credentials: Record<string, string>
): Promise<void>

deleteCredentials(specialistId: string): Promise<void>
```
