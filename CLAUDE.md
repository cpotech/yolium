# Yolium Project Instructions

## What Is Yolium

Yolium Desktop is an Electron app that orchestrates AI coding agents (Claude Code, OpenCode, Codex) running in isolated Docker containers. Users manage work items on a kanban board, assign them to agents, and each agent gets its own git worktree branch for conflict-free parallel work.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│  Renderer (React 19)                                    │
│  ┌──────────┐ ┌──────────┐ ┌────────────┐ ┌──────────┐ │
│  │ Terminal  │ │ Kanban   │ │ Dialogs    │ │ Sidebar  │ │
│  │ (xterm)  │ │ Board    │ │            │ │          │ │
│  └──────────┘ └──────────┘ └────────────┘ └──────────┘ │
│       │             │             │             │       │
│       └─────────────┴──────┬──────┴─────────────┘       │
│                            │ IPC (namespaced)            │
├────────────────────────────┼────────────────────────────┤
│  Main Process (Electron)   │                            │
│  ┌──────────┐ ┌────────────┴───┐ ┌───────────────────┐  │
│  │ IPC      │ │ Agent Runner   │ │ Docker            │  │
│  │ Handlers │ │ (orchestrator) │ │ (containers, pty) │  │
│  └──────────┘ └────────────────┘ └───────────────────┘  │
│       │               │                  │              │
│  ┌────┴────┐    ┌─────┴──────┐    ┌─────┴──────┐       │
│  │ Stores  │    │ Git        │    │ Dockerfile │       │
│  │ (JSON)  │    │ Worktrees  │    │ (dev env)  │       │
│  └─────────┘    └────────────┘    └────────────┘       │
└─────────────────────────────────────────────────────────┘
```

## Codebase Map

### Entry Points
- `src/main.ts` — Electron main process: window creation, menu, app lifecycle
- `src/renderer/main.tsx` — React entry point: renders `<App />`
- `src/renderer/App.tsx` — Root component: tab management, dialog orchestration, keyboard shortcuts
- `src/preload.ts` — IPC bridge: exposes `window.electronAPI.*` namespaces to renderer

### Import Aliases
- `@main/*` → `src/main/*` (main process code)
- `@renderer/*` → `src/renderer/*` (React/UI code)
- `@shared/*` → `src/shared/*` (types shared across processes)

### Main Process (`src/main/`)

#### IPC Layer (`src/main/ipc/`)
Each file registers handlers for one namespace. All aggregated in `src/main/ipc/index.ts`.
Full API reference with types: [docs/IPC.md](docs/IPC.md).

| File | Namespace | Purpose |
|------|-----------|---------|
| `app-handlers.ts` | `app:*` | Version, home dir, quit lifecycle |
| `terminal-handlers.ts` | `terminal:*` | PTY creation, write, resize, close |
| `tab-handlers.ts` | `tab:*` | Context menus, tab navigation events |
| `dialog-handlers.ts` | `dialog:*` | Native confirm/close dialogs |
| `filesystem-handlers.ts` | `fs:*` | Directory listing and creation |
| `git-handlers.ts` | `git:*`, `git-config:*` | Repo detection, branch, config, PAT |
| `docker-handlers.ts` | `docker:*` | Image build, Docker state detection |
| `container-handlers.ts` | `yolium:*`, `container:*` | Interactive container sessions |
| `kanban-handlers.ts` | `kanban:*` | Board CRUD, item updates |
| `agent-handlers.ts` | `agent:*` | Headless agent start/stop/resume |
| `cache-handlers.ts` | `cache:*` | Project cache management |
| `whisper-handlers.ts` | `whisper:*` | Speech-to-text model management |

#### Services (`src/main/services/`)
- `agent-runner.ts` — Agent orchestration: start, stop, resume, protocol message routing
- `agent-loader.ts` — Parse agent definitions from `src/agents/*.md` (YAML frontmatter + system prompt)
- `agent-protocol.ts` — Extract `@@YOLIUM:{type,data}` protocol messages from agent stdout
- `pty-manager.ts` — PTY creation and management for terminal sessions
- `whisper-manager.ts` — Whisper speech-to-text model management
- `docker-setup.ts` — Docker availability detection and setup

#### Docker (`src/main/docker/`)
- `agent-container.ts` — Create headless agent containers with stream-json parsing for live output
- `container-lifecycle.ts` — Create/stop interactive containers (user-facing terminal)
- `image-builder.ts` — Build `yolium:latest` Docker image
- `project-registry.ts` — Track project cache directories (delegates to SQLite via yolium-db.ts)
- `cache-manager.ts` — Cache cleanup (orphaned, stale)
- `agent-auth.ts` — Shared agent authentication checks (Claude/OpenCode/Codex)
- `path-utils.ts` — Docker-specific path normalization
- `shared.ts` — Shared Docker client instance (dockerode)

#### Stores (`src/main/stores/`)
- `yolium-db.ts` — Unified SQLite store for kanban boards, project registry, schedules, and credentials
- `kanban-store.ts` — Re-export shim that delegates to yolium-db.ts
- `session-store.ts` — Persist tab/session state via localStorage
- `workitem-log-store.ts` — Per-work-item agent output logs (filesystem-based)

#### Git (`src/main/git/`)
- `git-worktree.ts` — Create/delete git worktrees for branch isolation
- `git-config.ts` — Git credential storage (name, email, PAT, API keys, Claude OAuth detection)

#### Lib (`src/main/lib/`)
- `logger.ts` — Structured logging with module context
- `focus-trap.ts` — Focus trap utility for dialogs
- `path-utils.ts` — Path normalization helpers
- `audio-utils.ts` — Audio format conversion for Whisper

### Renderer (`src/renderer/`)

#### Components (`src/renderer/components/`)
- **`agent/`**: `AgentSelectDialog.tsx`, `AgentControls.tsx`, `AgentLogPanel.tsx`
- **`kanban/`**: `KanbanView.tsx`, `KanbanColumn.tsx`, `KanbanCard.tsx`, `NewItemDialog.tsx`, `ItemDetailDialog.tsx`, `CommentsList.tsx`
- **`navigation/`**: `Sidebar.tsx`, `ProjectList.tsx`, `PathInputDialog.tsx`, `DirectoryListing.tsx`, `FavoritesList.tsx`, `FolderCreationInput.tsx`
- **`terminal/`**: `Terminal.tsx`
- **`tabs/`**: `TabBar.tsx`, `Tab.tsx`
- **`settings/`**: `GitConfigDialog.tsx`, `KeyboardShortcutsDialog.tsx`, `WhisperModelDialog.tsx`
- **`docker/`**: `DockerSetupDialog.tsx`
- **Shared**: `StatusBar.tsx`, `EmptyState.tsx`, `SpeechToTextButton.tsx`

#### Hooks (`src/renderer/hooks/`)
- `useTabState.ts` — Tab CRUD, reducer-based state management
- `useAgentCreation.ts` — Agent session creation flow (container + worktree)
- `useAgentSession.ts` — Agent event listeners (output, questions, completion)
- `useDockerState.ts` — Docker availability detection and image building
- `useDialogState.ts` — Dialog open/close state management
- `useDirectoryNavigation.ts` — Folder browsing for project selection
- `useFavoriteFolders.ts` — Favorite folders persistence
- `useGitBranchPolling.ts` — Poll git branch for active tabs
- `useKeyboardShortcuts.ts` — Global keyboard shortcut registration
- `useWhisper.ts` — Speech-to-text recording and transcription
- `useTerminalCwd.ts` — Track terminal working directory

#### Theme (`src/renderer/theme/`)
- `index.ts` — Theme exports
- `ThemeProvider.tsx` — React context provider for theming
- `tokens.ts` — Design token definitions
- `themes/dark.ts`, `themes/light.ts` — Theme implementations

### Shared Types (`src/shared/types/`)
- `agent.ts` — `AgentType`, `KanbanAgentType`, `ProtocolMessage` variants, `AgentDefinition`
- `kanban.ts` — `KanbanBoard`, `KanbanItem`, `KanbanColumn`, `AgentStatus`
- `tabs.ts` — `Tab`, `TabState`, `TabAction` (reducer actions)
- `docker.ts` — `ContainerSession`, `ProjectCacheInfo`, `DockerState`
- `git.ts` — Git-related types
- `whisper.ts` — Whisper model types
- `theme.ts` — Theme types

### Agent Definitions (`src/agents/`)
- `plan-agent.md` — Planning agent: decomposes goals into kanban items
- `code-agent.md` — Code execution agent: implements work items
- `verify-agent.md` — Verification agent: read-only code reviewer
- `scout-agent.md` — Scout agent: lead generation and business intelligence
- `marketing-agent.md` — Marketing agent: executes marketing tasks via specialized skills
- `_protocol.md` — Protocol reference for `@@YOLIUM:{...}` messages

### Tests (`src/tests/`)
- Unit tests: `*.test.ts` (Vitest)
- E2E tests: `e2e/tests/*.spec.ts` (Playwright)
- E2E helpers: `e2e/helpers/app.ts`, `e2e/helpers/selectors.ts`

## Key Design Decisions

- **Docker isolation**: Each agent runs in a container to prevent conflicts and provide a consistent dev environment
- **Git worktrees**: Agents work on isolated branches without switching the main repo's checkout, enabling true parallel work
- **Namespaced IPC**: All IPC channels follow `domain:action` naming (e.g., `kanban:add-item`) to avoid collisions and improve discoverability
- **Agent protocol**: Agents communicate via `@@YOLIUM:{type,data}` JSON messages embedded in stdout — no separate control channel needed
- **Stream-json output**: Agent containers use `--output-format stream-json` with Claude CLI so events stream incrementally (Claude's `-p` mode alone buffers all output until completion). The main process parses JSON events into readable display text (assistant messages, tool use summaries, results with cost) and extracts protocol messages from text content
- **SQLite for persistence**: Kanban boards and project registry use SQLite via better-sqlite3; session state uses localStorage; agent output logs use the filesystem

## Common Patterns

### Adding a new IPC handler

1. Create `src/main/ipc/foo-handlers.ts`:
```typescript
import type { IpcMain } from 'electron';

export function registerFooHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('foo:do-thing', (_event, arg: string) => {
    return doThing(arg);
  });
}
```

2. Register in `src/main/ipc/index.ts`:
```typescript
import { registerFooHandlers } from './foo-handlers';
// Inside registerAllHandlers():
registerFooHandlers(ipcMain);
```

3. Expose in `src/preload.ts`:
```typescript
const foo = {
  doThing: (arg: string) => ipcRenderer.invoke('foo:do-thing', arg),
};
// Add to contextBridge.exposeInMainWorld and declare global types
```

### Adding a new React component

- Place in `src/renderer/components/<feature>/FooDialog.tsx` (group by feature: agent, kanban, navigation, settings, etc.)
- Use `data-testid` attributes on interactive elements for E2E tests
- Follow existing dialog patterns (see `NewItemDialog.tsx` for a clean example)
- Wire into `App.tsx` if it needs global state or dialog management
- Import types with `@shared/types/...`, hooks with `@renderer/hooks/...`

### Adding a new custom hook

- Place in `src/renderer/hooks/useFoo.ts`
- Keep hooks focused on one concern
- Access IPC via `window.electronAPI.namespace.method()`
- Return cleanup functions from `useEffect` for event listeners

### Adding a new agent definition

- Create `src/agents/foo-agent.md` with YAML frontmatter:
```yaml
---
name: foo-agent
description: What this agent does
model: sonnet
tools: [Read, Write, Edit, Bash, Glob, Grep]
timeout: 30
---
```
- Below the frontmatter, write the system prompt
- The agent communicates back via `@@YOLIUM:{...}` protocol messages (see `src/agents/_protocol.md`)

## Git Rules

- Never commit `.planning/` directory (GSD planning artifacts are local-only)
- Never commit debug logging code (hex dumps, verbose IPC logging)
- Never commit `.env` files or secrets
- Never add `Co-Authored-By` or `Co-authored-by` trailers to commit messages. Commits must contain only the commit message itself — no trailers, no sign-off lines.

## Code Style

- Use TypeScript for all new code
- Follow existing patterns in the codebase
- Keep commits atomic and well-described
- Keep code readable and testable:
  - Extract pure functions where possible (no side effects, deterministic output)
  - Avoid deeply nested logic; prefer early returns
  - Keep functions small and single-purpose
  - Use dependency injection for external services (fs, Docker, etc.)

## Testing

- Run `npm test` before committing to verify all unit tests pass
- Run `npm start` before committing to verify production build works
- Test OpenCode/Claude in container after terminal-related changes

## Agent Testing Requirements for User Projects

When agents work on user projects (not Yolium itself), they must:

### Use Real Samples
- Projects can mount a `/Samples` directory into agent containers via `.yolium.json` `sharedDirs`
- Agents must use data from `/Samples` for all tests — never fabricate test fixtures when real samples exist

### Never Skip Authentication
- Projects requiring authenticated E2E tests must provide credentials in `.env`:
  ```
  E2E_USER_EMAIL="..."
  E2E_USER_PASSWORD="..."
  ```
- Agents must check `.env` for these values before running E2E tests
- Agents must never skip, mock, or bypass authentication in tests

### Run All Tests
- Agents must run both unit tests and E2E tests when the project has them
- If E2E tests fail to execute (not assertion failures — execution failures like missing creds or broken config), agents must stop and report the error

## Test-Driven Development

Use TDD when adding new features or fixing bugs:

1. **Write the test first** - Add a failing test in `src/tests/` that describes expected behavior
2. **Run tests** - Verify the test fails (`npm test`)
3. **Implement the code** - Write minimal code to make the test pass
4. **Refactor** - Clean up while keeping tests green

### Running Tests

```bash
npm test          # Run all tests once
npm test:watch    # Watch mode for development
```

### Test File Location

Tests live in `src/tests/` and import via path aliases:
- `src/tests/git-worktree.test.ts` → `src/main/git/git-worktree.ts`
- `src/tests/session-store.test.ts` → `src/main/stores/session-store.ts`
- `src/tests/useTabState.test.ts` → `src/renderer/hooks/useTabState.ts`
- `src/tests/KanbanView.test.tsx` → `src/renderer/components/kanban/KanbanView.tsx`

### Writing Testable Code

- Pure functions are easiest to test (input → output, no side effects)
- Mock external dependencies (fs, Docker API, localStorage)
- Keep business logic separate from I/O operations

## E2E Testing

Use E2E tests for UI features and user-facing workflows:

1. **Write the E2E test first** - Add a test in `src/tests/e2e/tests/` that describes the user workflow
2. **Build the app** - Run `npm start` once (Ctrl+C to stop) to create the build
3. **Run E2E tests** - Verify the test fails (`npm run test:e2e`)
4. **Implement the feature** - Write code to make the test pass
5. **Verify** - Run E2E tests again to confirm

### Running E2E Tests

```bash
npm start         # Build app first (Ctrl+C after build completes)
npm run test:e2e  # Run all E2E tests
```

### E2E Test File Location

E2E tests live in `src/tests/e2e/tests/`:
- `src/tests/e2e/tests/app-launch.spec.ts` - App startup and Docker detection
- `src/tests/e2e/tests/tab-lifecycle.spec.ts` - Tab creation, navigation, dialogs

### E2E Test Helpers

- `src/tests/e2e/helpers/app.ts` - App launch/close, test repo creation
- `src/tests/e2e/helpers/selectors.ts` - UI element selectors (use `data-testid` attributes)

### When to Write E2E Tests

- New UI components or dialogs
- User-facing workflows (tab creation, settings changes)
- Integration points (Docker, terminal, IPC)
- **Keyboard shortcuts and vim actions** — any new or modified shortcut must have an E2E test verifying the actual keyboard interaction works end-to-end (not just unit-level synthetic events). Use Playwright's `keyboard.press()` to simulate real key presses. Reference existing patterns in `src/tests/e2e/tests/vim-shortcut-explorer.spec.ts` and `src/tests/e2e/tests/dialog-shortcuts.spec.ts`.
- **Vim audit coverage** — when adding a new single-key vim action to `VIM_ACTIONS` in `src/shared/vim-actions.ts`, you MUST also add it to the `COVERED_ACTIONS` set in `src/tests/e2e/tests/vim-single-key-audit.spec.ts`. The manifest completeness test will fail otherwise. The bidirectional audit (`src/tests/e2e/tests/vim-single-key-audit.spec.ts`) automatically verifies all declared keys produce DOM effects (forward) and all undeclared keys are inert (reverse).

### E2E Test Isolation

Tests must be isolated - each test starts with a clean state:
- Containers are cleaned up between tests automatically
- Use `beforeEach`/`afterEach` hooks for setup/teardown
- Never rely on state from previous tests
