# Portfolio Auto Recorder — Roadmap

**Status:** Baseline Roadmap v0.1

---

# Product Evolution

```text
Phase 0
Foundation
    ↓
Phase 1
Automatic Recording
    ↓
Phase 2
Portfolio Capture
    ↓
Phase 3
Smart Editing
    ↓
Phase 4
Project Intelligence
    ↓
Phase 5
Automatic Portfolio Builder
```

The project should remain useful at every phase.

---

# Phase 0 — Architecture & Spike

## Sprint 0.1 — Repository Foundation

### Objectives

- Create project repository.
- Configure TypeScript.
- Configure Electron.
- Configure React/Vite.
- Configure build pipeline.
- Establish directory structure.

### Deliverables

```text
Electron app launches
React UI renders
TypeScript compiles
production build works
```

### Verification

```text
npm run build
npm run dist
```

---

## Sprint 0.2 — SQLite Foundation

### Objectives

- Add SQLite.
- Create migrations.
- Implement repositories.
- Add project/session/asset models.

### Deliverables

- database initializes
- migration runs
- project CRUD works
- tests pass

### Verification

```text
npm run test
  → SQLite DB file created on disk
  → migration applies cleanly (idempotent)
  → project CRUD round-trips: create → read → update → delete
  → unit tests pass for all repositories
```

---

## Sprint 0.3 — IPC Architecture

### Objectives

- Create secure preload bridge.
- Define shared types.
- Implement typed IPC.

### Deliverables

```text
renderer
    ↓
preload
    ↓
IPC
    ↓
services
```

No direct Node access from React.

### Verification

```text
npm run build
  → preload bundle compiles with no errors
  → renderer TypeScript compiles against typed bridge
  → contextBridge.exposeInMainWorld called with correct API shape
  → calling window.portfolio.projects.list() from renderer invokes IPC handler
  → no direct require('fs') or child_process in renderer bundle
```

---

# Phase 1 — Automatic Recording MVP

## Sprint 1.1 — Project Management

Features:

- Add project
- Edit project
- Delete project
- Enable/disable auto recording
- Configure executable

UI:

```text
Projects
    ↓
Add Project
    ↓
Project configuration
```

### Verification

```text
npm run test
  → project service unit tests pass

Manual / E2E:
  → open dashboard
  → add project (name, path, executable)
  → project appears in list
  → edit project fields → persisted
  → disable auto-record → toggle reflected
  → delete project → removed from list
  → IPC layer receives and dispatches correctly
```

---

## Sprint 1.2 — Process Detection

Implement:

- process polling
- executable path resolution
- process start detection
- process exit detection
- project matching

Verification:

```text
Launch configured app
→ detected

Close configured app
→ detected
```

---

## Sprint 1.3 — Recording Provider

Implement capture abstraction.

Tasks:

- select display
- configure FPS
- configure resolution
- write MP4
- stop cleanly

Verification:

```text
Start
→ MP4 created

Stop
→ playable MP4
```

---

## Sprint 1.4 — Session Manager

Connect:

```text
ProcessMonitor
      ↓
SessionManager
      ↓
CaptureProvider
```

Implement:

- automatic start
- automatic stop
- failure handling
- session metadata

### Verification

```text
npm run test
  → session state machine transitions validated
  → unit tests cover all status transitions

Manual / E2E:
  → launch configured app → session created (status: recording)
  → close app → session finalized (status: complete)
  → kill app unexpectedly → session stops, status: complete (not stuck in recording)
  → rapid start/stop cycles → no orphan sessions
  → session metadata: duration, trigger, project_id correct in DB
```

---

## Sprint 1.5 — FFmpeg Processing

Implement:

- probe
- thumbnail
- frame extraction
- basic transcode
- duration calculation

### Verification

```text
npm run test
  → ffmpeg service unit tests pass (mocked ffmpeg)
  → probe returns correct MediaInfo

Integration:
  → given a valid MP4 → thumbnail generated at 20% mark
  → given a valid MP4 → probe returns width/height/duration/codec
  → given a valid MP4 → frame extraction at timestamp produces PNG
  → invalid file → graceful error (no crash)
  → all ffmpeg args use array form (no shell interpolation)
```

---

## Sprint 1.6 — Recording Library

UI:

- session history
- thumbnails
- video preview
- duration
- date/time
- processing state

### Verification

```text
npm run test
  → session list UI component tests pass

Manual:
  → dashboard shows recent sessions sorted by date
  → session row shows: date, duration, asset count, status badge
  → click session → opens detail view
  → detail view shows: video player, thumbnails, metadata
  → processing state updates live (recording → processing → complete)
  → failed session shows error state, raw file remains accessible
```

---

## Sprint 1.7 — MVP Hardening

Test:

- app crash
- recorder crash
- process closes quickly
- disk full
- FFmpeg failure
- duplicate launches
- repeated sessions

### Milestone

**MVP 1.0**

A developer can install the app and automatically collect recordings of applications.

---

# Phase 2 — Portfolio Capture

## Sprint 2.1 — Screenshot Extraction

Add:

- automatic screenshots
- screenshot gallery
- thumbnail selection
- duplicate suppression

### Verification

```text
npm run test
  → screenshot extraction unit tests pass

Integration:
  → given a 60s recording → produces 3–8 screenshots
  → screenshots saved to screenshots/ directory
  → duplicate frames suppressed (< threshold similarity)
  → first few seconds skipped
  → idle sections skipped
  → screenshots spread across session duration
  → thumbnail generated for each screenshot
```

---

## Sprint 2.2 — Idle Detection

Capture interaction signals.

Implement:

```text
active
idle
active
idle
```

Store timeline.

### Verification

```text
npm run test
  → idle detection unit tests pass (active → idle → active transitions)

Integration:
  → during recording: mouse/keyboard events reset idle timer
  → no events for N seconds → idle detected
  → activity resumes → active detected
  → idle segments recorded in session timeline
  → timeline data persisted to DB
  → idle threshold configurable via settings
```

---

## Sprint 2.3 — Smart Trimming

Remove obvious dead time.

Initial rules:

```text
idle > threshold
loading screen
unchanged frames
```

Keep conservative defaults.

### Verification

```text
npm run test
  → trimming logic unit tests pass

Integration:
  → raw recording with 30s idle segment → trimmed output shorter
  → no idle segments → output duration ≈ input duration
  → trimmed output is valid MP4 (ffprobe confirms)
  → conservative: only removes segments exceeding threshold
  → raw recording preserved alongside trimmed version
```

---

## Sprint 2.4 — Demo Generation

Create:

```text
raw recording
    ↓
trimmed recording
    ↓
portfolio demo
```

Target:

```text
30–90 seconds
```

### Verification

```text
npm run test
  → demo assembly tests pass

Integration:
  → given trimmed segments → demo assembled within 30–90s range
  → demo output is valid MP4 (ffprobe confirms)
  → intro/outro segments included if configured
  → demo preserves feature segments from raw
  → demo file stored in processed/ directory
  → session record linked to demo asset
```

---

## Sprint 2.5 — Export Bundle

Generate:

```text
demo.mp4
screenshots/
metadata.json
```

### Verification

```text
npm run test
  → export logic unit tests pass

Manual:
  → export project → creates export directory
  → export contains: demo.mp4, screenshots/, metadata.json
  → metadata.json contains: name, description, techStack, features
  → exported files are valid (not corrupted)
  → re-export overwrites cleanly
```

---

## Sprint 2.6 — Project Metadata

Add:

- description
- features
- tech stack
- links
- GitHub URL
- project status

### Verification

```text
npm run test
  → project metadata CRUD tests pass

Manual:
  → add description, features, tech stack, GitHub URL → persisted
  → metadata visible in project detail view
  → metadata included in export bundle
  → empty fields handled gracefully (no crashes)
```

---

## Sprint 2.7 — Portfolio Dashboard

Dashboard should answer:

> What have I built?

Show:

```text
Projects
Recent demos
Recent screenshots
Capture count
Last activity
```

### Verification

```text
npm run test
  → dashboard component tests pass

Manual:
  → dashboard shows all projects with last activity
  → recent demos listed with thumbnails
  → recent screenshots shown
  → capture count per project displayed
  → last activity timestamp accurate
  → click project → navigates to project detail
  → click demo → opens video preview
```

### Milestone

**Portfolio Capture 2.0**

The tool is no longer merely a recorder. It automatically maintains portfolio evidence.

---

# Phase 3 — Smart Editing

## Sprint 3.1 — Highlight Scoring

Implement heuristic scoring:

```text
interaction
visual change
window change
activity density
manual marker
```

### Verification

```text
npm run test
  → highlight scoring unit tests pass
  → given interaction events → score calculated correctly
  → given visual change data → score weighted per formula
  → manual marker boosts score
  → scoring is deterministic for identical inputs
```

---

## Sprint 3.2 — Scene Detection

Detect:

- major screen transitions
- page changes
- modal appearance
- visual changes

### Verification

```text
npm run test
  → scene detection unit tests pass

Integration:
  → given recording with page transitions → scenes detected
  → major visual change → scene boundary marked
  → scene timestamps accurate to within 1s
  → false positives below threshold
```

---

## Sprint 3.3 — Better Demo Assembly

Create a timeline:

```text
Intro
 ↓
Feature 1
 ↓
Feature 2
 ↓
Feature 3
 ↓
End
```

### Verification

```text
npm run test
  → timeline assembly unit tests pass

Integration:
  → given scenes + highlights → structured timeline produced
  → timeline respects max duration setting
  → intro/outro included when configured
  → output is valid MP4 (ffprobe confirms)
  → demo preserves scene order
```

---

## Sprint 3.4 — Automatic Screenshot Selection

Rank extracted screenshot frames and select the best subset for portfolio display.

### ScreenshotRanker

- `rank(frames, context)`: score each frame by weighted factors
- `selectRanked(frames, config)`: return top-N frames sorted by score
- Factors (weighted):

| Factor | Weight | Description |
|--------|--------|-------------|
| visual uniqueness | 0.30 | Perceptual hash distance from other selected frames |
| interaction proximity | 0.25 | Distance to nearest user interaction event (click, key) |
| readability | 0.20 | Blur detection (Laplacian variance), brightness, contrast |
| duration on screen | 0.15 | How long the frame was displayed without change |
| feature coverage | 0.10 | Unique UI elements visible vs. already-selected frames |

### Types

```typescript
interface ScreenshotRankConfig {
  maxScreenshots: number;       // default 5–8
  minScoreThreshold: number;    // 0.0–1.0, reject below
  similarityThreshold: number;  // pHash distance, reject if too close
  weights: ScreenshotWeights;
}

interface ScreenshotWeights {
  visualUniqueness: number;
  interactionProximity: number;
  readability: number;
  durationOnScreen: number;
  featureCoverage: number;
}

interface RankedScreenshot {
  framePath: string;
  timestampMs: number;
  score: number;
  factors: {
    visualUniqueness: number;
    interactionProximity: number;
    readability: number;
    durationOnScreen: number;
    featureCoverage: number;
  };
}
```

### Integration

- SessionManager calls ScreenshotRanker after ScreenshotExtractor
- Ranked results replace raw screenshot list in asset metadata
- Readability pre-filter: reject frames below threshold before ranking
- Visual dedup: pHash comparison rejects near-duplicates before ranking

### Verification

```text
npm run test
  → screenshot ranking unit tests pass

Factors:
  → visual uniqueness: high score for distinct frames
  → visual uniqueness: low score for near-duplicates
  → interaction proximity: frames near clicks scored higher
  → readability: blurry/dark frames scored low
  → readability: sharp/bright frames scored high
  → duration: frames displayed longer scored higher
  → feature coverage: frames with unique UI elements scored higher

Selection:
  → given session with 20 frames → top 5–8 selected
  → visually similar frames → only highest-ranked kept
  → frames near interaction events ranked higher
  → frames spread across session timeline
  → readability filter rejects blurry/dark frames
  → minScoreThreshold rejects low-quality frames
  → maxScreenshots limit enforced
  → empty input returns empty array
  → single frame returns that frame with score 1.0
```

---

## Sprint 3.5 — Recording Profiles

Profiles:

```text
Quick Demo
Portfolio Demo
Long Session
Screenshot Only
Manual
```

Example:

```text
Portfolio Demo
1080p
30 FPS
No microphone
Aggressive idle trimming
5 screenshots
60-second target
```

### Verification

```text
npm run test
  → profile selection unit tests pass

Manual:
  → select "Portfolio Demo" profile → applies 1080p/30fps/no-mic
  → select "Quick Demo" → applies lower quality, shorter target
  → select "Screenshot Only" → no video recorded
  → profile settings override global defaults
  → custom profile persists across sessions
```

---

## Sprint 3.6 — Manual Editing Overrides

User can:

- select segment
- remove segment
- choose thumbnail
- mark highlight
- reorder highlights

Important:

Automation should be editable rather than authoritative.

### Verification

```text
npm run test
  → manual override unit tests pass

Manual:
  → select segment → highlights visually
  → remove segment → segment removed from demo
  → choose thumbnail → thumbnail updated
  → mark highlight → highlight persisted
  → reorder highlights → new order reflected in demo
  → overrides saved and survive app restart
```

### Milestone

**Smart Demo 3.0**

The system can turn ordinary development sessions into reasonably polished demos.

---

# Phase 4 — Project Intelligence

## Sprint 4.1 — Git Integration

Read:

```text
.git
README
package.json
pyproject.toml
requirements.txt
```

Extract:

- project name
- description
- tech stack
- repository
- current branch
- latest commit

### Verification

```text
npm run test
  → git integration unit tests pass

Integration:
  → project with .git → repo metadata extracted (branch, SHA, URL)
  → project without .git → graceful fallback (no crash)
  → README.md content extracted when present
  → package.json → name, description, dependencies parsed
  → metadata persisted to project record in DB
```

---

## Sprint 4.2 — Project Scanner

Scan project structure.

Identify:

```text
frontend
backend
database
tests
docs
assets
```

Generate a project model.

### Verification

```text
npm run test
  → project scanner unit tests pass

Integration:
  → scan typical React project → identifies frontend
  → scan Python project → identifies backend
  → scan project with tests/ → marks tests present
  → scan project with docs/ → marks docs present
  → generated model matches actual structure
  → unknown patterns handled gracefully
```

---

## Sprint 4.3 — Feature Evidence

Connect:

```text
Git changes
+
screenshots
+
recording interactions
+
README
```

to infer:

```text
Feature:
Dashboard

Evidence:
- screenshot
- 22-second recording segment
- related source files
```

### Verification

```text
npm run test
  → feature evidence unit tests pass

Integration:
  → git commit + screenshot → feature candidate generated
  → feature evidence links: commit, screenshot, recording segment
  → feature candidates sorted by confidence
  → manual override: accept/reject feature candidate
  → feature evidence persisted to DB
```

---

## Sprint 4.4 — Local AI

Optional local model.

Input:

```text
project metadata
screenshots
selected frames
Git information
README
```

Output:

```text
description
feature list
demo title
screenshot captions
portfolio summary
```

AI must remain optional.

### Verification

```text
npm run test
  → AI module unit tests pass (mocked model)

Integration:
  → AI disabled → app functions normally, no model loaded
  → AI enabled + model present → description generated
  → AI enabled + model missing → graceful fallback, no crash
  → generated description is non-empty and plausible
  → AI processing does not block main thread
  → AI results cached to avoid re-processing
```

---

## Sprint 4.5 — Project Timeline

Show:

```text
Project
│
├── Aug 20
│   └── initial UI
│
├── Aug 23
│   └── database added
│
├── Aug 25
│   └── dashboard completed
│
└── Aug 28
    └── polished demo
```

### Verification

```text
npm run test
  → project timeline component tests pass

Manual:
  → project with git history → timeline shows commits with dates
  → project with sessions → recording events on timeline
  → timeline sorted chronologically
  → click event → navigates to detail (commit or session)
  → timeline handles project with no history gracefully
```

### Milestone

**Project Intelligence 4.0**

The application becomes a visual record of the developer's projects and their evolution.

---

# Phase 5 — Automatic Portfolio Builder

## Sprint 5.1 — Portfolio Generator

Generate:

```text
portfolio/
├── index.html
├── projects/
├── assets/
└── data.json
```

Static-site output.

### Verification

```text
npm run test
  → portfolio generator unit tests pass

Manual:
  → generate portfolio → creates portfolio/ directory
  → output contains index.html, projects/, assets/, data.json
  → index.html opens in browser and displays projects
  → data.json contains all project metadata
  → assets (images, videos) copied correctly
  → re-generation overwrites cleanly
```

---

## Sprint 5.2 — Project Pages

Each project:

```text
Hero
Demo
Description
Features
Screenshots
Tech stack
GitHub
Timeline
```

### Verification

```text
npm run test
  → project page component tests pass

Manual:
  → project page shows: hero image, demo video, description
  → features list rendered from metadata
  → screenshots displayed in gallery
  → tech stack shown as badges
  → GitHub link clickable
  → timeline shows project history
  → page renders for project with minimal data (no crashes)
```

---

## Sprint 5.3 — Theme System

Templates:

```text
Minimal
Developer
Dark
Grid
Resume
```

### Verification

```text
npm run test
  → theme system unit tests pass

Manual:
  → select "Minimal" theme → clean layout, no decorations
  → select "Developer" theme → dark background, monospace
  → select "Dark" theme → dark color scheme applied
  → select "Grid" theme → projects in grid layout
  → theme switch → all pages update consistently
  → custom theme colors persist
```

---

New project evidence:

```text
recording
    ↓
processing
    ↓
portfolio assets
    ↓
portfolio regeneration
```

### Verification

```text
npm run test
  → auto-update trigger unit tests pass

Integration:
  → new recording processed → portfolio regenerated automatically
  → new screenshot added → portfolio assets updated
  → portfolio regeneration does not block recording
  → concurrent recordings → queue processed sequentially
  → regeneration failure → previous portfolio version preserved
```

---

## Sprint 5.5 — Export / Deploy

Optional:

- ZIP export
- local preview
- GitHub Pages
- Netlify
- Vercel

Cloud deployment should remain optional.

### Verification

```text
npm run test
  → export/deploy unit tests pass

Manual:
  → ZIP export → valid ZIP containing portfolio files
  → local preview → opens in default browser
  → GitHub Pages deploy → portfolio accessible at URL (if configured)
  → Netlify deploy → portfolio accessible at URL (if configured)
  → Vercel deploy → portfolio accessible at URL (if configured)
  → deploy failure → clear error message, no data loss
```

### Milestone

**Portfolio Builder 5.0**

A developer can continuously build software while the system quietly maintains their portfolio.

---

# Phase 6 — Advanced Automation

## Sprint 6.1 — Browser Application Detection

Support:

```text
localhost:3000
localhost:5173
localhost:8000
```

Associate browser sessions with projects.

### Verification

```text
npm run test
  → browser detection unit tests pass

Integration:
  → dev server running on localhost:5173 → detected
  → detected browser session associated with correct project
  → recording starts when dev server launches
  → recording stops when dev server stops
  → multiple dev servers → each associated with correct project
```

---

## Sprint 6.2 — Window-Level Capture

Instead of recording an entire monitor:

```text
specific application window
```

Benefits:

- privacy
- cleaner demos
- smaller files
- easier editing

### Verification

```text
npm run test
  → window capture unit tests pass

Integration:
  → select specific window → only that window recorded
  → window moved/resized → capture follows
  → window minimized → capture pauses or continues (configurable)
  → other windows overlapping → not captured
  → output file smaller than full-screen capture
  → capture quality matches configuration
```

---

## Sprint 6.3 — Automatic Feature Chapters

Generate:

```text
00:00 Introduction
00:08 Dashboard
00:23 Analytics
00:41 Project creation
00:55 Export
```

### Verification

```text
npm run test
  → feature chapter unit tests pass

Integration:
  → given demo with scene transitions → chapters generated
  → chapter timestamps match scene boundaries
  → chapter titles derived from feature detection
  → chapters embedded as metadata in video or chapter file
  → chapter count matches detected features
  → manual override: rename/reorder chapters
```

---

Optional generated voiceover:

```text
screen activity
    +
project metadata
    ↓
narration script
    ↓
TTS
    ↓
demo
```

This should be opt-in.

### Verification

```text
npm run test
  → narration unit tests pass (mocked TTS)

Integration:
  → narration disabled → demo has no voiceover
  → narration enabled + TTS available → voiceover generated
  → narration enabled + TTS unavailable → graceful fallback
  → narration synced to video timeline
  → narration volume configurable
  → narration can be toggled on/off per demo
```

---

## Sprint 6.5 — Demo Quality Scoring

Score:

```text
visual clarity
feature coverage
dead time
duration
screenshot quality
```

Example:

```text
Demo Quality: 87/100

✓ Good opening
✓ Shows 4 features
✓ Strong screenshots
⚠ 8 seconds idle
⚠ Ending could be shorter
```

### Verification

```text
npm run test
  → quality scoring unit tests pass

Integration:
  → given demo video → score calculated (0–100)
  → score reflects: visual clarity, feature coverage, dead time
  → score breakdown shown to user
  → score improves after trimming dead time
  → score is deterministic for identical input
  → score persisted with session record
```

---

# Phase 7 — Long-Term Vision

## Automatic Developer Portfolio Memory

Eventually:

```text
Everything you build
        ↓
        ↓
Automatic capture
        ↓
        ↓
Project understanding
        ↓
        ↓
Evidence graph
        ↓
        ↓
Portfolio
```

The system could answer:

> What did I build this month?

> Show me everything I've made with React.

> Which project has the best demo?

> Generate a portfolio entry for my three strongest projects.

> Find the recording where I demonstrated the dashboard.

> What features did I add to this project?

---

# 8. Priority Matrix

| Feature | Priority | Phase |
|---|---:|---:|
| Project management | P0 | 1 |
| Process detection | P0 | 1 |
| Screen capture | P0 | 1 |
| Session management | P0 | 1 |
| FFmpeg processing | P0 | 1 |
| Recording library | P0 | 1 |
| Crash recovery | P0 | 1 |
| Privacy controls | P0 | 1 |
| Screenshots | P1 | 2 |
| Idle detection | P1 | 2 |
| Auto trimming | P1 | 2 |
| Demo generation | P1 | 2 |
| Export | P1 | 2 |
| Git integration | P2 | 4 |
| AI descriptions | P2 | 4 |
| Highlight AI | P2 | 3–4 |
| Portfolio generator | P2 | 5 |
| Browser detection | P2 | 6 |
| Narration | P3 | 6 |
| Cloud publishing | P3 | 5–6 |

---

# 9. Recommended Build Order

Do not build all phases at once.

The recommended sequence is:

```text
Electron shell
    ↓
SQLite
    ↓
Projects
    ↓
Process detection
    ↓
Capture
    ↓
Sessions
    ↓
FFmpeg
    ↓
Recording library
    ↓
Screenshots
    ↓
Idle detection
    ↓
Auto trimming
    ↓
Demo generation
    ↓
Git
    ↓
AI
    ↓
Portfolio generator
```

---

# 10. Release Strategy

## v0.1 — Technical Spike

Prove:

```text
capture works
FFmpeg works
process detection works
```

## v0.5 — Developer Preview

```text
projects
automatic recording
session library
```

## v1.0 — Automatic Portfolio Capture

```text
automatic recording
screenshots
thumbnails
basic trimming
export
```

## v2.0 — Smart Portfolio Capture

```text
highlight detection
demo generation
Git metadata
project intelligence
```

## v3.0 — Automatic Portfolio Builder

```text
AI-assisted descriptions
portfolio pages
automatic project updates
```

---

# 11. Success Metrics

The most important metric is not recording quality.

It is:

> **How little effort does the developer need to spend to produce useful portfolio evidence?**

Track:

```text
minutes of user interaction required
per completed portfolio demo
```

Target:

```text
MVP:
< 30 seconds of setup per project

Future:
~0 seconds after project setup
```

Secondary metrics:

- recording reliability
- processing success rate
- average demo duration
- screenshot usefulness
- storage consumed
- CPU overhead
- false-positive recordings
- missed recordings

---

# 12. Final Product Principle

The ideal experience is:

```text
Developer:
    "I'm going to build something."

Developer:
    builds something

Portfolio Auto Recorder:
    "Got it."

Portfolio Auto Recorder:
    records the useful parts

Portfolio Auto Recorder:
    creates screenshots

Portfolio Auto Recorder:
    trims the boring parts

Portfolio Auto Recorder:
    understands the project

Portfolio Auto Recorder:
    updates the portfolio
```

The user should spend their time **building software**, not documenting that they built it.
