# Repository Guidelines

## Project Structure & Module Organization

- `src/` contains the Electron main process (`main.ts`), React UI (`App.tsx`, `components/`), shared logic (`lib/`), and preload bridge (`preload.ts`).
- `src/tests/` holds unit tests, with end-to-end tests in `src/tests/e2e/`.
- `config/` stores build and test configuration (e.g., `vitest.config.ts`, `playwright.config.ts`).
- `docs/` includes technical and workflow documentation.
- `assets/` contains static assets like diagrams.
- `src/docker/` and `src/docker-manager.ts` cover container orchestration.

## Build, Test, and Development Commands

- `npm start` runs the Electron app in development mode.
- `npm run build` builds the Vite/Electron bundles.
- `npm run make` produces distributables via Electron Forge.
- `npm run lint` runs ESLint over `.ts` and `.tsx`.
- `npm test` runs Vitest unit tests.
- `npm run test:e2e` builds and runs Playwright E2E tests.
- `npm run test:e2e:ui` launches the Playwright UI for debugging.

## Coding Style & Naming Conventions

- Codebase is TypeScript + React. Prefer `.ts` for non-UI and `.tsx` for components.
- Follow existing file and symbol naming patterns in nearby code.
- Use ESLint (`npm run lint`) before sending PRs.

## Testing Guidelines

- Unit tests live in `src/tests/**` and use `*.test.ts` naming.
- E2E tests live in `src/tests/e2e/**` and use `*.spec.ts` naming (Playwright).
- Playwright runs serially (configured for Electron); keep E2E tests deterministic.

## Commit & Pull Request Guidelines

- Commit format (from `docs/GIT-BEST-PRACTICES.md`):
  - `(type) Short description`
  - Types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`
  - Optional body and `Co-Authored-By` line if needed.
- Open PRs against `main`. Summarize changes and include test results you ran.
- CODEOWNERS auto-assigns reviewers; agents should not self-approve.

## Security & Configuration Tips

- Do not commit secrets or `.env` files.
- Review Docker and Git credential handling changes carefully.
- API keys are passed as environment variables to containers; OAuth tokens (`~/.claude`) are mounted read-only and staged with restricted permissions.
