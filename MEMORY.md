# MEMORY.md — Agent Working Memory

## Current Goal
Await human E2E retest of .exe; auto-fill feature shipped

## Completed
- Sprint 0.1–6.5: All sprints complete
- ERR_REQUIRE_ESM fixed (b335889)
- Startup error dialog added (83202da)
- Renderer path fix committed (55a157c + 6800482)
- Process-level crash handlers added to esbuild banner (fca420b)
- Preload bridge type fix: added Sprint 2.6 fields (4403230)
- Feature: Project Auto-Fill from directory path (e551b63)

## Verified 2026-09-07
- 693/693 tests pass (12.8s), 41 test files
- Build: Vite 33 modules 172KB + esbuild clean
- dist: portable exe + NSIS installer (90MB each), ready for human retest

## Open Threads
- `npm run lint` pre-existing tsconfig composite:true errors
- act() warnings in renderer tests (pre-existing, React 16)
- FeatureChapterGenerator standalone (not wired into SessionManager post-processing)
- DemoQualityScorer standalone (not wired into SessionManager post-processing)
- TimelineAssembler not wired into DemoGenerator (Sprint 3.3 note)
- Screenshot ranker injects empty interaction/segment context
- Zod validation for IPC inputs deferred
- CSP 'unsafe-inline' for scripts/styles (production concern)
- E2E smoke test awaiting human retest (Task #7)

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

## Directory Structure
- apps/desktop/{electron,renderer}
- packages/{shared,database,media}
- tests/{unit,renderer}
