import type {
  HighlightScoreSignals,
  HighlightScoreConfig,
  HighlightScoreResult,
  HighlightScorer,
} from '../../../../packages/shared/types/index.js';

const DEFAULT_CONFIG: HighlightScoreConfig = {
  interactionWeight: 0.35,
  visualWeight: 0.30,
  windowWeight: 0.20,
  markerWeight: 0.15,
  markerBoost: 1.0,
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeSignals(signals: HighlightScoreSignals): {
  interaction: number;
  visual: number;
  window: number;
} {
  return {
    interaction: clamp(signals.interactionDensity, 0, 1),
    visual: clamp(signals.visualChange, 0, 1),
    window: clamp(signals.windowChange, 0, 1),
  };
}

export class HighlightScorerImpl implements HighlightScorer {
  private readonly config: HighlightScoreConfig;

  constructor(config?: Partial<HighlightScoreConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  score(
    signals: HighlightScoreSignals,
    timestampMs: number,
    config?: Partial<HighlightScoreConfig>
  ): HighlightScoreResult {
    const cfg = { ...this.config, ...config };
    const norm = normalizeSignals(signals);

    const interaction = norm.interaction * cfg.interactionWeight;
    const visual = norm.visual * cfg.visualWeight;
    const window = norm.window * cfg.windowWeight;
    const marker = signals.manualMarker ? cfg.markerWeight * cfg.markerBoost : 0;

    const raw = interaction + visual + window + marker;
    const score = clamp(raw, 0, 1);

    return {
      score,
      breakdown: {
        interaction,
        visual,
        window,
        marker,
      },
      timestampMs,
    };
  }

  scoreAll(
    segments: Array<{ signals: HighlightScoreSignals; timestampMs: number }>,
    config?: Partial<HighlightScoreConfig>
  ): HighlightScoreResult[] {
    return segments
      .map((seg) => this.score(seg.signals, seg.timestampMs, config))
      .sort((a, b) => b.score - a.score);
  }
}