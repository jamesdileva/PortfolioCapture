# MEMORY.md — Agent Working Memory

## Current Goal
Delete cascade + portfolio namespacing shipped 2026-09-14: FK trap fixed (transactional cascades + disk cleanup + toasts), flat-assets collision fixed (per-project slug dirs). 919 unit + 7 e2e green, repacked. Human retries deletes + pushes fresh portfolio.

## Completed
- Sprint 0.1–7.6: All sprints complete
- Sprint 7.6: Error Boundaries & Polish — ErrorBoundary, ErrorToast, health checks, IPC timeout, unhandled rejection handler (f88b734)
- Sprint 7.5: Crash Recovery — orphan detection, discard, auto-cleanup (466c7c4)
- Sprint 7.5 Post-fix: IPC allowlist gap fixed (81 channels)

## Verified 2026-09-12
- Tree CLEAN (SITREP 3-dirty is stale false-positive confirmed 2nd time: git status clean — test-db.mjs deleted, WORKLOG.md==worklog.md case artifact, AGENTS.md mirror expected)
- Memory-DB probe DECISIVE 2:42 AM PDT: log stops at "memory DB probe START", :memory: constructor aborts, no JS exception — native module hard-abort, not file/path issue
- require("better-sqlite3") v13.0.3 succeeds; `new Database()` is the abort point for both :memory: and file paths

## Open Threads
- Event Viewer: human pastes Application-log fault entry for the crash (faulting module path, exception code e.g. 0xc0000005/0xc0000135/0xc0000409) to distinguish missing CRT vs ABI mismatch vs ASAR-unpack load failure
- E2E verification: run `npx playwright test` against built app (needs Electron running)

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
- esbuild CJS externals: electron + better-sqlite3 only — archiver v8 is ESM-only ("type":"module"), must bundle
- Electron v33 rejects --remote-debugging-port=0 (Playwright default) — use ignoreDefaultArgs
- ESM output for Electron main process works but CJS is simpler for native module externals

## Directory Structure
- apps/desktop/{electron,renderer}
- packages/{shared,database,media}
- tests/{unit,renderer,e2e}
