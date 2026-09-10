# MEMORY.md — Agent Working Memory

## Current Goal
Sprint 7.4 complete (abce812); E2E tests fixed but not yet verified passing (need Playwright run against built app)

## Completed
- Sprint 0.1–7.4: All sprints complete
- Sprint 7.4: E2E scaffolding + build refactor (abce812, 42c1564, 9622598)

## Verified 2026-09-09
- 800/800 tests pass (44 test files), clean output
- Build: Vite 33 modules 173KB + esbuild clean
- Sprint 7.4: E2E path fixed (main.mjs), ignoreDefaultArgs added, build refactored (ESM main + CJS preload + nativeModulePlugin)

## Open Threads
- Human must retest .exe — logs at %LOCALAPPDATA%/portfolio-auto-recorder/logs/startup.log
- E2E verification: run `npx playwright test` against built app (needs Electron running)
- Phase 7 remaining: 7.5 crash recovery, 7.6 error boundaries

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
- esbuild nativeModulePlugin: externalize electron/better-sqlite3 via banner require(), not esbuild externals
- Electron v33 rejects --remote-debugging-port=0 (Playwright default) — use ignoreDefaultArgs
- esbuild ESM output (.mjs) works for Electron main process (Node 18+ ESM support)

## Directory Structure
- apps/desktop/{electron,renderer}
- packages/{shared,database,media}
- tests/{unit,renderer}
