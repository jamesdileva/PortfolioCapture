import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { IdleDetectorImpl } from "../../apps/desktop/electron/services/idle-detector.js";

function createMockNow(initial = 0) {
  let time = initial;
  const fn = vi.fn(() => time);
  const advance = (ms: number) => { time += ms; return time; };
  return { now: fn, advance };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("IdleDetectorImpl", () => {
  describe("constructor", () => {
    it("creates with default config", () => {
      const { now } = createMockNow();
      const detector = new IdleDetectorImpl({}, now);
      expect(detector).toBeDefined();
      expect(detector.isIdle()).toBe(false);
    });

    it("creates with custom config", () => {
      const { now } = createMockNow();
      const detector = new IdleDetectorImpl({ idleTimeoutMs: 5000 }, now);
      expect(detector).toBeDefined();
    });
  });

  describe("idle detection", () => {
    it("starts in active state", () => {
      const { now } = createMockNow();
      const detector = new IdleDetectorImpl({}, now);
      expect(detector.isIdle()).toBe(false);
    });

    it("detects idle after timeout", () => {
      const { now, advance } = createMockNow(0);
      const detector = new IdleDetectorImpl({ idleTimeoutMs: 1000, pollIntervalMs: 100 }, now);

      advance(1100);
      detector.check();

      expect(detector.isIdle()).toBe(true);
    });

    it("remains active when activity before timeout", () => {
      const { now, advance } = createMockNow(0);
      const detector = new IdleDetectorImpl({ idleTimeoutMs: 1000, pollIntervalMs: 100 }, now);

      advance(500);
      detector.recordActivity();
      detector.check();

      expect(detector.isIdle()).toBe(false);
    });

    it("transitions to active on new activity", () => {
      const { now, advance } = createMockNow(0);
      const detector = new IdleDetectorImpl({ idleTimeoutMs: 1000, pollIntervalMs: 100 }, now);

      advance(1100);
      detector.check();
      expect(detector.isIdle()).toBe(true);

      detector.recordActivity();
      expect(detector.isIdle()).toBe(false);
    });
  });

  describe("callbacks", () => {
    it("fires onIdle callback when idle detected", () => {
      const { now, advance } = createMockNow(0);
      const detector = new IdleDetectorImpl({ idleTimeoutMs: 1000, pollIntervalMs: 100 }, now);
      const idleFn = vi.fn();
      detector.onIdle(idleFn);

      advance(1100);
      detector.check();

      expect(idleFn).toHaveBeenCalledTimes(1);
    });

    it("fires onActive callback when activity resumes", () => {
      const { now, advance } = createMockNow(0);
      const detector = new IdleDetectorImpl({ idleTimeoutMs: 1000, pollIntervalMs: 100 }, now);
      const activeFn = vi.fn();
      detector.onActive(activeFn);

      advance(1100);
      detector.check();

      detector.recordActivity();
      expect(activeFn).toHaveBeenCalledTimes(1);
    });

    it("does not fire onIdle repeatedly", () => {
      const { now, advance } = createMockNow(0);
      const detector = new IdleDetectorImpl({ idleTimeoutMs: 1000, pollIntervalMs: 100 }, now);
      const idleFn = vi.fn();
      detector.onIdle(idleFn);

      advance(1100);
      detector.check();
      detector.check();
      detector.check();

      expect(idleFn).toHaveBeenCalledTimes(1);
    });
  });

  describe("timeline", () => {
    it("returns active segment when running", () => {
      const { now, advance } = createMockNow(0);
      const detector = new IdleDetectorImpl({}, now);
      detector.start();

      advance(500);
      const timeline = detector.getTimeline();
      expect(timeline).toHaveLength(1);
      expect(timeline[0].idle).toBe(false);
      expect(timeline[0].startMs).toBe(0);
      expect(timeline[0].endMs).toBe(500);
      detector.stop();
    });

    it("records idle segment in timeline", () => {
      const { now, advance } = createMockNow(0);
      const detector = new IdleDetectorImpl({ idleTimeoutMs: 1000, pollIntervalMs: 100 }, now);
      detector.start();

      advance(500);
      detector.recordActivity();
      advance(1100);
      detector.check();
      advance(100);

      const timeline = detector.getTimeline();
      expect(timeline.length).toBeGreaterThanOrEqual(2);
      expect(timeline[0].idle).toBe(false);
      expect(timeline[1].idle).toBe(true);
      detector.stop();
    });

    it("records active segment after idle", () => {
      const { now, advance } = createMockNow(0);
      const detector = new IdleDetectorImpl({ idleTimeoutMs: 1000, pollIntervalMs: 100 }, now);
      detector.start();

      advance(1100);
      detector.check();
      advance(500);
      detector.recordActivity();
      advance(100);

      const timeline = detector.getTimeline();
      expect(timeline.length).toBeGreaterThanOrEqual(3);
      expect(timeline[0].idle).toBe(false);
      expect(timeline[1].idle).toBe(true);
      expect(timeline[2].idle).toBe(false);
      detector.stop();
    });

    it("finalizes segment on stop", () => {
      const { now, advance } = createMockNow(0);
      const detector = new IdleDetectorImpl({ idleTimeoutMs: 1000, pollIntervalMs: 100 }, now);
      detector.start();

      advance(500);
      detector.stop();

      const timeline = detector.getTimeline();
      expect(timeline).toHaveLength(1);
      expect(timeline[0].endMs).toBe(500);
    });

    it("finalizes segment on activity when idle", () => {
      const { now, advance } = createMockNow(0);
      const detector = new IdleDetectorImpl({ idleTimeoutMs: 1000, pollIntervalMs: 100 }, now);
      detector.start();

      advance(1100);
      detector.check();

      advance(200);
      detector.recordActivity();

      const timeline = detector.getTimeline();
      expect(timeline).toHaveLength(2);
      expect(timeline[0].idle).toBe(false);
      expect(timeline[0].endMs).toBe(1000);
      expect(timeline[1].idle).toBe(true);
      expect(timeline[1].endMs).toBe(1300);
      detector.stop();
    });
  });

  describe("start/stop", () => {
    it("start is idempotent", () => {
      const { now } = createMockNow();
      const detector = new IdleDetectorImpl({}, now);
      detector.start();
      detector.start();
      detector.stop();
    });

    it("stop is idempotent", () => {
      const { now } = createMockNow();
      const detector = new IdleDetectorImpl({}, now);
      detector.start();
      detector.stop();
      detector.stop();
    });
  });

  describe("multiple idle-active cycles", () => {
    it("tracks multiple transitions", () => {
      const { now, advance } = createMockNow(0);
      const detector = new IdleDetectorImpl({ idleTimeoutMs: 1000, pollIntervalMs: 100 }, now);
      detector.start();

      advance(500);
      detector.recordActivity();
      advance(1100);
      detector.check();
      advance(200);
      detector.recordActivity();
      advance(1100);
      detector.check();
      advance(300);
      detector.recordActivity();
      detector.stop();

      const timeline = detector.getTimeline();
      expect(timeline.length).toBeGreaterThanOrEqual(4);
      const idleCount = timeline.filter(s => s.idle).length;
      expect(idleCount).toBeGreaterThanOrEqual(1);
    });
  });
});
