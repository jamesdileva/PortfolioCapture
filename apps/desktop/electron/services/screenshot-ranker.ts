import { readFileSync } from "fs";
import type {
  ExtractedScreenshot,
  ScreenshotRankConfig,
  ScreenshotWeights,
  ScreenshotRankContext,
  RankedScreenshot,
  ScreenshotRanker,
} from "../../../../packages/shared/types/index.js";

const DEFAULT_WEIGHTS = {
  visualUniqueness: 0.30,
  interactionProximity: 0.25,
  readability: 0.20,
  durationOnScreen: 0.15,
  featureCoverage: 0.10,
};

const DEFAULT_CONFIG: ScreenshotRankConfig = {
  maxScreenshots: 6,
  minScoreThreshold: 0.2,
  similarityThreshold: 0.85,
  weights: DEFAULT_WEIGHTS,
};

function computeFileSample(fileA: string, fileB: string, readFileBytes: (path: string) => Buffer): number {
  try {
    const bufA = readFileBytes(fileA);
    const bufB = readFileBytes(fileB);
    if (bufA.length === 0 || bufB.length === 0) return 0;
    const minLen = Math.min(bufA.length, bufB.length);
    const sampleSize = Math.min(minLen, 1024);
    let matches = 0;
    for (let i = 0; i < sampleSize; i++) {
      if (bufA[i] === bufB[i]) matches++;
    }
    return matches / sampleSize;
  } catch {
    return 0;
  }
}

function computeVisualUniqueness(
  framePath: string,
  alreadySelected: string[],
  readFileBytes: (path: string) => Buffer,
): number {
  if (alreadySelected.length === 0) return 1.0;
  let maxDistance = 0;
  for (const selectedPath of alreadySelected) {
    const similarity = computeFileSample(framePath, selectedPath, readFileBytes);
    const distance = 1 - similarity;
    if (distance > maxDistance) maxDistance = distance;
  }
  return maxDistance;
}

function computeInteractionProximity(
  timestampMs: number,
  interactionTimestamps: number[],
  videoDurationMs: number,
): number {
  if (interactionTimestamps.length === 0) return 0.5;
  let minDistance = Infinity;
  for (const it of interactionTimestamps) {
    const dist = Math.abs(timestampMs - it);
    if (dist < minDistance) minDistance = dist;
  }
  const normalizedDist = minDistance / videoDurationMs;
  return Math.max(0, 1 - normalizedDist);
}

function computeReadability(fileSizeBytes: number): number {
  const minSize = 5000;
  const maxSize = 200000;
  if (fileSizeBytes < minSize) return 0.1;
  if (fileSizeBytes > maxSize) return 1.0;
  return (fileSizeBytes - minSize) / (maxSize - minSize);
}

function computeDurationOnScreen(
  timestampMs: number,
  segmentDurations: number[],
  timestamps: number[],
): number {
  if (segmentDurations.length === 0) {
    if (timestamps.length <= 1) return 1.0;
    const idx = timestamps.indexOf(timestampMs);
    if (idx < 0) return 0.5;
    const prev = idx > 0 ? timestamps[idx - 1] : 0;
    const next = idx < timestamps.length - 1 ? timestamps[idx + 1] : timestampMs;
    return Math.min(1.0, (next - prev) / 10000);
  }
  let idx = 0;
  for (let i = 0; i < timestamps.length; i++) {
    if (timestamps[i] === timestampMs) {
      idx = i;
      break;
    }
  }
  if (idx < segmentDurations.length) {
    return Math.min(1.0, segmentDurations[idx] / 10000);
  }
  return 0.5;
}

function computeFeatureCoverage(
  fileA: string,
  fileB: string,
  readFileBytes: (path: string) => Buffer,
): number {
  const sampleA = computeFileSample(fileA, fileB, readFileBytes);
  return Math.max(0, 1 - sampleA);
}

export class ScreenshotRankerImpl implements ScreenshotRanker {
  private readFileBytes: (path: string) => Buffer;

  constructor(readFileBytes?: (path: string) => Buffer) {
    this.readFileBytes = readFileBytes ?? ((p: string) => readFileSync(p));
  }

  rank(
    frames: ExtractedScreenshot[],
    context: ScreenshotRankContext,
    config?: Partial<ScreenshotRankConfig>,
  ): RankedScreenshot[] {
    const cfg = this.mergeConfig(config);
    if (frames.length === 0) return [];

    const ranked: RankedScreenshot[] = [];
    const selectedPaths: string[] = [];

    for (const frame of frames) {
      const factors = this.computeFactors(frame, context, selectedPaths, frames);
      const score = this.computeWeightedScore(factors, cfg.weights);

      ranked.push({
        framePath: frame.path,
        timestampMs: frame.timestampMs,
        score,
        factors,
      });

      selectedPaths.push(frame.path);
    }

    ranked.sort((a, b) => b.score - a.score);
    return ranked;
  }

  selectRanked(
    frames: ExtractedScreenshot[],
    context: ScreenshotRankContext,
    config?: Partial<ScreenshotRankConfig>,
  ): RankedScreenshot[] {
    const cfg = this.mergeConfig(config);
    const allRanked = this.rank(frames, context, cfg);

    const selected: RankedScreenshot[] = [];
    const selectedPaths: string[] = [];

    for (const ranked of allRanked) {
      if (selected.length >= cfg.maxScreenshots) break;
      if (ranked.score < cfg.minScoreThreshold) continue;

      const isDuplicate = selectedPaths.some(
        (p) => computeFileSample(ranked.framePath, p, this.readFileBytes) >= cfg.similarityThreshold,
      );
      if (isDuplicate) continue;

      selected.push(ranked);
      selectedPaths.push(ranked.framePath);
    }

    selected.sort((a, b) => a.timestampMs - b.timestampMs);
    return selected;
  }

  private mergeConfig(config?: Partial<ScreenshotRankConfig>): ScreenshotRankConfig {
    return {
      ...DEFAULT_CONFIG,
      ...config,
      weights: { ...DEFAULT_CONFIG.weights, ...config?.weights },
    };
  }

  private computeFactors(
    frame: ExtractedScreenshot,
    context: ScreenshotRankContext,
    selectedPaths: string[],
    allFrames: ExtractedScreenshot[],
  ): RankedScreenshot["factors"] {
    let fileSizeBytes = 0;
    try {
      const buf = this.readFileBytes(frame.path);
      fileSizeBytes = buf.length;
    } catch {
      fileSizeBytes = 50000;
    }

    const visualUniqueness = computeVisualUniqueness(frame.path, selectedPaths, this.readFileBytes);
    const interactionProximity = computeInteractionProximity(
      frame.timestampMs,
      context.interactionTimestamps,
      context.videoDurationMs,
    );
    const readability = computeReadability(fileSizeBytes);
    const allTimestamps = allFrames.map((f) => f.timestampMs);
    const durationOnScreen = computeDurationOnScreen(
      frame.timestampMs,
      context.segmentDurations,
      allTimestamps,
    );
    let featureCoverage = 0.5;
    if (selectedPaths.length > 0) {
      let maxCoverage = 0;
      for (const sp of selectedPaths) {
        const cov = computeFeatureCoverage(frame.path, sp, this.readFileBytes);
        if (cov > maxCoverage) maxCoverage = cov;
      }
      featureCoverage = maxCoverage;
    }

    return {
      visualUniqueness,
      interactionProximity,
      readability,
      durationOnScreen,
      featureCoverage,
    };
  }

  private computeWeightedScore(
    factors: RankedScreenshot["factors"],
    weights: ScreenshotWeights,
  ): number {
    return (
      factors.visualUniqueness * weights.visualUniqueness +
      factors.interactionProximity * weights.interactionProximity +
      factors.readability * weights.readability +
      factors.durationOnScreen * weights.durationOnScreen +
      factors.featureCoverage * weights.featureCoverage
    );
  }
}
