# Unit Test Gap Review

**Date**: 2025-03-05
**Current state**: 56 test files, 1221 tests passing, 2 skipped

## Coverage Summary

| Area | Source Files | Tested | Coverage |
|------|-------------|--------|----------|
| src/main/services | 8 | 6 | 75% |
| src/main/ipc | 16 | 7 | 44% |
| src/main/docker | 9 | 3 | 33% |
| src/main/git | 2 | 2 | 100% |
| src/main/stores | 3 | 3 | 100% |
| src/main/lib | 1 | 0 | 0% |
| src/renderer/hooks | 12 | 2 | 17% |
| src/renderer/components | 29 | 13 | 45% |
| **Total** | **~83** | **~36** | **~43%** |

---

## Well-Tested Areas (no action needed)

These files have strong test coverage with good edge-case and error-path testing:

- **agent-runner.ts** — ~95 tests covering prompt building, model resolution, column routing, worktree isolation, completion behavior
- **agent-protocol.ts** — ~48 tests covering all message types, legacy compat, JSON parsing edge cases, malformed input
- **agent-container.ts** — ~95 tests covering stream parsing (Claude + Codex), protocol extraction, usage tracking, bind mounts, env vars
- **kanban-store.ts** — ~62 tests covering path normalization, CRUD, validation, comments, batch operations
- **git-worktree.ts** — ~70 tests covering repo detection, branch naming, sanitization, worktree creation, Windows MSYS2 path fixing
- **useTabState.ts** — ~30 tests covering all reducer actions, close logic, session restore
- **Kanban components** — KanbanView, KanbanColumn, KanbanCard, NewItemDialog, ItemDetailDialog, CommentsList all tested

---

## Priority 1: Source Files With Tests But Significant Gaps

### `git-config.ts` — Only Codex OAuth refresh tested
**19 tests, but the file exports ~15+ functions.** Missing tests for:
- `loadGitConfig()` / `saveGitConfig()` / `loadDetectedGitConfig()` — core config persistence
- `hasHostClaudeOAuth()` / `hasHostCodexOAuth()` — OAuth detection
- `fetchClaudeUsage()` / `fetchGitHubUser()` — API calls
- `generateGitCredentials()` — credential file generation
- Credential path resolution logic

### `container-lifecycle.ts` — Only 6 tests
Only verifies onboarding env vars and shared memory. Missing tests for:
- `createYolium()` main logic — worktree creation, mount paths, bind mounts
- Git credential/OAuth binding
- Error handling (worktree failures, Docker API errors)
- Container cleanup/removal

### `session-store.ts` — Only 12 tests
Basic save/load/clear only. Missing:
- Active tab index recovery
- Partial/corrupted session recovery
- Empty session handling edge cases

### `agent-loader.ts` — Only parsing tested
~15 tests for YAML parsing. Missing:
- `loadAgentDefinition()` — file loading pipeline
- `listAgents()` — directory listing
- Missing/unreadable agent files
- Malformed YAML (no frontmatter delimiters)

### `agent-runner.ts` — Missing key entry points
~95 tests but all for helper/utility functions. Missing:
- `startAgent()` — the main orchestration entry point (~400 lines)
- `handleAgentOutput()` — protocol message routing
- `stopAgent()` / `resumeAgent()`
- Error propagation when Docker container creation fails
- `stopAllAgentsForProject()` cleanup

---

## Priority 2: Untested Source Files (Main Process)

### IPC Handlers — 9 files with no tests
| File | Key logic to test |
|------|------------------|
| `kanban-handlers.ts` | Board CRUD delegation, input validation |
| `container-handlers.ts` | Container session management, interactive sessions |
| `terminal-handlers.ts` | PTY creation, write, resize, close |
| `cache-handlers.ts` | Cache listing, cleanup triggers |
| `tab-handlers.ts` | Context menu, tab navigation events |
| `app-handlers.ts` | Version, home dir, quit lifecycle |
| `dialog-handlers.ts` | Native confirm/close dialogs |
| `onboarding-handlers.ts` | Onboarding flow |
| `project-config-handlers.ts` | Project config read/write |

### Docker — 6 files with no tests
| File | Key logic to test |
|------|------------------|
| `agent-auth.ts` | Auth checks for Claude/OpenCode/Codex |
| `cache-manager.ts` | Orphaned/stale cache cleanup |
| `image-builder.ts` | Docker image build pipeline |
| `project-registry.ts` | Project tracking, registry file I/O |
| `path-utils.ts` | Docker-specific path normalization |
| `shared.ts` | Docker client singleton |

### Services — 2 files with no tests
| File | Key logic to test |
|------|------------------|
| `pty-manager.ts` | PTY creation, lifecycle, cleanup |
| `docker-setup.ts` | Docker availability detection |

### Lib — 1 file with no tests
| File | Key logic to test |
|------|------------------|
| `logger.ts` | Structured logging, module context |

---

## Priority 3: Untested Renderer Code

### Hooks — 10 of 12 hooks untested
| Hook | Complexity | Recommended |
|------|-----------|-------------|
| `useAgentCreation.ts` | High — agent session creation flow | Yes |
| `useAgentSession.ts` | High — event listeners, output handling | Yes |
| `useDockerState.ts` | Medium — Docker detection, image building | Yes |
| `useDialogState.ts` | Low — open/close state | No (trivial) |
| `useDirectoryNavigation.ts` | Medium — folder browsing | Maybe |
| `useFavoriteFolders.ts` | Low — persistence | No (trivial) |
| `useGitBranchPolling.ts` | Medium — polling, cleanup | Yes |
| `useKeyboardShortcuts.ts` | Medium — shortcut registration | Maybe |
| `useClaudeUsage.ts` | Low — API call wrapper | No |
| `useTerminalCwd.ts` | Low — cwd tracking | No |

### Components — 16 of 29 untested
Higher-value targets:
- `AgentLogPanel.tsx` — agent output display with complex rendering
- `TabBar.tsx` / `Tab.tsx` — tab interaction, drag-and-drop reordering
- `StatusBar.tsx` — status display, Docker/git state
- `DockerSetupDialog.tsx` — setup wizard flow
- `ProjectList.tsx` — project listing, selection

Lower-priority (thin UI):
- `DirectoryListing.tsx`, `FavoritesList.tsx`, `FolderCreationInput.tsx`, `PathInputDialog.tsx`
- `KeyboardShortcutsDialog.tsx`, `WhisperModelDialog.tsx`
- `SpeechToTextButton.tsx`, `GitDiffDialog.tsx`, `MockPreviewModal.tsx`, `Terminal.tsx`

---

## Priority 4: Test Quality Issues in Existing Tests

### React `act()` warnings
Several component tests produce `act(...)` warnings in stderr:
- `ItemDetailDialog.test.tsx` — state updates not wrapped in act()
- `Sidebar.test.tsx` — state updates not wrapped in act()

These aren't failures but indicate async state updates are happening outside the test's control flow, which could cause flaky tests.

### Missing error-path tests across the board
Most test files focus heavily on happy paths. Specific gaps:
- **Network failures** — very few tests simulate fetch/Docker API failures
- **Permission errors** — no tests for fs permission denied scenarios
- **Timeout handling** — no tests for agent timeout behavior
- **Concurrent operations** — no tests for race conditions in stores or agent management

---

## Recommended Action Items (ordered by impact)

1. **Add tests for `startAgent()` in agent-runner** — This is the core orchestration function and is completely untested
2. **Expand `git-config.test.ts`** — Test `loadGitConfig`, `saveGitConfig`, OAuth detection, credential generation
3. **Add tests for `container-lifecycle.ts`** — Test `createYolium()` with various mount/credential configs
4. **Add tests for `agent-auth.ts`** — Auth validation is security-critical
5. **Add tests for `cache-manager.ts`** — Cleanup logic could delete valid data if buggy
6. **Add tests for `project-registry.ts`** — Registry corruption could lose project tracking
7. **Test `useAgentCreation` and `useAgentSession` hooks** — Core user-facing workflows
8. **Test `TabBar`/`Tab` components** — Central UI interaction point
9. **Fix `act()` warnings** in ItemDetailDialog and Sidebar tests
10. **Add error-path tests** to existing test files (network failures, Docker errors, fs permissions)
