# MEMORY.md — Agent Working Memory

## Current Goal
Sprint 7.3 complete; awaiting next directive (7.4 E2E Smoke Test is next)

## Completed
- Sprint 0.1–7.3: All sprints complete
- Sprint 7.3: InteractionCollector + screenshot ranker context fix (b4506bc)

## Verified 2026-09-09
- 800/800 tests pass (44 test files), clean output
- Build: Vite 33 modules 173KB + esbuild clean
- Sprint 7.3: InteractionCollector captures keyboard events during recording, timestamps passed to ScreenshotRanker context

## Open Threads
- Human must retest .exe — logs at %LOCALAPPDATA%/portfolio-auto-recorder/logs/startup.log
- Phase 7 remaining: 7.4 E2E, 7.5 crash recovery, 7.6 error boundaries

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
