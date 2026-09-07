import { describe, it, expect, vi } from "vitest";
import { FeatureChapterGeneratorImpl, formatTimestamp, deriveTitleFromFeature, deriveTitleFromScene } from "../../apps/desktop/electron/services/feature-chapter-generator.js";
import type { SceneDetector, Scene, FeatureEvidence } from "../../packages/shared/types/index.js";

function makeSceneDetector(scenes: Scene[]): SceneDetector {
  return { detect: vi.fn().mockResolvedValue(scenes) };
}

function makeEvidence(overrides?: Partial<FeatureEvidence>): FeatureEvidence {
  return {
    id: "ev-1",
    projectId: "proj-1",
    featureName: "Dashboard",
    description: "Dashboard feature",
    confidence: 0.8,
    status: "accepted",
    commits: [{ sha: "abc", message: "feat: dashboard", date: "2026-01-01" }],
    screenshotPaths: [],
    recordingSegmentPaths: [],
    readmeSnippet: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("FeatureChapterGeneratorImpl", () => {
  describe("generateChapters", () => {
    it("throws on empty videoPath", async () => {
      const gen = new FeatureChapterGeneratorImpl(makeSceneDetector([]));
      await expect(gen.generateChapters("", "s1", [])).rejects.toThrow("videoPath is required");
    });

    it("throws on empty sessionId", async () => {
      const gen = new FeatureChapterGeneratorImpl(makeSceneDetector([]));
      await expect(gen.generateChapters("video.mp4", "", [])).rejects.toThrow("sessionId is required");
    });

    it("returns single Introduction chapter when no scenes detected", async () => {
      const gen = new FeatureChapterGeneratorImpl(makeSceneDetector([]));
      const result = await gen.generateChapters("video.mp4", "s1", []);
      expect(result.chapters).toHaveLength(1);
      expect(result.chapters[0].title).toBe("Introduction");
      expect(result.chapters[0].startMs).toBe(0);
      expect(result.chapters[0].endMs).toBeNull();
    });

    it("generates chapters from scene transitions", async () => {
      const scenes: Scene[] = [
        { timestampMs: 0, score: 1.0 },
        { timestampMs: 5000, score: 0.9 },
        { timestampMs: 12000, score: 0.8 },
      ];
      const gen = new FeatureChapterGeneratorImpl(makeSceneDetector(scenes));
      const result = await gen.generateChapters("video.mp4", "s1", []);
      expect(result.chapters.length).toBeGreaterThanOrEqual(2);
      expect(result.chapters[0].startMs).toBe(0);
      expect(result.chapters[1].startMs).toBe(5000);
    });

    it("uses feature titles in hybrid mode", async () => {
      const scenes: Scene[] = [
        { timestampMs: 0, score: 1.0 },
        { timestampMs: 8000, score: 0.9 },
      ];
      const evidence = [makeEvidence({ featureName: "Analytics" })];
      const gen = new FeatureChapterGeneratorImpl(makeSceneDetector(scenes));
      const result = await gen.generateChapters("video.mp4", "s1", evidence);
      expect(result.chapters[0].title).toBe("Analytics");
    });

    it("uses scene titles in scene mode", async () => {
      const scenes: Scene[] = [
        { timestampMs: 0, score: 1.0 },
        { timestampMs: 8000, score: 0.9 },
      ];
      const gen = new FeatureChapterGeneratorImpl(makeSceneDetector(scenes));
      const result = await gen.generateChapters("video.mp4", "s1", [], { titleSource: "scene" });
      expect(result.chapters[0].title).toBe("Chapter 1");
    });

    it("uses feature titles in feature mode", async () => {
      const scenes: Scene[] = [
        { timestampMs: 0, score: 1.0 },
        { timestampMs: 8000, score: 0.9 },
      ];
      const evidence = [makeEvidence({ featureName: "export" })];
      const gen = new FeatureChapterGeneratorImpl(makeSceneDetector(scenes));
      const result = await gen.generateChapters("video.mp4", "s1", evidence, { titleSource: "feature" });
      expect(result.chapters[0].title).toBe("Export");
    });

    it("falls back to Chapter N when no features and titleSource is feature", async () => {
      const scenes: Scene[] = [
        { timestampMs: 0, score: 1.0 },
        { timestampMs: 8000, score: 0.9 },
      ];
      const gen = new FeatureChapterGeneratorImpl(makeSceneDetector(scenes));
      const result = await gen.generateChapters("video.mp4", "s1", [], { titleSource: "feature" });
      expect(result.chapters[0].title).toBe("Chapter 1");
    });

    it("filters short chapters below minChapterDurationMs", async () => {
      const scenes: Scene[] = [
        { timestampMs: 0, score: 1.0 },
        { timestampMs: 1000, score: 0.9 },
        { timestampMs: 8000, score: 0.8 },
      ];
      const gen = new FeatureChapterGeneratorImpl(makeSceneDetector(scenes));
      const result = await gen.generateChapters("video.mp4", "s1", [], { minChapterDurationMs: 3000 });
      const firstChapter = result.chapters.find((c) => c.startMs === 0);
      expect(firstChapter).toBeUndefined();
    });

    it("merges close scenes within mergeGapMs", async () => {
      const scenes: Scene[] = [
        { timestampMs: 0, score: 1.0 },
        { timestampMs: 500, score: 0.5 },
        { timestampMs: 8000, score: 0.9 },
      ];
      const gen = new FeatureChapterGeneratorImpl(makeSceneDetector(scenes));
      const result = await gen.generateChapters("video.mp4", "s1", [], { mergeGapMs: 1000 });
      expect(result.chapters).toHaveLength(2);
      expect(result.chapters[0].sceneScore).toBe(1.0);
    });

    it("sets endMs to null for last chapter", async () => {
      const scenes: Scene[] = [
        { timestampMs: 0, score: 1.0 },
        { timestampMs: 8000, score: 0.9 },
      ];
      const gen = new FeatureChapterGeneratorImpl(makeSceneDetector(scenes));
      const result = await gen.generateChapters("video.mp4", "s1", []);
      expect(result.chapters[result.chapters.length - 1].endMs).toBeNull();
    });

    it("includes featureName from evidence", async () => {
      const scenes: Scene[] = [
        { timestampMs: 0, score: 1.0 },
        { timestampMs: 8000, score: 0.9 },
      ];
      const evidence = [makeEvidence({ featureName: "Login" })];
      const gen = new FeatureChapterGeneratorImpl(makeSceneDetector(scenes));
      const result = await gen.generateChapters("video.mp4", "s1", evidence);
      expect(result.chapters[0].featureName).toBe("Login");
    });

    it("sorts features by confidence descending", async () => {
      const scenes: Scene[] = [
        { timestampMs: 0, score: 1.0 },
        { timestampMs: 8000, score: 0.9 },
      ];
      const evidence = [
        makeEvidence({ featureName: "Low", confidence: 0.3 }),
        makeEvidence({ id: "ev-2", featureName: "High", confidence: 0.9 }),
      ];
      const gen = new FeatureChapterGeneratorImpl(makeSceneDetector(scenes));
      const result = await gen.generateChapters("video.mp4", "s1", evidence);
      expect(result.chapters[0].featureName).toBe("High");
    });

    it("sets sessionId and generatedAt in result", async () => {
      const gen = new FeatureChapterGeneratorImpl(makeSceneDetector([]));
      const result = await gen.generateChapters("video.mp4", "s1", []);
      expect(result.sessionId).toBe("s1");
      expect(result.generatedAt).toBeTruthy();
    });

    it("chapter indices are sequential starting from 0", async () => {
      const scenes: Scene[] = [
        { timestampMs: 0, score: 1.0 },
        { timestampMs: 5000, score: 0.9 },
        { timestampMs: 12000, score: 0.8 },
      ];
      const gen = new FeatureChapterGeneratorImpl(makeSceneDetector(scenes));
      const result = await gen.generateChapters("video.mp4", "s1", []);
      result.chapters.forEach((ch, idx) => {
        expect(ch.index).toBe(idx);
      });
    });
  });

  describe("getChapters", () => {
    it("returns null for unknown session", () => {
      const gen = new FeatureChapterGeneratorImpl(makeSceneDetector([]));
      expect(gen.getChapters("unknown")).toBeNull();
    });

    it("throws on empty sessionId", () => {
      const gen = new FeatureChapterGeneratorImpl(makeSceneDetector([]));
      expect(() => gen.getChapters("")).toThrow("sessionId is required");
    });

    it("returns previously generated chapters", async () => {
      const gen = new FeatureChapterGeneratorImpl(makeSceneDetector([]));
      await gen.generateChapters("video.mp4", "s1", []);
      expect(gen.getChapters("s1")).not.toBeNull();
    });
  });

  describe("saveChapters", () => {
    it("throws on empty sessionId", () => {
      const gen = new FeatureChapterGeneratorImpl(makeSceneDetector([]));
      expect(() => gen.saveChapters("", { sessionId: "s1", chapters: [], totalDurationMs: 0, generatedAt: "" })).toThrow("sessionId is required");
    });

    it("throws on null chapterList", () => {
      const gen = new FeatureChapterGeneratorImpl(makeSceneDetector([]));
      expect(() => gen.saveChapters("s1", null as any)).toThrow("chapterList is required");
    });

    it("saves and retrieves chapters", async () => {
      const gen = new FeatureChapterGeneratorImpl(makeSceneDetector([]));
      const chapters = { sessionId: "s1", chapters: [{ index: 0, title: "Test", startMs: 0, endMs: null, featureName: null, sceneScore: 1.0 }], totalDurationMs: 10000, generatedAt: "" };
      gen.saveChapters("s1", chapters);
      const result = gen.getChapters("s1");
      expect(result?.chapters[0].title).toBe("Test");
    });

    it("reindexes chapter indices on save", () => {
      const gen = new FeatureChapterGeneratorImpl(makeSceneDetector([]));
      const chapters = { sessionId: "s1", chapters: [{ index: 5, title: "A", startMs: 0, endMs: null, featureName: null, sceneScore: 1.0 }], totalDurationMs: 10000, generatedAt: "" };
      gen.saveChapters("s1", chapters);
      expect(gen.getChapters("s1")?.chapters[0].index).toBe(0);
    });
  });

  describe("renameChapter", () => {
    it("throws on empty sessionId", () => {
      const gen = new FeatureChapterGeneratorImpl(makeSceneDetector([]));
      expect(() => gen.renameChapter("", 0, "New")).toThrow("sessionId is required");
    });

    it("throws on missing chapterIndex", () => {
      const gen = new FeatureChapterGeneratorImpl(makeSceneDetector([]));
      expect(() => gen.renameChapter("s1", undefined as any, "New")).toThrow("chapterIndex is required");
    });

    it("throws on empty newTitle", () => {
      const gen = new FeatureChapterGeneratorImpl(makeSceneDetector([]));
      expect(() => gen.renameChapter("s1", 0, "")).toThrow("newTitle is required");
    });

    it("throws on unknown session", () => {
      const gen = new FeatureChapterGeneratorImpl(makeSceneDetector([]));
      expect(() => gen.renameChapter("unknown", 0, "New")).toThrow("No chapters found");
    });

    it("throws on nonexistent chapter index", async () => {
      const gen = new FeatureChapterGeneratorImpl(makeSceneDetector([]));
      await gen.generateChapters("video.mp4", "s1", []);
      expect(() => gen.renameChapter("s1", 99, "New")).toThrow("not found");
    });

    it("renames chapter and returns it", async () => {
      const scenes: Scene[] = [
        { timestampMs: 0, score: 1.0 },
        { timestampMs: 8000, score: 0.9 },
      ];
      const gen = new FeatureChapterGeneratorImpl(makeSceneDetector(scenes));
      await gen.generateChapters("video.mp4", "s1", []);
      const chapter = gen.renameChapter("s1", 0, "My Chapter");
      expect(chapter.title).toBe("My Chapter");
    });
  });

  describe("reorderChapters", () => {
    it("throws on empty sessionId", () => {
      const gen = new FeatureChapterGeneratorImpl(makeSceneDetector([]));
      expect(() => gen.reorderChapters("", [])).toThrow("sessionId is required");
    });

    it("throws on non-array newOrder", () => {
      const gen = new FeatureChapterGeneratorImpl(makeSceneDetector([]));
      expect(() => gen.reorderChapters("s1", null as any)).toThrow("newOrder must be an array");
    });

    it("throws on unknown session", () => {
      const gen = new FeatureChapterGeneratorImpl(makeSceneDetector([]));
      expect(() => gen.reorderChapters("unknown", [0, 1])).toThrow("No chapters found");
    });

    it("throws on invalid original index", async () => {
      const scenes: Scene[] = [
        { timestampMs: 0, score: 1.0 },
        { timestampMs: 8000, score: 0.9 },
      ];
      const gen = new FeatureChapterGeneratorImpl(makeSceneDetector(scenes));
      await gen.generateChapters("video.mp4", "s1", []);
      expect(() => gen.reorderChapters("s1", [1, 99])).toThrow("not found");
    });

    it("reorders chapters", async () => {
      const scenes: Scene[] = [
        { timestampMs: 0, score: 1.0 },
        { timestampMs: 8000, score: 0.9 },
      ];
      const gen = new FeatureChapterGeneratorImpl(makeSceneDetector(scenes));
      await gen.generateChapters("video.mp4", "s1", []);
      const result = gen.reorderChapters("s1", [1, 0]);
      expect(result.chapters[0].index).toBe(0);
      expect(result.chapters[1].index).toBe(1);
    });

    it("preserves chapter data after reorder", async () => {
      const scenes: Scene[] = [
        { timestampMs: 0, score: 1.0 },
        { timestampMs: 8000, score: 0.9 },
      ];
      const evidence = [makeEvidence({ featureName: "A" }), makeEvidence({ id: "ev-2", featureName: "B" })];
      const gen = new FeatureChapterGeneratorImpl(makeSceneDetector(scenes));
      await gen.generateChapters("video.mp4", "s1", evidence);
      const original = gen.getChapters("s1");
      gen.reorderChapters("s1", [1, 0]);
      const reordered = gen.getChapters("s1");
      expect(reordered?.chapters[0].startMs).toBe(original?.chapters[1].startMs);
      expect(reordered?.chapters[1].startMs).toBe(original?.chapters[0].startMs);
    });
  });

  describe("deleteChapters", () => {
    it("throws on empty sessionId", () => {
      const gen = new FeatureChapterGeneratorImpl(makeSceneDetector([]));
      expect(() => gen.deleteChapters("")).toThrow("sessionId is required");
    });

    it("deletes chapters", async () => {
      const gen = new FeatureChapterGeneratorImpl(makeSceneDetector([]));
      await gen.generateChapters("video.mp4", "s1", []);
      expect(gen.getChapters("s1")).not.toBeNull();
      gen.deleteChapters("s1");
      expect(gen.getChapters("s1")).toBeNull();
    });

    it("does not throw when deleting nonexistent session", () => {
      const gen = new FeatureChapterGeneratorImpl(makeSceneDetector([]));
      expect(() => gen.deleteChapters("unknown")).not.toThrow();
    });
  });
});

describe("formatTimestamp", () => {
  it("formats 0ms as 00:00", () => {
    expect(formatTimestamp(0)).toBe("00:00");
  });

  it("formats 65000ms as 01:05", () => {
    expect(formatTimestamp(65000)).toBe("01:05");
  });

  it("formats 3661000ms as 61:01", () => {
    expect(formatTimestamp(3661000)).toBe("61:01");
  });
});

describe("deriveTitleFromFeature", () => {
  it("capitalizes feature name", () => {
    const ev = makeEvidence({ featureName: "dashboard" });
    expect(deriveTitleFromFeature(ev, 0)).toBe("Dashboard");
  });

  it("falls back to Feature N when empty name", () => {
    const ev = makeEvidence({ featureName: "" });
    expect(deriveTitleFromFeature(ev, 2)).toBe("Feature 3");
  });

  it("falls back to Feature N when whitespace name", () => {
    const ev = makeEvidence({ featureName: "   " });
    expect(deriveTitleFromFeature(ev, 0)).toBe("Feature 1");
  });
});

describe("deriveTitleFromScene", () => {
  it("returns Chapter N", () => {
    expect(deriveTitleFromScene(0)).toBe("Chapter 1");
    expect(deriveTitleFromScene(4)).toBe("Chapter 5");
  });
});
