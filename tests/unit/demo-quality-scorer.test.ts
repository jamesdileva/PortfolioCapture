import { describe, it, expect } from "vitest";
import { DemoQualityScorerImpl } from "../../apps/desktop/electron/services/demo-quality-scorer.js";

describe("DemoQualityScorerImpl", () => {
  const scorer = new DemoQualityScorerImpl();

  it("returns a score between 0 and 100", () => {
    const result = scorer.score({
      videoDurationMs: 60000,
      idleTimeMs: 5000,
      screenshotCount: 4,
      featureCount: 3,
      fps: 30,
    });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("returns all 5 breakdown factors", () => {
    const result = scorer.score({
      videoDurationMs: 60000,
      idleTimeMs: 0,
      screenshotCount: 5,
      featureCount: 3,
      fps: 30,
    });
    expect(result.breakdown).toHaveLength(5);
    const factors = result.breakdown.map((b) => b.factor);
    expect(factors).toContain("Visual Clarity");
    expect(factors).toContain("Feature Coverage");
    expect(factors).toContain("Dead Time");
    expect(factors).toContain("Duration");
    expect(factors).toContain("Screenshots");
  });

  it("includes computedAt timestamp", () => {
    const result = scorer.score({
      videoDurationMs: 60000,
      idleTimeMs: 0,
      screenshotCount: 1,
      featureCount: 1,
      fps: 30,
    });
    expect(result.computedAt).toBeTruthy();
    expect(new Date(result.computedAt).getTime()).toBeGreaterThan(0);
  });

  it("gives high score for ideal input", () => {
    const result = scorer.score({
      videoDurationMs: 60000,
      idleTimeMs: 0,
      screenshotCount: 5,
      featureCount: 5,
      fps: 30,
    });
    expect(result.score).toBeGreaterThanOrEqual(80);
  });

  it("penalizes high idle time", () => {
    const clean = scorer.score({
      videoDurationMs: 60000,
      idleTimeMs: 5000,
      screenshotCount: 3,
      featureCount: 3,
      fps: 30,
    });
    const idle = scorer.score({
      videoDurationMs: 60000,
      idleTimeMs: 30000,
      screenshotCount: 3,
      featureCount: 3,
      fps: 30,
    });
    expect(idle.score).toBeLessThan(clean.score);
  });

  it("penalizes low fps", () => {
    const high = scorer.score({
      videoDurationMs: 60000,
      idleTimeMs: 0,
      screenshotCount: 3,
      featureCount: 3,
      fps: 30,
    });
    const low = scorer.score({
      videoDurationMs: 60000,
      idleTimeMs: 0,
      screenshotCount: 3,
      featureCount: 3,
      fps: 10,
    });
    expect(low.score).toBeLessThan(high.score);
  });

  it("penalizes few features", () => {
    const many = scorer.score({
      videoDurationMs: 60000,
      idleTimeMs: 0,
      screenshotCount: 3,
      featureCount: 5,
      fps: 30,
    });
    const few = scorer.score({
      videoDurationMs: 60000,
      idleTimeMs: 0,
      screenshotCount: 3,
      featureCount: 0,
      fps: 30,
    });
    expect(few.score).toBeLessThan(many.score);
  });

  it("penalizes no screenshots", () => {
    const withScreenshots = scorer.score({
      videoDurationMs: 60000,
      idleTimeMs: 0,
      screenshotCount: 4,
      featureCount: 3,
      fps: 30,
    });
    const noScreenshots = scorer.score({
      videoDurationMs: 60000,
      idleTimeMs: 0,
      screenshotCount: 0,
      featureCount: 3,
      fps: 30,
    });
    expect(noScreenshots.score).toBeLessThan(withScreenshots.score);
  });

  it("penalizes very short or very long duration", () => {
    const ideal = scorer.score({
      videoDurationMs: 60000,
      idleTimeMs: 0,
      screenshotCount: 3,
      featureCount: 3,
      fps: 30,
    });
    const short = scorer.score({
      videoDurationMs: 10000,
      idleTimeMs: 0,
      screenshotCount: 3,
      featureCount: 3,
      fps: 30,
    });
    const long = scorer.score({
      videoDurationMs: 300000,
      idleTimeMs: 0,
      screenshotCount: 3,
      featureCount: 3,
      fps: 30,
    });
    expect(short.score).toBeLessThan(ideal.score);
    expect(long.score).toBeLessThan(ideal.score);
  });

  it("accepts custom config weights", () => {
    const result = scorer.score(
      {
        videoDurationMs: 60000,
        idleTimeMs: 0,
        screenshotCount: 5,
        featureCount: 5,
        fps: 30,
      },
      {
        weights: {
          visualClarity: 0.1,
          featureCoverage: 0.1,
          deadTimeRatio: 0.1,
          durationScore: 0.1,
          screenshotQuality: 0.6,
        },
      },
    );
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("accepts custom ideal duration and tolerance", () => {
    const result = scorer.score(
      {
        videoDurationMs: 120000,
        idleTimeMs: 0,
        screenshotCount: 3,
        featureCount: 3,
        fps: 30,
      },
      {
        idealDurationMs: 120000,
        durationToleranceMs: 10000,
      },
    );
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("score is deterministic for identical input", () => {
    const input = {
      videoDurationMs: 45000,
      idleTimeMs: 3000,
      screenshotCount: 3,
      featureCount: 4,
      fps: 24,
    };
    const r1 = scorer.score(input);
    const r2 = scorer.score(input);
    expect(r1.score).toBe(r2.score);
    expect(r1.factors).toEqual(r2.factors);
  });

  it("handles zero video duration gracefully", () => {
    const result = scorer.score({
      videoDurationMs: 0,
      idleTimeMs: 0,
      screenshotCount: 0,
      featureCount: 0,
      fps: 0,
    });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("clamps factors to 0-1 range", () => {
    const result = scorer.score({
      videoDurationMs: 60000,
      idleTimeMs: 0,
      screenshotCount: 100,
      featureCount: 100,
      fps: 120,
    });
    expect(result.factors.visualClarity).toBeLessThanOrEqual(1);
    expect(result.factors.featureCoverage).toBeLessThanOrEqual(1);
    expect(result.factors.deadTimeRatio).toBeLessThanOrEqual(1);
    expect(result.factors.durationScore).toBeLessThanOrEqual(1);
    expect(result.factors.screenshotQuality).toBeLessThanOrEqual(1);
  });

  it("breakdown includes weight for each factor", () => {
    const result = scorer.score({
      videoDurationMs: 60000,
      idleTimeMs: 0,
      screenshotCount: 3,
      featureCount: 3,
      fps: 30,
    });
    for (const item of result.breakdown) {
      expect(item.weight).toBeGreaterThan(0);
      expect(item.weight).toBeLessThanOrEqual(1);
    }
  });

  it("idle score of 1.0 when no idle time", () => {
    const result = scorer.score({
      videoDurationMs: 60000,
      idleTimeMs: 0,
      screenshotCount: 3,
      featureCount: 3,
      fps: 30,
    });
    expect(result.factors.deadTimeRatio).toBe(1);
  });

  it("idle score decreases with more idle time", () => {
    const r1 = scorer.score({
      videoDurationMs: 60000,
      idleTimeMs: 10000,
      screenshotCount: 3,
      featureCount: 3,
      fps: 30,
    });
    const r2 = scorer.score({
      videoDurationMs: 60000,
      idleTimeMs: 50000,
      screenshotCount: 3,
      featureCount: 3,
      fps: 30,
    });
    expect(r2.factors.deadTimeRatio).toBeLessThan(r1.factors.deadTimeRatio);
  });
});
