# MEMORY.md — Agent Working Memory

## Current Goal
Sprint 0.3 complete. Next: Sprint 1.1 (Project Management UI).

## Completed
- Sprint 0.1: Repository Foundation (cce4695)
- Sprint 0.2: SQLite Foundation — 31 tests pass, all repositories functional
- Sprint 0.2 Post-fix: Import paths corrected (5c68994)
- Sprint 0.3: IPC Architecture — 50 tests pass, service layer, handlers, typed preload

## Open Threads
- `npm run dev` doesn't pass VITE_DEV_SERVER_URL to electron — fix needed before dev workflow
- CSP has 'unsafe-inline' for scripts/styles — tighten for production
- `npm run lint` has pre-existing errors (root tsconfig references without `composite: true`)
- Zod validation for IPC inputs — deferred from Sprint 0.3

## Key Learnings
- `better-sqlite3` uses prebuilt binaries on Windows — no VS C++ build tools required
- In-memory SQLite tests: use `:memory:` DB with migration SQL for fast, isolated tests
- Timestamp-based ordering tests need manual time offset to avoid flakiness
- Electron tsconfig needs ESNext modules to import from packages/ (monorepo structure)
- Service layer pattern: Repository → Service → IPC handler → Preload bridge → Renderer

## Directory Structure
- apps/desktop/{electron,renderer}
- packages/{shared,database,media}
- tests/{unit,integration,e2e}
