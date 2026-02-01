# Director Agent + Git Follow Mode — Implementation Plan

## Overview

Two interconnected features:

1. **Director Agent** — A long-lived container running Claude that decomposes complex goals into subtasks, spawns specialist agent containers (Codex, Claude, Shell) to execute them in parallel worktrees, and merges results back to main when each specialist finishes.

2. **Git Follow Mode** — Keeps the main repository checkout synchronized with the active worktree's branch. Git hooks (post-checkout, post-commit) installed in worktrees trigger automatic checkout in the main repo. When an agent finishes, its branch is merged into main. Available for all worktree sessions, not just Director.

### End-to-End Flow

```
User gives Director a complex task
    ↓
Director decomposes into 3 subtasks
    ↓
Director spawns 3 specialists, each in its own worktree branch
    ↓
While agents work:
  - Git Follow Mode tracks branch switches in worktrees
  - Main repo checkout follows the active tab's worktree branch
  - IDE/server/Xcode stay open on main repo path, see live updates
    ↓
Agent A finishes → its branch is merged into the target branch chosen by the Director
Agent B finishes → its branch is merged into the Director's target branch
Agent C finishes → its branch is merged into the Director's target branch
    ↓
Director summarizes results to user
Target branch now has all 3 agents' changes merged
```

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Electron Main Process                                       │
│                                                              │
│  ┌───────────┐ ┌──────────────┐ ┌──────────────────────────┐│
│  │ IPC Bridge│ │ Task Manager │ │ Git Follow Manager       ││
│  │ (existing)│ │ (NEW)        │ │ (NEW)                    ││
│  │           │ │              │ │ - installs git hooks     ││
│  │           │ │              │ │ - monitors branch changes││
│  │           │ │              │ │ - merges on completion   ││
│  └─────┬─────┘ └──────┬───────┘ └────────────┬─────────────┘│
│        │              │                       │              │
│  ┌─────┴──────────────┴───────────────────────┴────────────┐ │
│  │              Docker Manager (extended)                   │ │
│  └──┬────────────┬────────────┬────────────────────────────┘ │
└─────┼────────────┼────────────┼──────────────────────────────┘
      │            │            │
 ┌────┴───┐  ┌────┴───┐  ┌────┴───┐
 │Director│  │ Codex  │  │ Claude │  ...specialist containers
 │Agent   │  │ Worker │  │ Worker │
 │(long-  │  │(work-  │  │(work-  │
 │ lived) │  │ tree)  │  │ tree)  │
 └────────┘  └────────┘  └────────┘
```

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Director ↔ Main comms | Structured stdout (`@@YOLIUM:` prefix) | Reuses existing Docker stream; no new sockets needed |
| Director prompt injection | Claude `-p` flag with inline string | Confirmed: entrypoint already uses `-p "$REVIEW_PROMPT"` for code reviews |
| Specialist containers | Interactive (`Tty:true, OpenStdin:true`) via `createYolium()` | Specialists need full terminal capability, same as normal sessions |
| Follow Mode mechanism | Git hooks (post-checkout, post-commit) in worktrees | Same approach as VibeTunnel; more reliable than fs.watch() |
| Follow Mode config storage | `git config vibetunnel.followWorktree` on main repo | Persists across sessions; standard git config pattern |
| Merge on completion | `git merge --no-ff <branch>` into Director-chosen target branch | Director specifies `targetBranch` per spawn; preserves branch history |
| Concurrency limit | Max 3 parallel specialist containers | Prevents resource exhaustion; configurable |
| Stream parsing | Stateful line buffer with `@@YOLIUM:` detection | Raw Docker Buffers need line-buffering before protocol parsing |
| IPC pattern | `ipcMain.handle()` for req/res, `webContents.send()` for events | Matches existing codebase conventions exactly |

---

## Phase 1: Director Protocol Parser (TDD)

**Goal:** Build the protocol parser that extracts `@@YOLIUM:` commands from raw Docker stream data and formats events to send back.

### 1.1 Types (`src/types/task.ts`) — NEW

```typescript
export type TaskStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
export type SpecialistAgent = 'codex' | 'claude' | 'opencode' | 'shell';

export interface DirectorTask {
  id: string;                    // task-{timestamp}-{randomStr}
  parentSessionId: string;       // director container session that spawned it
  sessionId: string | null;      // specialist container session once spawned
  agent: SpecialistAgent;
  status: TaskStatus;
  prompt: string;                // what the specialist should do
  workdir: string;               // project path
  branch?: string;               // worktree branch name
  targetBranch?: string;         // branch to merge into on completion
  timeout?: number;              // seconds, default 1800
  output: string[];              // captured stdout (ring buffer, max 2000 lines)
  exitCode?: number;
  error?: string;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  mergeResult?: 'merged' | 'conflict' | 'skipped';
}

export interface SpawnCommand {
  type: 'spawn';
  agent: SpecialistAgent;
  prompt: string;
  branch?: string;              // worktree branch for this specialist
  targetBranch?: string;        // branch to merge into on completion (default: current branch)
  timeout?: number;
}

export interface StatusCommand { type: 'status'; taskId: string; }
export interface ListCommand { type: 'list_tasks'; }
export interface CancelCommand { type: 'cancel'; taskId: string; }

export type DirectorCommand = SpawnCommand | StatusCommand | ListCommand | CancelCommand;

export interface TaskEvent {
  type: 'task_spawned' | 'task_running' | 'task_complete' | 'task_failed'
      | 'task_cancelled' | 'task_output' | 'task_list' | 'task_merged'
      | 'task_merge_conflict';
  taskId?: string;
  [key: string]: unknown;
}
```

### 1.2 Protocol Parser (`src/lib/director-protocol.ts`) — NEW

**Test first:** `src/tests/director-protocol.test.ts`

Tests to write:
1. Detects `@@YOLIUM:{json}` lines in mixed terminal output
2. Parses valid spawn command with all fields
3. Parses spawn with minimal fields (no branch, no timeout)
4. Parses status, list_tasks, cancel commands
5. Returns null for malformed JSON after prefix
6. Returns null for lines without prefix
7. Buffers partial lines across multiple `feed()` calls
8. Handles multiple protocol lines in one chunk
9. Separates protocol lines from passthrough output correctly
10. Formats TaskEvent to `@@YOLIUM:{json}\n` string
11. Rejects unknown command types
12. Validates agent field is one of SpecialistAgent values
13. Rejects prompts longer than 10KB
14. Validates branch names using same rules as `validateBranchName()`
15. Handles empty chunks and newline-only chunks

```typescript
const PROTOCOL_PREFIX = '@@YOLIUM:';

export class ProtocolParser {
  private buffer: string = '';

  /**
   * Feed raw data from Docker stream.
   * Returns parsed commands and non-protocol passthrough text.
   * Buffers incomplete lines across calls.
   */
  feed(chunk: string): { commands: DirectorCommand[]; passthrough: string };

  reset(): void;
}

export function parseDirectorCommand(json: string): DirectorCommand | null;
export function formatTaskEvent(event: TaskEvent): string;
export function isProtocolLine(line: string): boolean;
```

### 1.3 Files

| File | Type |
|------|------|
| `src/types/task.ts` | NEW |
| `src/lib/director-protocol.ts` | NEW |
| `src/tests/director-protocol.test.ts` | NEW (write first) |

---

## Phase 2: Task Manager (TDD)

**Goal:** Manage specialist task lifecycle — queueing, concurrency, spawning containers, collecting results, triggering merges.

### 2.1 Task Manager (`src/lib/task-manager.ts`) — NEW

**Test first:** `src/tests/task-manager.test.ts`

Tests to write:
1. `enqueue()` creates task with status 'queued'
2. `enqueue()` auto-starts task if under concurrency limit
3. `enqueue()` queues task if at concurrency limit
4. Dequeues next task when a running task completes
5. `cancel()` removes queued task, notifies Director
6. `cancel()` stops running task's container
7. `getTask()` returns task by ID, undefined for missing
8. `listTasks()` returns only tasks for a given parentSessionId
9. `handleSpecialistExit()` with code 0 → status 'completed'
10. `handleSpecialistExit()` with code >0 → status 'failed'
11. `handleSpecialistData()` appends to output array
12. Output ring buffer: caps at 2000 lines, drops oldest
13. Task timeout: fires callback after elapsed seconds
14. `notifyDirector()` writes formatted event to parent session stream
15. `cleanup()` cancels all tasks for a director session
16. Emits 'task-update' event on every state change (for UI)

```typescript
import { EventEmitter } from 'node:events';

interface TaskManagerOptions {
  maxConcurrent?: number;          // default 3
  spawnContainer: (task: DirectorTask) => Promise<string>;  // returns sessionId
  stopContainer: (sessionId: string) => Promise<void>;
  writeToContainer: (sessionId: string, data: string) => void;
  mergeWorktreeBranch: (mainRepoPath: string, branch: string, targetBranch: string) => Promise<MergeResult>;
}

export class TaskManager extends EventEmitter {
  constructor(options: TaskManagerOptions);

  enqueue(parentSessionId: string, command: SpawnCommand, workdir: string): DirectorTask;
  cancel(taskId: string): void;
  getTask(taskId: string): DirectorTask | undefined;
  listTasks(parentSessionId: string): DirectorTask[];
  handleSpecialistData(taskId: string, data: string): void;
  handleSpecialistExit(taskId: string, exitCode: number): void;
  cleanup(parentSessionId: string): void;
}
```

**Dependency injection:** Constructor takes function callbacks for Docker operations and merge. Tests mock these. Production passes real docker-manager and git functions.

### 2.2 Merge on Completion

When `handleSpecialistExit()` is called with exit code 0 and the task has a branch:

```typescript
async handleSpecialistExit(taskId: string, exitCode: number) {
  const task = this.tasks.get(taskId);
  // ... update status ...

  if (exitCode === 0 && task.branch) {
    // Merge specialist's branch into the Director-specified target branch
    const target = task.targetBranch || 'main';  // Director chooses the target
    const result = await this.mergeWorktreeBranch(task.workdir, task.branch, target);
    task.mergeResult = result.status; // 'merged' | 'conflict' | 'skipped'

    if (result.status === 'merged') {
      this.notifyDirector(task.parentSessionId, {
        type: 'task_merged', taskId, branch: task.branch,
        targetBranch: target, summary: result.summary,
      });
    } else if (result.status === 'conflict') {
      this.notifyDirector(task.parentSessionId, {
        type: 'task_merge_conflict', taskId, branch: task.branch,
        targetBranch: target, conflictFiles: result.conflictFiles,
      });
    }
  }

  this.tryDequeue();
}
```

### 2.3 Files

| File | Type |
|------|------|
| `src/lib/task-manager.ts` | NEW |
| `src/tests/task-manager.test.ts` | NEW (write first) |

---

## Phase 3: Git Follow Mode (TDD)

**Goal:** Synchronize main repo checkout with the active worktree's branch using git hooks. Merge worktree branches back to main on completion.

### 3.1 Git Follow Manager (`src/lib/git-follow.ts`) — NEW

**Test first:** `src/tests/git-follow.test.ts`

Tests to write:
1. `installHooks()` creates post-checkout and post-commit hooks in worktree
2. Hooks contain correct shell script that writes branch name to a marker file
3. `installHooks()` backs up existing hooks (appends, doesn't overwrite)
4. `uninstallHooks()` restores original hooks
5. `startFollowing()` stores worktree path in main repo git config
6. `stopFollowing()` removes git config entry and uninstalls hooks
7. `handleBranchChange()` runs `git checkout <branch>` in main repo
8. `handleBranchChange()` skips if main repo has uncommitted changes
9. `handleBranchChange()` skips if branch doesn't exist in main repo
10. `handleBranchChange()` debounces rapid changes (500ms)
11. `mergeBranch()` runs `git merge --no-ff <branch>` in main repo
12. `mergeBranch()` returns conflict details on failure
13. `mergeBranch()` returns summary (files changed, insertions, deletions)
14. `isFollowing()` returns boolean for a session
15. `stopAllFollowing()` cleans up all sessions

### 3.2 Hook-Based Architecture (inspired by VibeTunnel)

Instead of fs.watch(), install lightweight git hooks in worktrees:

**Post-checkout hook** (installed in worktree `.git/hooks/post-checkout`):
```bash
#!/bin/bash
# Yolium Git Follow Mode hook
BRANCH=$(git rev-parse --abbrev-ref HEAD)
echo "$BRANCH" > /tmp/yolium-follow-{sessionId}.branch
```

**Post-commit hook** (installed in worktree `.git/hooks/post-commit`):
```bash
#!/bin/bash
# Yolium Git Follow Mode hook
BRANCH=$(git rev-parse --abbrev-ref HEAD)
echo "$BRANCH" > /tmp/yolium-follow-{sessionId}.branch
```

**Main process watcher:** `fs.watchFile()` on `/tmp/yolium-follow-{sessionId}.branch` detects when hooks fire, reads the new branch name, and runs checkout on the main repo.

**Why hooks + marker file instead of direct IPC:** The hooks run inside Docker containers. They can't call Electron IPC. But the marker file is on a bind-mounted path visible to the host. The host watches the file.

### 3.3 Marker File Bind Mount

In `createYolium()`, when follow mode is enabled, add a bind mount for the marker file:

```typescript
const markerDir = path.join(os.tmpdir(), 'yolium-follow');
fs.mkdirSync(markerDir, { recursive: true });
binds.push(`${toDockerPath(markerDir)}:/tmp/yolium-follow:rw`);
```

The hook writes to `/tmp/yolium-follow/{sessionId}.branch` inside the container, which appears at `{os.tmpdir()}/yolium-follow/{sessionId}.branch` on the host.

### 3.4 Implementation

```typescript
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';

export interface FollowSession {
  sessionId: string;
  worktreePath: string;
  mainRepoPath: string;
  currentBranch: string | null;
  watcher: ReturnType<typeof fs.watchFile> | null;
  debounceTimer: ReturnType<typeof setTimeout> | null;
}

export interface MergeResult {
  status: 'merged' | 'conflict' | 'skipped';
  summary?: string;          // "3 files changed, 45 insertions, 12 deletions"
  conflictFiles?: string[];  // files with conflicts
  error?: string;
}

const sessions = new Map<string, FollowSession>();

// Hook management
export function installFollowHooks(worktreePath: string, sessionId: string): void;
export function uninstallFollowHooks(worktreePath: string): void;

// Session management
export function startFollowing(sessionId: string, worktreePath: string, mainRepoPath: string): void;
export function stopFollowing(sessionId: string): void;
export function stopAllFollowing(): void;
export function isFollowing(sessionId: string): boolean;
export function getFollowStatus(sessionId: string): { branch: string | null; active: boolean };

// Git operations
export function handleBranchChange(sessionId: string, newBranch: string): void;
export function mergeBranch(mainRepoPath: string, branch: string, targetBranch: string): MergeResult;

// Internal
function readMarkerFile(sessionId: string): string | null;
function hasUncommittedChanges(repoPath: string): boolean;
function branchExistsInRepo(repoPath: string, branch: string): boolean;
function getChangeSummary(repoPath: string): string;
```

### 3.5 Merge Implementation

```typescript
export function mergeBranch(mainRepoPath: string, branch: string, targetBranch: string): MergeResult {
  // Safety: check for uncommitted changes
  if (hasUncommittedChanges(mainRepoPath)) {
    return { status: 'skipped', error: 'Repo has uncommitted changes' };
  }

  // Safety: check both branches exist
  if (!branchExistsInRepo(mainRepoPath, branch)) {
    return { status: 'skipped', error: `Branch ${branch} not found` };
  }
  if (!branchExistsInRepo(mainRepoPath, targetBranch)) {
    return { status: 'skipped', error: `Target branch ${targetBranch} not found` };
  }

  try {
    // Checkout the Director-specified target branch
    execSync(`git checkout "${targetBranch}"`, { cwd: mainRepoPath, stdio: 'pipe' });

    // Merge specialist branch into target with --no-ff to preserve history
    const output = execSync(
      `git merge --no-ff "${branch}" -m "Merge ${branch} into ${targetBranch} (via Yolium)"`,
      { cwd: mainRepoPath, encoding: 'utf-8', stdio: 'pipe' }
    );

    return { status: 'merged', summary: getChangeSummary(mainRepoPath) };
  } catch (err) {
    // Check if it's a merge conflict
    const status = execSync('git status --porcelain', {
      cwd: mainRepoPath, encoding: 'utf-8'
    });
    const conflictFiles = status.split('\n')
      .filter(l => l.startsWith('UU') || l.startsWith('AA'))
      .map(l => l.slice(3).trim());

    if (conflictFiles.length > 0) {
      // Abort the failed merge
      execSync('git merge --abort', { cwd: mainRepoPath, stdio: 'pipe' });
      return { status: 'conflict', conflictFiles };
    }

    return { status: 'skipped', error: String(err) };
  }
}
```

### 3.6 Files

| File | Type |
|------|------|
| `src/lib/git-follow.ts` | NEW |
| `src/tests/git-follow.test.ts` | NEW (write first) |

---

## Phase 4: Docker Manager Integration

**Goal:** Wire the protocol parser, task manager, and follow mode into docker-manager. Add the `director` agent type.

### 4.1 Add Director Agent Type

`src/types/agent.ts`:
```typescript
export type AgentType = 'claude' | 'opencode' | 'codex' | 'shell' | 'director';
```

### 4.2 Extend ContainerSession

`src/types/docker.ts`:
```typescript
export interface ContainerSession {
  // ... existing fields ...
  isDirector?: boolean;
  taskId?: string;            // set on specialist containers
  parentSessionId?: string;   // links specialist → director
  followMode?: boolean;       // git follow mode active
}
```

### 4.3 Modify `createYolium()` in `src/docker-manager.ts`

**Protocol parser per-session** (around line 620):
```typescript
// After session creation, if director:
let protocolParser: ProtocolParser | undefined;
if (agent === 'director') {
  protocolParser = new ProtocolParser();
  session.isDirector = true;
}
```

**Stream data handler** (modify existing, around line 637):
```typescript
stream.on('data', (data: Buffer) => {
  const dataStr = data.toString();

  if (protocolParser) {
    const { commands, passthrough } = protocolParser.feed(dataStr);
    for (const cmd of commands) {
      taskManager.handleCommand(sessionId, cmd, folderPath);
    }
    if (passthrough) {
      webContents?.send('container:data', sessionId, passthrough);
    }
  } else {
    webContents?.send('container:data', sessionId, dataStr);
  }
});
```

**Stream end handler** (modify existing, around line 658):
```typescript
stream.on('end', async () => {
  // ... existing state update and IPC ...

  // If this is a specialist, notify TaskManager
  if (session.taskId) {
    taskManager.handleSpecialistExit(session.taskId, exitCode);
  }

  // If follow mode, stop following
  if (session.followMode) {
    stopFollowing(sessionId);
  }
});
```

**Follow mode integration** (after container starts, around line 630):
```typescript
if (worktreeEnabled && followModeEnabled) {
  // Install git hooks in worktree and start watching marker file
  installFollowHooks(worktreePath!, sessionId);
  startFollowing(sessionId, worktreePath!, resolvedFolderPath);
  session.followMode = true;
}
```

**Follow mode marker bind mount** (in binds array, around line 531):
```typescript
if (followModeEnabled) {
  const markerDir = path.join(os.tmpdir(), 'yolium-follow');
  fs.mkdirSync(markerDir, { recursive: true });
  binds.push(`${toDockerPath(markerDir)}:/tmp/yolium-follow:rw`);
}
```

**Environment variables for director** (around line 558):
```typescript
if (agent === 'director') {
  envVars.TOOL = 'director';
  envVars.DIRECTOR_MODE = 'true';
} else {
  envVars.TOOL = agent;
}

// If spawned by TaskManager with a prompt:
if (options?.agentPrompt) {
  envVars.AGENT_PROMPT = options.agentPrompt;
}
```

### 4.4 Specialist Container Spawning

New export for TaskManager to call:

```typescript
export async function createSpecialistContainer(task: DirectorTask): Promise<string> {
  // Calls createYolium() with:
  //   folderPath: task.workdir
  //   agent: task.agent
  //   worktreeEnabled: !!task.branch
  //   branchName: task.branch
  //   options: { agentPrompt: task.prompt, taskId: task.id, parentSessionId: task.parentSessionId }
  //
  // The session gets taskId and parentSessionId set on it.
  // Follow mode NOT enabled for specialist containers (Director manages merges).
  return sessionId;
}
```

### 4.5 Entrypoint Changes (`src/docker/entrypoint.sh`)

**Add AGENT_PROMPT handling** (before the main TOOL dispatch, around line 325):
```bash
# Specialist mode: if AGENT_PROMPT is set, run agent with prompt and exit
if [ -n "$AGENT_PROMPT" ]; then
    case "$TOOL" in
        claude)
            exec claude --dangerously-skip-permissions -p "$AGENT_PROMPT"
            ;;
        codex)
            exec "$CODEX_BIN" exec --sandbox danger-full-access "$AGENT_PROMPT"
            ;;
        opencode)
            exec "$OPENCODE_BIN" run "$AGENT_PROMPT"
            ;;
        shell)
            eval "$AGENT_PROMPT"
            ;;
    esac
fi
```

**Add director case** (after claude case, around line 479):
```bash
elif [ "$TOOL" = "director" ]; then
    DIRECTOR_PROMPT='You are a Director Agent running inside Yolium. You decompose complex tasks into subtasks and delegate them to specialist agents running in isolated Docker containers.

COMMUNICATION PROTOCOL
Send commands by printing lines with the @@YOLIUM: prefix:

SPAWN A SPECIALIST:
echo '\''@@YOLIUM:{"type":"spawn","agent":"codex","prompt":"<detailed task>","branch":"<work-branch>","targetBranch":"<merge-into-this-branch>"}'\''

CHECK TASK STATUS:
echo '\''@@YOLIUM:{"type":"status","taskId":"<id>"}'\''

LIST ALL TASKS:
echo '\''@@YOLIUM:{"type":"list_tasks"}'\''

CANCEL A TASK:
echo '\''@@YOLIUM:{"type":"cancel","taskId":"<id>"}'\''

EVENTS (received on stdin):
@@YOLIUM:{"type":"task_spawned","taskId":"...","agent":"codex"}
@@YOLIUM:{"type":"task_running","taskId":"..."}
@@YOLIUM:{"type":"task_complete","taskId":"...","exitCode":0,"summary":"..."}
@@YOLIUM:{"type":"task_failed","taskId":"...","exitCode":1,"error":"..."}
@@YOLIUM:{"type":"task_merged","taskId":"...","branch":"...","summary":"3 files changed"}
@@YOLIUM:{"type":"task_merge_conflict","taskId":"...","conflictFiles":["file.ts"]}

AGENTS: codex (coding/bugs/refactoring), claude (analysis/review/docs), shell (build/test/verify)

RULES:
1. Break tasks into small, focused subtasks
2. Each specialist gets its own git branch - name descriptively
3. Provide detailed prompts to specialists
4. Wait for dependent tasks before spawning follow-ups
5. Max 3 parallel specialists for independent work
6. When a task completes, its branch is auto-merged into targetBranch
7. Always specify targetBranch (the branch to merge work into)
8. If merge conflicts, spawn a specialist to resolve them
8. Always verify with a shell task: run tests after code changes
9. Summarize all results to the user when done
10. Use echo to print @@YOLIUM: commands to stdout'

    exec claude --dangerously-skip-permissions -p "$DIRECTOR_PROMPT"
```

### 4.6 IPC Handlers (`src/main.ts`)

```typescript
// Director task operations
ipcMain.handle('director:list-tasks', (_event, sessionId: string) =>
  taskManager.listTasks(sessionId));

ipcMain.handle('director:cancel-task', (_event, taskId: string) =>
  taskManager.cancel(taskId));

ipcMain.handle('director:get-task', (_event, taskId: string) =>
  taskManager.getTask(taskId));

// Git Follow operations
ipcMain.handle('git-follow:status', (_event, sessionId: string) =>
  getFollowStatus(sessionId));

// TaskManager → renderer events
taskManager.on('task-update', (task: DirectorTask) => {
  const win = BrowserWindow.getAllWindows()[0];
  if (win && !win.isDestroyed()) {
    win.webContents.send('director:task-update', task);
  }
});
```

### 4.7 Preload Bridge (`src/preload.ts`)

```typescript
// Director
directorListTasks: (sessionId: string) =>
  ipcRenderer.invoke('director:list-tasks', sessionId),
directorCancelTask: (taskId: string) =>
  ipcRenderer.invoke('director:cancel-task', taskId),
directorGetTask: (taskId: string) =>
  ipcRenderer.invoke('director:get-task', taskId),
onDirectorTaskUpdate: (callback: (task: DirectorTask) => void): CleanupFn => {
  const handler = (_e: Electron.IpcRendererEvent, task: DirectorTask) => callback(task);
  ipcRenderer.on('director:task-update', handler);
  return () => ipcRenderer.removeListener('director:task-update', handler);
},

// Git Follow
gitFollowStatus: (sessionId: string) =>
  ipcRenderer.invoke('git-follow:status', sessionId),
onGitFollowBranchChanged: (callback: (sessionId: string, branch: string) => void): CleanupFn => {
  const handler = (_e: Electron.IpcRendererEvent, sid: string, branch: string) => callback(sid, branch);
  ipcRenderer.on('git-follow:branch-changed', handler);
  return () => ipcRenderer.removeListener('git-follow:branch-changed', handler);
},
```

### 4.8 Files Changed

| File | Type | Description |
|------|------|-------------|
| `src/types/agent.ts` | MODIFY | Add `'director'` |
| `src/types/docker.ts` | MODIFY | Add `isDirector`, `taskId`, `parentSessionId`, `followMode` |
| `src/docker-manager.ts` | MODIFY | Protocol parser, specialist spawning, follow mode hooks |
| `src/docker/entrypoint.sh` | MODIFY | Director case, AGENT_PROMPT handling |
| `src/main.ts` | MODIFY | Director + follow IPC handlers, TaskManager wiring |
| `src/preload.ts` | MODIFY | Director + follow API bridge |

---

## Phase 5: UI Integration

**Goal:** Add Director to agent selection, show task panel, show follow mode status.

### 5.1 Agent Selection Dialog (`src/components/AgentSelectDialog.tsx`) — MODIFY

Add 5th agent:
```typescript
{ id: 'director', label: 'Director', shortcut: '5',
  description: 'Orchestrates multiple agents for complex tasks' }
```

Add Follow Mode toggle (visible when worktree is enabled):
```typescript
{worktreeEnabled && (
  <div data-testid="follow-mode-toggle">
    <label>
      <input type="checkbox" checked={followMode} onChange={...} />
      Git Follow Mode — main repo follows worktree branch changes
    </label>
  </div>
)}
```

When Director is selected, auto-enable worktree + follow mode (Director always uses worktrees).

### 5.2 Tab Type Extension (`src/types/tabs.ts`) — MODIFY

```typescript
export interface Tab {
  // ... existing fields ...
  agentType?: AgentType;
  followMode?: boolean;
}
```

### 5.3 Task Panel Component (`src/components/TaskPanel.tsx`) — NEW

Shown alongside Terminal when active tab has `agentType === 'director'`:

```typescript
interface TaskPanelProps {
  directorSessionId: string;
}

function TaskPanel({ directorSessionId }: TaskPanelProps) {
  const [tasks, setTasks] = useState<DirectorTask[]>([]);

  useEffect(() => {
    // Load initial tasks
    window.electronAPI.directorListTasks(directorSessionId).then(setTasks);

    // Listen for updates
    const cleanup = window.electronAPI.onDirectorTaskUpdate((task) => {
      setTasks(prev => {
        const idx = prev.findIndex(t => t.id === task.id);
        if (idx >= 0) {
          const next = [...prev]; next[idx] = task; return next;
        }
        return [...prev, task];
      });
    });

    return cleanup;
  }, [directorSessionId]);

  return (
    <div data-testid="director-task-panel" className="task-panel">
      {tasks.map(task => (
        <TaskCard key={task.id} task={task} />
      ))}
    </div>
  );
}
```

Each TaskCard shows:
- Status dot (same colors as tab status dots)
- Agent type badge
- Branch name
- Prompt snippet (first 100 chars)
- Merge result badge (merged/conflict/pending)
- Cancel button for queued/running
- Expandable output viewer (last 50 lines)

### 5.4 Layout Change (`src/App.tsx`) — MODIFY

```tsx
<div className="main-content">
  <div className={activeTab?.agentType === 'director' ? 'terminal-split' : 'terminal-full'}>
    <Terminal ... />
  </div>
  {activeTab?.agentType === 'director' && (
    <TaskPanel directorSessionId={activeTab.sessionId} />
  )}
</div>
```

### 5.5 Status Bar Follow Indicator (`src/components/StatusBar.tsx`) — MODIFY

When follow mode is active, show in status bar:
```
🔗 Following: feature-branch
```

Listen to `git-follow:branch-changed` events to update the displayed branch.

### 5.6 Pass `agentType` and `followMode` Through Tab Creation

In `App.tsx`, `createYoliumWithAgent()`:
```typescript
const tabId = addTab(sessionId, folderPath, 'starting', gitBranch, {
  agentType: agent,
  followMode: worktreeEnabled && followModeEnabled,
});
```

### 5.7 Files Changed

| File | Type | Description |
|------|------|-------------|
| `src/components/AgentSelectDialog.tsx` | MODIFY | Director option, Follow Mode toggle |
| `src/components/TaskPanel.tsx` | NEW | Task status side panel |
| `src/components/StatusBar.tsx` | MODIFY | Follow mode indicator |
| `src/types/tabs.ts` | MODIFY | Add `agentType`, `followMode` |
| `src/App.tsx` | MODIFY | Split layout, pass agentType/followMode |
| `src/tests/e2e/helpers/selectors.ts` | MODIFY | Director + follow selectors |

---

## Phase 6: Hardening

### 6.1 Task Timeouts
- Default 1800s (30 min) per specialist
- `setTimeout()` starts when container enters 'running' state
- On timeout: stop container, mark failed, notify Director

### 6.2 Merge Conflict Handling
- On conflict: abort merge, notify Director with conflict file list
- Director can spawn a specialist to resolve conflicts
- Specialist resolves in worktree, then merge is retried

### 6.3 Safety Guards
- Follow mode pauses if main repo has uncommitted changes (logs warning, skips checkout)
- Branch validation on all spawn commands (reuse `validateBranchName()`)
- Rate limit: max 10 spawns per minute per director session
- Specialist prompt max 10KB
- Output buffer: ring buffer at 2000 lines per task

### 6.4 Cleanup
- Director tab close → `TaskManager.cleanup(sessionId)` → cancel all tasks, stop containers, delete worktrees
- App quit → `stopAllFollowing()`, `closeAllContainers()` (existing)
- Hook cleanup → `uninstallFollowHooks()` restores original hooks

### 6.5 Error Recovery
- Specialist crash → TaskManager notifies Director with error
- Director prompt instructs retry/adjust behavior
- Director crash → UI shows "Director stopped", user can restart tab
- Marker file cleanup: remove on session stop

---

## Complete File Change Summary

| File | Type | Phase | Description |
|------|------|-------|-------------|
| `src/types/task.ts` | NEW | 1 | Task, command, event types |
| `src/lib/director-protocol.ts` | NEW | 1 | ProtocolParser class |
| `src/tests/director-protocol.test.ts` | NEW | 1 | Protocol parser tests (TDD) |
| `src/lib/task-manager.ts` | NEW | 2 | TaskManager class |
| `src/tests/task-manager.test.ts` | NEW | 2 | TaskManager tests (TDD) |
| `src/lib/git-follow.ts` | NEW | 3 | Git Follow Mode |
| `src/tests/git-follow.test.ts` | NEW | 3 | Follow mode tests (TDD) |
| `src/types/agent.ts` | MODIFY | 4 | Add `'director'` |
| `src/types/docker.ts` | MODIFY | 4 | Add session fields |
| `src/types/tabs.ts` | MODIFY | 5 | Add `agentType`, `followMode` |
| `src/docker-manager.ts` | MODIFY | 4 | Protocol + specialist + follow integration |
| `src/docker/entrypoint.sh` | MODIFY | 4 | Director case, AGENT_PROMPT |
| `src/main.ts` | MODIFY | 4 | IPC handlers, TaskManager wiring |
| `src/preload.ts` | MODIFY | 4 | API bridge |
| `src/components/AgentSelectDialog.tsx` | MODIFY | 5 | Director + Follow Mode UI |
| `src/components/TaskPanel.tsx` | NEW | 5 | Task status panel |
| `src/components/StatusBar.tsx` | MODIFY | 5 | Follow indicator |
| `src/App.tsx` | MODIFY | 5 | Split layout, agentType |
| `src/tests/e2e/helpers/selectors.ts` | MODIFY | 5 | New selectors |
| `src/tests/e2e/tests/director.spec.ts` | NEW | 5 | Director E2E tests |

---

## TDD Execution Order

Each phase:
1. Write test file with all cases → all fail
2. `npm test` → verify failures
3. Implement minimal code to pass
4. `npm test` → green
5. Refactor, keep green

Phases 1-3 are pure logic (no Docker/Electron) → fast TDD. Phase 4 is integration wiring. Phase 5 needs E2E tests.

---

## Open Questions

1. **What happens on merge conflict?** Current design: abort merge, notify Director, Director spawns resolver. Alternative: leave conflict markers in main repo for user to resolve manually.

2. **Should Follow Mode track the active tab or all worktrees?** Current design: each worktree session has its own Follow Mode that independently updates main repo when its hooks fire. Multiple concurrent follow sessions could cause rapid checkout switching on main. Mitigation: only the focused tab's follow mode is active; others are paused.

3. **Context window limits for long-running Director?** Many task completions with large outputs fill Claude's context. Solutions: aggressive summarization in TaskManager (send only exit code + summary, not full output), scratchpad files.
