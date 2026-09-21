import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "events";
import { SmartTrimmerImpl, type ExecFn } from "../../apps/desktop/electron/services/smart-trimmer.js";
import type { FFmpegService, IdleSegment, MediaInfo } from "../../packages/shared/types/index.js";
import { mkdirSync, rmSync } from "fs";
import { join } from "path";

function createMockProcess(stdout = "", stderr = "", exitCode = 0): ReturnType<ExecFn> & { _emitter: EventEmitter } {
  const emitter = new EventEmitter();
  const proc = Object.assign(emitter, {
    kill: vi.fn(),
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    pid: 1234,
    _emitter: emitter,
  });

  setTimeout(() => {
    if (stdout) proc.stdout.emit("data", Buffer.from(stdout));
    if (stderr) proc.stderr.emit("data", Buffer.from(stderr));
    proc.emit("close", exitCode);
  }, 0);

  return proc as unknown as ReturnType<ExecFn> & { _emitter: EventEmitter };
}

function createFailingProcess(message = "ENOENT"): ReturnType<ExecFn> & { _emitter: EventEmitter } {
  const emitter = new EventEmitter();
  const proc = Object.assign(emitter, {
    kill: vi.fn(),
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    pid: 1234,
    _emitter: emitter,
  });

  setTimeout(() => {
    proc.emit("error", new Error(message));
  }, 0);

  return proc as unknown as ReturnType<ExecFn> & { _emitter: EventEmitter };
}

function createMockFfmpegService(durationMs = 60_000, outputDurationMs?: number): FFmpegService {
  let callCount = 0;
  return {
    probe: vi.fn().mockImplementation(() => {
      const isOutput = callCount++ > 0 && outputDurationMs !== undefined;
      return Promise.resolve({
        width: 1920,
        height: 1080,
        durationMs: isOutput ? outputDurationMs! : durationMs,
        codec: "h264",
        fps: 30,
        bitrate: 5_000_000,
      } as MediaInfo);
    }),
    thumbnail: vi.fn().mockResolvedValue(Buffer.from("fake-png")),
    extractFrame: vi.fn().mockResolvedValue(Buffer.from("fake-frame")),
    transcode: vi.fn().mockResolvedValue({ outputPath: "/tmp/out.mp4" }),
  };
}

function freshProcess(): ReturnType<ExecFn> {
  return createMockProcess() as unknown as ReturnType<ExecFn>;
}

const INPUT_DIR = join(import.meta.dirname, "..", "_trim_test_tmp");

beforeEach(() => {
  mkdirSync(INPUT_DIR, { recursive: true });
});

afterEach(() => {
  try { rmSync(INPUT_DIR, { recursive: true, force: true }); } catch { /* ignore */ }
});

describe("SmartTrimmerImpl", () => {
  describe("trim", () => {
    it("throws when no active segments exist (entire recording idle)", async () => {
      const ffmpegService = createMockFfmpegService(60_000);
      const execFn = vi.fn().mockImplementation(() => freshProcess());
      const trimmer = new SmartTrimmerImpl(ffmpegService, { minIdleDurationMs: 1000 }, execFn);

      const timeline: IdleSegment[] = [
        { startMs: 0, endMs: 60_000, idle: true },
      ];

      await expect(trimmer.trim("input.mp4", INPUT_DIR, timeline))
        .rejects.toThrow("No active segments to trim — entire recording is idle");
    });

    it("throws when nothing to trim (no significant idle segments)", async () => {
      const ffmpegService = createMockFfmpegService(60_000);
      const execFn = vi.fn().mockImplementation(() => freshProcess());
      const trimmer = new SmartTrimmerImpl(ffmpegService, { minIdleDurationMs: 5000 }, execFn);

      const timeline: IdleSegment[] = [
        { startMs: 0, endMs: 30_000, idle: false },
        { startMs: 30_000, endMs: 32_000, idle: true },
        { startMs: 32_000, endMs: 60_000, idle: false },
      ];

      await expect(trimmer.trim("input.mp4", INPUT_DIR, timeline))
        .rejects.toThrow("No idle segments detected — nothing to trim");
    });

    it("trims video by removing idle segments", async () => {
      const ffmpegService = createMockFfmpegService(60_000, 40_000);
      const execFn = vi.fn().mockImplementation(() => freshProcess());
      const trimmer = new SmartTrimmerImpl(ffmpegService, { minIdleDurationMs: 5000 }, execFn);

      const timeline: IdleSegment[] = [
        { startMs: 0, endMs: 10_000, idle: false },
        { startMs: 10_000, endMs: 20_000, idle: true },
        { startMs: 20_000, endMs: 50_000, idle: false },
        { startMs: 50_000, endMs: 60_000, idle: true },
      ];

      const result = await trimmer.trim("input.mp4", INPUT_DIR, timeline);

      expect(result.outputPath).toBe(join(INPUT_DIR, "trimmed.mp4"));
      expect(result.durationBeforeMs).toBe(60_000);
      expect(result.durationAfterMs).toBe(40_000);
      expect(result.removedMs).toBe(20_000);
      expect(result.removedPercent).toBe(33);
      expect(result.segmentsRemoved).toBe(2);
    });

    it("extracts segments and concatenates them", async () => {
      const ffmpegService = createMockFfmpegService(60_000);
      const calls: [string, string[]][] = [];
      const execFn = vi.fn().mockImplementation((command: string, args: string[]) => {
        calls.push([command, args]);
        return freshProcess();
      });
      const trimmer = new SmartTrimmerImpl(ffmpegService, { minIdleDurationMs: 5000 }, execFn);

      const timeline: IdleSegment[] = [
        { startMs: 0, endMs: 10_000, idle: false },
        { startMs: 10_000, endMs: 20_000, idle: true },
        { startMs: 20_000, endMs: 60_000, idle: false },
      ];

      await trimmer.trim("input.mp4", INPUT_DIR, timeline);

      const segmentCalls = calls.filter((c) => c[1].includes("-ss"));
      const concatCalls = calls.filter((c) => c[1].includes("concat"));

      expect(segmentCalls.length).toBe(2);
      expect(concatCalls.length).toBe(1);
      expect(concatCalls[0][1][concatCalls[0][1].indexOf("-f") + 1]).toBe("concat");
    });

    it("uses custom config override", async () => {
      const ffmpegService = createMockFfmpegService(60_000);
      const execFn = vi.fn().mockImplementation(() => freshProcess());
      const trimmer = new SmartTrimmerImpl(ffmpegService, { minIdleDurationMs: 5000 }, execFn);

      const timeline: IdleSegment[] = [
        { startMs: 0, endMs: 10_000, idle: false },
        { startMs: 10_000, endMs: 20_000, idle: true },
        { startMs: 20_000, endMs: 60_000, idle: false },
      ];

      const result = await trimmer.trim("input.mp4", INPUT_DIR, timeline, {
        outputFilename: "custom.mp4",
      });

      expect(result.outputPath).toBe(join(INPUT_DIR, "custom.mp4"));
    });

    it("reports correct segment count after merging close idle segments", async () => {
      const ffmpegService = createMockFfmpegService(60_000, 40_000);
      const execFn = vi.fn().mockImplementation(() => freshProcess());
      const trimmer = new SmartTrimmerImpl(ffmpegService, { minIdleDurationMs: 5000, mergeGapMs: 1000 }, execFn);

      const timeline: IdleSegment[] = [
        { startMs: 0, endMs: 10_000, idle: false },
        { startMs: 10_000, endMs: 20_000, idle: true },
        { startMs: 20_500, endMs: 30_000, idle: true },
        { startMs: 30_000, endMs: 60_000, idle: false },
      ];

      const result = await trimmer.trim("input.mp4", INPUT_DIR, timeline);

      expect(result.segmentsRemoved).toBe(2);
      expect(result.removedMs).toBe(20_000);
    });

    it("propagates ffmpeg errors during extraction", async () => {
      const ffmpegService = createMockFfmpegService(60_000);
      const execFn = vi.fn()
        .mockReturnValueOnce(createMockProcess("", "", 1))
        .mockImplementation(() => freshProcess());
      const trimmer = new SmartTrimmerImpl(ffmpegService, { minIdleDurationMs: 5000 }, execFn);

      const timeline: IdleSegment[] = [
        { startMs: 0, endMs: 10_000, idle: false },
        { startMs: 10_000, endMs: 20_000, idle: true },
        { startMs: 20_000, endMs: 60_000, idle: false },
      ];

      await expect(trimmer.trim("input.mp4", INPUT_DIR, timeline))
        .rejects.toThrow();
    });

    it("propagates probe failures", async () => {
      const ffmpegService = createMockFfmpegService(60_000);
      (ffmpegService.probe as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("probe failed"));
      const execFn = vi.fn().mockImplementation(() => freshProcess());
      const trimmer = new SmartTrimmerImpl(ffmpegService, {}, execFn);

      await expect(trimmer.trim("input.mp4", INPUT_DIR, []))
        .rejects.toThrow("probe failed");
    });
  });

  describe("computeActiveSegments", () => {
    it("returns full duration when no significant idle", () => {
      const trimmer = new SmartTrimmerImpl(createMockFfmpegService(), { minIdleDurationMs: 5000 });

      const timeline: IdleSegment[] = [
        { startMs: 0, endMs: 60_000, idle: false },
      ];

      const active = trimmer.computeActiveSegments(timeline, 60_000);
      expect(active).toEqual([{ startMs: 0, endMs: 60_000 }]);
    });

    it("splits around idle segment in the middle", () => {
      const trimmer = new SmartTrimmerImpl(createMockFfmpegService(), { minIdleDurationMs: 5000 });

      const timeline: IdleSegment[] = [
        { startMs: 0, endMs: 10_000, idle: false },
        { startMs: 10_000, endMs: 20_000, idle: true },
        { startMs: 20_000, endMs: 60_000, idle: false },
      ];

      const active = trimmer.computeActiveSegments(timeline, 60_000);
      expect(active).toEqual([
        { startMs: 0, endMs: 10_000 },
        { startMs: 20_000, endMs: 60_000 },
      ]);
    });

    it("removes idle at start", () => {
      const trimmer = new SmartTrimmerImpl(createMockFfmpegService(), { minIdleDurationMs: 5000 });

      const timeline: IdleSegment[] = [
        { startMs: 0, endMs: 10_000, idle: true },
        { startMs: 10_000, endMs: 60_000, idle: false },
      ];

      const active = trimmer.computeActiveSegments(timeline, 60_000);
      expect(active).toEqual([{ startMs: 10_000, endMs: 60_000 }]);
    });

    it("removes idle at end", () => {
      const trimmer = new SmartTrimmerImpl(createMockFfmpegService(), { minIdleDurationMs: 5000 });

      const timeline: IdleSegment[] = [
        { startMs: 0, endMs: 40_000, idle: false },
        { startMs: 40_000, endMs: 60_000, idle: true },
      ];

      const active = trimmer.computeActiveSegments(timeline, 60_000);
      expect(active).toEqual([{ startMs: 0, endMs: 40_000 }]);
    });

    it("ignores idle segments shorter than minIdleDurationMs", () => {
      const trimmer = new SmartTrimmerImpl(createMockFfmpegService(), { minIdleDurationMs: 5000 });

      const timeline: IdleSegment[] = [
        { startMs: 0, endMs: 10_000, idle: false },
        { startMs: 10_000, endMs: 12_000, idle: true },
        { startMs: 12_000, endMs: 60_000, idle: false },
      ];

      const active = trimmer.computeActiveSegments(timeline, 60_000);
      expect(active).toEqual([{ startMs: 0, endMs: 60_000 }]);
    });

    it("merges idle segments within mergeGapMs", () => {
      const trimmer = new SmartTrimmerImpl(createMockFfmpegService(), {
        minIdleDurationMs: 5000,
        mergeGapMs: 1000,
      });

      const timeline: IdleSegment[] = [
        { startMs: 0, endMs: 10_000, idle: false },
        { startMs: 10_000, endMs: 20_000, idle: true },
        { startMs: 20_500, endMs: 30_000, idle: true },
        { startMs: 30_000, endMs: 60_000, idle: false },
      ];

      const active = trimmer.computeActiveSegments(timeline, 60_000);
      expect(active).toEqual([
        { startMs: 0, endMs: 10_000 },
        { startMs: 30_000, endMs: 60_000 },
      ]);
    });

    it("does not merge idle segments beyond mergeGapMs", () => {
      const trimmer = new SmartTrimmerImpl(createMockFfmpegService(), {
        minIdleDurationMs: 5000,
        mergeGapMs: 500,
      });

      const timeline: IdleSegment[] = [
        { startMs: 0, endMs: 10_000, idle: false },
        { startMs: 10_000, endMs: 20_000, idle: true },
        { startMs: 22_000, endMs: 32_000, idle: true },
        { startMs: 32_000, endMs: 60_000, idle: false },
      ];

      const active = trimmer.computeActiveSegments(timeline, 60_000);
      expect(active).toEqual([
        { startMs: 0, endMs: 10_000 },
        { startMs: 20_000, endMs: 22_000 },
        { startMs: 32_000, endMs: 60_000 },
      ]);
    });

    it("handles all idle timeline", () => {
      const trimmer = new SmartTrimmerImpl(createMockFfmpegService(), { minIdleDurationMs: 5000 });

      const timeline: IdleSegment[] = [
        { startMs: 0, endMs: 30_000, idle: true },
        { startMs: 30_000, endMs: 60_000, idle: true },
      ];

      const active = trimmer.computeActiveSegments(timeline, 60_000);
      expect(active).toEqual([]);
    });

    it("handles empty timeline", () => {
      const trimmer = new SmartTrimmerImpl(createMockFfmpegService(), { minIdleDurationMs: 5000 });

      const active = trimmer.computeActiveSegments([], 60_000);
      expect(active).toEqual([{ startMs: 0, endMs: 60_000 }]);
    });
  });

  describe("trimEdgesFocus", () => {
    const focusOf = (title: string, exePath: string | null, startMs: number, endMs: number) => ({
      title,
      exePath,
      startMs,
      endMs,
    });

    it("cuts lead-in and tail around target-foreground bounds", async () => {
      const execFn = vi.fn(() => freshProcess());
      const trimmer = new SmartTrimmerImpl(createMockFfmpegService(60_000), {}, execFn);
      const focus = [
        focusOf("Portfolio Auto Recorder", "C:\\app\\rec.exe", 0, 4000),
        focusOf("My App", "C:\\app\\myapp.exe", 4000, 50000),
        focusOf("Portfolio Auto Recorder", "C:\\app\\rec.exe", 50000, 56000),
      ];

      const out = await trimmer.trimEdgesFocus(
        "/rec/raw.mp4",
        "/rec/edged.mp4",
        focus,
        { exePath: "C:\\app\\myapp.exe" },
        { edgePaddingMs: 1000 },
      );

      expect(out).toBe("/rec/edged.mp4");
      const args = (execFn.mock.calls[0][1] ?? execFn.mock.calls[0][0]) as string[];
      const flat = Array.isArray(args) ? args.join(" ") : String(execFn.mock.calls[0]);
      expect(flat).toContain("-ss");
      expect(flat).toContain("3");
      expect(flat).toContain("48");
    });

    it("matches by window title when no exe is configured", async () => {
      const execFn = vi.fn(() => freshProcess());
      const trimmer = new SmartTrimmerImpl(createMockFfmpegService(60_000), {}, execFn);
      const focus = [
        focusOf("Portfolio Auto Recorder", null, 0, 2000),
        focusOf("My App — Dashboard", null, 2000, 58000),
      ];

      const out = await trimmer.trimEdgesFocus("/rec/raw.mp4", "/rec/edged.mp4", focus, {
        windowTitle: "my app",
      });

      expect(out).toBe("/rec/edged.mp4");
    });

    it("returns null when the target never has focus", async () => {
      const execFn = vi.fn(() => freshProcess());
      const trimmer = new SmartTrimmerImpl(createMockFfmpegService(60_000), {}, execFn);
      const focus = [focusOf("Other", null, 0, 60000)];

      const out = await trimmer.trimEdgesFocus("/rec/raw.mp4", "/rec/edged.mp4", focus, {
        exePath: "C:\\app\\myapp.exe",
      });

      expect(out).toBeNull();
      expect(execFn).not.toHaveBeenCalled();
    });

    it("returns null when there is nothing worth cutting", async () => {
      const execFn = vi.fn(() => freshProcess());
      const trimmer = new SmartTrimmerImpl(createMockFfmpegService(60_000), {}, execFn);
      const focus = [focusOf("My App", "C:\\app\\myapp.exe", 0, 60000)];

      const out = await trimmer.trimEdgesFocus("/rec/raw.mp4", "/rec/edged.mp4", focus, {
        exePath: "C:\\app\\myapp.exe",
      });

      expect(out).toBeNull();
      expect(execFn).not.toHaveBeenCalled();
    });

    it("returns null when the result would be too short", async () => {
      const execFn = vi.fn(() => freshProcess());
      const trimmer = new SmartTrimmerImpl(createMockFfmpegService(10_000), {}, execFn);
      const focus = [
        focusOf("Other", null, 0, 9000),
        focusOf("My App", null, 9000, 9500),
      ];

      const out = await trimmer.trimEdgesFocus(
        "/rec/raw.mp4",
        "/rec/edged.mp4",
        focus,
        { windowTitle: "My App" },
        { edgePaddingMs: 100, minResultMs: 2000 },
      );

      expect(out).toBeNull();
      expect(execFn).not.toHaveBeenCalled();
    });

    it("propagates ffmpeg failures", async () => {
      const execFn = vi.fn(() => createFailingProcess("boom") as unknown as ReturnType<ExecFn>);
      const trimmer = new SmartTrimmerImpl(createMockFfmpegService(60_000), {}, execFn);
      const focus = [
        focusOf("Other", null, 0, 5000),
        focusOf("My App", null, 5000, 55000),
      ];

      await expect(
        trimmer.trimEdgesFocus("/rec/raw.mp4", "/rec/edged.mp4", focus, { windowTitle: "My App" }),
      ).rejects.toThrow("boom");
    });
  });
});
