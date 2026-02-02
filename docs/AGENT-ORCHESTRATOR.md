# Kanban Dashboard + Director Agent + Git Follow Mode — Complete Plan

## Scope

Add a Kanban dashboard to Yolium with a left sidebar, integrated with the Director Agent and Git Follow Mode. Work items flow through stages: **Backlog → Ready → In Progress → Review → Done**. The Director Agent reads Ready items, spawns specialists, and manages the pipeline. PR creation is manual (user clicks in Done column).

## Key Decisions (from user)

- **PR creation**: Manual only — user reviews, moves to Done, clicks "Create PR"
- **Git push**: On PR creation only — branch stays local until user explicitly creates PR, then push + PR together
- **Director notification**: Main process sends `@@YOLIUM:` event to Director stdin when items move to Ready
- **Board scope**: Per-project — each project folder gets its own board at `~/.yolium/kanban/{hash}.json`

---

## Phase 1: Kanban Types + Store (TDD)

### 1.1 Types — `src/types/kanban.ts` (NEW)

```typescript
export type KanbanColumn = 'backlog' | 'ready' | 'in_progress' | 'review' | 'done';

export interface KanbanItem {
  id: string;                     // kanban-{timestamp}-{random}
  title: string;
  description: string;            // detailed instructions for agent
  branch: string;                 // worktree branch name
  targetBranch: string;           // merge target (Director chooses)
  agentType: SpecialistAgent;     // codex | claude | opencode | shell
  column: KanbanColumn;
  projectPath: string;
  order: number;                  // sort order within column
  sessionId?: string;             // container session when in_progress
  taskId?: string;                // links to DirectorTask.id
  prUrl?: string;                 // after PR creation
  mergeResult?: 'merged' | 'conflict' | 'skipped';
  error?: string;                 // last error message
  reviewOutput?: string;          // review agent findings
  reviewSessionId?: string;       // review container session
  reviewStatus?: 'pending' | 'running' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
}

export interface KanbanBoard {
  version: 1;
  projectPath: string;
  items: KanbanItem[];
}

// Column transition rules
export const VALID_TRANSITIONS: Record<string, { ui: KanbanColumn[]; director: KanbanColumn[] }> = {
  backlog:     { ui: ['ready'],                director: [] },
  ready:       { ui: ['backlog'],              director: ['in_progress'] },
  in_progress: { ui: [],                       director: ['review'] },
  review:      { ui: ['done', 'in_progress'],  director: [] },
  done:        { ui: [],                       director: [] },
};
```

### 1.2 Store — `src/lib/kanban-store.ts` (NEW)

**Test first**: `src/tests/kanban-store.test.ts`

Pure functions for board mutations (no I/O):
- `addItem(board, itemData)` → `{ board, item }`
- `moveItem(board, itemId, toColumn, source: 'ui'|'director')` → board (validates transitions)
- `updateItem(board, itemId, updates)` → board
- `deleteItem(board, itemId)` → board
- `reorderItem(board, itemId, newOrder)` → board
- `getItemsByColumn(board)` → `Record<KanbanColumn, KanbanItem[]>` (sorted by order)
- `getReadyItems(board)` → `KanbanItem[]`

I/O functions:
- `loadBoard(projectPath)` → board (returns empty board if file missing/corrupt)
- `saveBoard(board)` → void (atomic write: temp file → rename, 0o600 permissions)

Use `hashProjectPath()` extracted to `src/lib/path-utils.ts` (shared with docker-manager).

**Key test cases** (35+ tests):
- All pure function happy paths
- Column transition validation rejects invalid moves
- Source-based permission enforcement (UI vs Director)
- Atomic write: temp file rename pattern
- Corrupt JSON recovery (returns empty board)
- Board version migration stub
- Item ordering within columns
- Concurrent modification safety (single-threaded Node.js event loop guarantees serial execution for IPC handlers)

### 1.3 Shared Utility — `src/lib/path-utils.ts` (NEW)

Extract `hashProjectPath()` from docker-manager.ts:
```typescript
export function hashProjectPath(projectPath: string): string;
```

Update docker-manager.ts to import from path-utils instead of defining locally.

### Files

| File | Type |
|------|------|
| `src/types/kanban.ts` | NEW |
| `src/lib/kanban-store.ts` | NEW |
| `src/lib/path-utils.ts` | NEW (extracted from docker-manager) |
| `src/docker-manager.ts` | MODIFY (import hashProjectPath from path-utils) |
| `src/tests/kanban-store.test.ts` | NEW (write first) |

---

## Phase 2: Kanban IPC + PR Creation (TDD)

### 2.1 IPC Handlers — `src/main.ts` (MODIFY)

All handlers follow existing pattern: `ipcMain.handle()` with `{ success, data?, error? }` returns.

```
kanban:load-board      (projectPath)                          → { success, board }
kanban:add-item        (projectPath, itemData)                → { success, item }
kanban:move-item       (projectPath, itemId, toColumn)        → { success, board }
kanban:update-item     (projectPath, itemId, updates)         → { success, board }
kanban:delete-item     (projectPath, itemId)                  → { success }
kanban:get-item        (projectPath, itemId)                  → { success, item }
kanban:create-pr       (projectPath, itemId)                  → { success, prUrl }
```

Every mutation calls `notifyBoardUpdated(projectPath)` → `webContents.send('kanban:board-updated', projectPath)`.

### 2.2 PR Creation — `src/lib/kanban-pr.ts` (NEW)

**Test first**: `src/tests/kanban-pr.test.ts`

```typescript
export async function createPullRequest(projectPath: string, item: KanbanItem): Promise<string> {
  // 1. Validate item is in 'done' column
  // 2. Check gh CLI exists: execSync('gh --version')
  // 3. Push branch to remote: git push -u origin {branch}
  //    (runs in main repo, not worktree — branch exists after merge)
  // 4. Authenticate gh with PAT: echo $PAT | gh auth login --with-token
  //    (PAT from ~/.yolium/settings.json via loadGitConfig())
  // 5. Check no existing PR for this branch: gh pr list --head {branch}
  // 6. Create PR: gh pr create --base {targetBranch} --head {branch} --title --body
  // 7. Return PR URL
}
```

**Key gap fixes:**
- Push before PR (branch is local-only from worktree)
- Authenticate host `gh` using PAT from settings (not relying on user's `gh auth`)
- Pre-check for existing PRs on same branch
- Shell-escape title/description to prevent injection

**Test cases** (15+ tests):
- Happy path: push + auth + create → URL
- gh CLI not installed → descriptive error
- Push fails (no remote, auth) → error
- PR already exists → return existing URL
- Network timeout → error
- Invalid PAT → error
- Branch doesn't exist → error
- Shell injection in title/description → escaped safely

### 2.3 Preload Bridge — `src/preload.ts` (MODIFY)

Add all kanban methods + `onKanbanBoardUpdated` listener with cleanup function.

### Files

| File | Type |
|------|------|
| `src/lib/kanban-pr.ts` | NEW |
| `src/main.ts` | MODIFY (add 7 kanban IPC handlers) |
| `src/preload.ts` | MODIFY (add kanban API + event listener) |
| `src/tests/kanban-pr.test.ts` | NEW (write first) |

---

## Phase 3: Sidebar + Kanban UI

### 3.1 Sidebar — `src/components/Sidebar.tsx` (NEW)

Collapsible left navigation:
- **Collapsed** (default): 40px, icons only (Terminal, Kanban from lucide-react)
- **Expanded**: 160px, icons + labels
- Toggle button at bottom (PanelLeftClose/PanelLeftOpen)
- Active view indicator: left border accent
- Styling: `bg-[var(--color-bg-secondary)]`, `border-r border-[var(--color-border-primary)]`
- Collapsed state persisted in `localStorage('yolium:sidebarCollapsed')`
- `data-testid="sidebar"`, `data-testid="nav-terminal"`, `data-testid="nav-kanban"`, `data-testid="sidebar-toggle"`

### 3.2 Layout Change — `src/App.tsx` (MODIFY)

Add `activeView` state: `'terminal' | 'kanban'`

New layout:
```
TabBar (full width, top)
flex row:
  Sidebar (40px or 160px)
  main (flex-1):
    if activeView === 'terminal':
      Terminal/EmptyState + StatusBar (existing)
    if activeView === 'kanban':
      KanbanDashboard
```

Sidebar always visible (including when no tabs). EmptyState unchanged but sidebar provides alternative navigation to Kanban.

**Terminal resize fix**: Add `ResizeObserver` to Terminal's parent container. When sidebar toggles, the observer fires → `fitAddon.fit()` → `resizeYolium()`. This handles the xterm.js reflow automatically.

### 3.3 Kanban Components (all NEW)

```
src/components/kanban/
  KanbanDashboard.tsx    — top-level, loads board via IPC, project context from active tab
  KanbanToolbar.tsx      — project path display, "New Item" button, refresh
  KanbanBoard.tsx        — horizontal flex of 5 columns, overflow-x-auto
  KanbanColumn.tsx       — column header + card list, drop zone styling
  KanbanCard.tsx         — card display: title, branch, agent badge, status, context menu
  KanbanItemDialog.tsx   — create/edit modal (title, description, branch, targetBranch, agentType)
```

**KanbanDashboard** determines project context:
- If tabs exist: uses active tab's `cwd`
- If no tabs: shows project selector (reuse PathInputDialog)

**KanbanCard context menu** (web-based, not native Electron):
- "Move to Ready" / "Move to Backlog" (depending on current column)
- "Edit" → opens KanbanItemDialog
- "Delete" → confirmation
- "Create PR" (only in Done column)
- Move options filtered by `VALID_TRANSITIONS[column].ui`

**No drag-and-drop** — explicit move actions via context menu.

### 3.4 Kanban Hook — `src/hooks/useKanbanState.ts` (NEW)

**Test first**: `src/tests/useKanbanState.test.ts`

```typescript
function useKanbanState(projectPath: string | null) {
  // Loads board on mount / projectPath change
  // Subscribes to kanban:board-updated events
  // Returns: { board, addItem, moveItem, updateItem, deleteItem, createPr, refresh, loading, error }
}
```

### 3.5 Tab Type Extension — `src/types/tabs.ts` (MODIFY)

Add optional `agentType?: AgentType` and `followMode?: boolean` to Tab interface.

### Files

| File | Type |
|------|------|
| `src/components/Sidebar.tsx` | NEW |
| `src/components/kanban/KanbanDashboard.tsx` | NEW |
| `src/components/kanban/KanbanToolbar.tsx` | NEW |
| `src/components/kanban/KanbanBoard.tsx` | NEW |
| `src/components/kanban/KanbanColumn.tsx` | NEW |
| `src/components/kanban/KanbanCard.tsx` | NEW |
| `src/components/kanban/KanbanItemDialog.tsx` | NEW |
| `src/hooks/useKanbanState.ts` | NEW |
| `src/App.tsx` | MODIFY (sidebar, activeView, layout) |
| `src/components/Terminal.tsx` | MODIFY (ResizeObserver for sidebar toggle) |
| `src/types/tabs.ts` | MODIFY (agentType, followMode) |
| `src/tests/useKanbanState.test.ts` | NEW (write first) |
| `src/tests/e2e/helpers/selectors.ts` | MODIFY (kanban + sidebar selectors) |

---

## Phase 4: Director Protocol + Kanban Integration (includes Auto-Review)

### 4.1 Protocol Parser Extensions — `src/lib/director-protocol.ts` (MODIFY)

Add kanban command types to DirectorCommand union:

```typescript
interface KanbanPickCommand { type: 'kanban_pick'; itemId: string; }
interface KanbanUpdateCommand { type: 'kanban_update'; itemId: string; column: KanbanColumn; }
interface KanbanListReadyCommand { type: 'kanban_list_ready'; }
```

Parser validates:
- `itemId` format matches `kanban-{digits}-{alphanum}`
- `column` is valid KanbanColumn enum value
- Commands from Director sessions only (checked by caller in docker-manager)

### 4.2 Director → Kanban Integration — `src/docker-manager.ts` (MODIFY)

When protocol parser extracts a kanban command from a Director container:

```typescript
case 'kanban_pick':
  const board = loadBoard(session.folderPath);
  const item = board.items.find(i => i.id === cmd.itemId);
  if (item && item.column === 'ready') {
    // Move to in_progress
    const updated = moveItem(board, cmd.itemId, 'in_progress', 'director');
    saveBoard(updated);
    notifyBoardUpdated(session.folderPath);
    // Send item details back to Director
    session.stream.write(formatTaskEvent({
      type: 'kanban_item',
      itemId: item.id, title: item.title, prompt: item.description,
      branch: item.branch, targetBranch: item.targetBranch, agentType: item.agentType,
    }) + '\n');
  }
  break;

case 'kanban_update':
  // Director moves item (only in_progress → review allowed)
  const board2 = loadBoard(session.folderPath);
  const updated2 = moveItem(board2, cmd.itemId, cmd.column, 'director');
  saveBoard(updated2);
  notifyBoardUpdated(session.folderPath);

  // AUTO-REVIEW: When item moves to 'review', spawn a review agent
  if (cmd.column === 'review') {
    const reviewItem = updated2.items.find(i => i.id === cmd.itemId);
    if (reviewItem) {
      spawnReviewAgent(session.folderPath, reviewItem);
    }
  }
  break;
```

### 4.3 Ready Item Notification

When UI moves an item to Ready (via `kanban:move-item` IPC handler), check if a Director session exists for this project:

```typescript
// In kanban:move-item handler, after save:
if (toColumn === 'ready') {
  // Find Director session for this project
  const directorSession = findDirectorSession(projectPath);
  if (directorSession?.stream) {
    directorSession.stream.write(formatTaskEvent({
      type: 'kanban_item_ready',
      itemId,
      title: item.title,
      agentType: item.agentType,
    }) + '\n');
  }
}
```

### 4.4 Director Prompt Update — `src/docker/entrypoint.sh` (MODIFY)

Append to DIRECTOR_PROMPT:

```
KANBAN BOARD INTEGRATION:
You receive events when work items become Ready:
@@YOLIUM:{"type":"kanban_item_ready","itemId":"...","title":"...","agentType":"codex"}

Pick up a Ready item to start working on it:
echo '@@YOLIUM:{"type":"kanban_pick","itemId":"..."}'
Response: @@YOLIUM:{"type":"kanban_item","itemId":"...","title":"...","prompt":"...","branch":"...","targetBranch":"..."}

After spawning a specialist, update the kanban item when work moves to Review:
echo '@@YOLIUM:{"type":"kanban_update","itemId":"...","column":"review"}'

WORKFLOW: Ready items arrive → pick them up → spawn specialist with item's prompt and branch → when specialist finishes, move item to review.
```

### 4.5 Auto-Review Agent

When an item moves to the Review column (Director sends `kanban_update` with `column: 'review'`), the main process automatically spawns a review agent container. This reuses the existing `createCodeReviewContainer()` pattern but works on local branches instead of remote repos.

```typescript
async function spawnReviewAgent(projectPath: string, item: KanbanItem): Promise<void> {
  // 1. Build review prompt focused on the item's branch changes
  const reviewPrompt = `You are reviewing code changes on branch "${item.branch}".
Run: git log --oneline main..${item.branch}
Run: git diff main...${item.branch}

Original task: ${item.title}
${item.description}

Review for: bugs, security, performance, style, test coverage.
Post your review summary to stdout. Be thorough but constructive.`;

  // 2. Spawn headless Claude container with -p flag (like code-review mode)
  //    Uses createHeadlessContainer() — Tty:false, no stdin, captures stdout
  //    Mounts the project directory (not a clone — branch is local)

  // 3. Capture review output
  //    On container exit: store review text on KanbanItem.reviewOutput field
  //    Update item: saveBoard() with review attached
  //    Notify UI: webContents.send('kanban:board-updated', projectPath)

  // 4. User sees review output on the KanbanCard in the Review column
  //    If review passes: user moves to Done
  //    If review flags issues: user can move back to In Progress
}
```

**KanbanItem extension** — add to `src/types/kanban.ts`:
```typescript
  reviewOutput?: string;           // review agent's findings
  reviewSessionId?: string;        // review container session
  reviewStatus?: 'pending' | 'running' | 'completed' | 'failed';
```

**KanbanCard in Review column** shows:
- Spinner while `reviewStatus === 'running'`
- Expandable review output when completed
- "Re-run Review" button if review failed

**Review agent uses Claude** (hardcoded — best at code review). Runs headless like the existing code-review container but against the local project instead of cloning a remote repo.

### 4.6 Security Enforcement

- **Path traversal protection**: `kanban-store.ts` validates resolved path is under `~/.yolium/kanban/`
- **Protocol source validation**: Only sessions with `isDirector === true` can send kanban commands (checked in docker-manager protocol handler)
- **Column transition enforcement**: `moveItem()` validates source ('ui' vs 'director') against `VALID_TRANSITIONS`
- **Input validation**: Branch names validated with existing `validateBranchName()`, descriptions capped at 10KB

### Files

| File | Type |
|------|------|
| `src/lib/director-protocol.ts` | MODIFY (add kanban command types) |
| `src/docker-manager.ts` | MODIFY (kanban command handling, Ready notification) |
| `src/docker/entrypoint.sh` | MODIFY (kanban section in Director prompt) |
| `src/main.ts` | MODIFY (Ready notification in move-item handler) |
| `src/lib/kanban-review.ts` | NEW (spawnReviewAgent function) |
| `src/tests/kanban-review.test.ts` | NEW (write first — mock container spawn) |
| `src/tests/director-protocol.test.ts` | MODIFY (add kanban command parse tests) |

---

## Phase 5: Git Follow Mode (TDD)

### 5.1 Git Follow Manager — `src/lib/git-follow.ts` (NEW)

**Test first**: `src/tests/git-follow.test.ts`

Uses git hooks (post-checkout, post-commit) in worktrees → marker file on bind mount → host fs.watchFile().

- `installFollowHooks(worktreePath, sessionId)` — install hooks that write branch to marker file
- `startFollowing(sessionId, worktreePath, mainRepoPath)` — watch marker file, checkout on change
- `stopFollowing(sessionId)` — uninstall hooks, stop watching, clean up marker
- `mergeBranch(mainRepoPath, branch, targetBranch)` → `MergeResult`
- Safety: skip if main repo dirty, debounce 500ms, validate branch exists

### 5.2 Integration

- `createYolium()`: install hooks + start following when `followMode` enabled
- `stopYolium()`: stop following + uninstall hooks
- Marker file bind mount: `{os.tmpdir()}/yolium-follow:/tmp/yolium-follow:rw`

### Files

| File | Type |
|------|------|
| `src/lib/git-follow.ts` | NEW |
| `src/tests/git-follow.test.ts` | NEW (write first) |
| `src/docker-manager.ts` | MODIFY (hook install/cleanup on container lifecycle) |

---

## Phase 6: Director Agent Type + Entrypoint (TDD)

### 6.1 Agent Type — `src/types/agent.ts` (MODIFY)

```typescript
export type AgentType = 'claude' | 'opencode' | 'codex' | 'shell' | 'director';
```

### 6.2 Task Manager — `src/lib/task-manager.ts` (NEW)

**Test first**: `src/tests/task-manager.test.ts`

Manages specialist lifecycle with dependency injection for Docker operations.

### 6.3 Protocol Parser — `src/lib/director-protocol.ts` (NEW)

**Test first**: `src/tests/director-protocol.test.ts`

Stateful line buffer: `feed(chunk)` → `{ commands, passthrough }`.

### 6.4 Entrypoint + Specialist Prompt

- Director case with full DIRECTOR_PROMPT including kanban instructions
- AGENT_PROMPT handling for specialist containers (Claude `-p`, Codex `exec`, etc.)

### Files

| File | Type |
|------|------|
| `src/types/agent.ts` | MODIFY |
| `src/types/docker.ts` | MODIFY (isDirector, taskId, parentSessionId, followMode) |
| `src/lib/task-manager.ts` | NEW |
| `src/lib/director-protocol.ts` | NEW |
| `src/docker/entrypoint.sh` | MODIFY |
| `src/docker-manager.ts` | MODIFY (protocol parsing in stream handler, specialist spawning) |
| `src/main.ts` | MODIFY (TaskManager wiring, director IPC) |
| `src/preload.ts` | MODIFY (director API) |
| `src/tests/task-manager.test.ts` | NEW (write first) |
| `src/tests/director-protocol.test.ts` | NEW (write first) |

---

## Phase 7: Director UI (Task Panel + Agent Dialog)

- Add Director to AgentSelectDialog (5th option, shortcut `5`)
- TaskPanel component alongside Terminal for director tabs
- Director tab auto-enables worktree + follow mode
- Split layout: 2/3 terminal, 1/3 task panel

---

## Complete File List (all phases)

| # | File | Type | Phase |
|---|------|------|-------|
| 1 | `src/types/kanban.ts` | NEW | 1 |
| 2 | `src/lib/path-utils.ts` | NEW | 1 |
| 3 | `src/lib/kanban-store.ts` | NEW | 1 |
| 4 | `src/tests/kanban-store.test.ts` | NEW | 1 |
| 5 | `src/lib/kanban-pr.ts` | NEW | 2 |
| 6 | `src/tests/kanban-pr.test.ts` | NEW | 2 |
| 7 | `src/components/Sidebar.tsx` | NEW | 3 |
| 8 | `src/components/kanban/KanbanDashboard.tsx` | NEW | 3 |
| 9 | `src/components/kanban/KanbanToolbar.tsx` | NEW | 3 |
| 10 | `src/components/kanban/KanbanBoard.tsx` | NEW | 3 |
| 11 | `src/components/kanban/KanbanColumn.tsx` | NEW | 3 |
| 12 | `src/components/kanban/KanbanCard.tsx` | NEW | 3 |
| 13 | `src/components/kanban/KanbanItemDialog.tsx` | NEW | 3 |
| 14 | `src/hooks/useKanbanState.ts` | NEW | 3 |
| 15 | `src/tests/useKanbanState.test.ts` | NEW | 3 |
| 16 | `src/lib/kanban-review.ts` | NEW | 4 |
| 17 | `src/tests/kanban-review.test.ts` | NEW | 4 |
| 18 | `src/lib/git-follow.ts` | NEW | 5 |
| 19 | `src/tests/git-follow.test.ts` | NEW | 5 |
| 20 | `src/lib/task-manager.ts` | NEW | 6 |
| 21 | `src/lib/director-protocol.ts` | NEW | 6 |
| 22 | `src/tests/task-manager.test.ts` | NEW | 6 |
| 23 | `src/tests/director-protocol.test.ts` | NEW | 6 |
| 24 | `src/components/TaskPanel.tsx` | NEW | 7 |
| 25 | `src/tests/e2e/tests/kanban-board.spec.ts` | NEW | 3 |
| 26 | `src/tests/e2e/tests/director.spec.ts` | NEW | 7 |
| 27 | `src/docker-manager.ts` | MODIFY | 1,4,5,6 |
| 28 | `src/main.ts` | MODIFY | 2,4,6 |
| 29 | `src/preload.ts` | MODIFY | 2,6 |
| 30 | `src/App.tsx` | MODIFY | 3,7 |
| 31 | `src/components/Terminal.tsx` | MODIFY | 3 |
| 32 | `src/components/AgentSelectDialog.tsx` | MODIFY | 7 |
| 33 | `src/components/StatusBar.tsx` | MODIFY | 5 |
| 34 | `src/types/agent.ts` | MODIFY | 6 |
| 35 | `src/types/docker.ts` | MODIFY | 6 |
| 36 | `src/types/tabs.ts` | MODIFY | 3 |
| 37 | `src/docker/entrypoint.sh` | MODIFY | 4,6 |
| 38 | `src/tests/e2e/helpers/selectors.ts` | MODIFY | 3 |

---

## TDD Execution Order

Each phase: write tests → run (fail) → implement → run (pass) → refactor

1. **Phase 1** (kanban-store) — pure logic, zero dependencies, fastest TDD cycle
2. **Phase 2** (IPC + PR) — mock execSync for gh CLI, mock fs for store
3. **Phase 3** (UI) — components + hook, E2E tests after unit
4. **Phase 4** (Director-Kanban integration) — extends protocol parser tests
5. **Phase 5** (Git Follow) — mock fs.watchFile, execSync for git
6. **Phase 6** (Director core) — mock Docker operations via DI
7. **Phase 7** (Director UI) — component tests + E2E

## Verification

After each phase:
- `npm test` — all unit tests pass
- `npm start` — app builds and launches (Ctrl+C after verify)
- Phase 3+: `npm run test:e2e` — E2E tests pass
- Manual: open app, click sidebar, verify kanban board renders with columns

