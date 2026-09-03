# MEMORY.md — Agent Working Memory

## Current Goal
Sprint 3.1 complete (a1e4a8c). Next: Sprint 3.2 (Scene Detection).

## Completed
- Sprint 0.1: Repository Foundation (cce4695)
- Sprint 0.2: SQLite Foundation — 31 tests pass, all repositories functional
- Sprint 0.2 Post-fix: Import paths corrected (5c68994)
- Sprint 0.3: IPC Architecture — 50 tests pass, service layer, handlers, typed preload
- File Restoration: Restored architecture, implementation-guide, roadmap from cce4695 (825e4b3)
- Sprint 1.1: Project Management UI — 51 tests pass, CRUD UI, error handling, listAll
- Sprint 1.2: Process Detection — 69 tests pass, ProcessMonitor with polling, start/stop detection, project matching
- Sprint 1.3: Recording Provider — 84 tests pass, FfmpegCaptureProvider with start/stop, spawnFn injection, gdigrab+dshow
- Sprint 1.3 Post-fix: Review issues addressed — 85 tests pass, statSync timeout, dead code removed
- Docs Restoration: architecture.md, roadmap.md, implementation-guide.md under clean filenames (929447d, 6e1f6f2)
- Sprint 1.4: Session Manager — 99 tests pass, wire ProcessMonitor+SessionManager+CaptureProvider, auto start/stop, state machine
- Sprint 1.4 Post-fix: Race condition, relative path, status ordering fixed (69b9bdf)
- Sprint 1.5: FFmpeg Processing — 122 tests pass, probe/thumbnail/extractFrame/transcode
- Sprint 1.5 Post-fix: Approved, probe() error deferred
- Sprint 1.6: Recording Library UI — 140 tests pass, session list/detail, tab navigation, vitest/jsdom setup
- Sprint 2.1: Screenshot Extraction — 150 tests pass, duplicate suppression, configurable extraction
- Sprint 2.2: Idle Detection — 173 tests pass, IdleDetector, timeline recording, IPC integration
- Sprint 2.3: Smart Trimming — 190 tests pass, timeline-based idle removal, segment extraction+concatenation
- Sprint 2.4: Demo Generation — 203 tests pass, segment distribution, intro/outro support
- Sprint 2.4 Post-fix: trimmed_video asset type, decoupled paths (efc0a6f)
- Sprint 2.5: Export Bundle — 214 tests pass, project export (demo, screenshots, metadata, README)
- Sprint 2.6: Project Metadata — 219 tests pass, description/features/techStack/githubUrl/status fields
- Sprint 2.7: Portfolio Dashboard — 231 tests pass, stat cards, project grid, demo/screenshot galleries
- Sprint 2.7 Post-fix: Removed dead code, parallelized asset loading (b68a66b)
- Sprint 3.1: Highlight Scoring — 250 tests pass, heuristic scoring with interaction/visual/window/marker weights

## Open Threads
- `npm run dev` doesn't pass VITE_DEV_SERVER_URL to electron — fix needed before dev workflow
- CSP has 'unsafe-inline' for scripts/styles — tighten for production
- `npm run lint` has pre-existing errors (root tsconfig references without `composite: true`)
- Zod validation for IPC inputs — deferred from Sprint 0.3
- probe() JSON.parse unstructured error — deferred from Sprint 1.5 review

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

## Directory Structure
- apps/desktop/{electron,renderer}
- packages/{shared,database,media}
- tests/{unit,renderer}
