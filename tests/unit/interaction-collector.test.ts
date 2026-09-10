import { describe, it, expect, vi, beforeEach } from "vitest";
import { InteractionCollectorImpl } from "../../apps/desktop/electron/services/interaction-collector.js";

describe("InteractionCollectorImpl", () => {
  let registered: Map<string, () => void>;
  let collector: InteractionCollectorImpl;

  beforeEach(() => {
    registered = new Map();
    collector = new InteractionCollectorImpl({
      registerFn: (acc, cb) => { registered.set(acc, cb); return true; },
      unregisterFn: (acc) => { registered.delete(acc); return true; },
      unregisterAllFn: () => { registered.clear(); },
      config: { nowFn: () => 1000, accelerators: ["Ctrl+C", "Ctrl+V", "Tab"] },
    });
  });

  it("starts and registers accelerators", () => {
    collector.start();
    expect(registered.size).toBe(3);
    expect(registered.has("Ctrl+C")).toBe(true);
    expect(registered.has("Ctrl+V")).toBe(true);
    expect(registered.has("Tab")).toBe(true);
  });

  it("records events when accelerator fires", () => {
    collector.start();
    registered.get("Ctrl+C")!();
    registered.get("Tab")!();

    const events = collector.getEvents();
    expect(events).toHaveLength(2);
    expect(events[0].type).toBe("keyboard");
    expect(events[0].accelerator).toBe("Ctrl+C");
    expect(events[0].timestampMs).toBe(1000);
    expect(events[1].accelerator).toBe("Tab");
  });

  it("getTimestamps returns only timestamps", () => {
    collector.start();
    registered.get("Ctrl+V")!();

    const timestamps = collector.getTimestamps();
    expect(timestamps).toEqual([1000]);
  });

  it("stop unregisters all accelerators", () => {
    collector.start();
    collector.stop();
    expect(registered.size).toBe(0);
  });

  it("events ignored after stop", () => {
    collector.start();
    registered.get("Ctrl+C")!();
    const ctrlVCb = registered.get("Ctrl+V")!;
    collector.stop();
    ctrlVCb();

    expect(collector.getEvents()).toHaveLength(1);
  });

  it("start is idempotent", () => {
    collector.start();
    collector.start();
    expect(registered.size).toBe(3);
  });

  it("stop before start is safe", () => {
    expect(() => collector.stop()).not.toThrow();
  });

  it("reset clears events and stops", () => {
    collector.start();
    registered.get("Ctrl+C")!();
    collector.reset();
    expect(collector.getEvents()).toHaveLength(0);
    expect(registered.size).toBe(0);
  });

  it("uses default accelerators when none provided", () => {
    const c = new InteractionCollectorImpl({
      registerFn: (acc, cb) => { registered.set(acc, cb); return true; },
      unregisterAllFn: () => { registered.clear(); },
    });
    c.start();
    expect(registered.size).toBeGreaterThan(10);
  });

  it("tracks multiple timestamps from repeated events", () => {
    let t = 1000;
    const timeFn = () => { t += 100; return t; };
    const c = new InteractionCollectorImpl({
      registerFn: (acc, cb) => { registered.set(acc, cb); return true; },
      unregisterAllFn: () => { registered.clear(); },
      config: { nowFn: timeFn, accelerators: ["Tab"] },
    });
    c.start();
    registered.get("Tab")!();
    registered.get("Tab")!();
    registered.get("Tab")!();
    expect(c.getTimestamps()).toEqual([1100, 1200, 1300]);
  });

  it("returns independent copy from getEvents", () => {
    collector.start();
    registered.get("Ctrl+C")!();
    const events1 = collector.getEvents();
    const events2 = collector.getEvents();
    events1.pop();
    expect(collector.getEvents()).toHaveLength(1);
    expect(events2).toHaveLength(1);
  });

  it("unregisterFn failure is ignored", () => {
    const c = new InteractionCollectorImpl({
      registerFn: () => true,
      unregisterFn: () => false,
      unregisterAllFn: () => {},
    });
    c.start();
    expect(() => c.stop()).not.toThrow();
  });
});
