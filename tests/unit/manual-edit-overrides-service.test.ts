import { describe, it, expect, beforeEach } from "vitest";
import { createTestDatabase } from "../helpers/database.js";
import type Database from "better-sqlite3";
import { SettingsRepository } from "../../packages/database/repositories/settings-repository.js";
import { SettingsService } from "../../apps/desktop/electron/services/settings-service.js";
import { ManualEditOverridesServiceImpl } from "../../apps/desktop/electron/services/manual-edit-overrides-service.js";
import type { TimelineOverrides } from "../../packages/shared/types/index.js";

const DEFAULT_OVERRIDES: TimelineOverrides = {
  selectedIndices: [],
  removedIndices: [],
  thumbnailTimestampMs: null,
  highlightIndices: [],
  customOrder: null,
};

describe("ManualEditOverridesServiceImpl", () => {
  let db: Database.Database;
  let settingsService: SettingsService;
  let service: ManualEditOverridesServiceImpl;

  beforeEach(() => {
    db = createTestDatabase();
    settingsService = new SettingsService(new SettingsRepository(db));
    service = new ManualEditOverridesServiceImpl(settingsService);
  });

  describe("getOverrides", () => {
    it("returns default overrides when none saved", () => {
      expect(service.getOverrides("session-1")).toEqual(DEFAULT_OVERRIDES);
    });

    it("throws on empty sessionId", () => {
      expect(() => service.getOverrides("")).toThrow("Session ID is required");
    });

    it("returns saved overrides", () => {
      const overrides: TimelineOverrides = {
        selectedIndices: [0, 2],
        removedIndices: [1],
        thumbnailTimestampMs: 5000,
        highlightIndices: [0],
        customOrder: [2, 0, 1],
      };
      service.saveOverrides("session-1", overrides);
      expect(service.getOverrides("session-1")).toEqual(overrides);
    });

    it("returns independent copy (not shared reference)", () => {
      const overrides: TimelineOverrides = {
        selectedIndices: [0],
        removedIndices: [],
        thumbnailTimestampMs: null,
        highlightIndices: [],
        customOrder: null,
      };
      service.saveOverrides("session-1", overrides);
      const result = service.getOverrides("session-1");
      result.selectedIndices.push(99);
      expect(service.getOverrides("session-1").selectedIndices).toEqual([0]);
    });

    it("isolates overrides per session", () => {
      service.saveOverrides("session-1", {
        selectedIndices: [0],
        removedIndices: [],
        thumbnailTimestampMs: null,
        highlightIndices: [],
        customOrder: null,
      });
      service.saveOverrides("session-2", {
        selectedIndices: [1, 2],
        removedIndices: [],
        thumbnailTimestampMs: 3000,
        highlightIndices: [],
        customOrder: null,
      });
      expect(service.getOverrides("session-1").selectedIndices).toEqual([0]);
      expect(service.getOverrides("session-2").selectedIndices).toEqual([1, 2]);
    });

    it("handles corrupted data gracefully", () => {
      settingsService.set("timeline-overrides:bad-session", "not-json{{{");
      expect(service.getOverrides("bad-session")).toEqual(DEFAULT_OVERRIDES);
    });

    it("handles partial overrides in stored JSON", () => {
      settingsService.set(
        "timeline-overrides:partial",
        JSON.stringify({ selectedIndices: [0, 1] }),
      );
      expect(service.getOverrides("partial")).toEqual({
        selectedIndices: [0, 1],
        removedIndices: [],
        thumbnailTimestampMs: null,
        highlightIndices: [],
        customOrder: null,
      });
    });
  });

  describe("saveOverrides", () => {
    it("throws on empty sessionId", () => {
      expect(() => service.saveOverrides("", DEFAULT_OVERRIDES)).toThrow(
        "Session ID is required",
      );
    });

    it("throws on null overrides", () => {
      expect(() => service.saveOverrides("session-1", null as unknown as TimelineOverrides)).toThrow(
        "Overrides are required",
      );
    });

    it("saves and retrieves overrides", () => {
      const overrides: TimelineOverrides = {
        selectedIndices: [0, 2, 4],
        removedIndices: [1, 3],
        thumbnailTimestampMs: 7500,
        highlightIndices: [0, 4],
        customOrder: [4, 2, 0],
      };
      service.saveOverrides("session-1", overrides);
      expect(service.getOverrides("session-1")).toEqual(overrides);
    });

    it("stores a copy (not shared reference)", () => {
      const overrides: TimelineOverrides = {
        selectedIndices: [0],
        removedIndices: [],
        thumbnailTimestampMs: null,
        highlightIndices: [],
        customOrder: null,
      };
      service.saveOverrides("session-1", overrides);
      overrides.selectedIndices.push(99);
      expect(service.getOverrides("session-1").selectedIndices).toEqual([0]);
    });

    it("overwrites previous overrides for same session", () => {
      service.saveOverrides("session-1", {
        selectedIndices: [0],
        removedIndices: [],
        thumbnailTimestampMs: null,
        highlightIndices: [],
        customOrder: null,
      });
      service.saveOverrides("session-1", {
        selectedIndices: [5],
        removedIndices: [0],
        thumbnailTimestampMs: 10000,
        highlightIndices: [5],
        customOrder: null,
      });
      expect(service.getOverrides("session-1")).toEqual({
        selectedIndices: [5],
        removedIndices: [0],
        thumbnailTimestampMs: 10000,
        highlightIndices: [5],
        customOrder: null,
      });
    });

    it("handles all override fields populated", () => {
      const overrides: TimelineOverrides = {
        selectedIndices: [0, 1, 2, 3],
        removedIndices: [2],
        thumbnailTimestampMs: 12345,
        highlightIndices: [0, 3],
        customOrder: [3, 1, 0, 2],
      };
      service.saveOverrides("session-full", overrides);
      expect(service.getOverrides("session-full")).toEqual(overrides);
    });

    it("persists across service instances", () => {
      service.saveOverrides("session-1", {
        selectedIndices: [1],
        removedIndices: [],
        thumbnailTimestampMs: 2000,
        highlightIndices: [],
        customOrder: null,
      });
      const service2 = new ManualEditOverridesServiceImpl(settingsService);
      expect(service2.getOverrides("session-1").selectedIndices).toEqual([1]);
      expect(service2.getOverrides("session-1").thumbnailTimestampMs).toBe(2000);
    });
  });

  describe("clearOverrides", () => {
    it("throws on empty sessionId", () => {
      expect(() => service.clearOverrides("")).toThrow("Session ID is required");
    });

    it("clears saved overrides", () => {
      service.saveOverrides("session-1", {
        selectedIndices: [0],
        removedIndices: [1],
        thumbnailTimestampMs: 5000,
        highlightIndices: [0],
        customOrder: null,
      });
      service.clearOverrides("session-1");
      expect(service.getOverrides("session-1")).toEqual(DEFAULT_OVERRIDES);
    });

    it("does not throw when no overrides exist", () => {
      expect(() => service.clearOverrides("nonexistent")).not.toThrow();
    });

    it("only clears the specified session", () => {
      service.saveOverrides("session-1", {
        selectedIndices: [0],
        removedIndices: [],
        thumbnailTimestampMs: null,
        highlightIndices: [],
        customOrder: null,
      });
      service.saveOverrides("session-2", {
        selectedIndices: [1],
        removedIndices: [],
        thumbnailTimestampMs: null,
        highlightIndices: [],
        customOrder: null,
      });
      service.clearOverrides("session-1");
      expect(service.getOverrides("session-1")).toEqual(DEFAULT_OVERRIDES);
      expect(service.getOverrides("session-2").selectedIndices).toEqual([1]);
    });
  });
});
