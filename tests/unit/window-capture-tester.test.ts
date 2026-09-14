import { describe, it, expect, vi } from "vitest";
import {
  WindowCaptureTester,
  sampleVideoBrightness,
  BLANK_BRIGHTNESS_THRESHOLD,
} from "../../apps/desktop/electron/services/window-capture-tester.js";
import type { CaptureProvider } from "../../packages/shared/types/index.js";

const WINDOWS = [
  { title: "My App", pid: 11, hwnd: "0x1" },
  { title: "Other Window", pid: 22, hwnd: "0x2" },
];

function makeProvider(overrides: {
  start?: (opts: unknown) => Promise<{ sessionId: string; startedAt: string }>;
  stop?: (id: string) => Promise<unknown>;
} = {}): CaptureProvider & { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> } {
  const start = vi.fn(async () => ({ sessionId: "cap-1", startedAt: new Date().toISOString() }));
  const stop = vi.fn(async () => ({
    outputPath: "C:\\tmp\\par-testcap-1.mp4",
    durationMs: 3000,
    fileSizeBytes: 12345,
    width: 1280,
    height: 720,
  }));
  if (overrides.start) start.mockImplementation(overrides.start as never);
  if (overrides.stop) stop.mockImplementation(overrides.stop as never);
  return { start, stop } as never;
}

function baseOptions(overrides: Record<string, unknown> = {}) {
  return {
    windowEnumerator: { listWindows: async () => WINDOWS },
    captureProvider: makeProvider(),
    brightnessSampler: async () => 100 as number | null,
    tmpDir: "C:\\tmp",
    unlinkFn: vi.fn(),
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

  it("reports provider start failures", async () => {
    const captureProvider = makeProvider({
      start: async () => { throw new Error("host busy"); },
    });
    const tester = new WindowCaptureTester(baseOptions({ captureProvider }));
    const result = await tester.testCapture("My App");
    expect(result.ok).toBe(false);
    expect(result.message).toContain("failed to start");
  });

  it("reports provider stop failures", async () => {
    const captureProvider = makeProvider({
      stop: async () => { throw new Error("remux blew up"); },
    });
    const tester = new WindowCaptureTester(baseOptions({ captureProvider }));
    const result = await tester.testCapture("My App");
    expect(result.ok).toBe(false);
    expect(result.message).toContain("failed to stop");
  });

  it("flags blank captures", async () => {
    const tester = new WindowCaptureTester(baseOptions({
      brightnessSampler: async () => 250,
    }));
    const result = await tester.testCapture("My App");
    expect(result.ok).toBe(false);
    expect(result.brightness).toBeCloseTo(250, 5);
    expect(result.message).toContain("blank");
  });

  it("passes healthy captures and cleans up temp", async () => {
    const unlinkFn = vi.fn();
    const captureProvider = makeProvider();
    const tester = new WindowCaptureTester(baseOptions({
      captureProvider,
      brightnessSampler: async () => 90,
      unlinkFn,
    }));
    const result = await tester.testCapture("my app", 0);
    expect(result.ok).toBe(true);
    expect(result.message).toContain("My App");
    expect(captureProvider.start).toHaveBeenCalledTimes(1);
    const opts = captureProvider.start.mock.calls[0][0] as { windowTitle?: string; captureMode?: string };
    expect(opts.captureMode).toBe("window");
    expect(opts.windowTitle).toBe("My App");
    expect(captureProvider.stop).toHaveBeenCalledTimes(1);
    expect(unlinkFn).toHaveBeenCalledTimes(1);
  });
});
