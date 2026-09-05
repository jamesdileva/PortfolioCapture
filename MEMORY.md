# MEMORY.md — Agent Working Memory

## Current Goal
Sprint 4.2 done (5f94ec2). 392 tests pass, build clean. Next: Sprint 4.3 Feature Evidence.

## Completed
- Sprint 0.1–4.2 (all committed, 5f94ec2)
- Sprint 4.1: GitService — repo info, file metadata, IPC bridge
- Sprint 4.2: ProjectScanner — detect project structure and technologies

## Open Threads
- execPromise duplicated in 4 files (capture-provider, smart-trimmer, demo-generator, scene-detector)
- SessionManager constructor 11 positional params → options object
- No UI trigger for export:project yet (Sprint 2.6+)
- formatDuration/STATUS_COLORS duplicated across SessionList + SessionDetail
- `npm run dev` VITE_DEV_SERVER_URL not passed to electron
- CSP 'unsafe-inline' for scripts/styles — tighten for production
- `npm run lint` has pre-existing tsconfig composite:true errors
- Zod validation for IPC inputs — deferred
- probe() JSON.parse unguarded (minor)
- selectDistributed ignores minScreenshots param (deferred)
- Dedup tests use identical mock buffers (deferred)
- Migration 002 ALTER TABLE not idempotent (low risk)
- act() warnings in renderer tests (pre-existing)
- SceneDetector not wired into SessionManager (expected, standalone)
- TimelineAssembler not wired into SessionManager/DemoGenerator (expected, Sprint 3.5+)
- Intro/outro behavior untested when files exist (coverage gap)
- Screenshot ranker injects empty interaction/segment context (Sprint 3.5+)

## Key Learnings
- `better-sqlite3` uses prebuilt binaries on Windows — no VS C++ build tools required
- In-memory SQLite tests: use `:memory:` DB with migration SQL for fast, isolated tests
- Timestamp-based ordering tests need manual time offset to avoid flakiness
- Electron tsconfig needs ESNext modules to import from packages/ (monorepo structure)
- Service layer pattern: Repository → Service → IPC handler → Preload bridge → Renderer
- ProcessMonitor: inject execFn for testability, avoid promisify on callback exec
- Process matching: exact path match first, then filename fallback (case-insensitive)
- FfmpegCaptureProvider: statSync polling to detect output file created (avoids stderr parsing)
- Vitest jsdom: `environmentMatchGlobs` for mixed node/jsdom test suites; `@renderer` alias for component imports
- jsdom `<video>` has no ARIA role — use `container.querySelector("video")` not `getByRole("video")`
- React 16 + @testing-library/react: `vi.stubGlobal("portfolio", ...)` to mock window.portfolio in tests
- mockReturnValue with mutable singleton is recurring test pitfall — always use mockImplementation for factories
- Workspace status header can be stale; always verify with git status + npm run test
- Screenshot ranker: inject readFileBytes for testing without real PNG files, use byte sampling for similarity

## Directory Structure
- apps/desktop/{electron,renderer}
- packages/{shared,database,media}
- tests/{unit,renderer}
