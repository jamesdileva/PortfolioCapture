import { describe, it, expect } from "vitest";
import { TimelineAssemblerImpl } from "../../apps/desktop/electron/services/timeline-assembler.js";
import type {
  Scene,
  HighlightScoreResult,
} from "../../packages/shared/types/index.js";

function makeHighlight(timestampMs: number, score: number): HighlightScoreResult {
  return {
    score,
    breakdown: { interaction: score, visual: 0, window: 0, marker: 0 },
    timestampMs,
  };
}

describe("TimelineAssemblerImpl", () => {
  it("creates 5 equal segments when no scenes provided", () => {
    const assembler = new TimelineAssemblerImpl();
    const timeline = assembler.assemble([], [], 60_000);

    expect(timeline.segments).toHaveLength(5);
    expect(timeline.segments[0].startMs).toBe(0);
    expect(timeline.segments[4].endMs).toBe(60_000);
    expect(timeline.segments[0].label).toBe("Feature 1");
    expect(timeline.segments[4].label).toBe("Feature 5");
  });

  it("creates segments from scene boundaries", () => {
    const scenes: Scene[] = [
      { timestampMs: 0, score: 0.8 },
      { timestampMs: 10_000, score: 0.9 },
      { timestampMs: 30_000, score: 0.7 },
    ];
    const assembler = new TimelineAssemblerImpl();
    const timeline = assembler.assemble(scenes, [], 60_000);

    expect(timeline.segments).toHaveLength(3);
    expect(timeline.segments[0]).toEqual({
      startMs: 0,
      endMs: 10_000,
      label: "Feature 1",
      priority: expect.any(Number),
    });
    expect(timeline.segments[1]).toEqual({
      startMs: 10_000,
      endMs: 30_000,
      label: "Feature 2",
      priority: expect.any(Number),
    });
    expect(timeline.segments[2]).toEqual({
      startMs: 30_000,
      endMs: 60_000,
      label: "Feature 3",
      priority: expect.any(Number),
    });
  });

  it("scores segments using highlight scores", () => {
    const scenes: Scene[] = [
      { timestampMs: 0, score: 0.5 },
      { timestampMs: 20_000, score: 0.5 },
      { timestampMs: 40_000, score: 0.5 },
    ];
    const highlights: HighlightScoreResult[] = [
      makeHighlight(5_000, 0.9),
      makeHighlight(25_000, 0.3),
      makeHighlight(45_000, 0.1),
    ];
    const assembler = new TimelineAssemblerImpl();
    const timeline = assembler.assemble(scenes, highlights, 60_000);

    expect(timeline.segments[0].priority).toBeGreaterThan(
      timeline.segments[1].priority,
    );
    expect(timeline.segments[1].priority).toBeGreaterThan(
      timeline.segments[2].priority,
    );
  });

  it("selects segments by priority within max duration", () => {
    const scenes: Scene[] = [
      { timestampMs: 0, score: 0.5 },
      { timestampMs: 5_000, score: 0.9 },
      { timestampMs: 10_000, score: 0.5 },
      { timestampMs: 15_000, score: 0.8 },
      { timestampMs: 20_000, score: 0.5 },
      { timestampMs: 25_000, score: 0.3 },
      { timestampMs: 30_000, score: 0.5 },
      { timestampMs: 35_000, score: 0.2 },
      { timestampMs: 40_000, score: 0.5 },
      { timestampMs: 45_000, score: 0.1 },
      { timestampMs: 50_000, score: 0.5 },
      { timestampMs: 55_000, score: 0.4 },
    ];
    const assembler = new TimelineAssemblerImpl();
    const timeline = assembler.assemble(scenes, [], 60_000, { maxDurationMs: 30_000 });

    const totalMs = timeline.segments.reduce(
      (sum, s) => sum + (s.endMs - s.startMs),
      0,
    );
    expect(totalMs).toBeLessThanOrEqual(30_000);
  });

  it("filters segments shorter than minSegmentDurationMs", () => {
    const scenes: Scene[] = [
      { timestampMs: 0, score: 0.5 },
      { timestampMs: 1_000, score: 0.9 },
      { timestampMs: 2_000, score: 0.5 },
      { timestampMs: 3_000, score: 0.5 },
    ];
    const assembler = new TimelineAssemblerImpl();
    const timeline = assembler.assemble(scenes, [], 4_000, {
      minSegmentDurationMs: 2_000,
    });

    expect(timeline.segments).toHaveLength(0);
  });

  it("sorts selected segments chronologically", () => {
    const scenes: Scene[] = [
      { timestampMs: 0, score: 0.3 },
      { timestampMs: 20_000, score: 0.9 },
      { timestampMs: 40_000, score: 0.5 },
    ];
    const assembler = new TimelineAssemblerImpl();
    const timeline = assembler.assemble(scenes, [], 60_000, { maxDurationMs: 30_000 });

    for (let i = 1; i < timeline.segments.length; i++) {
      expect(timeline.segments[i].startMs).toBeGreaterThanOrEqual(
        timeline.segments[i - 1].startMs,
      );
    }
  });

  it("computes spanMs from first start to last end", () => {
    const scenes: Scene[] = [
      { timestampMs: 0, score: 0.5 },
      { timestampMs: 20_000, score: 0.5 },
      { timestampMs: 40_000, score: 0.5 },
    ];
    const assembler = new TimelineAssemblerImpl();
    const timeline = assembler.assemble(scenes, [], 60_000);

    expect(timeline.spanMs).toBe(60_000);
  });

  it("returns empty timeline when all segments filtered by minSegmentDuration", () => {
    const scenes: Scene[] = [
      { timestampMs: 0, score: 0.5 },
      { timestampMs: 1_000, score: 0.5 },
      { timestampMs: 2_000, score: 0.5 },
      { timestampMs: 3_000, score: 0.5 },
    ];
    const assembler = new TimelineAssemblerImpl();
    const timeline = assembler.assemble(scenes, [], 4_000, {
      minSegmentDurationMs: 2_000,
    });

    expect(timeline.segments).toHaveLength(0);
    expect(timeline.spanMs).toBe(0);
  });

  it("deduplicates segments with same start/end", () => {
    const scenes: Scene[] = [
      { timestampMs: 10_000, score: 0.8 },
      { timestampMs: 10_000, score: 0.9 },
      { timestampMs: 30_000, score: 0.7 },
    ];
    const assembler = new TimelineAssemblerImpl();
    const timeline = assembler.assemble(scenes, [], 60_000);

    expect(timeline.segments).toHaveLength(2);
  });

  it("does not add intro/outro when paths are null", () => {
    const assembler = new TimelineAssemblerImpl();
    const timeline = assembler.assemble([], [], 60_000);

    expect(timeline.segments.every((s) => s.label !== "Intro")).toBe(true);
    expect(timeline.segments.every((s) => s.label !== "End")).toBe(true);
  });

  it("does not add intro/outro when files do not exist", () => {
    const assembler = new TimelineAssemblerImpl();
    const timeline = assembler.assemble([], [], 60_000, {
      introPath: "C:\\nonexistent\\intro.mp4",
      outroPath: "C:\\nonexistent\\outro.mp4",
    });

    expect(timeline.segments.every((s) => s.label !== "Intro")).toBe(true);
    expect(timeline.segments.every((s) => s.label !== "End")).toBe(true);
  });

  it("uses default config when none provided", () => {
    const assembler = new TimelineAssemblerImpl();
    const timeline = assembler.assemble([], [], 60_000);

    expect(timeline.segments).toHaveLength(5);
    expect(timeline.spanMs).toBe(60_000);
  });

  it("overrides config with partial values", () => {
    const scenes: Scene[] = [
      { timestampMs: 0, score: 0.5 },
      { timestampMs: 30_000, score: 0.5 },
    ];
    const assembler = new TimelineAssemblerImpl();
    const timeline = assembler.assemble(scenes, [], 60_000, {
      maxDurationMs: 15_000,
    });

    const totalMs = timeline.segments.reduce(
      (sum, s) => sum + (s.endMs - s.startMs),
      0,
    );
    expect(totalMs).toBeLessThanOrEqual(15_000);
  });

  it("prefers higher scene score when highlights absent", () => {
    const scenes: Scene[] = [
      { timestampMs: 0, score: 0.2 },
      { timestampMs: 10_000, score: 0.9 },
      { timestampMs: 20_000, score: 0.5 },
    ];
    const assembler = new TimelineAssemblerImpl();
    const timeline = assembler.assemble(scenes, [], 60_000, { maxDurationMs: 15_000 });

    expect(timeline.segments.length).toBeGreaterThan(0);
    expect(timeline.segments[0].priority).toBeGreaterThanOrEqual(
      timeline.segments[timeline.segments.length - 1].priority,
    );
  });

  it("handles empty scenes and highlights", () => {
    const assembler = new TimelineAssemblerImpl();
    const timeline = assembler.assemble([], [], 60_000);

    expect(timeline.segments).toHaveLength(5);
    expect(timeline.spanMs).toBe(60_000);
  });

  it("handles single scene", () => {
    const scenes: Scene[] = [{ timestampMs: 0, score: 0.8 }];
    const assembler = new TimelineAssemblerImpl();
    const timeline = assembler.assemble(scenes, [], 60_000);

    expect(timeline.segments).toHaveLength(1);
    expect(timeline.segments[0].startMs).toBe(0);
    expect(timeline.segments[0].endMs).toBe(60_000);
  });

  it("handles highlights outside scene boundaries", () => {
    const scenes: Scene[] = [
      { timestampMs: 10_000, score: 0.5 },
      { timestampMs: 20_000, score: 0.5 },
    ];
    const highlights: HighlightScoreResult[] = [
      makeHighlight(5_000, 0.9),
    ];
    const assembler = new TimelineAssemblerImpl();
    const timeline = assembler.assemble(scenes, highlights, 60_000);

    expect(timeline.segments).toHaveLength(2);
    expect(timeline.segments[0].priority).toBe(
      timeline.segments[1].priority,
    );
  });
});
