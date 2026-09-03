import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "events";
import { SceneDetectorImpl } from "../../apps/desktop/electron/services/scene-detector.js";
import type { ExecFn } from "../../apps/desktop/electron/services/scene-detector.js";

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

const SCENE_OUTPUT_3_SCENES = [
  "ffmpeg version 6.0",
  "[Parsed_showinfo_1 @ 0x00000200] n:   0 pts:0 pts_time:0       ...",
  "[Parsed_showinfo_1 @ 0x00000200] n:   1 pts:  45000 pts_time:1.5 ...",
  "[Parsed_showinfo_1 @ 0x00000200] n:   2 pts: 180000 pts_time:6.0 ...",
].join("\n");

const SCENE_OUTPUT_EMPTY = "ffmpeg version 6.0\n";

const SCENE_OUTPUT_CLOSE_TIMESTAMPS = [
  "ffmpeg version 6.0",
  "[Parsed_showinfo_1 @ 0x00000200] n:   0 pts:0 pts_time:2.0 ...",
  "[Parsed_showinfo_1 @ 0x00000200] n:   1 pts:  1500 pts_time:2.5 ...",
  "[Parsed_showinfo_1 @ 0x00000200] n:   2 pts:  60000 pts_time:6.0 ...",
].join("\n");

const SCENE_OUTPUT_CLOSE_HIGHER_SCORE_SECOND = [
  "ffmpeg version 6.0",
  "[Parsed_showinfo_1 @ 0x00000200] n:   0 pts:0 pts_time:2.0 ...",
  "[Parsed_showinfo_1 @ 0x00000200] n:   1 pts:  1500 pts_time:2.1 ...",
].join("\n");

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SceneDetectorImpl", () => {
  it("returns empty array when no scenes detected", async () => {
    const execFn = vi.fn(() => createMockProcess("", SCENE_OUTPUT_EMPTY));
    const detector = new SceneDetectorImpl("ffmpeg", execFn);

    const scenes = await detector.detect("input.mp4");

    expect(scenes).toEqual([]);
  });

  it("parses scene timestamps from ffmpeg stderr", async () => {
    const execFn = vi.fn(() => createMockProcess("", SCENE_OUTPUT_3_SCENES));
    const detector = new SceneDetectorImpl("ffmpeg", execFn);

    const scenes = await detector.detect("input.mp4");

    expect(scenes).toHaveLength(3);
    expect(scenes[0]).toEqual({ timestampMs: 0, score: 1.0 });
    expect(scenes[1]).toEqual({ timestampMs: 1500, score: 1.0 });
    expect(scenes[2]).toEqual({ timestampMs: 6000, score: 1.0 });
  });

  it("calls ffmpeg with correct scene detection filter", async () => {
    const execFn = vi.fn(() => createMockProcess("", SCENE_OUTPUT_EMPTY));
    const detector = new SceneDetectorImpl("ffmpeg", execFn);

    await detector.detect("input.mp4");

    expect(execFn).toHaveBeenCalledWith("ffmpeg", [
      "-i", "input.mp4",
      "-vf", "select='gt(scene,0.3)',showinfo",
      "-f", "null",
      "-",
    ]);
  });

  it("uses custom threshold in filter", async () => {
    const execFn = vi.fn(() => createMockProcess("", SCENE_OUTPUT_EMPTY));
    const detector = new SceneDetectorImpl("ffmpeg", execFn);

    await detector.detect("input.mp4", { threshold: 0.5 });

    const ffmpegCall = execFn.mock.calls[0];
    expect(ffmpegCall[1]).toContain("-vf");
    expect(ffmpegCall[1]).toContain("select='gt(scene,0.5)',showinfo");
  });

  it("merges scenes closer than minSceneGapMs", async () => {
    const execFn = vi.fn(() => createMockProcess("", SCENE_OUTPUT_CLOSE_TIMESTAMPS));
    const detector = new SceneDetectorImpl("ffmpeg", execFn);

    const scenes = await detector.detect("input.mp4");

    expect(scenes).toHaveLength(2);
    expect(scenes[0].timestampMs).toBe(2000);
    expect(scenes[1].timestampMs).toBe(6000);
  });

  it("keeps first scene when merging close scenes with equal scores", async () => {
    const execFn = vi.fn(() => createMockProcess("", SCENE_OUTPUT_CLOSE_HIGHER_SCORE_SECOND));
    const detector = new SceneDetectorImpl("ffmpeg", execFn);

    const scenes = await detector.detect("input.mp4", { minSceneGapMs: 5000 });

    expect(scenes).toHaveLength(1);
    expect(scenes[0].timestampMs).toBe(2000);
  });

  it("respects custom minSceneGapMs", async () => {
    const wideGapOutput = [
      "ffmpeg version 6.0",
      "[Parsed_showinfo_1 @ 0x00000200] n:   0 pts:0 pts_time:0 ...",
      "[Parsed_showinfo_1 @ 0x00000200] n:   1 pts:  45000 pts_time:1.5 ...",
      "[Parsed_showinfo_1 @ 0x00000200] n:   2 pts: 600000 pts_time:20.0 ...",
    ].join("\n");
    const execFn = vi.fn(() => createMockProcess("", wideGapOutput));
    const detector = new SceneDetectorImpl("ffmpeg", execFn);

    const scenes = await detector.detect("input.mp4", { minSceneGapMs: 10000 });

    expect(scenes).toHaveLength(2);
    expect(scenes[0].timestampMs).toBe(0);
    expect(scenes[1].timestampMs).toBe(20000);
  });

  it("throws on ffmpeg failure", async () => {
    const execFn = vi.fn(() => createFailingProcess("ENOENT"));
    const detector = new SceneDetectorImpl("ffmpeg", execFn);

    await expect(detector.detect("missing.mp4")).rejects.toThrow("Failed to run ffmpeg");
  });

  it("throws on non-zero exit code", async () => {
    const execFn = vi.fn(() => createMockProcess("", "invalid file", 1));
    const detector = new SceneDetectorImpl("ffmpeg", execFn);

    await expect(detector.detect("corrupt.mp4")).rejects.toThrow("exited with code 1");
  });

  it("ignores lines without pts_time", async () => {
    const stderr = [
      "ffmpeg version 6.0",
      "Input #0, mov,mp4,m4a,3gp from 'input.mp4':",
      "  Duration: 00:01:00.00",
      "Stream #0:0: Video: h264",
    ].join("\n");
    const execFn = vi.fn(() => createMockProcess("", stderr));
    const detector = new SceneDetectorImpl("ffmpeg", execFn);

    const scenes = await detector.detect("input.mp4");

    expect(scenes).toEqual([]);
  });

  it("uses custom ffmpeg path", async () => {
    const execFn = vi.fn(() => createMockProcess("", SCENE_OUTPUT_EMPTY));
    const detector = new SceneDetectorImpl("/usr/local/bin/ffmpeg", execFn);

    await detector.detect("input.mp4");

    expect(execFn).toHaveBeenCalledWith("/usr/local/bin/ffmpeg", expect.any(Array));
  });

  it("handles single scene detected", async () => {
    const stderr = "[Parsed_showinfo_1 @ 0x00000200] n:   0 pts:0 pts_time:3.5 ...\n";
    const execFn = vi.fn(() => createMockProcess("", stderr));
    const detector = new SceneDetectorImpl("ffmpeg", execFn);

    const scenes = await detector.detect("input.mp4");

    expect(scenes).toHaveLength(1);
    expect(scenes[0]).toEqual({ timestampMs: 3500, score: 1.0 });
  });

  it("handles fractional timestamps", async () => {
    const stderr = "[Parsed_showinfo_1 @ 0x00000200] n:   0 pts:0 pts_time:1.234567 ...\n";
    const execFn = vi.fn(() => createMockProcess("", stderr));
    const detector = new SceneDetectorImpl("ffmpeg", execFn);

    const scenes = await detector.detect("input.mp4");

    expect(scenes[0].timestampMs).toBe(1235);
  });
});
