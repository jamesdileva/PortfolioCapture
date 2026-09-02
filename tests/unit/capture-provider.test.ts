import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "events";
import { FfmpegCaptureProvider } from "../../apps/desktop/electron/services/capture-provider.js";
import type { CaptureOptions, SpawnFn } from "../../apps/desktop/electron/services/capture-provider.js";

function createMockProcess(): ReturnType<SpawnFn> & { _emitter: EventEmitter } {
  const emitter = new EventEmitter();
  const proc = Object.assign(emitter, {
    kill: vi.fn(),
    stderr: new EventEmitter(),
    stdout: new EventEmitter(),
    pid: 1234,
    _emitter: emitter,
  });
  return proc as unknown as ReturnType<SpawnFn> & { _emitter: EventEmitter };
}

function defaultOptions(overrides: Partial<CaptureOptions> = {}): CaptureOptions {
  return {
    outputPath: "C:\\recordings\\test.mp4",
    fps: 30,
    width: 1920,
    height: 1080,
    audio: "none",
    ...overrides,
  };
}

let mockStatSync: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockStatSync = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("FfmpegCaptureProvider", () => {
  describe("start", () => {
    it("returns a CaptureSession with sessionId and startedAt", async () => {
      const mockProc = createMockProcess();
      const spawnFn = vi.fn(() => mockProc);
      const provider = new FfmpegCaptureProvider("ffmpeg", spawnFn);

      vi.mock("fs", () => ({
        statSync: vi.fn(() => ({ size: 1024 })),
      }));

      const { statSync } = await import("fs");
      vi.mocked(statSync).mockReturnValue({ size: 1024 } as any);

      const session = await provider.start(defaultOptions());

      expect(session.sessionId).toMatch(/^capture-\d+-\d+$/);
      expect(session.startedAt).toBeDefined();
      expect(new Date(session.startedAt).getTime()).not.toBeNaN();
    });

    it("spawns FFmpeg with correct path", async () => {
      const mockProc = createMockProcess();
      const spawnFn = vi.fn(() => mockProc);
      const provider = new FfmpegCaptureProvider("/usr/bin/ffmpeg", spawnFn);

      const { statSync } = await import("fs");
      vi.mocked(statSync).mockReturnValue({ size: 1024 } as any);

      await provider.start(defaultOptions());

      expect(spawnFn).toHaveBeenCalledWith("/usr/bin/ffmpeg", expect.any(Array));
    });

    it("passes -an for audio none", async () => {
      const mockProc = createMockProcess();
      const spawnFn = vi.fn(() => mockProc);
      const provider = new FfmpegCaptureProvider("ffmpeg", spawnFn);

      const { statSync } = await import("fs");
      vi.mocked(statSync).mockReturnValue({ size: 1024 } as any);

      await provider.start(defaultOptions({ audio: "none" }));

      const args = spawnFn.mock.calls[0][1];
      expect(args).toContain("-an");
    });

    it("includes dshow audio input for system audio", async () => {
      const mockProc = createMockProcess();
      const spawnFn = vi.fn(() => mockProc);
      const provider = new FfmpegCaptureProvider("ffmpeg", spawnFn);

      const { statSync } = await import("fs");
      vi.mocked(statSync).mockReturnValue({ size: 1024 } as any);

      await provider.start(defaultOptions({ audio: "system" }));

      const args = spawnFn.mock.calls[0][1];
      expect(args).toContain("-f");
      expect(args).toContain("dshow");
      expect(args).toContain("audio=virtual-audio-capturer");
    });

    it("uses gdigrab input format", async () => {
      const mockProc = createMockProcess();
      const spawnFn = vi.fn(() => mockProc);
      const provider = new FfmpegCaptureProvider("ffmpeg", spawnFn);

      const { statSync } = await import("fs");
      vi.mocked(statSync).mockReturnValue({ size: 1024 } as any);

      await provider.start(defaultOptions());

      const args = spawnFn.mock.calls[0][1];
      expect(args).toContain("-f");
      expect(args).toContain("gdigrab");
    });

    it("uses libx264 encoder", async () => {
      const mockProc = createMockProcess();
      const spawnFn = vi.fn(() => mockProc);
      const provider = new FfmpegCaptureProvider("ffmpeg", spawnFn);

      const { statSync } = await import("fs");
      vi.mocked(statSync).mockReturnValue({ size: 1024 } as any);

      await provider.start(defaultOptions());

      const args = spawnFn.mock.calls[0][1];
      expect(args).toContain("-c:v");
      expect(args).toContain("libx264");
    });

    it("includes scale filter for resolution", async () => {
      const mockProc = createMockProcess();
      const spawnFn = vi.fn(() => mockProc);
      const provider = new FfmpegCaptureProvider("ffmpeg", spawnFn);

      const { statSync } = await import("fs");
      vi.mocked(statSync).mockReturnValue({ size: 1024 } as any);

      await provider.start(defaultOptions({ width: 1280, height: 720 }));

      const args = spawnFn.mock.calls[0][1];
      expect(args).toContain("-vf");
      expect(args).toContain("scale=1280:720");
    });

    it("rejects on FFmpeg spawn error", async () => {
      const mockProc = createMockProcess();
      const spawnFn = vi.fn(() => mockProc);
      const provider = new FfmpegCaptureProvider("ffmpeg", spawnFn);

      const startPromise = provider.start(defaultOptions());

      mockProc.emit("error", new Error("ENOENT"));

      await expect(startPromise).rejects.toThrow("FFmpeg failed to start: ENOENT");
    });

    it("rejects when FFmpeg produces no streams", async () => {
      const mockProc = createMockProcess();
      const spawnFn = vi.fn(() => mockProc);
      const provider = new FfmpegCaptureProvider("ffmpeg", spawnFn);

      const startPromise = provider.start(defaultOptions());

      mockProc.stderr.emit("data", Buffer.from("Output file does not contain any stream"));

      await expect(startPromise).rejects.toThrow("FFmpeg produced no streams");
    });
  });

  describe("stop", () => {
    it("returns CaptureResult with output path and dimensions", async () => {
      const mockProc = createMockProcess();
      const spawnFn = vi.fn(() => mockProc);
      const provider = new FfmpegCaptureProvider("ffmpeg", spawnFn);

      const { statSync } = await import("fs");
      vi.mocked(statSync).mockReturnValue({ size: 50000 } as any);

      const session = await provider.start(defaultOptions({ width: 1280, height: 720 }));

      const stopPromise = provider.stop(session.sessionId);
      setTimeout(() => mockProc.emit("close", 0), 0);
      const result = await stopPromise;

      expect(result.outputPath).toBe("C:\\recordings\\test.mp4");
      expect(result.width).toBe(1280);
      expect(result.height).toBe(720);
      expect(result.fileSizeBytes).toBe(50000);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("sends SIGINT to stop FFmpeg", async () => {
      const mockProc = createMockProcess();
      const spawnFn = vi.fn(() => mockProc);
      const provider = new FfmpegCaptureProvider("ffmpeg", spawnFn);

      const { statSync } = await import("fs");
      vi.mocked(statSync).mockReturnValue({ size: 50000 } as any);

      const session = await provider.start(defaultOptions());

      const stopPromise = provider.stop(session.sessionId);
      setTimeout(() => mockProc.emit("close", 0), 0);
      await stopPromise;

      expect(mockProc.kill).toHaveBeenCalledWith("SIGINT");
    });

    it("throws on nonexistent session", async () => {
      const provider = new FfmpegCaptureProvider("ffmpeg");

      await expect(provider.stop("nonexistent")).rejects.toThrow("No active capture session: nonexistent");
    });

    it("removes session after stop", async () => {
      const mockProc = createMockProcess();
      const spawnFn = vi.fn(() => mockProc);
      const provider = new FfmpegCaptureProvider("ffmpeg", spawnFn);

      const { statSync } = await import("fs");
      vi.mocked(statSync).mockReturnValue({ size: 50000 } as any);

      const session = await provider.start(defaultOptions());

      const stopPromise = provider.stop(session.sessionId);
      setTimeout(() => mockProc.emit("close", 0), 0);
      await stopPromise;

      expect(provider.getActiveSessionIds()).toHaveLength(0);
    });
  });

  describe("getActiveSessionIds", () => {
    it("returns empty when no active sessions", () => {
      const provider = new FfmpegCaptureProvider("ffmpeg");
      expect(provider.getActiveSessionIds()).toHaveLength(0);
    });

    it("tracks active sessions", async () => {
      const mockProc = createMockProcess();
      const spawnFn = vi.fn(() => mockProc);
      const provider = new FfmpegCaptureProvider("ffmpeg", spawnFn);

      const { statSync } = await import("fs");
      vi.mocked(statSync).mockReturnValue({ size: 1024 } as any);

      const session = await provider.start(defaultOptions());
      expect(provider.getActiveSessionIds()).toContain(session.sessionId);

      const stopPromise = provider.stop(session.sessionId);
      setTimeout(() => mockProc.emit("close", 0), 0);
      await stopPromise;
      expect(provider.getActiveSessionIds()).toHaveLength(0);
    });
  });
});
