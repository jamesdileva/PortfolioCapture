# MEMORY.md — Agent Working Memory

## Current Goal
Await human E2E retest of .exe with diagnostic logging; Phase 7 roadmap complete

## Completed
- Sprint 0.1–6.5: All sprints complete
- ERR_REQUIRE_ESM fixed (b335889)
- Startup error dialog added (83202da)
- Renderer path fix committed (55a157c + 6800482)
- Process-level crash handlers added to esbuild banner (fca420b)
- Preload bridge type fix: added Sprint 2.6 fields (4403230)
- Feature: Project Auto-Fill from directory path (e551b63)
- Auto-fill review #212 fix: git remote cwd (639ad63)
- Wire unwired services into SessionManager post-processing (d3527dd)
- Diagnostic startup logging (fb163e9) — logs to userData/logs/startup.log
- Fix act() test warnings + suppress noise (bd82304)
- Fix double FFmpeg scene detection in chapter pipeline (#224 Note 1)
- Persist chapters via settingsService + saveChapters (#224 Note 2)

## Verified 2026-09-08
- 701/701 tests pass (12.7s), 41 test files, clean output
- Build: Vite 33 modules 173KB + esbuild clean
- dist: portable exe + NSIS installer rebuilt with diagnostic logging

## Open Threads
- Human must retest .exe — logs at %LOCALAPPDATA%/portfolio-auto-recorder/logs/startup.log
- Screenshot ranker empty context → tracked as Sprint 7.3
- Phase 7 sprints defined: 7.1 Zod, 7.2 CSP, 7.3 ranker fix, 7.4 E2E, 7.5 crash recovery, 7.6 error boundaries

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
