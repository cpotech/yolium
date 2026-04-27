## What was implemented

Follow-up test maintenance for the merge-bar refactor:
- fixed the new merge-bar E2E negative case to clear merge state with `undefined` instead of invalid `null`
- updated merge-local E2E assertions to click the current confirm dialog action id
- restored the legacy `addProjectButton` selector alias used by older E2E specs
- rewrote the Git diff E2E helpers to use the current work item dialog flow (`Compare Changes`) and real feature-branch fixtures instead of removed APIs and stale assumptions

## Files modified and why

- `src/tests/e2e/helpers/selectors.ts`: restored `addProjectButton` as a legacy alias for existing Playwright specs
- `src/tests/e2e/tests/merge-bar-layout.spec.ts`: fixed the absent-bar setup to clear merge metadata with `undefined`
- `src/tests/e2e/tests/merge-locally.spec.ts`: switched confirm clicks to `confirm-dialog-confirm`
- `src/tests/e2e/tests/git-diff-dialog.spec.ts`: replaced stale `tab.openGitDiff` setup with a real kanban item + compare-button flow and fixture branch creation
- `src/tests/e2e/tests/git-diff-navigation.spec.ts`: replaced stale setup and incorrect list-order assertions with real branch fixtures and focused-item navigation checks

## Tests added and results

- `npm test`: 2617 passed, 4 skipped
- `npm run test:e2e -- src/tests/e2e/tests/merge-bar-layout.spec.ts src/tests/e2e/tests/merge-locally.spec.ts src/tests/e2e/tests/git-diff-dialog.spec.ts src/tests/e2e/tests/git-diff-navigation.spec.ts`: 25 passed

## Caveats or follow-up items

- The focused Playwright regression set is green; I did not run the entire E2E suite beyond the affected merge-bar, merge-locally, and Git diff flows.
- `AGENTS.md`, `.yolium/mocks/merge-bar.html`, and `.yolium/verify.md` were left uncommitted because they are workspace/orchestration artifacts, not part of the code fix.
