# Kanban Dashboard + Specialist Agents — Complete Plan

## Scope

Add a Kanban dashboard to Yolium with a left sidebar, integrated with 4 specialist agents. Work items flow through stages: **Backlog → Ready → In Progress → Review → Done**. Users manually trigger agents from Ready items, selecting both **agent mode** (what the agent does) and **agent type** (which AI runs it). PR creation is manual (user clicks in Done column).

## Key Decisions

- **PR creation**: Manual only — user reviews, moves to Done, clicks "Create PR"
- **Git push**: On PR creation only — branch stays local until user explicitly creates PR, then push + PR together
- **Board scope**: Per-project — each project folder gets its own board at `~/.yolium/kanban/{hash}.json`
- **Agent execution**: User-triggered — click "Run" on Ready items to spawn headless containers

---

## Agent Architecture

### 4 Specialist Agents

| Agent Mode | Script | Purpose |
|------------|--------|---------|
| **PLAN** | `plan-agent.sh` | Maps codebase, asks clarifying questions, creates work items |
| **CODE** | `code-agent.sh` | Implements code changes |
| **REVIEW** | `review-agent.sh` | Performs code review on a branch |
| **GIT** | `git-agent.sh` | Git operations: push branch, run CI/E2E workflows, merge |

#### PLAN Agent Details
The PLAN agent is interactive and creates work:
1. **Maps the codebase** — Analyzes project structure, dependencies, patterns
2. **Asks clarifying questions** — Prompts user for requirements, constraints, preferences
3. **Creates work items** — Generates Kanban items in Backlog for the required work
4. **Outputs a plan summary** — Documents the approach and item breakdown

#### CODE Agent Details
The CODE agent implements changes:
1. **Reads task description** — Understands requirements from Kanban item
2. **Implements changes** — Writes code, creates files, modifies existing code
3. **Runs tests** — Executes relevant test suites
4. **Commits work** — Creates atomic commits on the branch

#### REVIEW Agent Details
The REVIEW agent performs code review:
1. **Analyzes diff** — Reviews changes between branch and target
2. **Checks for issues** — Security vulnerabilities, bugs, style violations
3. **Validates tests** — Ensures adequate test coverage
4. **Outputs findings** — Structured review with pass/fail/suggestions

#### GIT Agent Details
The GIT agent handles git operations and CI:
1. **Push branch** — Pushes local branch to remote origin
2. **Run E2E workflows** — Triggers and monitors GitHub Actions / CI pipelines
3. **Check CI status** — Reports workflow pass/fail results
4. **Merge operations** — Can perform merges when authorized

### 3 Agent Types

| Agent Type | AI Provider | Execution |
|------------|-------------|-----------|
| **Claude** | Anthropic | `claude -p` (headless prompt mode) |
| **OpenCode** | Various | OpenCode CLI headless |
| **Codex** | OpenAI | Codex CLI |

### Agent Scripts Location

```
src/docker/agents/
  plan-agent.sh     # Planning specialist
  code-agent.sh     # Coding specialist
  review-agent.sh   # Review specialist
  git-agent.sh      # Git operations specialist
```

Each script:
- Receives task title, description, project dir, and agent type
- Runs headless with `-p` flag (prompt mode)
- Outputs to stdout for UI capture
- Follows the existing REVIEW_AGENT pattern from `entrypoint.sh`

---

## Phase 1: Kanban Types + Store (TDD)

### 1.1 Types — `src/types/kanban.ts` (NEW)

```typescript
export type KanbanColumn = 'backlog' | 'ready' | 'in_progress' | 'review' | 'done';
export type AgentMode = 'plan' | 'code' | 'review' | 'git';
export type AgentType = 'claude' | 'opencode' | 'codex';

export interface KanbanItem {
  id: string;                     // kanban-{timestamp}-{random}
  title: string;
  description: string;            // detailed instructions for agent
  column: KanbanColumn;
  projectPath: string;
  branch: string;                 // worktree branch name
  agentMode: AgentMode;           // what the agent does
  agentType: AgentType;           // which AI runs it
  order: number;                  // sort order within column
  sessionId?: string;             // container session when in_progress
  output?: string;                // agent output capture
  error?: string;                 // last error message
  prUrl?: string;                 // after PR creation
  createdAt: number;
  updatedAt: number;
}

export interface KanbanBoard {
  version: 1;
  projectPath: string;
  items: KanbanItem[];
}

// Column transition rules (UI-only, no Director)
export const VALID_TRANSITIONS: Record<KanbanColumn, KanbanColumn[]> = {
  backlog:     ['ready'],
  ready:       ['backlog', 'in_progress'],
  in_progress: ['review'],
  review:      ['done', 'in_progress'],
  done:        [],
};
```

### 1.2 Store — `src/lib/kanban-store.ts` (NEW)

**Test first**: `src/tests/kanban-store.test.ts`

Pure functions for board mutations (no I/O):
- `addItem(board, itemData)` → `{ board, item }`
- `moveItem(board, itemId, toColumn)` → board (validates transitions)
- `updateItem(board, itemId, updates)` → board
- `deleteItem(board, itemId)` → board
- `reorderItem(board, itemId, newOrder)` → board
- `getItemsByColumn(board)` → `Record<KanbanColumn, KanbanItem[]>` (sorted by order)
- `getReadyItems(board)` → `KanbanItem[]`

I/O functions:
- `loadBoard(projectPath)` → board (returns empty board if file missing/corrupt)
- `saveBoard(board)` → void (atomic write: temp file → rename, 0o600 permissions)

Use `hashProjectPath()` extracted to `src/lib/path-utils.ts` (shared with docker-manager).

**Key test cases** (25+ tests):
- All pure function happy paths
- Column transition validation rejects invalid moves
- Atomic write: temp file rename pattern
- Corrupt JSON recovery (returns empty board)
- Board version migration stub
- Item ordering within columns

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

## Phase 2: Agent Shell Scripts + Container Support

### 2.1 Agent Scripts — `src/docker/agents/` (NEW)

Create 4 agent scripts following the REVIEW_AGENT pattern:

**plan-agent.sh**
```bash
#!/bin/bash
# Plan agent - maps codebase, asks questions, creates work items
# Args: $1=title, $2=description, $3=project_dir, $4=agent_type
# Output: JSON work items to be added to Kanban board

PLAN_PROMPT="You are a planning agent. Your job is to:
1. MAP THE CODEBASE: Analyze the project structure, key files, dependencies, and patterns
2. ASK CLARIFYING QUESTIONS: Ask the user about requirements, constraints, and preferences
3. CREATE WORK ITEMS: Break down the work into discrete Kanban items

Goal: $1

Details: $2

First, explore the codebase. Then ask any clarifying questions. Finally, output work items as JSON:
{\"items\": [{\"title\": \"...\", \"description\": \"...\", \"branch\": \"...\", \"agentMode\": \"code\"}]}"

case "$4" in
  claude)
    claude -p "$PLAN_PROMPT"
    ;;
  opencode)
    # OpenCode equivalent
    ;;
  codex)
    # Codex equivalent
    ;;
esac
```

**code-agent.sh**
```bash
#!/bin/bash
# Code agent - implements code changes
# Args: $1=title, $2=description, $3=project_dir, $4=agent_type

CODE_PROMPT="You are a coding agent. Implement the following task:

Task: $1

Requirements:
$2

Instructions:
1. Read and understand the relevant code
2. Implement the required changes
3. Write or update tests as needed
4. Run tests to verify your changes work
5. Commit your changes with a descriptive message"

case "$4" in
  claude)
    claude -p "$CODE_PROMPT"
    ;;
  opencode)
    # OpenCode equivalent
    ;;
  codex)
    # Codex equivalent
    ;;
esac
```

**review-agent.sh**
```bash
#!/bin/bash
# Review agent - performs code review on a branch
# Args: $1=title, $2=description, $3=project_dir, $4=agent_type, $5=branch

REVIEW_PROMPT="You are a code review agent. Review the changes on branch '$5'.

Original task: $1
Description: $2

Instructions:
1. Run: git log --oneline main..$5
2. Run: git diff main...$5
3. Review for:
   - Security vulnerabilities (injection, auth bypass, data exposure)
   - Bugs and logic errors
   - Test coverage adequacy
   - Code style and patterns consistency
4. Output a structured review:
   - PASS/FAIL for each category
   - Specific issues with file:line references
   - Suggestions for improvement"

case "$4" in
  claude)
    claude -p "$REVIEW_PROMPT"
    ;;
  opencode)
    # OpenCode equivalent
    ;;
  codex)
    # Codex equivalent
    ;;
esac
```

**git-agent.sh**
```bash
#!/bin/bash
# Git agent - handles git operations and CI workflows
# Args: $1=title, $2=description, $3=project_dir, $4=agent_type, $5=branch

GIT_PROMPT="You are a git operations agent. Perform the following task:

Task: $1
Details: $2
Branch: $5

Available operations:
- Push branch: git push -u origin $5
- Check CI status: gh run list --branch $5
- Run E2E workflow: gh workflow run e2e.yml --ref $5
- Watch workflow: gh run watch
- Merge branch: git checkout main && git merge $5

Execute the requested git operations and report results."

case "$4" in
  claude)
    claude -p "$GIT_PROMPT"
    ;;
  opencode)
    # OpenCode equivalent
    ;;
  codex)
    # Codex equivalent
    ;;
esac
```

### 2.2 Container Support — `src/docker-manager.ts` (MODIFY)

Add function to spawn agent containers:

```typescript
export async function createAgentContainer(
  projectPath: string,
  item: KanbanItem
): Promise<string> {
  // 1. Determine agent script based on item.agentMode
  // 2. Spawn headless container (Tty:false, no stdin)
  // 3. Mount project directory
  // 4. Execute agent script with item details
  // 5. Return sessionId for output tracking
}
```

### Files

| File | Type |
|------|------|
| `src/docker/agents/plan-agent.sh` | NEW |
| `src/docker/agents/code-agent.sh` | NEW |
| `src/docker/agents/review-agent.sh` | NEW |
| `src/docker/agents/git-agent.sh` | NEW |
| `src/docker-manager.ts` | MODIFY (add createAgentContainer) |
| `src/docker/entrypoint.sh` | MODIFY (add agent script dispatch) |

---

## Phase 3: IPC Handlers + PR Creation

### 3.1 IPC Handlers — `src/main.ts` (MODIFY)

All handlers follow existing pattern: `ipcMain.handle()` with `{ success, data?, error? }` returns.

```
kanban:load-board      (projectPath)                          → { success, board }
kanban:add-item        (projectPath, itemData)                → { success, item }
kanban:move-item       (projectPath, itemId, toColumn)        → { success, board }
kanban:update-item     (projectPath, itemId, updates)         → { success, board }
kanban:delete-item     (projectPath, itemId)                  → { success }
kanban:get-item        (projectPath, itemId)                  → { success, item }
kanban:run-agent       (projectPath, itemId)                  → { success, sessionId }
kanban:stop-agent      (projectPath, itemId)                  → { success }
kanban:create-pr       (projectPath, itemId)                  → { success, prUrl }
```

Every mutation calls `notifyBoardUpdated(projectPath)` → `webContents.send('kanban:board-updated', projectPath)`.

### 3.2 PR Creation — `src/lib/kanban-pr.ts` (NEW)

**Test first**: `src/tests/kanban-pr.test.ts`

```typescript
export async function createPullRequest(projectPath: string, item: KanbanItem): Promise<string> {
  // 1. Validate item is in 'done' column
  // 2. Check gh CLI exists: execSync('gh --version')
  // 3. Push branch to remote: git push -u origin {branch}
  // 4. Authenticate gh with PAT from settings
  // 5. Check no existing PR for this branch: gh pr list --head {branch}
  // 6. Create PR: gh pr create --base main --head {branch} --title --body
  // 7. Return PR URL
}
```

**Test cases** (15+ tests):
- Happy path: push + auth + create → URL
- gh CLI not installed → descriptive error
- Push fails (no remote, auth) → error
- PR already exists → return existing URL
- Network timeout → error
- Invalid PAT → error
- Branch doesn't exist → error
- Shell injection in title/description → escaped safely

### 3.3 Preload Bridge — `src/preload.ts` (MODIFY)

Add all kanban methods + `onKanbanBoardUpdated` listener with cleanup function.

### Files

| File | Type |
|------|------|
| `src/lib/kanban-pr.ts` | NEW |
| `src/main.ts` | MODIFY (add kanban IPC handlers) |
| `src/preload.ts` | MODIFY (add kanban API + event listener) |
| `src/tests/kanban-pr.test.ts` | NEW (write first) |

---

## Phase 4: Kanban UI Components

### 4.1 Sidebar — `src/components/Sidebar.tsx` (NEW)

Collapsible left navigation:
- **Collapsed** (default): 40px, icons only (Terminal, Kanban from lucide-react)
- **Expanded**: 160px, icons + labels
- Toggle button at bottom (PanelLeftClose/PanelLeftOpen)
- Active view indicator: left border accent
- Styling: `bg-[var(--color-bg-secondary)]`, `border-r border-[var(--color-border-primary)]`
- Collapsed state persisted in `localStorage('yolium:sidebarCollapsed')`
- `data-testid="sidebar"`, `data-testid="nav-terminal"`, `data-testid="nav-kanban"`, `data-testid="sidebar-toggle"`

### 4.2 Layout Change — `src/App.tsx` (MODIFY)

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

### 4.3 Kanban Components (all NEW)

```
src/components/kanban/
  KanbanDashboard.tsx    — top-level, loads board via IPC, project context from active tab
  KanbanToolbar.tsx      — project path display, "New Item" button, refresh
  KanbanBoard.tsx        — horizontal flex of 5 columns, overflow-x-auto
  KanbanColumn.tsx       — column header + card list, drop zone styling
  KanbanCard.tsx         — card display: title, branch, agent mode badge, agent type badge, status
  KanbanItemDialog.tsx   — create/edit modal (title, description, branch, agentMode, agentType)
```

**KanbanDashboard** determines project context:
- If tabs exist: uses active tab's `cwd`
- If no tabs: shows project selector (reuse PathInputDialog)

**KanbanCard badges**:
- Agent mode badge: PLAN (yellow), CODE (green), REVIEW (purple), GIT (blue)
- Agent type badge: Claude (purple), Codex (green), OpenCode (blue)

**KanbanItemDialog** fields:
- Title (text input)
- Description (textarea)
- Branch (text input with auto-suggest from git branches)
- Agent Mode (select: Plan, Code, Review, Git)
- Agent Type (select: Claude, OpenCode, Codex)

**KanbanCard context menu** (web-based, not native Electron):
- "Run Agent" (only in Ready column)
- "Stop Agent" (only when running in In Progress)
- "Move to Ready" / "Move to Backlog" (depending on current column)
- "Edit" → opens KanbanItemDialog
- "Delete" → confirmation
- "Create PR" (only in Done column)
- Move options filtered by `VALID_TRANSITIONS[column]`

**No drag-and-drop** — explicit move actions via context menu.

### 4.4 Kanban Hook — `src/hooks/useKanbanState.ts` (NEW)

**Test first**: `src/tests/useKanbanState.test.ts`

```typescript
function useKanbanState(projectPath: string | null) {
  // Loads board on mount / projectPath change
  // Subscribes to kanban:board-updated events
  // Returns: { board, addItem, moveItem, updateItem, deleteItem, runAgent, stopAgent, createPr, refresh, loading, error }
}
```

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
| `src/tests/useKanbanState.test.ts` | NEW (write first) |
| `src/tests/e2e/helpers/selectors.ts` | MODIFY (kanban + sidebar selectors) |

---

## Complete File List (all phases)

| # | File | Type | Phase |
|---|------|------|-------|
| 1 | `src/types/kanban.ts` | NEW | 1 |
| 2 | `src/lib/path-utils.ts` | NEW | 1 |
| 3 | `src/lib/kanban-store.ts` | NEW | 1 |
| 4 | `src/tests/kanban-store.test.ts` | NEW | 1 |
| 5 | `src/docker/agents/plan-agent.sh` | NEW | 2 |
| 6 | `src/docker/agents/code-agent.sh` | NEW | 2 |
| 7 | `src/docker/agents/review-agent.sh` | NEW | 2 |
| 8 | `src/docker/agents/git-agent.sh` | NEW | 2 |
| 9 | `src/lib/kanban-pr.ts` | NEW | 3 |
| 10 | `src/tests/kanban-pr.test.ts` | NEW | 3 |
| 11 | `src/components/Sidebar.tsx` | NEW | 4 |
| 12 | `src/components/kanban/KanbanDashboard.tsx` | NEW | 4 |
| 13 | `src/components/kanban/KanbanToolbar.tsx` | NEW | 4 |
| 14 | `src/components/kanban/KanbanBoard.tsx` | NEW | 4 |
| 15 | `src/components/kanban/KanbanColumn.tsx` | NEW | 4 |
| 16 | `src/components/kanban/KanbanCard.tsx` | NEW | 4 |
| 17 | `src/components/kanban/KanbanItemDialog.tsx` | NEW | 4 |
| 18 | `src/hooks/useKanbanState.ts` | NEW | 4 |
| 19 | `src/tests/useKanbanState.test.ts` | NEW | 4 |
| 20 | `src/tests/e2e/tests/kanban-board.spec.ts` | NEW | 4 |
| 21 | `src/docker-manager.ts` | MODIFY | 1,2 |
| 22 | `src/docker/entrypoint.sh` | MODIFY | 2 |
| 23 | `src/main.ts` | MODIFY | 3 |
| 24 | `src/preload.ts` | MODIFY | 3 |
| 25 | `src/App.tsx` | MODIFY | 4 |
| 26 | `src/components/Terminal.tsx` | MODIFY | 4 |
| 27 | `src/tests/e2e/helpers/selectors.ts` | MODIFY | 4 |

---

## TDD Execution Order

Each phase: write tests → run (fail) → implement → run (pass) → refactor

1. **Phase 1** (kanban-store) — pure logic, zero dependencies, fastest TDD cycle
2. **Phase 2** (agent scripts) — shell script testing, container mocking
3. **Phase 3** (IPC + PR) — mock execSync for gh CLI, mock fs for store
4. **Phase 4** (UI) — components + hook, E2E tests after unit

## Verification

After each phase:
- `npm test` — all unit tests pass
- `npm start` — app builds and launches (Ctrl+C after verify)
- Phase 4: `npm run test:e2e` — E2E tests pass
- Manual: open app, click sidebar, verify kanban board renders with columns

## Agent Execution Flow

### Standard Flow (CODE agent)
1. User creates Kanban item with title, description, branch, agent mode, agent type
2. User moves item to Ready
3. User clicks "Run" → headless container spawns
4. Container runs `code-agent.sh` — implements changes, runs tests, commits
5. Output streams back to UI via IPC
6. On completion, item moves to Review (auto-review runs)
7. User reviews and moves to Done
8. User clicks "Create PR" to push branch and create GitHub PR

### Planning Flow (PLAN agent)
1. User creates a PLAN item with a high-level goal description
2. User runs the PLAN agent
3. Agent maps codebase, asks clarifying questions via output
4. User provides answers (via comments or description updates)
5. Agent outputs JSON work items
6. System parses JSON and creates new Kanban items in Backlog
7. User reviews generated items, edits as needed, moves to Ready

### Review Flow (REVIEW agent)
1. CODE agent completes → item moves to Review column
2. REVIEW agent auto-runs (or user triggers manually)
3. Agent analyzes diff, checks security/bugs/tests/style
4. Outputs structured review with PASS/FAIL per category
5. User reviews findings:
   - If PASS: moves to Done
   - If FAIL: sends back to In Progress with feedback

### Git Operations Flow (GIT agent)
1. User creates GIT item for operations like "Push and run E2E"
2. User runs the GIT agent
3. Agent executes: push branch, trigger CI workflow, monitor status
4. Agent reports workflow results (pass/fail, logs)
5. User reviews and decides next steps

## Status Bar REVIEW_AGENT (unchanged)

The existing "PR Review" button in status bar continues to work unchanged:
- Uses `createCodeReviewContainer()` which clones a remote repo
- Kanban agents use worktrees on local repos — different use case
- No changes needed to existing code review functionality
