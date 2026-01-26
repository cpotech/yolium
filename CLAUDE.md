# Yolium Project Instructions

## Git Rules

- Never commit `.planning/` directory (GSD planning artifacts are local-only)
- Never commit debug logging code (hex dumps, verbose IPC logging)
- Never commit `.env` files or secrets

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

Tests live in `src/tests/`, alongside the source code:
- `src/tests/git-worktree.test.ts` → `src/lib/git-worktree.ts`
- `src/tests/session-store.test.ts` → `src/lib/session-store.ts`
- `src/tests/useTabState.test.ts` → `src/hooks/useTabState.ts`
- `src/tests/docker-manager.test.ts` → `src/docker-manager.ts`

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

### E2E Test Isolation

Tests must be isolated - each test starts with a clean state:
- Containers are cleaned up between tests automatically
- Use `beforeEach`/`afterEach` hooks for setup/teardown
- Never rely on state from previous tests
