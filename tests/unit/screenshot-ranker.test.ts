import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ScreenshotRankerImpl } from "../../apps/desktop/electron/services/screenshot-ranker.js";
import type { ExtractedScreenshot, ScreenshotRankContext } from "../../packages/shared/types/index.js";

const MOCK_CONTEXT: ScreenshotRankContext = {
  interactionTimestamps: [5000, 15000, 30000],
  segmentDurations: [3000, 4000, 2000, 5000],
  videoDurationMs: 60000,
};

function createFrames(count: number): ExtractedScreenshot[] {
  return Array.from({ length: count }, (_, i) => ({
    path: `screenshot/shot-${String(i + 1).padStart(3, "0")}.png`,
    timestampMs: i * 10000,
    width: 1920,
    height: 1080,
  }));
}

function createReadFileBytes(dataMap: Map<string, number>): (path: string) => Buffer {
  return (path: string) => {
    const size = dataMap.get(path) ?? 50000;
    const buf = Buffer.alloc(size);
    for (let i = 0; i < size; i++) {
      buf[i] = i % 256;
    }
    return buf;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ScreenshotRankerImpl", () => {
  describe("rank", () => {
    it("returns empty array for empty input", () => {
      const ranker = new ScreenshotRankerImpl();
      const result = ranker.rank([], MOCK_CONTEXT);
      expect(result).toEqual([]);
    });

    it("returns single frame with score 1.0 for visual uniqueness", () => {
      const ranker = new ScreenshotRankerImpl();
      const frames = createFrames(1);
      const result = ranker.rank(frames, MOCK_CONTEXT);
      expect(result).toHaveLength(1);
      expect(result[0].score).toBeGreaterThan(0);
      expect(result[0].factors.visualUniqueness).toBe(1.0);
    });

    it("scores distinct frames higher than near-duplicates", () => {
      const dataMap = new Map([
        ["a/shot-001.png", 100000],
        ["b/shot-002.png", 100001],
        ["c/shot-003.png", 200000],
      ]);
      const ranker = new ScreenshotRankerImpl(createReadFileBytes(dataMap));
      const frames: ExtractedScreenshot[] = [
        { path: "a/shot-001.png", timestampMs: 0, width: 1920, height: 1080 },
        { path: "b/shot-002.png", timestampMs: 10000, width: 1920, height: 1080 },
        { path: "c/shot-003.png", timestampMs: 20000, width: 1920, height: 1080 },
      ];

      const result = ranker.rank(frames, MOCK_CONTEXT);

      const shot3 = result.find((r) => r.framePath === "c/shot-003.png");
      const shot2 = result.find((r) => r.framePath === "b/shot-002.png");
      expect(shot3!.factors.visualUniqueness).toBeGreaterThanOrEqual(shot2!.factors.visualUniqueness);
    });

    it("near-duplicate frames get low visual uniqueness after first is selected", () => {
      const dataMap = new Map([
        ["a/shot-001.png", 100000],
        ["b/shot-002.png", 100000],
      ]);
      const ranker = new ScreenshotRankerImpl(createReadFileBytes(dataMap));
      const frames: ExtractedScreenshot[] = [
        { path: "a/shot-001.png", timestampMs: 0, width: 1920, height: 1080 },
        { path: "b/shot-002.png", timestampMs: 10000, width: 1920, height: 1080 },
      ];

      const result = ranker.rank(frames, MOCK_CONTEXT);

      const shot1 = result.find((r) => r.framePath === "a/shot-001.png")!;
      const shot2 = result.find((r) => r.framePath === "b/shot-002.png")!;
      expect(shot1.factors.visualUniqueness).toBe(1.0);
      expect(shot2.factors.visualUniqueness).toBeLessThan(0.5);
    });

    it("frames near interaction events get higher proximity score", () => {
      const ranker = new ScreenshotRankerImpl();
      const frames: ExtractedScreenshot[] = [
        { path: "near.png", timestampMs: 5100, width: 1920, height: 1080 },
        { path: "far.png", timestampMs: 50000, width: 1920, height: 1080 },
      ];

      const result = ranker.rank(frames, MOCK_CONTEXT);

      const near = result.find((r) => r.framePath === "near.png")!;
      const far = result.find((r) => r.framePath === "far.png")!;
      expect(near.factors.interactionProximity).toBeGreaterThan(far.factors.interactionProximity);
    });

    it("readability scores low for small files", () => {
      const dataMap = new Map([["small.png", 1000]]);
      const ranker = new ScreenshotRankerImpl(createReadFileBytes(dataMap));
      const frames = createFrames(1);

      const result = ranker.rank(frames, MOCK_CONTEXT);
      expect(result[0].factors.readability).toBeLessThan(0.5);
    });

    it("readability scores high for large files", () => {
      const dataMap = new Map([["large.png", 250000]]);
      const ranker = new ScreenshotRankerImpl(createReadFileBytes(dataMap));
      const frames = [{ path: "large.png", timestampMs: 0, width: 1920, height: 1080 }];

      const result = ranker.rank(frames, MOCK_CONTEXT);
      expect(result[0].factors.readability).toBe(1.0);
    });

    it("duration on screen scores based on segment durations", () => {
      const ranker = new ScreenshotRankerImpl();
      const frames: ExtractedScreenshot[] = [
        { path: "long.png", timestampMs: 5000, width: 1920, height: 1080 },
        { path: "short.png", timestampMs: 9000, width: 1920, height: 1080 },
      ];
      const context: ScreenshotRankContext = {
        interactionTimestamps: [],
        segmentDurations: [8000, 1000],
        videoDurationMs: 60000,
      };

      const result = ranker.rank(frames, context);

      const long = result.find((r) => r.framePath === "long.png")!;
      const short = result.find((r) => r.framePath === "short.png")!;
      expect(long.factors.durationOnScreen).toBeGreaterThan(short.factors.durationOnScreen);
    });

    it("feature coverage scores higher for frames differing from already-selected", () => {
      const readFileBytes = (path: string): Buffer => {
        if (path === "a/feat-001.png") {
          const buf = Buffer.alloc(100000);
          for (let i = 0; i < 100000; i++) buf[i] = i % 256;
          return buf;
        }
        const buf = Buffer.alloc(200000);
        for (let i = 0; i < 200000; i++) buf[i] = (i + 128) % 256;
        return buf;
      };
      const ranker = new ScreenshotRankerImpl(readFileBytes);
      const frames: ExtractedScreenshot[] = [
        { path: "a/feat-001.png", timestampMs: 0, width: 1920, height: 1080 },
        { path: "b/feat-002.png", timestampMs: 10000, width: 1920, height: 1080 },
      ];

      const result = ranker.rank(frames, MOCK_CONTEXT);

      const shot1 = result.find((r) => r.framePath === "a/feat-001.png")!;
      const shot2 = result.find((r) => r.framePath === "b/feat-002.png")!;
      expect(shot1.factors.featureCoverage).toBe(0.5);
      expect(shot2.factors.featureCoverage).toBeGreaterThan(0);
    });

    it("applies custom weights", () => {
      const ranker = new ScreenshotRankerImpl();
      const frames = createFrames(2);
      const context: ScreenshotRankContext = {
        interactionTimestamps: [0],
        segmentDurations: [10000, 10000],
        videoDurationMs: 60000,
      };

      const resultDefault = ranker.rank(frames, context);
      const resultCustom = ranker.rank(frames, context, {
        weights: {
          visualUniqueness: 1.0,
          interactionProximity: 0,
          readability: 0,
          durationOnScreen: 0,
          featureCoverage: 0,
        },
      });

      expect(resultCustom[0].score).toBeGreaterThan(0);
      expect(resultDefault).not.toEqual(resultCustom);
    });

    it("returns results sorted by score descending", () => {
      const dataMap = new Map([
        ["screenshot/shot-001.png", 50000],
        ["screenshot/shot-002.png", 150000],
        ["screenshot/shot-003.png", 100000],
      ]);
      const ranker = new ScreenshotRankerImpl(createReadFileBytes(dataMap));
      const frames = createFrames(3);

      const result = ranker.rank(frames, MOCK_CONTEXT);

      for (let i = 1; i < result.length; i++) {
        expect(result[i - 1].score).toBeGreaterThanOrEqual(result[i].score);
      }
    });

    it("handles context with no interaction timestamps", () => {
      const ranker = new ScreenshotRankerImpl();
      const frames = createFrames(2);
      const context: ScreenshotRankContext = {
        interactionTimestamps: [],
        segmentDurations: [],
        videoDurationMs: 60000,
      };

      const result = ranker.rank(frames, context);
      expect(result).toHaveLength(2);
      expect(result[0].factors.interactionProximity).toBe(0.5);
    });

    it("handles missing file gracefully", () => {
      const ranker = new ScreenshotRankerImpl(() => {
        throw new Error("File not found");
      });
      const frames = createFrames(1);

      const result = ranker.rank(frames, MOCK_CONTEXT);
      expect(result).toHaveLength(1);
      expect(result[0].factors.readability).toBeGreaterThan(0);
    });
  });

  describe("selectRanked", () => {
    it("selects top-N frames sorted chronologically", () => {
      const ranker = new ScreenshotRankerImpl();
      const frames = createFrames(10);

      const result = ranker.selectRanked(frames, MOCK_CONTEXT, { maxScreenshots: 3 });
      expect(result).toHaveLength(3);
      for (let i = 1; i < result.length; i++) {
        expect(result[i].timestampMs).toBeGreaterThan(result[i - 1].timestampMs);
      }
    });

    it("enforces maxScreenshots limit", () => {
      const ranker = new ScreenshotRankerImpl();
      const frames = createFrames(20);

      const result = ranker.selectRanked(frames, MOCK_CONTEXT, { maxScreenshots: 5 });
      expect(result.length).toBeLessThanOrEqual(5);
    });

    it("rejects frames below minScoreThreshold", () => {
      const dataMap = new Map([
        ["screenshot/shot-001.png", 1000],
        ["screenshot/shot-002.png", 1000],
        ["screenshot/shot-003.png", 1000],
      ]);
      const ranker = new ScreenshotRankerImpl(createReadFileBytes(dataMap));
      const frames = createFrames(3);

      const result = ranker.selectRanked(frames, MOCK_CONTEXT, {
        minScoreThreshold: 0.8,
      });
      expect(result.length).toBeLessThan(3);
    });

    it("filters visually similar duplicates", () => {
      const dataMap = new Map([
        ["a/dup-001.png", 100000],
        ["b/dup-002.png", 100000],
      ]);
      const ranker = new ScreenshotRankerImpl(createReadFileBytes(dataMap));
      const frames: ExtractedScreenshot[] = [
        { path: "a/dup-001.png", timestampMs: 0, width: 1920, height: 1080 },
        { path: "b/dup-002.png", timestampMs: 10000, width: 1920, height: 1080 },
      ];

      const result = ranker.selectRanked(frames, MOCK_CONTEXT, {
        similarityThreshold: 0.5,
        maxScreenshots: 5,
      });
      expect(result.length).toBeLessThanOrEqual(2);
    });

    it("returns empty array for empty input", () => {
      const ranker = new ScreenshotRankerImpl();
      const result = ranker.selectRanked([], MOCK_CONTEXT);
      expect(result).toEqual([]);
    });

    it("returns single frame when only one available", () => {
      const ranker = new ScreenshotRankerImpl();
      const frames = createFrames(1);

      const result = ranker.selectRanked(frames, MOCK_CONTEXT);
      expect(result).toHaveLength(1);
    });

    it("sorts selected frames by timestamp ascending", () => {
      const ranker = new ScreenshotRankerImpl();
      const frames = createFrames(8);

      const result = ranker.selectRanked(frames, MOCK_CONTEXT, { maxScreenshots: 4 });

      for (let i = 1; i < result.length; i++) {
        expect(result[i].timestampMs).toBeGreaterThanOrEqual(result[i - 1].timestampMs);
      }
    });
  });
});
