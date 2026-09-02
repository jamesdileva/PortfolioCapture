import type {
  IdleSegment,
  IdleDetectorConfig,
} from "../../../../packages/shared/types/index.js";

export type NowFn = () => number;

const DEFAULT_CONFIG: IdleDetectorConfig = {
  idleTimeoutMs: 15_000,
  pollIntervalMs: 1_000,
};

export class IdleDetectorImpl {
  private config: IdleDetectorConfig;
  private nowFn: NowFn;
  private segments: IdleSegment[] = [];
  private lastActivityAt: number;
  private currentIdle = false;
  private segmentStart: number;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private idleCallbacks: Array<() => void> = [];
  private activeCallbacks: Array<() => void> = [];

  constructor(config?: Partial<IdleDetectorConfig>, nowFn?: NowFn) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.nowFn = nowFn ?? (() => Date.now());
    this.lastActivityAt = this.nowFn();
    this.segmentStart = this.lastActivityAt;
  }

  start(): void {
    if (this.pollTimer) return;
    this.running = true;
    this.pollTimer = setInterval(() => {
      this.check();
    }, this.config.pollIntervalMs);
  }

  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.running = false;
    this.check();
    this.finalizeCurrentSegment();
    this.segmentStart = this.nowFn();
  }

  recordActivity(): void {
    const now = this.nowFn();
    this.lastActivityAt = now;

    if (this.currentIdle) {
      this.finalizeCurrentSegment();
      this.segmentStart = now;
      this.currentIdle = false;
      for (const cb of this.activeCallbacks) {
        cb();
      }
    }
  }

  isIdle(): boolean {
    return this.currentIdle;
  }

  getTimeline(): IdleSegment[] {
    this.check();
    const result = [...this.segments];
    if (this.running && this.segmentStart < this.nowFn()) {
      result.push({
        startMs: this.segmentStart,
        endMs: this.nowFn(),
        idle: this.currentIdle,
      });
    }
    return result;
  }

  onIdle(callback: () => void): void {
    this.idleCallbacks.push(callback);
  }

  onActive(callback: () => void): void {
    this.activeCallbacks.push(callback);
  }

  check(): void {
    const now = this.nowFn();
    const elapsed = now - this.lastActivityAt;

    if (!this.currentIdle && elapsed >= this.config.idleTimeoutMs) {
      const idleStartsAt = this.lastActivityAt + this.config.idleTimeoutMs;

      if (this.segmentStart < idleStartsAt) {
        this.segments.push({
          startMs: this.segmentStart,
          endMs: idleStartsAt,
          idle: false,
        });
      }

      this.segmentStart = idleStartsAt;
      this.currentIdle = true;
      for (const cb of this.idleCallbacks) {
        cb();
      }
    }
  }

  private finalizeCurrentSegment(): void {
    const now = this.nowFn();
    if (this.segmentStart < now) {
      this.segments.push({
        startMs: this.segmentStart,
        endMs: now,
        idle: this.currentIdle,
      });
    }
  }
}
