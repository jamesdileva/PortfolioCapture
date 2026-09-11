# MEMORY.md — Agent Working Memory

## Current Goal
Phase 7 complete (7.1–7.6). Fixed archiver ESM bundle bug (ERR_REQUIRE_ESM). 838/838 tests; 81 IPC channels. Awaiting human win-unpacked retest.

## Completed
- Sprint 0.1–7.6: All sprints complete
- Sprint 7.6: Error Boundaries & Polish — ErrorBoundary, ErrorToast, health checks, IPC timeout, unhandled rejection handler (f88b734)
- Sprint 7.5: Crash Recovery — orphan detection, discard, auto-cleanup (466c7c4)
- Sprint 7.5 Post-fix: IPC allowlist gap fixed (81 channels)

## Verified 2026-09-10
- 838/838 tests pass (48 test files), clean output
- Build: Vite 35 modules 175KB + esbuild clean (main.js + preload.js + migrations/)
- ErrorBoundary: per-tab isolation (Dashboard, Projects, Recordings)
- ErrorToast: auto-dismiss after 5s, manual dismiss, showToast/dismissToast/clearAllToasts API
- Health checks: DB writable, FFmpeg found, migrations dir — via injectable ExecFn
- IPC timeout: 30s default on all preload bridge calls via invokeWithTimeout
- Unhandled rejection: logged to startup.log, no crash
- health:check IPC channel registered (81 total)

## Open Threads
- Human must retest win-unpacked exe after archiver ESM fix (mail #276)
- E2E verification: run `npx playwright test` against built app (needs Electron running)
- Recovery dialog UI deferred — IPC bridge ready for renderer integration
- Pre-existing TS errors in ffmpeg-service.ts, project-autofill.ts, ipc/projects.ts (unrelated to Sprint 7.6)

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
