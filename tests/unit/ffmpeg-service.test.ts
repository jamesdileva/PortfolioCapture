import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "events";
import { FfmpegServiceImpl } from "../../apps/desktop/electron/services/ffmpeg-service.js";
import type { ExecFn } from "../../apps/desktop/electron/services/ffmpeg-service.js";

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

const PROBE_OUTPUT = JSON.stringify({
  streams: [
    {
      codec_type: "video",
      codec_name: "h264",
      width: 1920,
      height: 1080,
      r_frame_rate: "30/1",
    },
  ],
  format: {
    duration: "120.5",
    bit_rate: "5000000",
  },
});

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("FfmpegServiceImpl", () => {
  describe("probe", () => {
    it("returns MediaInfo from ffprobe JSON output", async () => {
      const execFn = vi.fn(() => createMockProcess(PROBE_OUTPUT));
      const service = new FfmpegServiceImpl("ffmpeg", "ffprobe", execFn);

      const info = await service.probe("test.mp4");

      expect(info.width).toBe(1920);
      expect(info.height).toBe(1080);
      expect(info.durationMs).toBe(120500);
      expect(info.codec).toBe("h264");
      expect(info.fps).toBe(30);
      expect(info.bitrate).toBe(5000000);
    });

    it("calls ffprobe with correct arguments", async () => {
      const execFn = vi.fn(() => createMockProcess(PROBE_OUTPUT));
      const service = new FfmpegServiceImpl("ffmpeg", "/usr/bin/ffprobe", execFn);

      await service.probe("input.mp4");

      expect(execFn).toHaveBeenCalledWith("/usr/bin/ffprobe", [
        "-v", "quiet",
        "-print_format", "json",
        "-show_format",
        "-show_streams",
        "input.mp4",
      ]);
    });

    it("throws when no video stream found", async () => {
      const output = JSON.stringify({
        streams: [{ codec_type: "audio", codec_name: "aac" }],
        format: { duration: "60", bit_rate: "128000" },
      });
      const execFn = vi.fn(() => createMockProcess(output));
      const service = new FfmpegServiceImpl("ffmpeg", "ffprobe", execFn);

      await expect(service.probe("audio.mp3")).rejects.toThrow("No video stream found");
    });

    it("throws on ffprobe failure", async () => {
      const execFn = vi.fn(() => createFailingProcess("ENOENT"));
      const service = new FfmpegServiceImpl("ffmpeg", "ffprobe", execFn);

      await expect(service.probe("missing.mp4")).rejects.toThrow("Failed to run ffprobe");
    });

    it("throws on non-zero exit code", async () => {
      const execFn = vi.fn(() => createMockProcess("", "invalid file", 1));
      const service = new FfmpegServiceImpl("ffmpeg", "ffprobe", execFn);

      await expect(service.probe("corrupt.mp4")).rejects.toThrow("exited with code 1");
    });

    it("handles fractional frame rates", async () => {
      const output = JSON.stringify({
        streams: [
          {
            codec_type: "video",
            codec_name: "h264",
            width: 1280,
            height: 720,
            r_frame_rate: "30000/1001",
          },
        ],
        format: { duration: "60.0", bit_rate: "3000000" },
      });
      const execFn = vi.fn(() => createMockProcess(output));
      const service = new FfmpegServiceImpl("ffmpeg", "ffprobe", execFn);

      const info = await service.probe("ntsc.mp4");
      expect(info.fps).toBeCloseTo(29.97, 1);
    });
  });

  describe("generateThumbnail", () => {
    it("extracts frame at 20% of duration by default", async () => {
      const execFn = vi.fn(() => createMockProcess(PROBE_OUTPUT));
      const service = new FfmpegServiceImpl("ffmpeg", "ffprobe", execFn);

      await service.generateThumbnail("input.mp4", "thumb.jpg");

      const ffmpegCall = execFn.mock.calls.find(
        (call) => call[0] === "ffmpeg"
      );
      expect(ffmpegCall).toBeDefined();
      const args = ffmpegCall![1];
      expect(args).toContain("-ss");
      expect(args).toContain("24.1");
      expect(args).toContain("-frames:v");
      expect(args).toContain("1");
      expect(args).toContain("-i");
      expect(args).toContain("input.mp4");
      expect(args).toContain("thumb.jpg");
    });

    it("uses custom timestamp percent", async () => {
      const execFn = vi.fn(() => createMockProcess(PROBE_OUTPUT));
      const service = new FfmpegServiceImpl("ffmpeg", "ffprobe", execFn);

      await service.generateThumbnail("input.mp4", "thumb.jpg", 50);

      const ffmpegCall = execFn.mock.calls.find(
        (call) => call[0] === "ffmpeg"
      );
      expect(ffmpegCall).toBeDefined();
      const args = ffmpegCall![1];
      expect(args).toContain("60.25");
    });

    it("includes -y flag to overwrite", async () => {
      const execFn = vi.fn(() => createMockProcess(PROBE_OUTPUT));
      const service = new FfmpegServiceImpl("ffmpeg", "ffprobe", execFn);

      await service.generateThumbnail("input.mp4", "thumb.jpg");

      const ffmpegCall = execFn.mock.calls.find(
        (call) => call[0] === "ffmpeg"
      );
      expect(ffmpegCall![1]).toContain("-y");
    });

    it("throws on probe failure", async () => {
      const execFn = vi.fn(() => createFailingProcess("ENOENT"));
      const service = new FfmpegServiceImpl("ffmpeg", "ffprobe", execFn);

      await expect(service.generateThumbnail("missing.mp4", "thumb.jpg")).rejects.toThrow();
    });

    it("throws on ffmpeg failure", async () => {
      const callCount = { probe: 0, ffmpeg: 0 };
      const execFn = vi.fn((cmd: string) => {
        if (cmd === "ffprobe") {
          return createMockProcess(PROBE_OUTPUT);
        }
        return createMockProcess("", "encode error", 1);
      });
      const service = new FfmpegServiceImpl("ffmpeg", "ffprobe", execFn);

      await expect(service.generateThumbnail("input.mp4", "thumb.jpg")).rejects.toThrow("exited with code 1");
    });
  });

  describe("extractFrame", () => {
    it("extracts frame at specified timestamp", async () => {
      const execFn = vi.fn(() => createMockProcess(""));
      const service = new FfmpegServiceImpl("ffmpeg", "ffprobe", execFn);

      await service.extractFrame("input.mp4", "frame.png", 30);

      const ffmpegCall = execFn.mock.calls.find(
        (call) => call[0] === "ffmpeg"
      );
      expect(ffmpegCall).toBeDefined();
      const args = ffmpegCall![1];
      expect(args).toContain("-ss");
      expect(args).toContain("30");
      expect(args).toContain("-frames:v");
      expect(args).toContain("1");
      expect(args).toContain("-i");
      expect(args).toContain("input.mp4");
      expect(args).toContain("frame.png");
    });

    it("includes -y flag to overwrite", async () => {
      const execFn = vi.fn(() => createMockProcess(""));
      const service = new FfmpegServiceImpl("ffmpeg", "ffprobe", execFn);

      await service.extractFrame("input.mp4", "frame.png", 0);

      const ffmpegCall = execFn.mock.calls.find(
        (call) => call[0] === "ffmpeg"
      );
      expect(ffmpegCall![1]).toContain("-y");
    });

    it("throws on ffmpeg failure", async () => {
      const execFn = vi.fn(() => createMockProcess("", "error", 1));
      const service = new FfmpegServiceImpl("ffmpeg", "ffprobe", execFn);

      await expect(service.extractFrame("input.mp4", "frame.png", 5)).rejects.toThrow("exited with code 1");
    });

    it("throws on spawn error", async () => {
      const execFn = vi.fn(() => createFailingProcess("ENOENT"));
      const service = new FfmpegServiceImpl("ffmpeg", "ffprobe", execFn);

      await expect(service.extractFrame("input.mp4", "frame.png", 5)).rejects.toThrow("Failed to run ffmpeg");
    });
  });

  describe("transcode", () => {
    it("uses default libx264 codec and audio copy", async () => {
      const execFn = vi.fn(() => createMockProcess(""));
      const service = new FfmpegServiceImpl("ffmpeg", "ffprobe", execFn);

      await service.transcode("input.mp4", "output.mp4");

      const ffmpegCall = execFn.mock.calls.find(
        (call) => call[0] === "ffmpeg"
      );
      expect(ffmpegCall).toBeDefined();
      const args = ffmpegCall![1];
      expect(args).toContain("-c:v");
      expect(args).toContain("libx264");
      expect(args).toContain("-c:a");
      expect(args).toContain("copy");
      expect(args).toContain("output.mp4");
    });

    it("applies custom codec", async () => {
      const execFn = vi.fn(() => createMockProcess(""));
      const service = new FfmpegServiceImpl("ffmpeg", "ffprobe", execFn);

      await service.transcode("input.mp4", "output.mp4", { codec: "libx265" });

      const ffmpegCall = execFn.mock.calls.find(
        (call) => call[0] === "ffmpeg"
      );
      const args = ffmpegCall![1];
      expect(args).toContain("libx265");
    });

    it("applies scale filter when width and height provided", async () => {
      const execFn = vi.fn(() => createMockProcess(""));
      const service = new FfmpegServiceImpl("ffmpeg", "ffprobe", execFn);

      await service.transcode("input.mp4", "output.mp4", { width: 1280, height: 720 });

      const ffmpegCall = execFn.mock.calls.find(
        (call) => call[0] === "ffmpeg"
      );
      const args = ffmpegCall![1];
      expect(args).toContain("-vf");
      expect(args).toContain("scale=1280:720");
    });

    it("applies custom fps", async () => {
      const execFn = vi.fn(() => createMockProcess(""));
      const service = new FfmpegServiceImpl("ffmpeg", "ffprobe", execFn);

      await service.transcode("input.mp4", "output.mp4", { fps: 60 });

      const ffmpegCall = execFn.mock.calls.find(
        (call) => call[0] === "ffmpeg"
      );
      const args = ffmpegCall![1];
      expect(args).toContain("-r");
      expect(args).toContain("60");
    });

    it("applies custom audio codec and bitrate", async () => {
      const execFn = vi.fn(() => createMockProcess(""));
      const service = new FfmpegServiceImpl("ffmpeg", "ffprobe", execFn);

      await service.transcode("input.mp4", "output.mp4", {
        audioCodec: "aac",
        audioBitrate: "192k",
      });

      const ffmpegCall = execFn.mock.calls.find(
        (call) => call[0] === "ffmpeg"
      );
      const args = ffmpegCall![1];
      expect(args).toContain("-c:a");
      expect(args).toContain("aac");
      expect(args).toContain("-b:a");
      expect(args).toContain("192k");
    });

    it("includes -y flag to overwrite", async () => {
      const execFn = vi.fn(() => createMockProcess(""));
      const service = new FfmpegServiceImpl("ffmpeg", "ffprobe", execFn);

      await service.transcode("input.mp4", "output.mp4");

      const ffmpegCall = execFn.mock.calls.find(
        (call) => call[0] === "ffmpeg"
      );
      expect(ffmpegCall![1]).toContain("-y");
    });

    it("throws on ffmpeg failure", async () => {
      const execFn = vi.fn(() => createMockProcess("", "encode error", 1));
      const service = new FfmpegServiceImpl("ffmpeg", "ffprobe", execFn);

      await expect(service.transcode("input.mp4", "output.mp4")).rejects.toThrow("exited with code 1");
    });

    it("throws on spawn error", async () => {
      const execFn = vi.fn(() => createFailingProcess("ENOENT"));
      const service = new FfmpegServiceImpl("ffmpeg", "ffprobe", execFn);

      await expect(service.transcode("input.mp4", "output.mp4")).rejects.toThrow("Failed to run ffmpeg");
    });
  });
});
