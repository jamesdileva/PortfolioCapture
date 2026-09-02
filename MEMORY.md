# MEMORY.md — Agent Working Memory

## Current Goal
Sprint 1.3 complete (542fd92). Next: Sprint 1.4 (Session Manager).

## Completed
- Sprint 0.1: Repository Foundation (cce4695)
- Sprint 0.2: SQLite Foundation — 31 tests pass, all repositories functional
- Sprint 0.2 Post-fix: Import paths corrected (5c68994)
- Sprint 0.3: IPC Architecture — 50 tests pass, service layer, handlers, typed preload
- File Restoration: Restored architecture, implementation-guide, roadmap from cce4695 (825e4b3)
- Sprint 1.1: Project Management UI — 51 tests pass, CRUD UI, error handling, listAll
- Sprint 1.2: Process Detection — 69 tests pass, ProcessMonitor with polling, start/stop detection, project matching
- Sprint 1.3: Recording Provider — 84 tests pass, FfmpegCaptureProvider with start/stop, spawnFn injection, gdigrab+dshow
- Sprint 1.3 Post-fix: Review issues addressed — 85 tests pass, statSync timeout, dead code removed

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
- ProcessMonitor: inject execFn for testability, avoid promisify on callback exec
- Process matching: exact path match first, then filename fallback (case-insensitive)
- FfmpegCaptureProvider: statSync polling to detect output file created (avoids stderr parsing)

## Directory Structure
- apps/desktop/{electron,renderer}
- packages/{shared,database,media}
- tests/{unit,integration,e2e}
