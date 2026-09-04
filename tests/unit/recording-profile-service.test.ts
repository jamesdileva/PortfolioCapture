import { describe, it, expect, beforeEach } from "vitest";
import { createTestDatabase } from "../helpers/database.js";
import type Database from "better-sqlite3";
import { SettingsRepository } from "../../packages/database/repositories/settings-repository.js";
import { SettingsService } from "../../apps/desktop/electron/services/settings-service.js";
import { RecordingProfileServiceImpl } from "../../apps/desktop/electron/services/recording-profile-service.js";

describe("RecordingProfileServiceImpl", () => {
  let db: Database.Database;
  let settingsService: SettingsService;
  let service: RecordingProfileServiceImpl;

  beforeEach(() => {
    db = createTestDatabase();
    settingsService = new SettingsService(new SettingsRepository(db));
    service = new RecordingProfileServiceImpl(settingsService);
  });

  describe("list", () => {
    it("returns empty array when no profiles exist", () => {
      expect(service.list()).toEqual([]);
    });

    it("returns all created profiles", () => {
      service.create({ name: "Custom 1", settings: {} });
      service.create({ name: "Custom 2", settings: {} });
      expect(service.list()).toHaveLength(2);
    });
  });

  describe("create", () => {
    it("creates a profile with default settings", () => {
      const profile = service.create({ name: "Test", settings: {} });
      expect(profile.name).toBe("Test");
      expect(profile.isPreset).toBe(false);
      expect(profile.settings.fps).toBe(30);
      expect(profile.settings.width).toBe(1920);
      expect(profile.settings.height).toBe(1080);
      expect(profile.settings.audio).toBe("none");
    });

    it("applies partial settings overrides", () => {
      const profile = service.create({
        name: "720p",
        settings: { width: 1280, height: 720, fps: 60 },
      });
      expect(profile.settings.width).toBe(1280);
      expect(profile.settings.height).toBe(720);
      expect(profile.settings.fps).toBe(60);
      expect(profile.settings.audio).toBe("none");
    });

    it("persists across instances", () => {
      service.create({ name: "Persistent", settings: {} });
      const service2 = new RecordingProfileServiceImpl(settingsService);
      expect(service2.list()).toHaveLength(1);
      expect(service2.list()[0].name).toBe("Persistent");
    });

    it("generates unique ids", () => {
      const p1 = service.create({ name: "A", settings: {} });
      const p2 = service.create({ name: "B", settings: {} });
      expect(p1.id).not.toBe(p2.id);
    });
  });

  describe("getById", () => {
    it("returns profile by id", () => {
      const created = service.create({ name: "FindMe", settings: {} });
      const found = service.getById(created.id);
      expect(found).not.toBeNull();
      expect(found!.name).toBe("FindMe");
    });

    it("returns null for nonexistent id", () => {
      expect(service.getById("nonexistent")).toBeNull();
    });
  });

  describe("update", () => {
    it("updates name", () => {
      const created = service.create({ name: "Old", settings: {} });
      const updated = service.update(created.id, { name: "New" });
      expect(updated.name).toBe("New");
    });

    it("updates settings partially", () => {
      const created = service.create({ name: "T", settings: { fps: 24 } });
      const updated = service.update(created.id, { settings: { fps: 60 } });
      expect(updated.settings.fps).toBe(60);
      expect(updated.settings.width).toBe(1920);
    });

    it("updates description", () => {
      const created = service.create({ name: "T", settings: {} });
      const updated = service.update(created.id, { description: "New desc" });
      expect(updated.description).toBe("New desc");
    });

    it("bumps updatedAt", () => {
      const created = service.create({ name: "T", settings: {} });
      const updated = service.update(created.id, { name: "T2" });
      expect(updated.updatedAt >= created.updatedAt).toBe(true);
    });

    it("throws for nonexistent id", () => {
      expect(() => service.update("nope", { name: "X" })).toThrow("Profile nope not found");
    });
  });

  describe("delete", () => {
    it("deletes a custom profile", () => {
      const created = service.create({ name: "D", settings: {} });
      service.delete(created.id);
      expect(service.getById(created.id)).toBeNull();
    });

    it("throws for nonexistent id", () => {
      expect(() => service.delete("nope")).toThrow("Profile nope not found");
    });

    it("persists deletion", () => {
      const created = service.create({ name: "D", settings: {} });
      service.delete(created.id);
      const service2 = new RecordingProfileServiceImpl(settingsService);
      expect(service2.list()).toHaveLength(0);
    });
  });

  describe("getPreset", () => {
    it("returns quick_demo preset with correct settings", () => {
      const preset = service.getPreset("quick_demo");
      expect(preset.isPreset).toBe(true);
      expect(preset.presetName).toBe("quick_demo");
      expect(preset.name).toBe("Quick Demo");
      expect(preset.settings.width).toBe(1280);
      expect(preset.settings.height).toBe(720);
      expect(preset.settings.fps).toBe(30);
    });

    it("returns portfolio_demo preset", () => {
      const preset = service.getPreset("portfolio_demo");
      expect(preset.isPreset).toBe(true);
      expect(preset.settings.width).toBe(1920);
      expect(preset.settings.height).toBe(1080);
    });

    it("returns long_session preset", () => {
      const preset = service.getPreset("long_session");
      expect(preset.isPreset).toBe(true);
      expect(preset.settings.maxScreenshots).toBe(10);
      expect(preset.settings.demoTargetDurationMs).toBe(120000);
    });

    it("returns screenshot_only preset", () => {
      const preset = service.getPreset("screenshot_only");
      expect(preset.isPreset).toBe(true);
      expect(preset.settings.screenshotsOnly).toBe(true);
      expect(preset.settings.maxScreenshots).toBe(20);
    });

    it("returns manual preset with system audio", () => {
      const preset = service.getPreset("manual");
      expect(preset.isPreset).toBe(true);
      expect(preset.settings.audio).toBe("system");
      expect(preset.settings.idleTimeoutMs).toBe(0);
    });

    it("returns cached preset on second call", () => {
      const p1 = service.getPreset("quick_demo");
      const p2 = service.getPreset("quick_demo");
      expect(p1.id).toBe(p2.id);
      expect(service.list().filter((p) => p.presetName === "quick_demo")).toHaveLength(1);
    });

    it("throws for unknown preset", () => {
      expect(() => service.getPreset("unknown" as any)).toThrow("Preset unknown not found");
    });
  });

  describe("getSettingsForProfile", () => {
    it("returns a copy of settings", () => {
      const created = service.create({ name: "T", settings: { fps: 60 } });
      const settings1 = service.getSettingsForProfile(created.id);
      const settings2 = service.getSettingsForProfile(created.id);
      expect(settings1).toEqual(settings2);
      settings1.fps = 120;
      expect(service.getSettingsForProfile(created.id).fps).toBe(60);
    });

    it("throws for nonexistent profile", () => {
      expect(() => service.getSettingsForProfile("nope")).toThrow("Profile nope not found");
    });

    it("returns full settings for preset", () => {
      const preset = service.getPreset("portfolio_demo");
      const settings = service.getSettingsForProfile(preset.id);
      expect(settings.fps).toBe(30);
      expect(settings.width).toBe(1920);
      expect(settings.height).toBe(1080);
      expect(settings.audio).toBe("none");
      expect(settings.maxScreenshots).toBe(5);
    });
  });
});
