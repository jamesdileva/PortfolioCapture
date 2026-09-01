# Portfolio Auto Recorder — Architecture

**Status:** Baseline Architecture v0.1  
**Purpose:** Local-first desktop utility that automatically captures lightweight portfolio evidence while the developer builds and demonstrates applications.

---

## 1. Product Definition

Portfolio Auto Recorder watches configured local projects and application processes. When a project is launched or an eligible application session begins, it can automatically capture a low-overhead recording. Sessions are stopped automatically when the application closes, the user becomes inactive for a configurable period, or a maximum session duration is reached.

The system then turns raw sessions into portfolio assets:

- MP4 demo recordings
- screenshots
- session metadata
- project metadata
- optional highlights
- optional generated descriptions
- optional portfolio-ready bundles

### Core Principle

**Capture first, intelligence second.**

The MVP must work without an LLM, cloud account, paid API, or always-running heavy model.

---

## 2. Goals

### Primary Goals

1. Automatically capture application demonstrations with minimal user interaction.
2. Keep CPU, RAM, disk, and GPU overhead low.
3. Operate locally by default.
4. Support Windows first.
5. Make recordings easy to associate with a project.
6. Preserve raw recordings while allowing derived portfolio assets.
7. Make the architecture extensible toward automatic highlight detection and portfolio generation.

### Secondary Goals

- Detect meaningful interaction.
- Remove dead time.
- Extract representative screenshots.
- Generate short demo clips.
- Maintain a searchable portfolio library.
- Integrate with Git metadata.
- Eventually generate portfolio pages and project summaries.

### Non-Goals for MVP

- Full professional video editor.
- Cloud video hosting.
- Social media publishing.
- Complex screen effects.
- Always-on AI vision.
- Automatic public publishing.
- Capturing arbitrary sensitive applications without explicit configuration.

---

# 3. Product Modes

## 3.1 Manual Mode

User presses Record.

```text
Start Recording
    ↓
Select Project
    ↓
Record
    ↓
Stop
    ↓
Process
```

## 3.2 Automatic Mode

```text
Project configured
        ↓
Application launched
        ↓
Session detected
        ↓
Recording starts
        ↓
User demonstrates app
        ↓
Application closes / timeout
        ↓
Recording finalized
```

## 3.3 Smart Mode

Future:

```text
Raw session
    ↓
Interaction analysis
    ↓
Interesting segments
    ↓
Highlight selection
    ↓
Short demo
    ↓
Screenshots
    ↓
Portfolio metadata
```

---

# 4. Recommended Tech Stack

## Desktop Shell

**Electron**

Reasons:

- Familiar ecosystem.
- Cross-platform path later.
- Tray support.
- Mature desktop window/process integration.
- Easy React UI integration.

Electron should remain the UI/orchestration shell rather than perform heavy video processing.

## Frontend

**React + TypeScript + Vite**

Responsibilities:

- Dashboard
- Project management
- Session history
- Recording settings
- Portfolio library
- Processing status
- Preview

## Backend / Local Service

Recommended MVP approach:

**Node.js/TypeScript background process inside the Electron application.**

Do not introduce FastAPI initially unless a separate Python processing service becomes necessary.

Reasons:

- Avoid two runtime environments.
- Easier packaging.
- Simple IPC.
- Lower operational complexity.

A Python worker can be introduced later for computer vision/ML workloads.

## Database

**SQLite**

ORM:

**Drizzle ORM** or direct `better-sqlite3`.

Recommendation: `better-sqlite3` + typed repository layer for MVP.

Database stores metadata only.

Never store video blobs in SQLite.

## Video

**FFmpeg**

Responsibilities:

- Capture integration where appropriate.
- Transcoding.
- Trimming.
- Concatenation.
- Frame extraction.
- Compression.
- Thumbnail generation.
- Metadata inspection.

Use the system FFmpeg during development and bundle a known FFmpeg build for production.

## Screen Capture

Windows-first options:

### MVP

Use a native/system capture path exposed to the application, with FFmpeg as the processing layer.

Possible implementations:

- Windows Graphics Capture
- Desktop Duplication API
- FFmpeg-compatible DirectShow / gdigrab path where acceptable

The capture adapter should hide the implementation behind:

```ts
interface CaptureProvider {
  start(options: CaptureOptions): Promise<CaptureSession>;
  stop(sessionId: string): Promise<CaptureResult>;
  pause(sessionId: string): Promise<void>;
  resume(sessionId: string): Promise<void>;
}
```

This allows the capture technology to change without rewriting the application.

## Process Detection

Windows process inspection through Node/native integration.

Initial requirements:

- Detect process start.
- Detect process exit.
- Resolve executable path.
- Map executable → configured project.

Potential implementation:

- `tasklist`
- PowerShell
- Node process libraries
- Native Windows API module if required for reliability.

Start with a simple adapter and replace it with a native implementation if performance/reliability demands it.

## Packaging

**electron-builder**

Target:

- Windows installer
- Portable build later

---

# 5. High-Level Architecture

```text
┌──────────────────────────────────────────────┐
│                 Electron App                 │
│                                              │
│  ┌──────────────┐      ┌──────────────────┐ │
│  │ React UI     │◄────►│ IPC API          │ │
│  └──────────────┘      └─────────┬────────┘ │
│                                  │          │
│                        ┌─────────▼────────┐ │
│                        │ Application Core │ │
│                        └─────────┬────────┘ │
│                                  │          │
│        ┌─────────────────────────┼────────┐ │
│        │                         │        │ │
│   ┌────▼─────┐             ┌────▼────┐   │ │
│   │ Process   │             │ Capture │   │ │
│   │ Monitor   │             │ Manager │   │ │
│   └───────────┘             └────┬────┘   │ │
│                                  │        │ │
│                           ┌──────▼──────┐ │ │
│                           │ FFmpeg      │ │ │
│                           │ Processor   │ │ │
│                           └──────┬──────┘ │ │
│                                  │        │ │
│                           ┌──────▼──────┐ │ │
│                           │ Asset       │ │ │
│                           │ Manager     │ │ │
│                           └──────┬──────┘ │ │
│                                  │        │ │
│                           ┌──────▼──────┐ │ │
│                           │ SQLite      │ │ │
│                           └─────────────┘ │ │
└──────────────────────────────────────────────┘
```

---

# 6. Directory Structure

```text
portfolio-auto-recorder/
│
├── apps/
│   └── desktop/
│       ├── electron/
│       │   ├── main.ts
│       │   ├── preload.ts
│       │   ├── ipc/
│       │   │   ├── projects.ts
│       │   │   ├── sessions.ts
│       │   │   ├── recordings.ts
│       │   │   ├── settings.ts
│       │   │   └── portfolio.ts
│       │   ├── services/
│       │   │   ├── app-detector.ts
│       │   │   ├── process-monitor.ts
│       │   │   ├── capture-manager.ts
│       │   │   ├── session-manager.ts
│       │   │   ├── ffmpeg-service.ts
│       │   │   ├── asset-manager.ts
│       │   │   └── storage-service.ts
│       │   └── windows/
│       │       └── main-window.ts
│       │
│       └── renderer/
│           ├── src/
│           │   ├── app/
│           │   ├── components/
│           │   ├── pages/
│           │   ├── hooks/
│           │   ├── services/
│           │   ├── stores/
│           │   ├── types/
│           │   └── styles/
│           └── index.html
│
├── packages/
│   ├── shared/
│   │   ├── types/
│   │   ├── constants/
│   │   └── schemas/
│   │
│   ├── database/
│   │   ├── schema/
│   │   ├── repositories/
│   │   └── migrations/
│   │
│   └── media/
│       ├── ffmpeg/
│       ├── capture/
│       └── processing/
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
├── scripts/
│   ├── download-ffmpeg.ts
│   └── package-app.ts
│
├── docs/
│   ├── architecture.md
│   ├── implementation-guide.md
│   └── roadmap.md
│
├── data/
│   └── .gitkeep
│
├── package.json
├── tsconfig.json
├── vite.config.ts
└── electron-builder.yml
```

---

# 7. Storage Architecture

Use an application data directory rather than storing assets inside the source project by default.

Example:

```text
%APPDATA%/PortfolioAutoRecorder/
│
├── database.sqlite
├── projects/
│   └── <project-id>/
│       ├── raw/
│       ├── processed/
│       ├── screenshots/
│       ├── thumbnails/
│       └── exports/
├── logs/
└── cache/
```

The user can optionally choose project-local storage later.

---

# 8. Database Schema

## projects

```sql
CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    path TEXT NOT NULL UNIQUE,
    executable_path TEXT,
    launch_command TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    auto_record INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
```

## sessions

```sql
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    status TEXT NOT NULL,
    trigger TEXT NOT NULL,
    duration_ms INTEGER,
    raw_video_path TEXT,
    FOREIGN KEY(project_id) REFERENCES projects(id)
);
```

Possible status values:

```text
recording
processing
complete
failed
cancelled
```

Possible triggers:

```text
manual
process_launch
hotkey
scheduled
```

## assets

```sql
CREATE TABLE assets (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    type TEXT NOT NULL,
    path TEXT NOT NULL,
    duration_ms INTEGER,
    width INTEGER,
    height INTEGER,
    file_size_bytes INTEGER,
    created_at TEXT NOT NULL,
    FOREIGN KEY(session_id) REFERENCES sessions(id),
    FOREIGN KEY(project_id) REFERENCES projects(id)
);
```

Asset types:

```text
raw_video
demo_video
highlight
screenshot
thumbnail
gif
export
```

## settings

```sql
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
```

---

# 9. Core Domain Objects

```ts
interface Project {
  id: string;
  name: string;
  path: string;
  executablePath?: string;
  launchCommand?: string;
  enabled: boolean;
  autoRecord: boolean;
}

interface RecordingSession {
  id: string;
  projectId: string;
  startedAt: string;
  endedAt?: string;
  status: SessionStatus;
  trigger: SessionTrigger;
  rawVideoPath?: string;
}

interface MediaAsset {
  id: string;
  sessionId: string;
  projectId: string;
  type: AssetType;
  path: string;
  durationMs?: number;
}
```

---

# 10. IPC API

Electron renderer must not access Node APIs directly.

Expose a typed API through preload.

Example:

```ts
window.portfolio.projects.list()

window.portfolio.projects.create(input)

window.portfolio.sessions.start(projectId)

window.portfolio.sessions.stop(sessionId)

window.portfolio.sessions.list(projectId)

window.portfolio.recordings.get(id)

window.portfolio.recordings.process(id)

window.portfolio.assets.list(projectId)

window.portfolio.settings.get()

window.portfolio.settings.update(input)
```

Events:

```ts
portfolio.recording.started
portfolio.recording.stopped
portfolio.recording.progress
portfolio.processing.started
portfolio.processing.progress
portfolio.processing.completed
portfolio.processing.failed
portfolio.project.detected
```

---

# 11. Process Detection

A project can define:

```text
Project
├── Root path
├── Executable
├── Process name
└── Optional launch command
```

Example:

```text
FinSight
Path:
C:\Projects\FinSight

Executable:
FinSight.exe

Process:
FinSight.exe
```

For web applications, support:

```text
Project:
Workflow Toolkit

Launch command:
npm run dev

Detection:
localhost:5173
```

Browser capture is more difficult and should be a later feature.

MVP should favor desktop applications and manually mapped browser windows.

---

# 12. Recording Lifecycle

```text
IDLE
  │
  ├── manual start
  └── detected launch
          │
          ▼
      STARTING
          │
          ▼
      RECORDING
          │
          ├── user active
          ├── inactivity timeout
          ├── max duration
          ├── process exit
          └── manual stop
                  │
                  ▼
              FINALIZING
                  │
                  ▼
              PROCESSING
                  │
                  ▼
              COMPLETE
```

Failure path:

```text
ANY STATE
    ↓
ERROR
    ↓
retain raw artifacts
    ↓
log failure
    ↓
allow retry
```

---

# 13. Lightweight Capture Strategy

Do not run expensive AI analysis continuously.

During recording, collect only cheap signals:

- video frames
- timestamp
- process state
- active window
- mouse movement/click events where permitted
- keyboard activity signal without storing typed content
- window changes

Never store raw keystrokes.

Interaction data should be event categories only:

```text
mouse_click
mouse_move
window_change
application_change
idle_start
idle_end
```

---

# 14. Privacy / Safety Architecture

Because the application records screens, privacy is a first-class requirement.

Default behavior:

- Local-only.
- No cloud uploads.
- No account.
- No telemetry by default.
- No raw keyboard capture.
- Recording indicator always visible.
- Configurable exclusion list.
- Pause hotkey.
- Stop hotkey.
- Optional capture-region selection.
- Clear storage controls.

Possible exclusions:

```text
Password managers
Banking applications
Email
Messaging applications
Browser private windows
```

Future native implementation should support application/window exclusion where possible.

---

# 15. Processing Pipeline

Raw recording:

```text
capture.mp4
```

Processing:

```text
capture.mp4
    │
    ├── inspect
    │
    ├── generate thumbnail
    │
    ├── detect idle sections
    │
    ├── trim
    │
    ├── extract screenshots
    │
    └── create demo.mp4
```

MVP processing should primarily use FFmpeg.

---

# 16. Highlight Detection

Do not start with an LLM.

Use deterministic heuristics:

### Candidate signals

- Mouse click clusters
- Window changes
- Large visual frame changes
- Long idle periods
- Session beginning/end
- Navigation changes
- User-defined markers

Example score:

```text
highlight_score =
    interaction_density * 0.35
  + visual_change * 0.30
  + window_change * 0.20
  + marker * 0.15
```

Later replace or supplement this with computer vision / multimodal models.

---

# 17. Screenshot Generation

Potential strategies:

### Strategy A — Fixed interval

Capture one frame every N seconds.

### Strategy B — Scene change

Capture around significant visual changes.

### Strategy C — Interaction peaks

Capture shortly after meaningful interaction.

MVP:

**Fixed interval + scene-change refinement.**

---

# 18. Portfolio Metadata

Each project can eventually contain:

```json
{
  "name": "Workflow Toolkit",
  "description": "",
  "techStack": [
    "Electron",
    "React",
    "TypeScript",
    "FastAPI",
    "SQLite"
  ],
  "features": [],
  "screenshots": [],
  "demoVideo": "",
  "github": "",
  "createdAt": "",
  "updatedAt": ""
}
```

Git metadata can later populate:

- repository
- branch
- latest commit
- commit count
- language
- contributors
- README
- package metadata

---

# 19. UI Architecture

## Dashboard

```text
┌─────────────────────────────────────────────┐
│ Portfolio Auto Recorder              ●      │
├──────────────┬──────────────────────────────┤
│ Projects     │ Recent Activity              │
│              │                              │
│ FinSight     │ FinSight — 12 min ago        │
│ Nexus        │ Workflow Toolkit — 1h ago   │
│ Workflow     │ Nexus — yesterday            │
│              │                              │
│ + Add        │ [View Portfolio]             │
└──────────────┴──────────────────────────────┘
```

## Project Page

```text
Project
──────────────────────────────

Workflow Toolkit

[▶ Open] [● Record]

Latest Demo
┌─────────────────────────────┐
│                             │
│        VIDEO PREVIEW        │
│                             │
└─────────────────────────────┘

Screenshots

[ img ] [ img ] [ img ] [ img ]

Sessions
──────────────────────────────
Today       14:23      7m
Yesterday   18:02      12m
```

## Recording Indicator

Tray / floating indicator:

```text
● REC  00:04:21
Workflow Toolkit
```

Keep it intentionally unobtrusive but impossible to mistake.

---

# 20. Configuration

```text
General
├── Storage location
├── Auto-start
├── Start with Windows
└── Hotkeys

Recording
├── Resolution
├── FPS
├── Quality
├── Audio
├── Max session duration
└── Idle timeout

Automation
├── Auto-record launches
├── Screenshot extraction
├── Auto-trim
└── Highlight generation

Privacy
├── Excluded applications
├── Excluded windows
├── Pause recording on lock
└── Delete raw recordings after processing
```

---

# 21. Audio

MVP should make audio optional.

Possible sources:

- system audio
- microphone
- both
- none

Default:

**No microphone recording.**

Portfolio demos generally do not need microphone audio, and omitting it reduces privacy concerns and complexity.

---

# 22. Performance Targets

Target idle overhead:

- CPU: <1–2%
- RAM: <150 MB
- GPU: negligible
- Disk: negligible

Recording overhead target:

- CPU: <5–10% under normal 1080p recording
- configurable FPS
- configurable quality

These are targets, not guarantees; actual results depend heavily on capture backend and hardware.

---

# 23. File Naming

Readable and deterministic:

```text
2026-08-28_13-24-12_workflow-toolkit_session.mp4
```

Assets:

```text
raw/
2026-08-28_13-24-12.mp4

processed/
demo.mp4

screenshots/
shot-001.png
shot-002.png

thumbnails/
thumb.png
```

---

# 24. Logging

Use structured logs.

```text
INFO  process detected
INFO  session started
INFO  capture started
INFO  session stopped
INFO  processing started
INFO  screenshot generated
INFO  processing complete
ERROR ffmpeg failed
```

Log levels:

```text
debug
info
warn
error
```

Never log:

- screen contents
- typed text
- passwords
- file contents unnecessarily

---

# 25. Error Handling

Recording must be resilient.

If processing fails:

```text
raw recording remains available
       ↓
error recorded
       ↓
retry processing
```

If application crashes:

```text
recording watchdog
       ↓
detect process exit
       ↓
finalize recording
```

If disk space becomes low:

```text
warning
    ↓
pause/stop recording
    ↓
preserve current file
```

---

# 26. Security

Electron security requirements:

- `contextIsolation: true`
- `nodeIntegration: false`
- preload bridge only
- validate IPC inputs
- avoid arbitrary shell execution from renderer
- sanitize file paths
- whitelist FFmpeg arguments
- avoid exposing filesystem APIs directly
- restrict renderer navigation

Any launch-command functionality must be treated as privileged.

---

# 27. Testing Architecture

## Unit

- session state machine
- project repository
- asset repository
- filename generation
- settings
- highlight scoring
- idle detection

## Integration

- FFmpeg processing
- process detection
- capture provider
- SQLite migrations
- session lifecycle

## E2E

```text
launch application
    ↓
detect test process
    ↓
start capture
    ↓
interact
    ↓
terminate process
    ↓
verify recording
    ↓
verify database
    ↓
verify assets
```

---

# 28. Future AI Layer

The architecture should eventually support:

```text
AI Analysis Service

Input:
- screenshots
- video frames
- interaction events
- Git diff
- README
- package metadata

Output:
- feature candidates
- important moments
- demo structure
- project description
- portfolio copy
- screenshot captions
```

Possible local models:

- Ollama-compatible vision model
- local embedding model
- lightweight image classifier

AI should remain an optional module.

---

# 29. Future Portfolio Export

Potential exports:

```text
/project-export/
├── demo.mp4
├── screenshots/
├── project.json
├── README.md
└── portfolio.html
```

Eventually:

```text
Portfolio
    ↓
Select Projects
    ↓
Generate
    ↓
Static portfolio site
```

---

# 30. Architectural Principles

1. Local-first.
2. Capture before intelligence.
3. Raw media is never destroyed accidentally.
4. SQLite stores metadata, not video.
5. FFmpeg performs media work.
6. Renderer never gets unrestricted OS access.
7. Capture providers are replaceable.
8. AI is optional.
9. Privacy is explicit.
10. Every long-running operation must be recoverable.
11. Every automated recording must be visibly indicated.
12. Start simple and add intelligence incrementally.
