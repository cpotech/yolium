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

- **[Plan Agent Workflow](../mockups/plan-agent-mockup.html)** — **PRIMARY MOCKUP for Phase 1** — 6-scene walkthrough of Plan Agent:
  1. **Decompose Goal** — User enters high-level goal, starts Plan Agent
  2. **Agent Analyzing** — Plan Agent explores codebase in background
  3. **Agent Asks Question** — Status changes to "Waiting", question shown prominently
  4. **User Answers** — User selects option, agent resumes with full context
  5. **Planning Complete** — Work items created in Backlog, ready for review
  6. **Session Recovery** — Interrupted status, Resume from conversation history

- **[Async Background Agents](../mockups/async-agents-mockup.html)** — **FUTURE REFERENCE** — Full workflow with Code/Review agents:
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

### Agent Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              AGENT WORKFLOW                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────┐                                                        │
│  │   PLAN_AGENT    │  ← Runs in Docker container (Opus model)              │
│  │   (Director)    │  ← Analyzes codebase, creates work items              │
│  │                 │  ← Can ask questions via comments (async)             │
│  └────────┬────────┘                                                        │
│           │ creates items                                                   │
│           ▼                                                                 │
│  ┌─────────────────┐                                                        │
│  │     BACKLOG     │  ← User reviews/edits items                           │
│  └────────┬────────┘                                                        │
│           │ user moves to Ready                                             │
│           ▼                                                                 │
│  ┌─────────────────┐                                                        │
│  │      READY      │  ← User clicks "Run Agent"                            │
│  └────────┬────────┘                                                        │
│           │                                                                 │
│           ▼                                                                 │
│  ┌─────────────────┐                                                        │
│  │   CODE_AGENT    │  ← Runs in Docker container (future release)          │
│  │  (In Progress)  │  ← codex/claude/opencode/shell                        │
│  └────────┬────────┘                                                        │
│           │ agent completes                                                 │
│           ▼                                                                 │
│  ┌─────────────────┐                                                        │
│  │     REVIEW      │  ← Human reviews work                                 │
│  └────────┬────────┘                                                        │
│           │ user approves                                                   │
│           ▼                                                                 │
│  ┌─────────────────┐                                                        │
│  │      DONE       │  ← User clicks "Create PR"                            │
│  └─────────────────┘                                                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Key Points:**
- **ALL agents run in Docker containers** with full auto-bypass permissions
- **PLAN_AGENT (Director)**: Uses Opus model, can ask questions via work item comments
- **CODE_AGENT**: Future release — codex/claude/opencode/shell options
- **Agent definitions**: Markdown files in `src/agents/` — easy to edit and extend

**Agent Permissions:**
All agents run with `--dangerously-skip-permissions` to enable autonomous operation:
```bash
claude --dangerously-skip-permissions --model opus -p "$PROMPT"
```

---

## Phase 1: Kanban Types + Store (TDD)

### 1.1 Types — `src/types/kanban.ts` (NEW)

```typescript
export type KanbanColumn = 'backlog' | 'ready' | 'in_progress' | 'review' | 'done';

export type CommentSource = 'user' | 'agent' | 'system';

export interface KanbanComment {
  id: string;                     // comment-{timestamp}-{random}
  source: CommentSource;          // who posted it
  text: string;                   // markdown content
  tag?: 'feedback' | 'question';  // special tags
  createdAt: number;
}

export type AgentStatus = 'idle' | 'running' | 'waiting' | 'interrupted' | 'completed' | 'failed';

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
  comments: KanbanComment[];      // activity thread (user, agent, system)
  iteration: number;              // agent run count (starts at 1, incremented on re-run)
  agentStatus: AgentStatus;       // current agent lifecycle state
  agentQuestion?: string;         // current question (if waiting)
  agentQuestionOptions?: string[];// optional choices for question
  output: string[];               // last N lines of agent stdout (ring buffer, ~200 lines)
  outputUpdatedAt?: number;       // timestamp of last output capture
  sessionId?: string;             // headless container session when running
  prUrl?: string;                 // after PR creation
  error?: string;                 // last error message
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

// Agent status rules:
// - Run Agent:       ready → in_progress(running)
// - Stop Agent:      in_progress(running) → in_progress(interrupted)
// - Resume Agent:    in_progress(waiting|interrupted) → in_progress(running)
// - Agent asks:      in_progress(running) → in_progress(waiting), question posted as comment
// - Agent completes: in_progress(running) → review, agentStatus='completed'
// - Agent fails:     in_progress(running) → in_progress(failed), error posted as comment
// - Send Back:       review → in_progress(running) if autoRerun, else → ready
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

## Phase 4: Agent Infrastructure (TDD)

### 4.1 Agent Loader — `src/lib/agent-loader.ts` (NEW)

**Test first**: `src/tests/agent-loader.test.ts`

Loads agent definitions from `src/agents/*.md`:

```typescript
export interface AgentDefinition {
  name: string;
  description: string;
  model: 'opus' | 'sonnet' | 'haiku';
  tools: string[];
  systemPrompt: string;
}

export function loadAgent(agentName: string): AgentDefinition;
export function listAgents(): AgentDefinition[];
```

Parses YAML frontmatter + markdown body from agent files.

### 4.2 Agent Protocol — `src/lib/agent-protocol.ts` (NEW)

**Test first**: `src/tests/agent-protocol.test.ts`

Parses `@@YOLIUM:` protocol messages from agent stdout:

```typescript
type AgentCommand =
  | { type: 'ask_question'; text: string; options?: string[] }
  | { type: 'create_mockup'; path: string; description: string }
  | { type: 'create_item'; title: string; description: string; branch: string; agentType: string; order: number }
  | { type: 'complete'; summary: string; mockupPath?: string }
  | { type: 'error'; message: string };

export function parseProtocol(chunk: string): { commands: AgentCommand[]; passthrough: string };
```

**Mockup creation:** Plan Agent creates interactive HTML mockups for UI-related goals before decomposing into work items. Mockups are saved to `docs/mockups/` and referenced in work item descriptions.

### 4.3 Agent Runner — `src/lib/agent-runner.ts` (NEW)

**Test first**: `src/tests/agent-runner.test.ts`

Manages headless container lifecycle for all agents:

```typescript
export class AgentRunner {
  constructor(private dockerManager: DockerManager) {}

  async runAgent(request: {
    projectPath: string;
    agentName: string;
    goal: string;
    conversationHistory?: string;
  }): Promise<void> {
    // 1. Load agent definition from src/agents/{agentName}.md
    // 2. Build prompt: agent system prompt + goal + conversation history
    // 3. Spawn headless Docker container:
    //    - claude --dangerously-skip-permissions --model {agent.model} -p "$PROMPT"
    //    - Mount projectPath
    //    - Capture stdout, parse with agent-protocol
    // 4. Handle protocol commands in real-time:
    //    - ask_question: post comment, set agentStatus='waiting', stop container
    //    - create_item: validate, add to Backlog
    //    - complete: set agentStatus='completed', move to review
    //    - error: set agentStatus='failed', post error comment
    // 5. Update board + notify UI after each command
  }

  async stopAgent(sessionId: string): Promise<void> {
    // Stop container gracefully (SIGTERM, 10s timeout, SIGKILL)
    // Set agentStatus='interrupted'
  }

  async resumeAgent(item: KanbanItem): Promise<void> {
    // Rebuild conversation history from comments
    // Call runAgent with history
  }
}
```

**Container execution:**
```bash
docker run --rm \
  -v /project:/workspace \
  yolium-agent \
  claude --dangerously-skip-permissions --model opus -p "$PROMPT"
```

**Output capture loop** (every 30 seconds while running):
```typescript
// 1. Read new lines from container stdout stream
// 2. Append to ring buffer (cap at 200 lines)
// 3. appendOutput(board, itemId, newLines) → saveBoard()
// 4. notifyBoardUpdated(projectPath)
```

### 4.4 Session Recovery — `src/lib/agent-recovery.ts` (NEW)

**Test first**: `src/tests/agent-recovery.test.ts`

Recovers agent state when app restarts:

```typescript
export async function recoverAgentSessions(board: KanbanBoard): Promise<void> {
  for (const item of board.items) {
    if (item.agentStatus === 'running') {
      // Container is gone (app was closed)
      item.agentStatus = 'interrupted';
      addSystemComment(item, 'Agent was interrupted. Click Resume to continue.');
    }
    // 'waiting' items need no recovery - question is already in comments
  }
}
```

Called on app startup before loading UI.

### 4.5 Security Enforcement

- **Path traversal protection**: `kanban-store.ts` validates resolved path is under `~/.yolium/kanban/`
- **Column transition enforcement**: `moveItem()` validates source ('ui' vs 'system') against `VALID_TRANSITIONS`
- **Input validation**: Branch names validated with existing `validateBranchName()`, descriptions capped at 10KB

### Files

| File | Type |
|------|------|
| `src/agents/plan-agent.md` | NEW |
| `src/agents/README.md` | NEW |
| `src/lib/agent-loader.ts` | NEW |
| `src/lib/agent-protocol.ts` | NEW |
| `src/lib/agent-runner.ts` | NEW |
| `src/lib/agent-recovery.ts` | NEW |
| `src/tests/agent-loader.test.ts` | NEW (write first) |
| `src/tests/agent-protocol.test.ts` | NEW (write first) |
| `src/tests/agent-runner.test.ts` | NEW (write first) |
| `src/tests/agent-recovery.test.ts` | NEW (write first) |
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

## Phase 6: Plan Agent Integration

Integrate the Plan Agent (defined in Phase 4) with the Kanban UI.

**Plan Agent Summary:**
- **Defined in `src/agents/plan-agent.md`** — easy to edit and refine
- **Runs in Docker container** with Claude Code and full auto-bypass permissions
- **Uses Opus model** for best reasoning and planning
- **Can ask questions** via work item comments (async flow)
- **Protocol-based communication** via `@@YOLIUM:` JSON messages

When the user clicks "Decompose Goal", Yolium spawns a headless container running Claude Code with the Plan Agent prompt. The agent streams structured `@@YOLIUM:` commands back to the Kanban board.

### 6.1 Agent Types — `src/types/agent.ts` (MODIFY)

```typescript
export type AgentType = 'plan-agent' | 'claude' | 'opencode' | 'codex' | 'shell';
```

### 6.2 IPC Handlers — `src/main.ts` (MODIFY)

Uses agent infrastructure from Phase 4 (agent-loader, agent-protocol, agent-runner).

```
agent:run         (projectPath, agentName, goal, conversationHistory?)  → { success, sessionId }
agent:stop        (sessionId)                                            → { success }
agent:resume      (projectPath, itemId)                                  → { success, sessionId }
agent:status      (sessionId)                                            → { success, status }
```

### Files

| File | Type |
|------|------|
| `src/agents/plan-agent.md` | NEW |
| `src/agents/README.md` | NEW |
| `src/lib/agent-loader.ts` | NEW |
| `src/lib/agent-protocol.ts` | NEW |
| `src/lib/agent-runner.ts` | NEW |
| `src/lib/agent-recovery.ts` | NEW |
| `src/main.ts` | MODIFY (agent IPC handlers) |
| `src/preload.ts` | MODIFY (agent API) |

---

## Phase 7: Plan Agent UI

### 7.1 Decompose Dialog — `src/components/kanban/KanbanDecomposeDialog.tsx` (NEW)

Triggered by "Decompose Goal" button on KanbanToolbar:

- Large textarea for the high-level goal (e.g., "Add user authentication with OAuth2, JWT tokens, and role-based access control")
- Optional target branch selector (defaults to main)
- "Decompose" button → calls `agent:run` with `plan-agent`
- Shows progress: "Plan Agent analyzing codebase...", spinner
- **If agent asks question**: Shows question inline with answer input
- On completion: shows list of created items with titles, branches, agent types
- User can review items in Backlog, edit/reorder/delete before moving to Ready

### 7.2 Kanban Toolbar Update — `src/components/kanban/KanbanToolbar.tsx` (MODIFY)

Add "Decompose Goal" button (sparkle icon) next to "New Item":
- Disabled while Plan Agent is running
- Shows spinner + "Planning..." while in progress

### 7.3 Agent Status Indicators

**Card status badges:**
- `running`: Spinner + "Agent working..."
- `waiting`: Yellow badge "Needs input" + question text
- `interrupted`: Orange badge "Interrupted" + Resume button
- `completed`: Green checkmark
- `failed`: Red badge + error message

**Resume flow:**
- User clicks Resume on `waiting` or `interrupted` item
- Agent restarts with full conversation history from comments

### Files

| File | Type |
|------|------|
| `src/components/kanban/KanbanDecomposeDialog.tsx` | NEW |
| `src/components/kanban/KanbanToolbar.tsx` | MODIFY |
| `src/preload.ts` | MODIFY (agent API) |

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
| 20 | `src/agents/plan-agent.md` | NEW | 4 |
| 21 | `src/agents/README.md` | NEW | 4 |
| 22 | `src/lib/agent-loader.ts` | NEW | 4 |
| 23 | `src/lib/agent-protocol.ts` | NEW | 4 |
| 24 | `src/lib/agent-runner.ts` | NEW | 4 |
| 25 | `src/lib/agent-recovery.ts` | NEW | 4 |
| 26 | `src/tests/agent-loader.test.ts` | NEW | 4 |
| 27 | `src/tests/agent-protocol.test.ts` | NEW | 4 |
| 28 | `src/tests/agent-runner.test.ts` | NEW | 4 |
| 29 | `src/tests/agent-recovery.test.ts` | NEW | 4 |
| 30 | `src/lib/git-follow.ts` | NEW | 5 |
| 31 | `src/tests/git-follow.test.ts` | NEW | 5 |
| 32 | `src/components/kanban/KanbanDecomposeDialog.tsx` | NEW | 6 |
| 33 | `src/tests/e2e/tests/kanban-board.spec.ts` | NEW | 3 |
| 34 | `src/tests/e2e/tests/plan-agent.spec.ts` | NEW | 6 |
| 35 | `src/docker-manager.ts` | MODIFY | 1,4,5 |
| 36 | `src/main.ts` | MODIFY | 2,4 |
| 37 | `src/preload.ts` | MODIFY | 2,4,6 |
| 38 | `src/App.tsx` | MODIFY | 3 |
| 39 | `src/components/Terminal.tsx` | MODIFY | 3 |
| 40 | `src/components/StatusBar.tsx` | MODIFY | 5 |
| 41 | `src/types/tabs.ts` | MODIFY | 3 |
| 42 | `src/tests/e2e/helpers/selectors.ts` | MODIFY | 3 |
| 43 | `src/components/kanban/KanbanToolbar.tsx` | MODIFY | 6 |

---

## TDD Execution Order

Each phase: write tests → run (fail) → implement → run (pass) → refactor

1. **Phase 1** (kanban-store) — pure logic, zero dependencies, fastest TDD cycle
2. **Phase 2** (IPC + PR) — mock execSync for gh CLI, mock fs for store
3. **Phase 3** (UI) — components + hook, E2E tests after unit
4. **Phase 4** (Agent Infrastructure) — agent loader, protocol parser, runner with Docker mocks
5. **Phase 5** (Git Follow) — mock fs.watchFile, execSync for git
6. **Phase 6** (Plan Agent UI) — Decompose dialog, toolbar integration, E2E tests

## Verification

After each phase:
- `npm test` — all unit tests pass
- `npm start` — app builds and launches (Ctrl+C after verify)
- Phase 3+: `npm run test:e2e` — E2E tests pass
- Manual: open app, click sidebar, verify kanban board renders with columns
