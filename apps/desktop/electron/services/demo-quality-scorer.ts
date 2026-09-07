import type {
  DemoQualityFactors,
  DemoQualityBreakdown,
  DemoQualityResult,
  DemoQualityScorerConfig,
} from "../../../../packages/shared/types/index.js";

const DEFAULT_CONFIG: DemoQualityScorerConfig = {
  weights: {
    visualClarity: 0.25,
    featureCoverage: 0.30,
    deadTimeRatio: 0.20,
    durationScore: 0.15,
    screenshotQuality: 0.10,
  },
  idealDurationMs: 60_000,
  durationToleranceMs: 30_000,
};

function clamp(value: number, min: number = 0, max: number = 1): number {
  return Math.max(min, Math.min(max, value));
}

function computeDurationScore(durationMs: number, idealMs: number, toleranceMs: number): number {
  const diff = Math.abs(durationMs - idealMs);
  return clamp(1 - diff / toleranceMs);
}

function computeDeadTimeScore(idleRatio: number): number {
  return clamp(1 - idleRatio * 2);
}

function computeFeatureScore(featureCount: number): number {
  if (featureCount >= 5) return 1;
  if (featureCount >= 3) return 0.8;
  if (featureCount >= 1) return 0.5;
  return 0.1;
}

function computeScreenshotScore(screenshotCount: number): number {
  if (screenshotCount >= 4) return 1;
  if (screenshotCount >= 2) return 0.7;
  if (screenshotCount >= 1) return 0.4;
  return 0;
}

function buildBreakdown(
  factors: DemoQualityFactors,
  weights: DemoQualityScorerConfig["weights"],
): DemoQualityBreakdown[] {
  const breakdown: DemoQualityBreakdown[] = [];

  breakdown.push({
    factor: "Visual Clarity",
    score: Math.round(factors.visualClarity * 100),
    weight: weights.visualClarity,
    note: factors.visualClarity >= 0.8 ? "Good opening" : factors.visualClarity < 0.4 ? "Low frame rate" : null,
  });

  breakdown.push({
    factor: "Feature Coverage",
    score: Math.round(factors.featureCoverage * 100),
    weight: weights.featureCoverage,
    note: factors.featureCoverage >= 0.8 ? `Shows ${Math.round(factors.featureCoverage * 5)}+ features` : factors.featureCoverage < 0.3 ? "Few features shown" : null,
  });

  breakdown.push({
    factor: "Dead Time",
    score: Math.round(factors.deadTimeRatio * 100),
    weight: weights.deadTimeRatio,
    note: factors.deadTimeRatio >= 0.8 ? "Strong screenshots" : factors.deadTimeRatio < 0.5 ? `${Math.round((1 - factors.deadTimeRatio) * 100)}% idle` : null,
  });

  breakdown.push({
    factor: "Duration",
    score: Math.round(factors.durationScore * 100),
    weight: weights.durationScore,
    note: factors.durationScore >= 0.9 ? "Ideal length" : factors.durationScore < 0.5 ? "Duration could be shorter" : null,
  });

  breakdown.push({
    factor: "Screenshots",
    score: Math.round(factors.screenshotQuality * 100),
    weight: weights.screenshotQuality,
    note: factors.screenshotQuality >= 0.8 ? "Strong screenshots" : factors.screenshotQuality === 0 ? "No screenshots" : null,
  });

  return breakdown;
}

export class DemoQualityScorerImpl {
  score(
    input: {
      videoDurationMs: number;
      idleTimeMs: number;
      screenshotCount: number;
      featureCount: number;
      fps: number;
    },
    config?: Partial<DemoQualityScorerConfig>,
  ): DemoQualityResult {
    const mergedConfig: DemoQualityScorerConfig = {
      ...DEFAULT_CONFIG,
      ...config,
      weights: { ...DEFAULT_CONFIG.weights, ...config?.weights },
    };

    const idleRatio = input.videoDurationMs > 0
      ? clamp(input.idleTimeMs / input.videoDurationMs)
      : 0;

    const factors: DemoQualityFactors = {
      visualClarity: clamp(input.fps / 30),
      featureCoverage: computeFeatureScore(input.featureCount),
      deadTimeRatio: computeDeadTimeScore(idleRatio),
      durationScore: computeDurationScore(
        input.videoDurationMs,
        mergedConfig.idealDurationMs,
        mergedConfig.durationToleranceMs,
      ),
      screenshotQuality: computeScreenshotScore(input.screenshotCount),
    };

    const weightedScore =
      factors.visualClarity * mergedConfig.weights.visualClarity +
      factors.featureCoverage * mergedConfig.weights.featureCoverage +
      factors.deadTimeRatio * mergedConfig.weights.deadTimeRatio +
      factors.durationScore * mergedConfig.weights.durationScore +
      factors.screenshotQuality * mergedConfig.weights.screenshotQuality;

    const totalWeight =
      mergedConfig.weights.visualClarity +
      mergedConfig.weights.featureCoverage +
      mergedConfig.weights.deadTimeRatio +
      mergedConfig.weights.durationScore +
      mergedConfig.weights.screenshotQuality;

    const normalizedScore = totalWeight > 0 ? weightedScore / totalWeight : 0;
    const finalScore = Math.round(clamp(normalizedScore) * 100);

    return {
      score: finalScore,
      factors,
      breakdown: buildBreakdown(factors, mergedConfig.weights),
      computedAt: new Date().toISOString(),
    };
  }
}
