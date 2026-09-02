import { mkdirSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import type {
  MediaInfo,
  FFmpegService,
  ScreenshotExtractorConfig,
  ScreenshotExtractor,
  ExtractedScreenshot,
} from "../../../../packages/shared/types/index.js";

const DEFAULT_CONFIG: ScreenshotExtractorConfig = {
  minScreenshots: 3,
  maxScreenshots: 8,
  skipFirstSeconds: 3,
  similarityThreshold: 0.05,
  intervalSeconds: 5,
};

function computeSimilarity(fileA: string, fileB: string): number {
  const bufA = readFileSync(fileA);
  const bufB = readFileSync(fileB);

  if (bufA.length === 0 || bufB.length === 0) return 0;

  const minLen = Math.min(bufA.length, bufB.length);
  const sampleSize = Math.min(minLen, 1024);

  let matches = 0;
  for (let i = 0; i < sampleSize; i++) {
    if (bufA[i] === bufB[i]) {
      matches++;
    }
  }

  return matches / sampleSize;
}

function generateCandidateTimestamps(
  durationMs: number,
  skipFirstSeconds: number,
  intervalSeconds: number,
  maxScreenshots: number,
): number[] {
  const startMs = skipFirstSeconds * 1000;
  const durationSec = durationMs / 1000;
  const candidates: number[] = [];

  for (let t = startMs; t < durationMs && candidates.length < maxScreenshots * 2; t += intervalSeconds * 1000) {
    candidates.push(t / 1000);
  }

  return candidates;
}

function selectDistributed(
  candidates: ExtractedScreenshot[],
  min: number,
  max: number,
): ExtractedScreenshot[] {
  if (candidates.length <= max) return candidates;

  const selected: ExtractedScreenshot[] = [];
  const step = (candidates.length - 1) / (max - 1);

  for (let i = 0; i < max; i++) {
    const idx = Math.round(i * step);
    selected.push(candidates[idx]);
  }

  return selected;
}

export class FfmpegScreenshotExtractor implements ScreenshotExtractor {
  private ffmpegService: FFmpegService;

  constructor(ffmpegService: FFmpegService) {
    this.ffmpegService = ffmpegService;
  }

  async extract(
    inputVideo: string,
    outputDir: string,
    config?: Partial<ScreenshotExtractorConfig>,
  ): Promise<ExtractedScreenshot[]> {
    const cfg = { ...DEFAULT_CONFIG, ...config };

    const info: MediaInfo = await this.ffmpegService.probe(inputVideo);

    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    const candidateTimestamps = generateCandidateTimestamps(
      info.durationMs,
      cfg.skipFirstSeconds,
      cfg.intervalSeconds,
      cfg.maxScreenshots,
    );

    if (candidateTimestamps.length === 0) {
      return [];
    }

    const extracted: ExtractedScreenshot[] = [];

    for (let i = 0; i < candidateTimestamps.length; i++) {
      const timestampSec = candidateTimestamps[i];
      const shotPath = join(outputDir, `shot-${String(i + 1).padStart(3, "0")}.png`);

      try {
        await this.ffmpegService.extractFrame(inputVideo, shotPath, timestampSec);
        extracted.push({
          path: shotPath,
          timestampMs: Math.round(timestampSec * 1000),
          width: info.width,
          height: info.height,
        });
      } catch {
        continue;
      }
    }

    const deduplicated: ExtractedScreenshot[] = [];
    for (const shot of extracted) {
      if (deduplicated.length === 0) {
        deduplicated.push(shot);
        continue;
      }

      const prevShot = deduplicated[deduplicated.length - 1];
      const similarity = computeSimilarity(prevShot.path, shot.path);

      if (similarity < 1 - cfg.similarityThreshold) {
        deduplicated.push(shot);
      }
    }

    const final = selectDistributed(deduplicated, cfg.minScreenshots, cfg.maxScreenshots);

    return final;
  }
}
