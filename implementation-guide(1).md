# Portfolio Auto Recorder — Implementation Guide

**Status:** Baseline Implementation Guide v0.1

---

# 1. Implementation Strategy

Build vertically rather than implementing every subsystem independently.

The first useful milestone is:

> Configure a project → launch its app → automatically record it → stop when it closes → produce an MP4.

Everything else builds on that loop.

Recommended implementation order:

```text
Project Model
    ↓
Database
    ↓
Electron Shell
    ↓
Process Detection
    ↓
Session Manager
    ↓
Capture Adapter
    ↓
FFmpeg Processor
    ↓
Asset Library
    ↓
UI Polish
    ↓
Smart Processing
```

---

# 2. Development Environment

Recommended:

- Windows 11
- Node.js LTS
- npm
- TypeScript
- React
- Vite
- Electron
- electron-builder
- SQLite
- better-sqlite3
- FFmpeg
- Vitest
- Playwright

Optional later:

- Python
- OpenCV
- Ollama

---

# 3. Project Bootstrap

Create:

```text
portfolio-auto-recorder/
```

Initialize:

```bash
npm init -y
```

Install core dependencies:

```bash
npm install electron react react-dom better-sqlite3
npm install zod
```

Development dependencies:

```bash
npm install -D typescript vite @vitejs/plugin-react
npm install -D electron-builder
npm install -D vitest playwright
npm install -D @types/node @types/react @types/react-dom
```

The exact package versions should be pinned once the baseline build is established.

---

# 4. Electron Configuration

Electron main process responsibilities:

```text
create window
register IPC
initialize database
initialize services
initialize tray
initialize process monitor
initialize capture manager
```

Do not put business logic directly into `main.ts`.

Example:

```text
main.ts
   ↓
ApplicationContainer
   ├── Database
   ├── ProjectService
   ├── SessionService
   ├── ProcessMonitor
   ├── CaptureManager
   └── MediaProcessor
```

---

# 5. Preload Bridge

Expose only approved methods.

Example:

```ts
contextBridge.exposeInMainWorld("portfolio", {
  projects: {
    list: () => ipcRenderer.invoke("projects:list"),
    create: (input) => ipcRenderer.invoke("projects:create", input),
  },

  sessions: {
    start: (projectId) =>
      ipcRenderer.invoke("sessions:start", projectId),

    stop: (sessionId) =>
      ipcRenderer.invoke("sessions:stop", sessionId),

    list: (projectId) =>
      ipcRenderer.invoke("sessions:list", projectId),
  }
});
```

Never expose:

```ts
ipcRenderer
fs
child_process
shell
```

directly to React.

---

# 6. Database Setup

Create migrations immediately.

Initial migration:

```text
001_initial.sql
```

Tables:

```text
projects
sessions
assets
settings
```

Add indexes:

```sql
CREATE INDEX idx_sessions_project
ON sessions(project_id);

CREATE INDEX idx_assets_project
ON assets(project_id);

CREATE INDEX idx_sessions_started_at
ON sessions(started_at);
```

Use repositories:

```text
ProjectRepository
SessionRepository
AssetRepository
SettingsRepository
```

Services should not contain raw SQL where avoidable.

---

# 7. Project Service

Responsibilities:

- create project
- update project
- delete project
- enable/disable project
- resolve executable
- validate project path

API:

```ts
createProject(input)
getProject(id)
listProjects()
updateProject(id, input)
deleteProject(id)
```

Validation:

```text
path exists
path is directory
name is non-empty
executable exists if configured
```

---

# 8. Project Onboarding

MVP UI:

```text
Add Project

Project Name
[________________]

Project Folder
[ Browse ]

Executable
[ Browse ] optional

[✓] Automatically record

[Add Project]
```

Do not require executable configuration if the user wants manual recording.

---

# 9. Process Monitor

Create:

```text
ProcessMonitor
```

Interface:

```ts
interface ProcessMonitor {
  start(): Promise<void>;
  stop(): Promise<void>;
  onProcessStarted(
    callback: (process: DetectedProcess) => void
  ): void;
  onProcessStopped(
    callback: (process: DetectedProcess) => void
  ): void;
}
```

Poll initially if necessary.

Example conceptual flow:

```text
every 1 second
    ↓
get running processes
    ↓
compare with previous snapshot
    ↓
new process?
    ↓
resolve executable path
    ↓
match configured project
```

Optimize later with native event notifications.

---

# 10. Process Matching

Never match only by display name if a full executable path is available.

Preferred:

```text
configured executable path
        ↓
exact match
```

Fallback:

```text
process name
        ↓
match
```

Potential ambiguity should be shown to the user.

---

# 11. Session Manager

The Session Manager owns the recording state machine.

Example:

```ts
class SessionManager {
  async start(projectId: string, trigger: SessionTrigger) {}
  async stop(sessionId: string) {}
  async pause(sessionId: string) {}
  async resume(sessionId: string) {}
}
```

It should:

1. Create database session.
2. Create asset directories.
3. Start capture.
4. Update status.
5. Watch for errors.
6. Stop capture.
7. Finalize metadata.
8. Queue processing.

---

# 12. Session State Machine

Implement explicit states.

```ts
type SessionStatus =
  | "starting"
  | "recording"
  | "paused"
  | "finalizing"
  | "processing"
  | "complete"
  | "failed"
  | "cancelled";
```

Avoid scattered booleans such as:

```text
isRecording
isStopping
isProcessing
```

A single state machine is easier to reason about.

---

# 13. Capture Provider

Create an abstraction:

```ts
interface CaptureProvider {
  start(options: CaptureOptions): Promise<CaptureSession>;
  stop(sessionId: string): Promise<CaptureResult>;
}
```

Options:

```ts
interface CaptureOptions {
  outputPath: string;
  fps: number;
  width?: number;
  height?: number;
  audio: AudioMode;
  displayId?: string;
}
```

Do not hard-code the capture implementation into SessionManager.

---

# 14. Capture MVP

The first goal is not perfect quality.

Target:

```text
1080p
30 FPS
H.264
no microphone
optional system audio
```

If hardware encoding is available, use it where stable.

Potential encoders:

```text
h264_nvenc
h264_qsv
h264_amf
libx264
```

The application should detect encoder availability instead of assuming one exists.

---

# 15. FFmpeg Service

Create:

```ts
interface FFmpegService {
  probe(file: string): Promise<MediaInfo>;
  trim(input: string, output: string, start: number, end: number): Promise<void>;
  extractFrame(input: string, output: string, timestamp: number): Promise<void>;
  generateThumbnail(input: string, output: string): Promise<void>;
  transcode(input: string, output: string, options: TranscodeOptions): Promise<void>;
}
```

All FFmpeg operations must use argument arrays rather than interpolated shell strings.

---

# 16. Processing Queue

Do not process video synchronously in the Electron UI.

Create:

```text
ProcessingQueue
```

Flow:

```text
session finished
      ↓
queue processing job
      ↓
worker
      ↓
FFmpeg
      ↓
asset records
      ↓
complete
```

Initial queue can simply be an in-process FIFO.

Later:

- worker thread
- separate process
- persistent job table

---

# 17. Idle Detection

The first implementation can use interaction timestamps.

Record only:

```text
lastActivityAt
```

When:

```text
now - lastActivityAt > idleTimeout
```

then either:

### Option A

Pause recording.

### Option B

Mark segment as idle and continue recording.

Recommended:

**Continue recording but mark idle segments.**

This preserves data and allows post-processing.

---

# 18. Automatic Trimming

After recording:

```text
raw video
   ↓
activity timeline
   ↓
idle segments
   ↓
remove long idle periods
   ↓
demo video
```

Do not aggressively trim MVP recordings.

Use conservative rules.

Example:

```text
idle > 15 sec
    ↓
candidate for removal
```

Later allow:

```text
10 sec
15 sec
30 sec
60 sec
never
```

---

# 19. Screenshot Extraction

MVP:

```text
extract 3–8 screenshots per session
```

Selection:

1. Ignore first few seconds.
2. Ignore long idle sections.
3. Prefer high-change frames.
4. Avoid duplicate-looking frames.
5. Spread screenshots across the session.

Store:

```text
screenshots/shot-001.png
...
```

---

# 20. Recording Library

Project page should display:

```text
Recent Sessions

Date        Duration   Assets       Status
--------------------------------------------
Today       08:42      5            Complete
Today       02:13      2            Complete
Yesterday   14:21      7            Complete
```

Clicking a session opens:

```text
video
screenshots
metadata
processing status
```

---

# 21. Thumbnail Generation

Every video should have a thumbnail.

Preferred:

```text
10–30% into demo
```

rather than the first frame, because the first frame is often an empty loading state.

---

# 22. Export

Implement:

```ts
exportProject(projectId)
```

Output:

```text
ProjectName/
├── demo.mp4
├── screenshots/
├── metadata.json
└── README.md
```

Initially export only selected assets.

---

# 23. Git Integration

Later implementation:

```text
Project path
    ↓
detect .git
    ↓
read repository metadata
```

Capture:

- current branch
- commit SHA
- repository URL
- commit timestamp
- README
- package.json

Do not require Git for MVP.

---

# 24. Hotkeys

Global hotkeys:

```text
Ctrl + Shift + R
```

Toggle recording.

```text
Ctrl + Shift + P
```

Pause.

```text
Ctrl + Shift + S
```

Capture screenshot.

Make these configurable later.

---

# 25. Tray Application

After MVP:

```text
Tray
│
├── Recording: OFF
├── Start Recording
├── Pause
├── Projects
├── Open Dashboard
└── Settings
```

When recording:

```text
● Recording: Workflow Toolkit
00:04:32
```

---

# 26. Privacy Implementation

Recording indicator must be visible.

Before first automatic recording:

```text
This project is configured for automatic recording.

Recording will capture your selected display/window.
No recordings are uploaded.

[Continue]
```

Provide:

```text
Pause
Stop
Delete
Exclude
```

Do not capture keyboard text.

---

# 27. Testing

## Unit Tests

Write first:

```text
project matching
session state transitions
idle detection
filename generation
asset registration
settings
```

## Integration

Then:

```text
SQLite
FFmpeg
process detection
recording lifecycle
```

## E2E

Build a tiny test application:

```text
TestCaptureApp.exe
```

It should:

- open
- display changing content
- wait
- change screen
- exit

Automate:

```text
launch test app
→ detector finds it
→ recording starts
→ wait
→ test app exits
→ recording stops
→ output exists
```

---

# 28. Performance Testing

Measure:

```text
idle CPU
idle RAM
recording CPU
recording RAM
GPU
disk write rate
processing time
```

Record baseline results in:

```text
docs/performance.md
```

Test at:

```text
720p / 30 FPS
1080p / 30 FPS
1080p / 60 FPS
```

Do not make 4K a requirement.

---

# 29. Build / Packaging

Development:

```bash
npm run dev
```

Production:

```bash
npm run build
npm run dist
```

Packaging checklist:

```text
Electron main
React renderer
FFmpeg binaries
SQLite native module
icons
installer
```

Verify native dependencies are correctly rebuilt for the Electron version.

---

# 30. Implementation Rules

### Rule 1

Never make the UI responsible for recording logic.

### Rule 2

Never store videos in SQLite.

### Rule 3

Never expose Node APIs directly to the renderer.

### Rule 4

Never delete raw recordings automatically without an explicit setting.

### Rule 5

Every long operation reports progress.

### Rule 6

Every recording has a recoverable database record.

### Rule 7

FFmpeg commands must be deterministic and testable.

### Rule 8

Keep AI completely optional.

### Rule 9

Prefer local processing.

### Rule 10

Do not optimize prematurely; measure first.

---

# 31. Suggested First Vertical Slice

Implement exactly this:

```text
1. Electron launches
2. React dashboard appears
3. User adds project
4. Project stored in SQLite
5. User configures executable
6. Process monitor starts
7. Executable launches
8. Project is recognized
9. Recording starts
10. Recording indicator appears
11. Executable closes
12. Recording stops
13. Raw MP4 saved
14. FFmpeg generates thumbnail
15. Session appears in UI
16. User can play recording
```

Do not implement AI, Git integration, automatic highlights, portfolio-site generation, or advanced editing before this works reliably.

---

# 32. Definition of Done — MVP

The MVP is complete when:

- A user can add a project.
- A project can be mapped to an executable.
- The app detects the executable launching.
- Recording starts automatically.
- Recording visibly indicates active capture.
- Recording stops when the executable exits.
- Raw video is preserved.
- Video metadata is stored.
- Thumbnail is generated.
- Session appears in the project history.
- Video can be previewed.
- Failed processing does not destroy the raw recording.
- App can be packaged and installed on another Windows machine.
