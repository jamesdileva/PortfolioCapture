# MEMORY.md — Agent Working Memory

## Current Goal
Sprint 7.2 complete; 7.3 Screenshot Ranker Context Fix is next

## Completed
- Sprint 0.1–7.2: All sprints complete
- Sprint 7.2: Security hardening (CSP, allowlist, path sanitizer, SQL audit)

## Verified 2026-09-08
- 785/785 tests pass (12.7s), 43 test files, clean output
- Build: Vite 33 modules 172KB + esbuild clean
- Sprint 7.2: CSP headers on BrowserWindow session, IPC allowlist 77 channels, path sanitizer, SQL audit safe

## Open Threads
- Human must retest .exe — logs at %LOCALAPPDATA%/portfolio-auto-recorder/logs/startup.log
- Screenshot ranker empty context → Sprint 7.3
- Phase 7 remaining: 7.3 ranker fix, 7.4 E2E, 7.5 crash recovery, 7.6 error boundaries

## Key Learnings
- `better-sqlite3` uses prebuilt binaries on Windows — no VS C++ build tools required
- In-memory SQLite tests: use `:memory:` DB with migration SQL for fast, isolated tests
- Electron tsconfig needs ESNext modules for monorepo imports from packages/
- Service layer: Repository → Service → IPC handler → Preload bridge → Renderer
- injectable ExecFn/SpawnFn pattern for testability across all services
- FfmpegCaptureProvider: statSync polling detects output file creation
- Vitest jsdom: `environmentMatchGlobs` for mixed node/jsdom suites; `@renderer` alias
- React 16: `vi.stubGlobal("portfolio", ...)` for window.portfolio mocking
- mockReturnValue with mutable singleton is pitfall — always use mockImplementation for factories
- IdleSegment uses startMs/endMs (not durationMs) — compute inline

## Directory Structure
- apps/desktop/{electron,renderer}
- packages/{shared,database,media}
- tests/{unit,renderer}
