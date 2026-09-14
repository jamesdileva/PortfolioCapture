# Plan: GPU-capable App-Window Capture (Electron desktopCapturer)

## Problem

FFmpeg `gdigrab title=` scrapes windows through GDI, which cannot see
GPU-composited pixels. Chromium/WebView2/Electron/Unity windows record as
blank white (proven: WorldSim raw.mp4, 209 s, YAVG=235/255, valid container).
Desktop capture is unaffected (DWM path is readable).

## Approach (no native code)

On Windows, Chromium's own window capture already traverses the
DWM / Graphics-Capture stack — the same path Teams/Discord use. Use it:

- Main process: `desktopCapturer.getSources({ types: ["window"] })`, match by
  window title (same exact-then-contains rule as today).
- Hidden `BrowserWindow` (`show: false`, lazily created, reused, never the
  visible UI): `getUserMedia({ video: { mandatory: { chromeMediaSource:
  "desktop", chromeMediaSourceId } } })` + `MediaRecorder` → webm chunks.
- Chunks stream to main via IPC (1 s timeslices, appended incrementally —
  no giant single transfer, no unbounded renderer memory).
- At stop: FFmpeg remuxes/transcodes webm → h264 mp4 into the existing
  pipeline (`raw.mp4` shape unchanged: path, dimensions, duration).
- New `ElectronWindowCaptureProvider implements CaptureProvider` — same
  start/stop contract, so SessionManager only gains provider *selection*.

## Selection & fallback (window mode)

1. Electron window capture → 2. FFmpeg `title=` → 3. full desktop.
Every step logged; misses already surface via `capture-fallback` /
`capture-blank` markers and badges. Desktop capture stays on FFmpeg.

## Phases

- **A — Spike (this doc's gate):** standalone prototype vs Sentinel's
  Electron UI. GO only on: non-blank video (brightness), ~15–30 fps
  effective, sane CPU, settled webm→mp4 strategy. Kill → revisit WinRT.
- **B — Build:** provider, hidden-window lifecycle, chunked IPC, remux,
  selection + fallback wiring, preload/d.ts surface for the capture host.
- **C — Harden:** unit tests (injected Electron fakes), window E2E flipped
  to assert non-blank video, Test-capture + blank badge unchanged
  (backend-agnostic), full suite + dist, worklog, commit + push.

## Carried-over limits (not hidden)

- Minimized windows still capture blank → blank badge catches it.
- Cursor is captured too. Audio stays off for window captures.
- Windows-only path (app is Windows-only; macOS consent model differs).
- MediaRecorder webm has no duration metadata (Chromium quirk) — irrelevant,
  FFmpeg remux restamps.

## Status (2026-09-14): Phase B + C shipped

- Spike passed on WorldSim itself: YAVG 38 (vs 235 white via gdigrab),
  ~17.6 fps effective, webm→h264 remux verified.
- `ElectronWindowCaptureProvider` behind the `CaptureProvider` interface;
  hidden lazily-created capture window (`?capture=1` route, shared preload
  `captureHost` bridge, chunked webm + seq/lastSeq accounting, busy guard).
- Selection: window mode → Electron → FFmpeg-title → desktop, all logged.
- `WindowCaptureTester` now drives the provider (not raw FFmpeg).
- Window E2E fixture is WorldSim (Sentinel's Ollama GPU load adds noise);
  asserts playable stream + non-blank brightness.
- New files: `services/electron-capture-provider.ts`,
  `renderer/src/components/CaptureHost.tsx`; extended: preload, global.d.ts,
  main.tsx, main.ts, session-manager, window-capture-tester, ipc/windows.
