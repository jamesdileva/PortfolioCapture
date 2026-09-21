import { describe, it, expect, vi, afterEach } from "vitest";
import {
  ForegroundTrackerImpl,
  buildForegroundScript,
  parseForegroundSnapshot,
} from "../../apps/desktop/electron/services/foreground-tracker.js";

describe("parseForegroundSnapshot", () => {
  it("parses title, pid, and exe", () => {
    const snap = parseForegroundSnapshot(
      JSON.stringify({ Title: "My App", Pid: 42, Exe: "C:\\app\\app.exe" }),
    );
    expect(snap).toEqual({ title: "My App", pid: 42, exePath: "C:\\app\\app.exe" });
  });

  it("returns null for empty titles", () => {
    expect(parseForegroundSnapshot(JSON.stringify({ Title: "  ", Pid: 1, Exe: null }))).toBeNull();
  });

  it("returns null for invalid JSON", () => {
    expect(parseForegroundSnapshot("not json")).toBeNull();
    expect(parseForegroundSnapshot("")).toBeNull();
  });

  it("treats missing exe as null", () => {
    const snap = parseForegroundSnapshot(JSON.stringify({ Title: "App", Pid: 7 }));
    expect(snap?.exePath).toBeNull();
  });
});

describe("buildForegroundScript", () => {
  it("avoids read-only automatic variables", () => {
    expect(buildForegroundScript()).not.toMatch(/\$pid\s*=/);
  });

  it("keeps here-strings intact for -File execution", () => {
    const script = buildForegroundScript();
    expect(script).toContain('@"');
    expect(script).toContain('"@');
    expect(script).toContain("GetForegroundWindow");
  });
});

describe("ForegroundTrackerImpl", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function jsonSnapshot(title: string, pid = 1, exe: string | null = null) {
    return JSON.stringify({ Title: title, Pid: pid, Exe: exe });
  }

  it("records segments across foreground changes", async () => {
    let now = 1000;
    const outputs = [
      jsonSnapshot("Portfolio Auto Recorder", 10, "C:\\app\\rec.exe"),
      jsonSnapshot("Portfolio Auto Recorder", 10, "C:\\app\\rec.exe"),
      jsonSnapshot("My App", 42, "C:\\app\\myapp.exe"),
      jsonSnapshot("My App", 42, "C:\\app\\myapp.exe"),
    ];
    let call = 0;
    const tracker = new ForegroundTrackerImpl(
      {},
      async () => outputs[Math.min(call++, outputs.length - 1)],
      () => now,
    );

    await tracker.check(); // t=1000, recorder foreground
    now = 2000;
    await tracker.check(); // same window, no new segment
    now = 3000;
    await tracker.check(); // switched to My App
    now = 4000;
    await tracker.check(); // same
    tracker.stop(); // finalize at t=4000

    expect(tracker.getSegments()).toEqual([
      { startMs: 1000, endMs: 3000, title: "Portfolio Auto Recorder", exePath: "C:\\app\\rec.exe" },
      { startMs: 3000, endMs: 4000, title: "My App", exePath: "C:\\app\\myapp.exe" },
    ]);
  });

  it("drops failed polls without segments", async () => {
    const tracker = new ForegroundTrackerImpl(
      {},
      async () => { throw new Error("ps broke"); },
      () => 1000,
    );
    await tracker.check();
    tracker.stop();
    expect(tracker.getSegments()).toEqual([]);
  });

  it("ignores empty snapshots", async () => {
    const tracker = new ForegroundTrackerImpl({}, async () => "", () => 1000);
    await tracker.check();
    tracker.stop();
    expect(tracker.getSegments()).toEqual([]);
  });

  it("start is idempotent and stop finalizes", async () => {
    vi.useFakeTimers();
    const tracker = new ForegroundTrackerImpl(
      { pollIntervalMs: 50 },
      async () => jsonSnapshot("App"),
      () => Date.now(),
    );
    tracker.start();
    tracker.start();
    await vi.advanceTimersByTimeAsync(120);
    tracker.stop();
    expect(tracker.getSegments().length).toBeGreaterThanOrEqual(1);
  });
});
