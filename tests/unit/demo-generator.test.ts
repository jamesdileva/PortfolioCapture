import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "events";
import { DemoGeneratorImpl, type ExecFn } from "../../apps/desktop/electron/services/demo-generator.js";
import type { FFmpegService, MediaInfo } from "../../packages/shared/types/index.js";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "fs";
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

function createMockFfmpegService(
  probeDurationMs = 60_000,
  outputDurationMs?: number,
): FFmpegService {
  let callCount = 0;
  return {
    probe: vi.fn().mockImplementation(() => {
      const isOutput = callCount++ > 0 && outputDurationMs !== undefined;
      return Promise.resolve({
        width: 1920,
        height: 1080,
        durationMs: isOutput ? outputDurationMs! : probeDurationMs,
        codec: "h264",
        fps: 30,
        bitrate: 5_000_000,
      } as MediaInfo);
    }),
    generateThumbnail: vi.fn().mockResolvedValue(undefined),
    extractFrame: vi.fn().mockResolvedValue(undefined),
    transcode: vi.fn().mockResolvedValue(undefined),
  };
}

function freshProcess(): ReturnType<ExecFn> {
  return createMockProcess() as unknown as ReturnType<ExecFn>;
}

const INPUT_DIR = join(import.meta.dirname, "..", "_demo_test_tmp");

beforeEach(() => {
  mkdirSync(INPUT_DIR, { recursive: true });
});

afterEach(() => {
  try { rmSync(INPUT_DIR, { recursive: true, force: true }); } catch { /* ignore */ }
});

describe("DemoGeneratorImpl", () => {
  describe("generate", () => {
    it("throws when trimmed video does not exist", async () => {
      const ffmpegService = createMockFfmpegService(60_000);
      const execFn = vi.fn().mockImplementation(() => freshProcess());
      const generator = new DemoGeneratorImpl(ffmpegService, {}, execFn);

      await expect(generator.generate("/nonexistent/video.mp4", INPUT_DIR))
        .rejects.toThrow("Trimmed video not found");
    });

    it("copies trimmed video directly when duration within max range", async () => {
      const ffmpegService = createMockFfmpegService(45_000, 45_000);
      const execFn = vi.fn().mockImplementation(() => freshProcess());
      const generator = new DemoGeneratorImpl(ffmpegService, {}, execFn);

      const trimmedPath = join(INPUT_DIR, "trimmed.mp4");
      writeFileSync(trimmedPath, "fake-video");

      const result = await generator.generate(trimmedPath, INPUT_DIR);

      expect(result.outputPath).toBe(join(INPUT_DIR, "demo.mp4"));
      expect(result.segmentCount).toBe(1);
      expect(result.hasIntro).toBe(false);
      expect(result.hasOutro).toBe(false);
      expect(result.durationMs).toBe(45_000);
    });

    it("extracts distributed segments when duration exceeds max", async () => {
      const ffmpegService = createMockFfmpegService(120_000, 60_000);
      const execFn = vi.fn().mockImplementation(() => freshProcess());
      const generator = new DemoGeneratorImpl(ffmpegService, {}, execFn);

      const trimmedPath = join(INPUT_DIR, "trimmed.mp4");
      writeFileSync(trimmedPath, "fake-video");

      const result = await generator.generate(trimmedPath, INPUT_DIR);

      expect(result.segmentCount).toBe(5);
      expect(result.outputPath).toBe(join(INPUT_DIR, "demo.mp4"));
    });

    it("prepends intro when introPath exists", async () => {
      const ffmpegService = createMockFfmpegService(60_000, 65_000);
      const execFn = vi.fn().mockImplementation(() => freshProcess());
      const generator = new DemoGeneratorImpl(ffmpegService, {}, execFn);

      const trimmedPath = join(INPUT_DIR, "trimmed.mp4");
      writeFileSync(trimmedPath, "fake-video");
      const introPath = join(INPUT_DIR, "intro.mp4");
      writeFileSync(introPath, "fake-intro");

      const result = await generator.generate(trimmedPath, INPUT_DIR, { introPath });

      expect(result.hasIntro).toBe(true);
      expect(result.segmentCount).toBe(1);
    });

    it("appends outro when outroPath exists", async () => {
      const ffmpegService = createMockFfmpegService(60_000, 65_000);
      const execFn = vi.fn().mockImplementation(() => freshProcess());
      const generator = new DemoGeneratorImpl(ffmpegService, {}, execFn);

      const trimmedPath = join(INPUT_DIR, "trimmed.mp4");
      writeFileSync(trimmedPath, "fake-video");
      const outroPath = join(INPUT_DIR, "outro.mp4");
      writeFileSync(outroPath, "fake-outro");

      const result = await generator.generate(trimmedPath, INPUT_DIR, { outroPath });

      expect(result.hasOutro).toBe(true);
      expect(result.segmentCount).toBe(1);
    });

    it("includes both intro and outro when both configured", async () => {
      const ffmpegService = createMockFfmpegService(60_000, 70_000);
      const execFn = vi.fn().mockImplementation(() => freshProcess());
      const generator = new DemoGeneratorImpl(ffmpegService, {}, execFn);

      const trimmedPath = join(INPUT_DIR, "trimmed.mp4");
      writeFileSync(trimmedPath, "fake-video");
      const introPath = join(INPUT_DIR, "intro.mp4");
      writeFileSync(introPath, "fake-intro");
      const outroPath = join(INPUT_DIR, "outro.mp4");
      writeFileSync(outroPath, "fake-outro");

      const result = await generator.generate(trimmedPath, INPUT_DIR, { introPath, outroPath });

      expect(result.hasIntro).toBe(true);
      expect(result.hasOutro).toBe(true);
    });

    it("skips intro when introPath does not exist on disk", async () => {
      const ffmpegService = createMockFfmpegService(60_000, 60_000);
      const execFn = vi.fn().mockImplementation(() => freshProcess());
      const generator = new DemoGeneratorImpl(ffmpegService, {}, execFn);

      const trimmedPath = join(INPUT_DIR, "trimmed.mp4");
      writeFileSync(trimmedPath, "fake-video");

      const result = await generator.generate(trimmedPath, INPUT_DIR, {
        introPath: "/nonexistent/intro.mp4",
      });

      expect(result.hasIntro).toBe(false);
    });

    it("skips outro when outroPath does not exist on disk", async () => {
      const ffmpegService = createMockFfmpegService(60_000, 60_000);
      const execFn = vi.fn().mockImplementation(() => freshProcess());
      const generator = new DemoGeneratorImpl(ffmpegService, {}, execFn);

      const trimmedPath = join(INPUT_DIR, "trimmed.mp4");
      writeFileSync(trimmedPath, "fake-video");

      const result = await generator.generate(trimmedPath, INPUT_DIR, {
        outroPath: "/nonexistent/outro.mp4",
      });

      expect(result.hasOutro).toBe(false);
    });

    it("uses custom output filename from config", async () => {
      const ffmpegService = createMockFfmpegService(45_000, 45_000);
      const execFn = vi.fn().mockImplementation(() => freshProcess());
      const generator = new DemoGeneratorImpl(ffmpegService, {}, execFn);

      const trimmedPath = join(INPUT_DIR, "trimmed.mp4");
      writeFileSync(trimmedPath, "fake-video");

      const result = await generator.generate(trimmedPath, INPUT_DIR, {
        outputFilename: "my-demo.mp4",
      });

      expect(result.outputPath).toBe(join(INPUT_DIR, "my-demo.mp4"));
    });

    it("propagates probe failures", async () => {
      const ffmpegService = createMockFfmpegService();
      (ffmpegService.probe as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("probe failed"));
      const execFn = vi.fn().mockImplementation(() => freshProcess());
      const generator = new DemoGeneratorImpl(ffmpegService, {}, execFn);

      const trimmedPath = join(INPUT_DIR, "trimmed.mp4");
      writeFileSync(trimmedPath, "fake-video");

      await expect(generator.generate(trimmedPath, INPUT_DIR))
        .rejects.toThrow("probe failed");
    });

    it("propagates ffmpeg errors during segment extraction", async () => {
      const ffmpegService = createMockFfmpegService(120_000, 60_000);
      const execFn = vi.fn()
        .mockReturnValueOnce(createMockProcess("", "", 1))
        .mockImplementation(() => freshProcess());
      const generator = new DemoGeneratorImpl(ffmpegService, {}, execFn);

      const trimmedPath = join(INPUT_DIR, "trimmed.mp4");
      writeFileSync(trimmedPath, "fake-video");

      await expect(generator.generate(trimmedPath, INPUT_DIR))
        .rejects.toThrow();
    });

    it("cleans up temp segments directory after generation", async () => {
      const ffmpegService = createMockFfmpegService(45_000, 45_000);
      const execFn = vi.fn().mockImplementation(() => freshProcess());
      const generator = new DemoGeneratorImpl(ffmpegService, {}, execFn);

      const trimmedPath = join(INPUT_DIR, "trimmed.mp4");
      writeFileSync(trimmedPath, "fake-video");

      await generator.generate(trimmedPath, INPUT_DIR);

      const dirs = require("fs").readdirSync(INPUT_DIR);
      const tempDirs = dirs.filter((d: string) => d.startsWith("_demo_"));
      expect(tempDirs.length).toBe(0);
    });

    it("calls execFn with correct ffmpeg args for short video", async () => {
      const ffmpegService = createMockFfmpegService(45_000, 45_000);
      const calls: [string, string[]][] = [];
      const execFn = vi.fn().mockImplementation((command: string, args: string[]) => {
        calls.push([command, args]);
        return freshProcess();
      });
      const generator = new DemoGeneratorImpl(ffmpegService, {}, execFn);

      const trimmedPath = join(INPUT_DIR, "trimmed.mp4");
      writeFileSync(trimmedPath, "fake-video");

      await generator.generate(trimmedPath, INPUT_DIR);

      const transcodeCalls = calls.filter((c) => c[1].includes("-c:v") && c[1].includes("libx264"));
      expect(transcodeCalls.length).toBeGreaterThanOrEqual(1);
      expect(transcodeCalls[0][1]).toContain("-i");
    });
  });
});
