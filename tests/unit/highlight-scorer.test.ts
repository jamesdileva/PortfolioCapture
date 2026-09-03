import { describe, it, expect } from 'vitest';
import { HighlightScorerImpl } from '../../apps/desktop/electron/services/highlight-scorer';

describe('HighlightScorerImpl', () => {
  describe('score', () => {
    it('returns 0 for all-zero signals', () => {
      const scorer = new HighlightScorerImpl();
      const result = scorer.score(
        { interactionDensity: 0, visualChange: 0, windowChange: 0, manualMarker: false },
        1000
      );
      expect(result.score).toBe(0);
      expect(result.breakdown).toEqual({ interaction: 0, visual: 0, window: 0, marker: 0 });
      expect(result.timestampMs).toBe(1000);
    });

    it('returns full score for max signals with marker', () => {
      const scorer = new HighlightScorerImpl();
      const result = scorer.score(
        { interactionDensity: 1, visualChange: 1, windowChange: 1, manualMarker: true },
        5000
      );
      const expected = 0.35 + 0.30 + 0.20 + 0.15;
      expect(result.score).toBeCloseTo(expected, 10);
      expect(result.timestampMs).toBe(5000);
    });

    it('weights interaction density by 0.35', () => {
      const scorer = new HighlightScorerImpl();
      const result = scorer.score(
        { interactionDensity: 0.8, visualChange: 0, windowChange: 0, manualMarker: false },
        0
      );
      expect(result.score).toBeCloseTo(0.8 * 0.35, 10);
      expect(result.breakdown.interaction).toBeCloseTo(0.8 * 0.35, 10);
    });

    it('weights visual change by 0.30', () => {
      const scorer = new HighlightScorerImpl();
      const result = scorer.score(
        { interactionDensity: 0, visualChange: 0.6, windowChange: 0, manualMarker: false },
        0
      );
      expect(result.score).toBeCloseTo(0.6 * 0.30, 10);
      expect(result.breakdown.visual).toBeCloseTo(0.6 * 0.30, 10);
    });

    it('weights window change by 0.20', () => {
      const scorer = new HighlightScorerImpl();
      const result = scorer.score(
        { interactionDensity: 0, visualChange: 0, windowChange: 0.9, manualMarker: false },
        0
      );
      expect(result.score).toBeCloseTo(0.9 * 0.20, 10);
      expect(result.breakdown.window).toBeCloseTo(0.9 * 0.20, 10);
    });

    it('adds marker weight when manualMarker is true', () => {
      const scorer = new HighlightScorerImpl();
      const result = scorer.score(
        { interactionDensity: 0, visualChange: 0, windowChange: 0, manualMarker: true },
        0
      );
      expect(result.score).toBeCloseTo(0.15, 10);
      expect(result.breakdown.marker).toBeCloseTo(0.15, 10);
    });

    it('marker weight is 0 when manualMarker is false', () => {
      const scorer = new HighlightScorerImpl();
      const result = scorer.score(
        { interactionDensity: 0, visualChange: 0, windowChange: 0, manualMarker: false },
        0
      );
      expect(result.breakdown.marker).toBe(0);
    });

    it('clamps signal values above 1', () => {
      const scorer = new HighlightScorerImpl();
      const result = scorer.score(
        { interactionDensity: 1.5, visualChange: 2, windowChange: 3, manualMarker: false },
        0
      );
      expect(result.score).toBeCloseTo(0.35 + 0.30 + 0.20, 10);
    });

    it('clamps signal values below 0', () => {
      const scorer = new HighlightScorerImpl();
      const result = scorer.score(
        { interactionDensity: -0.5, visualChange: -1, windowChange: 0, manualMarker: false },
        0
      );
      expect(result.score).toBe(0);
    });

    it('clamps final score to max 1', () => {
      const scorer = new HighlightScorerImpl({ markerBoost: 10 });
      const result = scorer.score(
        { interactionDensity: 1, visualChange: 1, windowChange: 1, manualMarker: true },
        0
      );
      expect(result.score).toBeLessThanOrEqual(1);
    });

    it('combines all signals correctly', () => {
      const scorer = new HighlightScorerImpl();
      const result = scorer.score(
        { interactionDensity: 0.5, visualChange: 0.7, windowChange: 0.3, manualMarker: true },
        2500
      );
      const expected =
        0.5 * 0.35 + 0.7 * 0.30 + 0.3 * 0.20 + 0.15;
      expect(result.score).toBeCloseTo(expected, 10);
    });

    it('accepts custom config', () => {
      const scorer = new HighlightScorerImpl();
      const result = scorer.score(
        { interactionDensity: 1, visualChange: 0, windowChange: 0, manualMarker: false },
        0,
        { interactionWeight: 0.50 }
      );
      expect(result.score).toBeCloseTo(0.50, 10);
    });

    it('applies markerBoost multiplier', () => {
      const scorer = new HighlightScorerImpl();
      const result = scorer.score(
        { interactionDensity: 0, visualChange: 0, windowChange: 0, manualMarker: true },
        0,
        { markerBoost: 2.0 }
      );
      expect(result.breakdown.marker).toBeCloseTo(0.15 * 2.0, 10);
    });
  });

  describe('scoreAll', () => {
    it('scores all segments', () => {
      const scorer = new HighlightScorerImpl();
      const segments = [
        { signals: { interactionDensity: 0.1, visualChange: 0.1, windowChange: 0.1, manualMarker: false }, timestampMs: 100 },
        { signals: { interactionDensity: 0.9, visualChange: 0.9, windowChange: 0.9, manualMarker: true }, timestampMs: 200 },
      ];
      const results = scorer.scoreAll(segments);
      expect(results).toHaveLength(2);
    });

    it('returns results sorted by score descending', () => {
      const scorer = new HighlightScorerImpl();
      const segments = [
        { signals: { interactionDensity: 0.1, visualChange: 0.1, windowChange: 0.1, manualMarker: false }, timestampMs: 100 },
        { signals: { interactionDensity: 0.9, visualChange: 0.9, windowChange: 0.9, manualMarker: true }, timestampMs: 200 },
        { signals: { interactionDensity: 0.5, visualChange: 0.5, windowChange: 0.5, manualMarker: false }, timestampMs: 300 },
      ];
      const results = scorer.scoreAll(segments);
      expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
      expect(results[1].score).toBeGreaterThanOrEqual(results[2].score);
    });

    it('preserves timestampMs in results', () => {
      const scorer = new HighlightScorerImpl();
      const segments = [
        { signals: { interactionDensity: 0.5, visualChange: 0.5, windowChange: 0.5, manualMarker: false }, timestampMs: 5000 },
      ];
      const results = scorer.scoreAll(segments);
      expect(results[0].timestampMs).toBe(5000);
    });

    it('returns empty array for empty input', () => {
      const scorer = new HighlightScorerImpl();
      const results = scorer.scoreAll([]);
      expect(results).toEqual([]);
    });

    it('applies config to all segments', () => {
      const scorer = new HighlightScorerImpl();
      const segments = [
        { signals: { interactionDensity: 1, visualChange: 0, windowChange: 0, manualMarker: false }, timestampMs: 0 },
      ];
      const results = scorer.scoreAll(segments, { interactionWeight: 0.80 });
      expect(results[0].score).toBeCloseTo(0.80, 10);
    });

    it('deterministic for identical inputs', () => {
      const scorer = new HighlightScorerImpl();
      const seg = { signals: { interactionDensity: 0.6, visualChange: 0.4, windowChange: 0.2, manualMarker: true }, timestampMs: 1000 };
      const r1 = scorer.scoreAll([seg]);
      const r2 = scorer.scoreAll([seg]);
      expect(r1[0].score).toBe(r2[0].score);
      expect(r1[0].breakdown).toEqual(r2[0].breakdown);
    });
  });
});