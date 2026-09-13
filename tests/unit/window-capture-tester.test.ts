import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "events";
import {
  WindowCaptureTester,
  sampleVideoBrightness,
  BLANK_BRIGHTNESS_THRESHOLD,
} from "../../apps/desktop/electron/services/window-capture-tester.js";

const WINDOWS = [
  { title: "My App", pid: 11, hwnd: "0x1" },
  { title: "Other Window", pid: 22, hwnd: "0x2" },
];

function makeSpawn(exitCode: number, stderrText = "") {
  return vi.fn(() => {
    const proc = new EventEmitter() as EventEmitter & {
      kill: ReturnType<typeof vi.fn>;
      stderr: EventEmitter;
    };
    proc.kill = vi.fn();
    proc.stderr = new EventEmitter();
    setTimeout(() => {
      if (stderrText) proc.stderr.emit("data", Buffer.from(stderrText));
      proc.emit("close", exitCode);
    }, 0);
    return proc as never;
  });
}

function baseOptions(overrides: Record<string, unknown> = {}) {
  return {
    windowEnumerator: { listWindows: async () => WINDOWS },
    spawnFn: makeSpawn(0),
    execFileFn: async () => ({ stdout: "YAVG=100.0\n", stderr: "" }),
    tmpDir: "C:\\tmp",
    unlinkFn: vi.fn(),
    existsFn: () => true,
    ...overrides,
  };
}

describe("sampleVideoBrightness", () => {
  it("averages YAVG values", async () => {
    const execFileFn = async () => ({ stdout: "foo YAVG=200.0 bar\nbaz YAVG=240.0\n", stderr: "" });
    expect(await sampleVideoBrightness(execFileFn, "ffmpeg", "x.mp4")).toBeCloseTo(220, 5);
  });

  it("returns null when exec fails", async () => {
    const execFileFn = async () => { throw new Error("ENOENT"); };
    expect(await sampleVideoBrightness(execFileFn, "ffmpeg", "x.mp4")).toBeNull();
  });

  it("returns null when no values present", async () => {
    const execFileFn = async () => ({ stdout: "nothing here\n", stderr: "" });
    expect(await sampleVideoBrightness(execFileFn, "ffmpeg", "x.mp4")).toBeNull();
  });

  it("threshold is near-white", () => {
    expect(BLANK_BRIGHTNESS_THRESHOLD).toBeGreaterThanOrEqual(240);
  });
});

describe("WindowCaptureTester", () => {
  it("rejects empty titles", async () => {
    const tester = new WindowCaptureTester(baseOptions());
    const result = await tester.testCapture("   ");
    expect(result.ok).toBe(false);
  });

  it("reports missing windows", async () => {
    const tester = new WindowCaptureTester(baseOptions({
      windowEnumerator: { listWindows: async () => WINDOWS },
    }));
    const result = await tester.testCapture("Gone App");
    expect(result.ok).toBe(false);
    expect(result.message).toContain("not open");
  });

  it("reports enumerator failures", async () => {
    const tester = new WindowCaptureTester(baseOptions({
      windowEnumerator: { listWindows: async () => { throw new Error("ps broke"); } },
    }));
    const result = await tester.testCapture("My App");
    expect(result.ok).toBe(false);
    expect(result.message).toContain("Could not list windows");
  });

  it("reports ffmpeg failures", async () => {
    const tester = new WindowCaptureTester(baseOptions({ spawnFn: makeSpawn(1, "I/O error") }));
    const result = await tester.testCapture("My App");
    expect(result.ok).toBe(false);
    expect(result.message).toContain("exit 1");
  });

  it("flags blank captures", async () => {
    const tester = new WindowCaptureTester(baseOptions({
      execFileFn: async () => ({ stdout: "YAVG=250.0\n", stderr: "" }),
    }));
    const result = await tester.testCapture("My App");
    expect(result.ok).toBe(false);
    expect(result.brightness).toBeCloseTo(250, 5);
    expect(result.message).toContain("blank");
  });

  it("passes healthy captures and cleans up temp", async () => {
    const unlinkFn = vi.fn();
    const spawnFn = makeSpawn(0);
    const tester = new WindowCaptureTester(baseOptions({
      spawnFn,
      execFileFn: async () => ({ stdout: "YAVG=90.0\n", stderr: "" }),
      unlinkFn,
    }));
    const result = await tester.testCapture("my app");
    expect(result.ok).toBe(true);
    expect(result.message).toContain("My App");
    expect(spawnFn).toHaveBeenCalledTimes(1);
    const args = spawnFn.mock.calls[0][1] as string[];
    expect(args).toContain("title=My App");
    expect(unlinkFn).toHaveBeenCalledTimes(1);
  });
});
