import { existsSync } from "fs";
import type {
  Scene,
  HighlightScoreResult,
  TimelineSegment,
  Timeline,
  TimelineAssemblerConfig,
  TimelineAssembler,
} from "../../../../packages/shared/types/index.js";

const DEFAULT_CONFIG: TimelineAssemblerConfig = {
  maxDurationMs: 60_000,
  minSegmentDurationMs: 3_000,
  introPath: null,
  outroPath: null,
};

function buildSegmentsFromScenes(
  scenes: Scene[],
  videoDurationMs: number,
): TimelineSegment[] {
  if (scenes.length === 0) {
    const chunkCount = 5;
    const chunkMs = videoDurationMs / chunkCount;
    const segments: TimelineSegment[] = [];
    for (let i = 0; i < chunkCount; i++) {
      segments.push({
        startMs: Math.round(i * chunkMs),
        endMs: Math.round((i + 1) * chunkMs),
        label: `Feature ${i + 1}`,
        priority: 0,
      });
    }
    return segments;
  }

  const sorted = [...scenes].sort((a, b) => a.timestampMs - b.timestampMs);
  const segments: TimelineSegment[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const startMs = sorted[i].timestampMs;
    const endMs = i + 1 < sorted.length ? sorted[i + 1].timestampMs : videoDurationMs;
    const duration = endMs - startMs;

    if (duration <= 0) continue;

    segments.push({
      startMs,
      endMs,
      label: `Feature ${i + 1}`,
      priority: sorted[i].score,
    });
  }

  return segments;
}

function scoreSegments(
  segments: TimelineSegment[],
  highlights: HighlightScoreResult[],
): TimelineSegment[] {
  if (highlights.length === 0) return segments;

  const sorted = [...highlights].sort((a, b) => a.timestampMs - b.timestampMs);

  return segments.map((seg) => {
    const inRange = sorted.filter(
      (h) => h.timestampMs >= seg.startMs && h.timestampMs < seg.endMs,
    );
    const maxHighlight = inRange.length > 0
      ? Math.max(...inRange.map((h) => h.score))
      : 0;
    const avgHighlight = inRange.length > 0
      ? inRange.reduce((sum, h) => sum + h.score, 0) / inRange.length
      : 0;

    const priority = (seg.priority * 0.4) + (maxHighlight * 0.35) + (avgHighlight * 0.25);

    return { ...seg, priority };
  });
}

function selectByPriority(
  segments: TimelineSegment[],
  maxDurationMs: number,
  minSegmentDurationMs: number,
): TimelineSegment[] {
  const filtered = segments.filter(
    (s) => (s.endMs - s.startMs) >= minSegmentDurationMs,
  );

  const sorted = [...filtered].sort((a, b) => b.priority - a.priority);
  const selected: TimelineSegment[] = [];
  let totalMs = 0;

  for (const seg of sorted) {
    const segMs = seg.endMs - seg.startMs;
    if (totalMs + segMs > maxDurationMs) continue;
    selected.push(seg);
    totalMs += segMs;
  }

  return selected.sort((a, b) => a.startMs - b.startMs);
}

function computeSpan(segments: TimelineSegment[]): number {
  if (segments.length === 0) return 0;
  return segments[segments.length - 1].endMs - segments[0].startMs;
}

export class TimelineAssemblerImpl implements TimelineAssembler {
  assemble(
    scenes: Scene[],
    highlights: HighlightScoreResult[],
    videoDurationMs: number,
    config?: Partial<TimelineAssemblerConfig>,
  ): Timeline {
    const cfg = { ...DEFAULT_CONFIG, ...config };

    let candidateSegments = buildSegmentsFromScenes(scenes, videoDurationMs);
    candidateSegments = scoreSegments(candidateSegments, highlights);

    let effectiveMax = cfg.maxDurationMs;
    if (cfg.introPath && existsSync(cfg.introPath)) {
      effectiveMax = Math.max(0, effectiveMax - 5_000);
    }
    if (cfg.outroPath && existsSync(cfg.outroPath)) {
      effectiveMax = Math.max(0, effectiveMax - 5_000);
    }

    const selected = selectByPriority(candidateSegments, effectiveMax, cfg.minSegmentDurationMs);

    const segments: TimelineSegment[] = [];
    let index = 1;

    if (cfg.introPath && existsSync(cfg.introPath)) {
      segments.push({
        startMs: 0,
        endMs: 5_000,
        label: "Intro",
        priority: 1.0,
      });
      index = 1;
    }

    for (const seg of selected) {
      segments.push({
        ...seg,
        label: seg.label.startsWith("Feature") ? `Feature ${index}` : seg.label,
      });
      index++;
    }

    if (cfg.outroPath && existsSync(cfg.outroPath)) {
      const lastEnd = segments.length > 0 ? segments[segments.length - 1].endMs : 0;
      segments.push({
        startMs: lastEnd,
        endMs: lastEnd + 5_000,
        label: "End",
        priority: 1.0,
      });
    }

    return {
      segments,
      spanMs: computeSpan(segments),
    };
  }
}
