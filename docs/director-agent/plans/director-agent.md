# Kanban Dashboard + Director Agent + Git Follow Mode — Complete Plan

## Scope

Add a Kanban dashboard to Yolium with a left sidebar, integrated with async background agents and Git Follow Mode. Work items flow through stages: **Backlog → Ready → In Progress → Review → Done**. Agents run headless in the background with live output streaming. The Director Agent decomposes high-level goals into multiple work items — it is a planning tool, not a pipeline orchestrator. PR creation is manual (user clicks in Done column).

## Key Decisions (from user)

- **PR creation**: Manual only — user reviews, moves to Done, clicks "Create PR"
- **Git push**: On PR creation only — branch stays local until user explicitly creates PR, then push + PR together
- **Director role**: Task Decomposer — takes a high-level goal, spawns a headless Claude container that analyzes the codebase and outputs structured kanban items. User reviews and edits items before manually running agents. Director does NOT orchestrate the pipeline or move items between columns.
- **Board scope**: Per-project — each project folder gets its own board at `~/.yolium/kanban/{hash}.json`

## UI Mockups

Interactive HTML mockups (open in a browser):

- **[Async Background Agents](../mockups/async-agents-mockup.html)** — **PRIMARY MOCKUP** — 9-scene walkthrough of the full workflow:
  1. **Board Overview** — Toolbar with "Decompose Goal" button; In Progress cards show live output preview + progress bar
  2. **Decompose Goal (Director)** — User enters a high-level goal; Director analyzes codebase and creates work items
  3. **Decompose Result** — Director finished; items listed with titles, branches, agent types; user reviews before moving to Ready
  4. **Start Agent** — User clicks "Run" on a Ready item; agent spawns as headless background container
  5. **Agent Running (Live Output)** — Live output panel updates every 30s; stop button; running time; expandable output
  6. **Stop + Edit + Restart** — User stops agent, edits description, adds comments, then restarts; branch work preserved
  7. **Review (Auto-Review Output)** — Review agent findings shown in output panel + as comment; agent work output collapsible
  8. **Send Back + Re-run** — Mandatory feedback; checkbox to auto re-run agent immediately; iteration tracking
  9. **Done + Create PR** — Final state with review passed; push branch + create PR

- **[Kanban Board + Sidebar Layout](../mockups/kanban-ui-mockup.html)** — Sidebar navigation, 5-column board, cards, context menus, terminal-to-kanban view switching

- **[Git Follow Mode + Storage](../mockups/git-follow-mode-mockup.html)** — Kanban storage format, board JSON structure, git follow mode mechanics, full architecture diagram

- ~~Item Lifecycle Flows~~ — *Deleted. Fully superseded by async-agents mockup.*

- ~~Director Agent UI~~ — *Deleted. Fully superseded by async-agents mockup (scenes 2-3 cover the decompose flow).*

### Key UI patterns (revised for async agents):
- **Agents run headless in the background** — No terminal tabs for kanban agents. Regular terminal tabs still exist for manual work.
- **Live output on work items** — Agent stdout captured and streamed to the item's output panel, updated every 30 seconds.
- **User controls: Stop / Restart** — User can stop an agent at any time, edit the description or add comments, then restart. The agent gets the updated prompt.
- **Description is editable while agent is stopped** — Allows iterative refinement without creating new items.
- **Comments are the communication channel** — User, Review Agent, and System all post to the same activity thread. Agent receives full thread on (re)start.
- **Send Back + Re-run** — Combines feedback with automatic agent restart. "Auto re-run" checkbox defaults to on.
- **Iteration counter** tracks how many agent runs an item has been through.
- **Director = Task Decomposer** — User enters a high-level goal (e.g., "Add user authentication"), Director analyzes the codebase and creates multiple structured kanban items in Backlog. User reviews/edits items, then moves to Ready and runs agents manually.

---

## Phase 1: Kanban Types + Store (TDD)

### 1.1 Types — `src/types/kanban.ts` (NEW)

```typescript
export type KanbanColumn = 'backlog' | 'ready' | 'in_progress' | 'review' | 'done';

export type CommentSource = 'user' | 'director' | 'review' | 'system';

export interface KanbanComment {
  id: string;                     // comment-{timestamp}-{random}
  source: CommentSource;          // who posted it
  text: string;                   // markdown content
  tag?: 'feedback';               // special tag for send-back feedback
  createdAt: number;
}

export type AgentStatus = 'idle' | 'running' | 'stopped' | 'completed' | 'failed';

export interface KanbanItem {
  id: string;                     // kanban-{timestamp}-{random}
  title: string;
  description: string;            // detailed instructions for agent (editable while stopped)
  branch: string;                 // worktree branch name
  targetBranch: string;           // merge target
  agentType: SpecialistAgent;     // codex | claude | opencode | shell
  column: KanbanColumn;
  projectPath: string;
  order: number;                  // sort order within column
  comments: KanbanComment[];      // activity thread (user, review, system)
  iteration: number;              // agent run count (starts at 1, incremented on re-run)
  agentStatus: AgentStatus;       // current agent lifecycle state
  output: string[];               // last N lines of agent stdout (ring buffer, ~200 lines)
  outputUpdatedAt?: number;       // timestamp of last output capture
  sessionId?: string;             // headless container session when running
  taskId?: string;                // links to DirectorTask.id
  prUrl?: string;                 // after PR creation
  error?: string;                 // last error message
  reviewOutput?: string;          // review agent findings (also posted as comment)
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

// Column transition rules (all user-driven or system-automated)
export const VALID_TRANSITIONS: Record<KanbanColumn, { ui: KanbanColumn[]; system: KanbanColumn[] }> = {
  backlog:     { ui: ['ready'],                system: [] },
  ready:       { ui: ['backlog', 'in_progress'], system: ['in_progress'] },  // ui: Run Agent or manual move; system: auto on run-agent
  in_progress: { ui: ['ready'],                system: ['review'] },          // ui: move back if stopped; system: auto on agent complete
  review:      { ui: ['done', 'in_progress'],  system: [] },                  // ui: approve or send back+re-run
  done:        { ui: [],                       system: [] },
};

// Agent control rules:
// - Run Agent:     ready/in_progress(stopped) → in_progress(running)
// - Stop Agent:    in_progress(running) → in_progress(stopped)
// - Restart Agent: in_progress(stopped) → in_progress(running), iteration++
// - Agent completes: in_progress(running) → review (auto), agentStatus='completed'
// - Agent fails:   in_progress(running) → in_progress(stopped), agentStatus='failed'
// - Send Back:     review → in_progress(running) if autoRerun, else → ready
```

### 1.2 Store — `src/lib/kanban-store.ts` (NEW)

**Test first**: `src/tests/kanban-store.test.ts`

Pure functions for board mutations (no I/O):
- `addItem(board, itemData)` → `{ board, item }` (adds system comment "Item created in Backlog", agentStatus='idle')
- `moveItem(board, itemId, toColumn, source: 'ui'|'system')` → board (validates transitions, adds system comment)
- `sendBack(board, itemId, feedback, autoRerun)` → board (review → in_progress or ready, requires non-empty feedback, adds tagged comment, increments iteration)
- `addComment(board, itemId, source, text, tag?)` → board (appends to item's comments array)
- `updateItem(board, itemId, updates)` → board (description only editable when agentStatus is 'idle' or 'stopped')
- `setAgentStatus(board, itemId, status, sessionId?)` → board (updates agentStatus + sessionId)
- `appendOutput(board, itemId, lines)` → board (appends to output ring buffer, caps at 200 lines)
- `deleteItem(board, itemId)` → board (refuses if agentStatus='running')
- `reorderItem(board, itemId, newOrder)` → board
- `getItemsByColumn(board)` → `Record<KanbanColumn, KanbanItem[]>` (sorted by order)
- `getReadyItems(board)` → `KanbanItem[]`
- `buildAgentPrompt(item)` → `string` (concatenates description + all comments chronologically; if iteration > 1, prepends "This is iteration #N — see feedback comments")

I/O functions:
- `loadBoard(projectPath)` → board (returns empty board if file missing/corrupt)
- `saveBoard(board)` → void (atomic write: temp file → rename, 0o600 permissions)

Use `hashProjectPath()` extracted to `src/lib/path-utils.ts` (shared with docker-manager).

**Key test cases** (35+ tests):
- All pure function happy paths
- Column transition validation rejects invalid moves
- Source-based permission enforcement (UI vs System)
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
kanban:send-back       (projectPath, itemId, feedback, autoRerun)  → { success, board }
    // review → in_progress (if autoRerun) or ready (if not)
    // feedback required, adds tagged 'feedback' comment
    // increments iteration, optionally spawns agent immediately
kanban:add-comment     (projectPath, itemId, text)            → { success, board }
kanban:update-item     (projectPath, itemId, updates)         → { success, board }
    // description editable while agentStatus is 'idle' or 'stopped'
kanban:delete-item     (projectPath, itemId)                  → { success }
kanban:get-item        (projectPath, itemId)                  → { success, item }
kanban:create-pr       (projectPath, itemId)                  → { success, prUrl }

// Agent control (async background agents)
kanban:run-agent       (projectPath, itemId)                  → { success }
    // spawns headless container, moves to in_progress, agentStatus='running'
    // agent receives buildAgentPrompt(item) = description + all comments
    // output captured every 30s → item.output (ring buffer, ~200 lines)
    // on agent exit: agentStatus='completed'|'failed', auto-move to review if completed
kanban:stop-agent      (projectPath, itemId)                  → { success }
    // stops container, agentStatus='stopped', item stays in_progress
    // description becomes editable, user can add comments + restart
kanban:restart-agent   (projectPath, itemId)                  → { success }
    // same as run-agent but increments iteration
    // agent gets updated description + all comments including new ones
kanban:get-output      (projectPath, itemId)                  → { success, output, updatedAt }
    // returns current output lines for live display
```

Every mutation calls `notifyBoardUpdated(projectPath)` → `webContents.send('kanban:board-updated', projectPath)`.

Output streaming: Main process captures agent stdout in a ring buffer (200 lines). Every 30s, writes buffer to `item.output` and saves board. UI polls via `kanban:board-updated` events or `kanban:get-output`.

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
  KanbanColumn.tsx       — column header + card list
  KanbanCard.tsx         — card with title, agent badge, live output preview, progress bar, Run/Stop buttons
  KanbanItemDialog.tsx   — create/edit modal (title, description, branch, targetBranch, agentType)
  KanbanItemDetail.tsx   — two-pane detail: live output panel + description + activity thread + sidebar (metadata, Run/Stop/Restart, move actions)
  KanbanLiveOutput.tsx   — live output display panel: green dot, timestamp, scrollable monospace output, expand button
  KanbanActivityThread.tsx — comment list with avatars, badges, timestamps; source-based styling (user/review/system)
  KanbanSendBackDialog.tsx — mandatory feedback prompt + "auto re-run" checkbox when sending review→in_progress
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
| `src/components/kanban/KanbanItemDetail.tsx` | NEW |
| `src/components/kanban/KanbanLiveOutput.tsx` | NEW |
| `src/components/kanban/KanbanActivityThread.tsx` | NEW |
| `src/components/kanban/KanbanSendBackDialog.tsx` | NEW |
| `src/hooks/useKanbanState.ts` | NEW |
| `src/App.tsx` | MODIFY (sidebar, activeView, layout) |
| `src/components/Terminal.tsx` | MODIFY (ResizeObserver for sidebar toggle) |
| `src/types/tabs.ts` | MODIFY (agentType, followMode) |
| `src/tests/useKanbanState.test.ts` | NEW (write first) |
| `src/tests/e2e/helpers/selectors.ts` | MODIFY (kanban + sidebar selectors) |

---

## Phase 4: Auto-Review + Agent Runner (TDD)

### 4.1 Agent Runner — `src/lib/agent-runner.ts` (NEW)

**Test first**: `src/tests/agent-runner.test.ts`

Manages headless container lifecycle for kanban work items:

```typescript
export class AgentRunner {
  constructor(private dockerManager: DockerManager) {}

  async startAgent(projectPath: string, item: KanbanItem): Promise<string> {
    // 1. Build prompt via buildAgentPrompt(item) — description + all comments
    // 2. Create headless container (Tty:false, no stdin)
    //    - Mount project directory
    //    - Set up worktree for item.branch
    //    - Pass prompt via AGENT_PROMPT env var
    // 3. Start output capture — ring buffer (200 lines), flush to item every 30s
    // 4. Register container exit handler:
    //    - Exit 0: agentStatus='completed', auto-move to review, trigger auto-review
    //    - Exit non-0: agentStatus='failed', add error comment, stay in_progress
    // 5. Return sessionId
  }

  async stopAgent(sessionId: string): Promise<void> {
    // Stop container gracefully (SIGTERM, 10s timeout, SIGKILL)
    // agentStatus='stopped', stop output capture
  }

  async restartAgent(projectPath: string, item: KanbanItem): Promise<string> {
    // Same as startAgent but increments iteration
    // Agent gets updated description + all new comments
  }
}
```

**Output capture loop**:
```typescript
// Every 30 seconds while agent is running:
// 1. Read new lines from container stdout stream
// 2. Append to ring buffer (cap at 200 lines)
// 3. appendOutput(board, itemId, newLines) → saveBoard()
// 4. notifyBoardUpdated(projectPath)
```

### 4.2 Auto-Review Agent — `src/lib/kanban-review.ts` (NEW)

**Test first**: `src/tests/kanban-review.test.ts`

When an agent completes and item moves to Review, main process spawns a review agent:

```typescript
export async function spawnReviewAgent(projectPath: string, item: KanbanItem): Promise<void> {
  // 1. Build review prompt focused on the item's branch changes
  const reviewPrompt = `You are reviewing code changes on branch "${item.branch}".
Run: git log --oneline main..${item.branch}
Run: git diff main...${item.branch}

Original task: ${item.title}
${item.description}

Review for: bugs, security, performance, style, test coverage.
Post your review summary to stdout. Be thorough but constructive.`;

  // 2. Spawn headless Claude container (hardcoded — best at code review)
  //    Tty:false, no stdin, captures stdout
  //    Mounts the project directory (branch is local)

  // 3. On exit: store review text on KanbanItem.reviewOutput
  //    Post review output as 'review' comment in activity thread
  //    Update reviewStatus: 'completed' or 'failed'
  //    Notify UI: webContents.send('kanban:board-updated', projectPath)
}
```

**KanbanCard in Review column** shows:
- Spinner while `reviewStatus === 'running'`
- Expandable review output when completed
- "Re-run Review" button if review failed

### 4.3 Security Enforcement

- **Path traversal protection**: `kanban-store.ts` validates resolved path is under `~/.yolium/kanban/`
- **Column transition enforcement**: `moveItem()` validates source ('ui' vs 'system') against `VALID_TRANSITIONS`
- **Input validation**: Branch names validated with existing `validateBranchName()`, descriptions capped at 10KB

### Files

| File | Type |
|------|------|
| `src/lib/agent-runner.ts` | NEW |
| `src/tests/agent-runner.test.ts` | NEW (write first) |
| `src/lib/kanban-review.ts` | NEW |
| `src/tests/kanban-review.test.ts` | NEW (write first) |
| `src/docker-manager.ts` | MODIFY (headless container support for agent-runner) |

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

## Phase 6: Director Agent — Task Decomposer (TDD)

The Director Agent is a **planning tool**: it takes a high-level goal, analyzes the codebase, and creates multiple structured kanban items. It does NOT orchestrate the pipeline or run agents.

### 6.1 Agent Type — `src/types/agent.ts` (MODIFY)

```typescript
export type AgentType = 'claude' | 'opencode' | 'codex' | 'shell' | 'director';
```

### 6.2 Director Protocol — `src/lib/director-protocol.ts` (NEW)

**Test first**: `src/tests/director-protocol.test.ts`

Stateful line buffer that parses `@@YOLIUM:` protocol messages from the Director container's stdout.

Director output commands:

```typescript
interface CreateItemCommand {
  type: 'create_item';
  title: string;
  description: string;
  branch: string;
  targetBranch: string;
  agentType: 'codex' | 'claude' | 'opencode' | 'shell';
  order: number;         // suggested execution order
}

interface DecomposeCompleteCommand {
  type: 'decompose_complete';
  summary: string;       // brief summary of what was planned
  itemCount: number;
}

interface DecomposeErrorCommand {
  type: 'decompose_error';
  error: string;
}
```

Parser: `feed(chunk)` → `{ commands: DirectorCommand[], passthrough: string }`.

### 6.3 Director Runner — `src/lib/director-runner.ts` (NEW)

**Test first**: `src/tests/director-runner.test.ts`

```typescript
export interface DecomposeRequest {
  projectPath: string;
  goal: string;              // high-level user goal
  targetBranch?: string;     // default: current branch or 'main'
}

export interface DecomposeResult {
  items: KanbanItem[];       // created items (in Backlog)
  summary: string;
}

export async function decomposeGoal(
  request: DecomposeRequest,
  dockerManager: DockerManager,
): Promise<DecomposeResult> {
  // 1. Build Director prompt:
  //    - "Analyze the codebase at {projectPath}"
  //    - "Break down the following goal into independent work items: {goal}"
  //    - "For each item, output: @@YOLIUM:{create_item JSON}"
  //    - "Choose appropriate agent types: codex for code changes, claude for complex reasoning, shell for scripts"
  //    - "Choose branch names: {convention}/{short-name}"
  //    - "When done: @@YOLIUM:{decompose_complete JSON}"
  //
  // 2. Spawn headless Claude container (Director always uses Claude)
  //    - Mount projectPath read-only
  //    - DIRECTOR_PROMPT env var with instructions
  //    - Capture stdout, parse with director-protocol
  //
  // 3. For each create_item command:
  //    - Validate branch name, description length
  //    - addItem(board, itemData) → saves to Backlog
  //    - notifyBoardUpdated(projectPath)
  //
  // 4. On decompose_complete: return summary + created items
  // 5. On error/timeout: return partial results + error
}
```

### 6.4 Director Prompt — `src/docker/entrypoint.sh` (MODIFY)

Add Director case to entrypoint:

```bash
if [ "$AGENT_TYPE" = "director" ]; then
  # Director gets DIRECTOR_PROMPT which includes:
  # - Codebase analysis instructions
  # - Output format: @@YOLIUM:{create_item} for each work item
  # - Guidelines: keep items independent, choose right agent types, suggest branch names
  # - Completion signal: @@YOLIUM:{decompose_complete}
  claude -p "$DIRECTOR_PROMPT"
fi
```

### 6.5 IPC Handlers — `src/main.ts` (MODIFY)

```
director:decompose    (projectPath, goal, targetBranch?)    → { success, items, summary }
director:status       ()                                     → { success, running: boolean }
director:cancel       ()                                     → { success }
```

### Files

| File | Type |
|------|------|
| `src/types/agent.ts` | MODIFY (add 'director') |
| `src/lib/director-protocol.ts` | NEW |
| `src/lib/director-runner.ts` | NEW |
| `src/tests/director-protocol.test.ts` | NEW (write first) |
| `src/tests/director-runner.test.ts` | NEW (write first) |
| `src/docker/entrypoint.sh` | MODIFY (Director case) |
| `src/main.ts` | MODIFY (director IPC handlers) |
| `src/preload.ts` | MODIFY (director API) |

---

## Phase 7: Director UI + Future Auto-Pilot

### 7.1 Decompose Dialog — `src/components/kanban/KanbanDecomposeDialog.tsx` (NEW)

Triggered by "Decompose Goal" button on KanbanToolbar:

- Large textarea for the high-level goal (e.g., "Add user authentication with OAuth2, JWT tokens, and role-based access control")
- Optional target branch selector (defaults to main)
- "Decompose" button → calls `director:decompose` IPC
- Shows progress: "Director analyzing codebase...", spinner
- On completion: shows list of created items with titles, branches, agent types
- User can review items in Backlog, edit/reorder/delete before moving to Ready

### 7.2 Kanban Toolbar Update — `src/components/kanban/KanbanToolbar.tsx` (MODIFY)

Add "Decompose Goal" button (sparkle icon) next to "New Item":
- Disabled while Director is running
- Shows spinner + "Decomposing..." while in progress

### 7.3 Director Status in Toolbar

Small indicator when Director is running:
- Spinner + "Decomposing..." text
- Cancel button to abort

### Files

| File | Type |
|------|------|
| `src/components/kanban/KanbanDecomposeDialog.tsx` | NEW |
| `src/components/kanban/KanbanToolbar.tsx` | MODIFY |
| `src/preload.ts` | MODIFY (director API) |

---

## Future: Auto-Pilot Mode (not in current scope)

> **Deferred enhancement**: Add an optional "Auto-Pilot" toggle to the Kanban toolbar. When enabled:
> - Director watches the board continuously (long-running headless container)
> - Auto-picks Ready items and runs agents (same as user clicking "Run")
> - Auto-moves completed items to Review (already happens)
> - Respects concurrency limits (e.g., max 3 agents running)
> - User can disable Auto-Pilot at any time to regain manual control
>
> This builds on the decomposer: user decomposes a goal → items land in Backlog → user moves batch to Ready → enables Auto-Pilot → agents run through the pipeline automatically.
>
> **Why deferred**: The manual flow must work well first. Auto-Pilot adds complexity (concurrency, error recovery, resource limits) that should be validated against real usage patterns.

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
| 14 | `src/components/kanban/KanbanItemDetail.tsx` | NEW | 3 |
| 15 | `src/components/kanban/KanbanLiveOutput.tsx` | NEW | 3 |
| 16 | `src/components/kanban/KanbanActivityThread.tsx` | NEW | 3 |
| 17 | `src/components/kanban/KanbanSendBackDialog.tsx` | NEW | 3 |
| 18 | `src/hooks/useKanbanState.ts` | NEW | 3 |
| 19 | `src/tests/useKanbanState.test.ts` | NEW | 3 |
| 20 | `src/lib/agent-runner.ts` | NEW | 4 |
| 21 | `src/tests/agent-runner.test.ts` | NEW | 4 |
| 22 | `src/lib/kanban-review.ts` | NEW | 4 |
| 23 | `src/tests/kanban-review.test.ts` | NEW | 4 |
| 24 | `src/lib/git-follow.ts` | NEW | 5 |
| 25 | `src/tests/git-follow.test.ts` | NEW | 5 |
| 26 | `src/lib/director-protocol.ts` | NEW | 6 |
| 27 | `src/lib/director-runner.ts` | NEW | 6 |
| 28 | `src/tests/director-protocol.test.ts` | NEW | 6 |
| 29 | `src/tests/director-runner.test.ts` | NEW | 6 |
| 30 | `src/components/kanban/KanbanDecomposeDialog.tsx` | NEW | 7 |
| 31 | `src/tests/e2e/tests/kanban-board.spec.ts` | NEW | 3 |
| 32 | `src/tests/e2e/tests/director.spec.ts` | NEW | 7 |
| 33 | `src/docker-manager.ts` | MODIFY | 1,4,5 |
| 34 | `src/main.ts` | MODIFY | 2,6 |
| 35 | `src/preload.ts` | MODIFY | 2,6,7 |
| 36 | `src/App.tsx` | MODIFY | 3 |
| 37 | `src/components/Terminal.tsx` | MODIFY | 3 |
| 38 | `src/components/StatusBar.tsx` | MODIFY | 5 |
| 39 | `src/types/agent.ts` | MODIFY | 6 |
| 40 | `src/types/tabs.ts` | MODIFY | 3 |
| 41 | `src/docker/entrypoint.sh` | MODIFY | 6 |
| 42 | `src/tests/e2e/helpers/selectors.ts` | MODIFY | 3 |
| 43 | `src/components/kanban/KanbanToolbar.tsx` | MODIFY | 7 |

---

## TDD Execution Order

Each phase: write tests → run (fail) → implement → run (pass) → refactor

1. **Phase 1** (kanban-store) — pure logic, zero dependencies, fastest TDD cycle
2. **Phase 2** (IPC + PR) — mock execSync for gh CLI, mock fs for store
3. **Phase 3** (UI) — components + hook, E2E tests after unit
4. **Phase 4** (Agent Runner + Auto-Review) — mock Docker for headless containers, output capture
5. **Phase 5** (Git Follow) — mock fs.watchFile, execSync for git
6. **Phase 6** (Director Decomposer) — mock Docker, test protocol parser + item creation
7. **Phase 7** (Director UI) — component tests + E2E

## Verification

After each phase:
- `npm test` — all unit tests pass
- `npm start` — app builds and launches (Ctrl+C after verify)
- Phase 3+: `npm run test:e2e` — E2E tests pass
- Manual: open app, click sidebar, verify kanban board renders with columns
