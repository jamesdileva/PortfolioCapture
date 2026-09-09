# MEMORY.md — Agent Working Memory

## Current Goal
Await human E2E retest of .exe; post-processing pipeline wired

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

## Verified 2026-09-08
- 701/701 tests pass (12.8s), 41 test files
- Build: Vite 33 modules 173KB + esbuild clean
- dist: portable exe + NSIS installer (90MB each), ready for human retest

## Open Threads
- npm run lint pre-existing tsconfig composite:true errors
- act() warnings in renderer tests (pre-existing, React 16)
- Screenshot ranker injects empty interaction/segment context
- Zod validation for IPC inputs deferred
- CSP unsafe-inline (production concern)
- E2E smoke test awaiting human retest

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
