# MEMORY.md — Agent Working Memory

## Current Goal
Exe silent-fail: rename falsifier NEGATIVE (fresh 1:15 AM PDT dist w/ portfoliodb.sqlite still aborts at new Database(), no portfoliodb.sqlite created — #365). Memory-DB probe added to main.ts + dist repacked 2:09 AM (asar-verified). Awaiting human retest of FRESH exe per docs/terminal-launch.md (#26).

## Completed
- Sprint 0.1–7.6: All sprints complete
- Sprint 7.6: Error Boundaries & Polish — ErrorBoundary, ErrorToast, health checks, IPC timeout, unhandled rejection handler (f88b734)
- Sprint 7.5: Crash Recovery — orphan detection, discard, auto-cleanup (466c7c4)
- Sprint 7.5 Post-fix: IPC allowlist gap fixed (81 channels)

## Verified 2026-09-12
- Tree CLEAN (SITREP 3-dirty is stale false-positive: test-db.mjs deleted, WORKLOG.md==worklog.md same file on Win, AGENTS.md mirror expected per #315)
- exe-adjacent startup.log (dist/win-unpacked) stops at "calling new Database() next", 14 lines — native abort, no JS exception
- userData log (%APPDATA%/portfolio-auto-recorder/logs/startup.log) stops at same line
- database.sqlite 0 bytes (9/11), no portfoliodb.sqlite yet = dist stale, falsifier not yet tested
- better-sqlite3 13.0.3 ships win32-x64.node in app.asar.unpacked; node 20.18.3 / electron 33.4.11 / x64; userData writable OK
- 838/838 tests pass; build clean

## Open Threads
- REPACK dist (npm run dist) to include b7a165f portfoliodb.sqlite falsifier, then human: terminal `--no-sandbox` + 5-item paste-back per docs/terminal-launch.md (#25, human #346)
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
