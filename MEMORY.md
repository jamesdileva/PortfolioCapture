# MEMORY.md — Agent Working Memory

## Current Goal
Await human E2E test of .exe (startup error dialog added, commit 83202da)

## Completed
- Sprint 0.1–0.3: Foundation, SQLite, IPC architecture
- Sprint 1.1–1.6: Project UI, process detection, capture, session manager, FFmpeg, recording library
- Sprint 2.1–2.7: Screenshots, idle detection, smart trimming, demo gen, export bundle, project metadata, dashboard
- Sprint 3.1–3.6: Highlight scoring, scene detection, timeline assembler, screenshot ranker, recording profiles, manual overrides
- Sprint 4.1–4.5: Git service, project scanner, feature evidence, local AI, project timeline
- Sprint 5.1–5.5: Portfolio generator, project pages, theme system, auto-update trigger, deploy/export
- Sprint 6.1–6.5: Dev server detection, window capture, feature chapters, demo quality scoring

## Verified 2026-09-07
- 674/674 tests pass (12.7s), 40 test files
- Build: Vite 33 modules 172KB + TS clean
- ERR_REQUIRE_ESM fixed: archiver bundled as CJS in esbuild
- dist: portable exe + NSIS installer (90MB each)
- Status checker false-negative: reports FAIL but exit code 0

## Open Threads
- parseJsonArray: NOT duplicated — shared util parses JSON strings, git-service one extracts from parsed objects (different signatures)
- Migration 004: idempotent via runner catch (database/index.ts:38-39)
- probe() JSON.parse: already guarded in try/catch (ffmpeg-service.ts:64-68)
- `npm run lint` pre-existing tsconfig composite:true errors
- act() warnings in renderer tests (pre-existing, React 16)
- FeatureChapterGenerator standalone (not wired into SessionManager post-processing)
- DemoQualityScorer standalone (not wired into SessionManager post-processing)
- TimelineAssembler not wired into DemoGenerator (Sprint 3.3 note)
- Screenshot ranker injects empty interaction/segment context
- Zod validation for IPC inputs deferred
- CSP 'unsafe-inline' for scripts/styles (production concern)
- E2E smoke test awaiting human manual launch (Task #7)

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
