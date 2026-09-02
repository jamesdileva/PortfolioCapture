import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FfmpegScreenshotExtractor } from "../../apps/desktop/electron/services/screenshot-extractor.js";
import type { FFmpegService, MediaInfo } from "../../packages/shared/types/index.js";

vi.mock("fs", () => ({
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(() => Buffer.from("fake-image-data")),
}));

const MOCK_MEDIA_INFO: MediaInfo = {
  width: 1920,
  height: 1080,
  durationMs: 60000,
  codec: "h264",
  fps: 30,
  bitrate: 5000000,
};

function createMockFFmpegService(overrides?: Partial<FFmpegService>): FFmpegService {
  return {
    probe: vi.fn().mockResolvedValue(MOCK_MEDIA_INFO),
    generateThumbnail: vi.fn().mockResolvedValue(undefined),
    extractFrame: vi.fn().mockResolvedValue(undefined),
    transcode: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("FfmpegScreenshotExtractor", () => {
  describe("extract", () => {
    it("extracts screenshots from a video", async () => {
      const ffmpeg = createMockFFmpegService();
      const extractor = new FfmpegScreenshotExtractor(ffmpeg);

      const screenshots = await extractor.extract("video.mp4", "output/screenshots");

      expect(screenshots.length).toBeGreaterThan(0);
      expect(ffmpeg.probe).toHaveBeenCalledWith("video.mp4");
      expect(ffmpeg.extractFrame).toHaveBeenCalled();
    });

    it("skips first few seconds by default", async () => {
      const ffmpeg = createMockFFmpegService();
      const extractor = new FfmpegScreenshotExtractor(ffmpeg);

      await extractor.extract("video.mp4", "output/screenshots");

      const calls = (ffmpeg.extractFrame as ReturnType<typeof vi.fn>).mock.calls;
      const timestamps = calls.map((c: unknown[]) => c[2] as number);

      for (const ts of timestamps) {
        expect(ts).toBeGreaterThanOrEqual(3);
      }
    });

    it("respects custom skipFirstSeconds", async () => {
      const ffmpeg = createMockFFmpegService();
      const extractor = new FfmpegScreenshotExtractor(ffmpeg);

      await extractor.extract("video.mp4", "output/screenshots", {
        skipFirstSeconds: 10,
      });

      const calls = (ffmpeg.extractFrame as ReturnType<typeof vi.fn>).mock.calls;
      const timestamps = calls.map((c: unknown[]) => c[2] as number);

      for (const ts of timestamps) {
        expect(ts).toBeGreaterThanOrEqual(10);
      }
    });

    it("returns empty array for very short videos", async () => {
      const ffmpeg = createMockFFmpegService({
        probe: vi.fn().mockResolvedValue({
          ...MOCK_MEDIA_INFO,
          durationMs: 1000,
        }),
      });
      const extractor = new FfmpegScreenshotExtractor(ffmpeg);

      const screenshots = await extractor.extract("short.mp4", "output/screenshots");

      expect(screenshots).toEqual([]);
    });

    it("limits screenshots to maxScreenshots", async () => {
      const ffmpeg = createMockFFmpegService({
        probe: vi.fn().mockResolvedValue({
          ...MOCK_MEDIA_INFO,
          durationMs: 300000,
        }),
      });
      const extractor = new FfmpegScreenshotExtractor(ffmpeg);

      const screenshots = await extractor.extract("long.mp4", "output/screenshots", {
        maxScreenshots: 5,
      });

      expect(screenshots.length).toBeLessThanOrEqual(5);
    });

    it("generates PNG files with sequential naming", async () => {
      const ffmpeg = createMockFFmpegService();
      const extractor = new FfmpegScreenshotExtractor(ffmpeg);

      const screenshots = await extractor.extract("video.mp4", "output/screenshots");

      for (const shot of screenshots) {
        expect(shot.path).toMatch(/shot-\d{3}\.png$/);
      }
    });

    it("returns correct metadata for each screenshot", async () => {
      const ffmpeg = createMockFFmpegService();
      const extractor = new FfmpegScreenshotExtractor(ffmpeg);

      const screenshots = await extractor.extract("video.mp4", "output/screenshots");

      for (const shot of screenshots) {
        expect(shot.width).toBe(1920);
        expect(shot.height).toBe(1080);
        expect(shot.timestampMs).toBeGreaterThanOrEqual(0);
        expect(shot.timestampMs).toBeLessThanOrEqual(60000);
      }
    });

    it("skips failed frame extractions", async () => {
      let callCount = 0;
      const ffmpeg = createMockFFmpegService({
        extractFrame: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 2) {
            return Promise.reject(new Error("Failed"));
          }
          return Promise.resolve();
        }),
      });
      const extractor = new FfmpegScreenshotExtractor(ffmpeg);

      const screenshots = await extractor.extract("video.mp4", "output/screenshots");

      expect(screenshots.length).toBeGreaterThan(0);
    });

    it("uses custom config values", async () => {
      const ffmpeg = createMockFFmpegService();
      const extractor = new FfmpegScreenshotExtractor(ffmpeg);

      const screenshots = await extractor.extract("video.mp4", "output/screenshots", {
        minScreenshots: 2,
        maxScreenshots: 3,
        skipFirstSeconds: 5,
        intervalSeconds: 10,
        similarityThreshold: 0,
      });

      expect(screenshots.length).toBeLessThanOrEqual(3);
      expect(screenshots.length).toBeGreaterThanOrEqual(1);
    });

    it("spreads screenshots across video duration", async () => {
      const ffmpeg = createMockFFmpegService({
        probe: vi.fn().mockResolvedValue({
          ...MOCK_MEDIA_INFO,
          durationMs: 120000,
        }),
      });
      const extractor = new FfmpegScreenshotExtractor(ffmpeg);

      const screenshots = await extractor.extract("video.mp4", "output/screenshots", {
        maxScreenshots: 5,
      });

      if (screenshots.length >= 2) {
        const first = screenshots[0].timestampMs;
        const last = screenshots[screenshots.length - 1].timestampMs;
        expect(last - first).toBeGreaterThan(10000);
      }
    });
  });
});
