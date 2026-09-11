# MEMORY.md — Agent Working Memory

## Current Goal
Sprint 7.5 complete (50f4c31); 818/818 tests; Crash Recovery IPC bridge ready. Sprint 7.6 (Error Boundaries & Polish) next.

## Completed
- Sprint 0.1–7.5: All sprints complete
- Sprint 7.5: Crash Recovery — orphan detection, discard, auto-cleanup (466c7c4)
- Sprint 7.5 Post-fix: IPC allowlist gap fixed (80 channels)

## Verified 2026-09-10
- 818/818 tests pass (45 test files), clean output
- Build: Vite 33 modules 173KB + esbuild clean (main.js 323KB CJS + preload.js 7.8KB + migrations/)
- CrashRecoveryServiceImpl: detectOrphans, discardOrphan, autoCleanup all functional
- IPC bridge: crashRecovery.detect/discard/autoCleanup wired
- IPC allowlist: 80 channels (includes crash-recovery:detect/discard/autoCleanup)

## Open Threads
- Human must retest .exe — logs at %LOCALAPPDATA%/portfolio-auto-recorder/logs/startup.log
- E2E verification: run `npx playwright test` against built app (needs Electron running)
- Sprint 7.6: Error Boundaries & Polish (React error boundaries, IPC timeouts, health checks)
- Recovery dialog UI deferred — IPC bridge ready for renderer integration

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
- esbuild CJS externals simpler than nativeModulePlugin — externalize electron/better-sqlite3/archiver
- Electron v33 rejects --remote-debugging-port=0 (Playwright default) — use ignoreDefaultArgs
- ESM output for Electron main process works but CJS is simpler for native module externals

## Directory Structure
- apps/desktop/{electron,renderer}
- packages/{shared,database,media}
- tests/{unit,renderer,e2e}
