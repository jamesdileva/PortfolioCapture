import type {
  FeatureChapter,
  FeatureChapterList,
  FeatureChapterGenerator,
  FeatureChapterGeneratorConfig,
  FeatureEvidence,
  Scene,
  SceneDetector,
} from "../../../../packages/shared/types/index.js";

const DEFAULT_CONFIG: FeatureChapterGeneratorConfig = {
  minChapterDurationMs: 3000,
  mergeGapMs: 1000,
  titleSource: "hybrid",
};

function formatTimestamp(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function deriveTitleFromFeature(feature: FeatureEvidence, index: number): string {
  const name = feature.featureName?.trim();
  if (name && name.length > 0) {
    return name.charAt(0).toUpperCase() + name.slice(1);
  }
  return `Feature ${index + 1}`;
}

function deriveTitleFromScene(index: number): string {
  return `Chapter ${index + 1}`;
}

function mergeCloseScenes(scenes: Scene[], mergeGapMs: number): Scene[] {
  if (scenes.length === 0) return scenes;
  const merged: Scene[] = [scenes[0]];
  for (let i = 1; i < scenes.length; i++) {
    const last = merged[merged.length - 1];
    if (scenes[i].timestampMs - last.timestampMs >= mergeGapMs) {
      merged.push(scenes[i]);
    } else if (scenes[i].score > last.score) {
      merged[merged.length - 1] = scenes[i];
    }
  }
  return merged;
}

export class FeatureChapterGeneratorImpl implements FeatureChapterGenerator {
  private sceneDetector: SceneDetector;
  private chapters: Map<string, FeatureChapterList> = new Map();

  constructor(sceneDetector: SceneDetector) {
    this.sceneDetector = sceneDetector;
  }

  async generateChapters(
    videoPath: string,
    sessionId: string,
    featureEvidence: FeatureEvidence[],
    config?: Partial<FeatureChapterGeneratorConfig>,
  ): Promise<FeatureChapterList> {
    if (!videoPath) throw new Error("videoPath is required");
    if (!sessionId) throw new Error("sessionId is required");

    const cfg = { ...DEFAULT_CONFIG, ...config };

    const scenes = await this.sceneDetector.detect(videoPath);
    const sortedScenes = mergeCloseScenes(
      [...scenes].sort((a, b) => a.timestampMs - b.timestampMs),
      cfg.mergeGapMs,
    );

    const videoDurationMs = sortedScenes.length > 0
      ? sortedScenes[sortedScenes.length - 1].timestampMs + 1000
      : 0;

    const sortedFeatures = [...featureEvidence]
      .sort((a, b) => b.confidence - a.confidence);

    const chapters: FeatureChapter[] = [];

    for (let i = 0; i < sortedScenes.length; i++) {
      const scene = sortedScenes[i];
      const nextScene = sortedScenes[i + 1];
      const endMs = nextScene ? nextScene.timestampMs : videoDurationMs;

      const chapterDuration = endMs - scene.timestampMs;
      if (chapterDuration < cfg.minChapterDurationMs && i < sortedScenes.length - 1) {
        continue;
      }

      const feature = sortedFeatures[i] ?? sortedFeatures[0] ?? null;

      let title: string;
      if (cfg.titleSource === "feature" && feature) {
        title = deriveTitleFromFeature(feature, i);
      } else if (cfg.titleSource === "scene") {
        title = deriveTitleFromScene(i);
      } else {
        title = feature ? deriveTitleFromFeature(feature, i) : deriveTitleFromScene(i);
      }

      chapters.push({
        index: i,
        title,
        startMs: scene.timestampMs,
        endMs: i === sortedScenes.length - 1 ? null : endMs,
        featureName: feature?.featureName ?? null,
        sceneScore: scene.score,
      });
    }

    if (chapters.length === 0) {
      chapters.push({
        index: 0,
        title: "Introduction",
        startMs: 0,
        endMs: null,
        featureName: null,
        sceneScore: 0,
      });
    }

    const result: FeatureChapterList = {
      sessionId,
      chapters: chapters.map((ch, idx) => ({ ...ch, index: idx })),
      totalDurationMs: videoDurationMs,
      generatedAt: new Date().toISOString(),
    };

    this.chapters.set(sessionId, result);
    return result;
  }

  getChapters(sessionId: string): FeatureChapterList | null {
    if (!sessionId) throw new Error("sessionId is required");
    return this.chapters.get(sessionId) ?? null;
  }

  saveChapters(sessionId: string, chapterList: FeatureChapterList): void {
    if (!sessionId) throw new Error("sessionId is required");
    if (!chapterList) throw new Error("chapterList is required");

    const reindexed: FeatureChapterList = {
      ...chapterList,
      sessionId,
      chapters: chapterList.chapters.map((ch, idx) => ({ ...ch, index: idx })),
    };

    this.chapters.set(sessionId, reindexed);
  }

  renameChapter(sessionId: string, chapterIndex: number, newTitle: string): FeatureChapter {
    if (!sessionId) throw new Error("sessionId is required");
    if (typeof chapterIndex !== "number") throw new Error("chapterIndex is required");
    if (!newTitle) throw new Error("newTitle is required");

    const existing = this.chapters.get(sessionId);
    if (!existing) throw new Error(`No chapters found for session ${sessionId}`);

    const chapter = existing.chapters.find((ch) => ch.index === chapterIndex);
    if (!chapter) throw new Error(`Chapter at index ${chapterIndex} not found`);

    chapter.title = newTitle;
    return chapter;
  }

  reorderChapters(sessionId: string, newOrder: number[]): FeatureChapterList {
    if (!sessionId) throw new Error("sessionId is required");
    if (!Array.isArray(newOrder)) throw new Error("newOrder must be an array");

    const existing = this.chapters.get(sessionId);
    if (!existing) throw new Error(`No chapters found for session ${sessionId}`);

    const reordered: FeatureChapter[] = [];
    for (let i = 0; i < newOrder.length; i++) {
      const originalIndex = newOrder[i];
      const chapter = existing.chapters.find((ch) => ch.index === originalIndex);
      if (!chapter) throw new Error(`Chapter at original index ${originalIndex} not found`);
      reordered.push({ ...chapter, index: i });
    }

    const result: FeatureChapterList = {
      ...existing,
      chapters: reordered,
    };

    this.chapters.set(sessionId, result);
    return result;
  }

  deleteChapters(sessionId: string): void {
    if (!sessionId) throw new Error("sessionId is required");
    this.chapters.delete(sessionId);
  }
}

export { formatTimestamp, deriveTitleFromFeature, deriveTitleFromScene };
