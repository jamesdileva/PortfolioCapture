import { describe, it, expect, beforeEach } from "vitest";
import { createTestDatabase } from "../helpers/database.js";
import type Database from "better-sqlite3";
import { SettingsRepository } from "../../packages/database/repositories/settings-repository.js";
import { SettingsService } from "../../apps/desktop/electron/services/settings-service.js";
import { ThemeServiceImpl } from "../../apps/desktop/electron/services/theme-service.js";

describe("ThemeServiceImpl", () => {
  let db: Database.Database;
  let settingsService: SettingsService;
  let service: ThemeServiceImpl;

  beforeEach(() => {
    db = createTestDatabase();
    settingsService = new SettingsService(new SettingsRepository(db));
    service = new ThemeServiceImpl(settingsService);
  });

  describe("listThemes", () => {
    it("returns all 5 built-in themes", () => {
      const themes = service.listThemes();
      expect(themes).toHaveLength(5);
      expect(themes.map((t) => t.name)).toEqual(["minimal", "developer", "dark", "grid", "resume"]);
    });

    it("each theme has required fields", () => {
      const themes = service.listThemes();
      for (const theme of themes) {
        expect(theme.name).toBeTruthy();
        expect(theme.label).toBeTruthy();
        expect(theme.colors.background).toBeTruthy();
        expect(theme.colors.text).toBeTruthy();
        expect(theme.colors.accent).toBeTruthy();
        expect(theme.fontFamily).toBeTruthy();
        expect(theme.borderRadius).toBeDefined();
        expect(theme.gridColumns).toBeTruthy();
        expect(["flat", "bordered", "elevated"]).toContain(theme.cardStyle);
      }
    });
  });

  describe("getTheme", () => {
    it("returns theme by name", () => {
      const theme = service.getTheme("minimal");
      expect(theme.name).toBe("minimal");
      expect(theme.label).toBe("Minimal");
    });

    it("returns developer theme (dark, monospace)", () => {
      const theme = service.getTheme("developer");
      expect(theme.colors.background).toBe("#0d1117");
      expect(theme.fontFamily).toContain("monospace");
    });

    it("returns dark theme", () => {
      const theme = service.getTheme("dark");
      expect(theme.colors.background).toBe("#121212");
    });

    it("returns grid theme with tighter columns", () => {
      const theme = service.getTheme("grid");
      expect(theme.gridColumns).toContain("280px");
    });

    it("returns resume theme with serif font", () => {
      const theme = service.getTheme("resume");
      expect(theme.fontFamily).toContain("Georgia");
      expect(theme.gridColumns).toBe("1fr");
    });

    it("throws on unknown theme", () => {
      expect(() => service.getTheme("unknown" as any)).toThrow("Unknown theme");
    });
  });

  describe("getActiveThemeName / setActiveTheme", () => {
    it("defaults to developer", () => {
      expect(service.getActiveThemeName()).toBe("developer");
    });

    it("persists theme selection", () => {
      service.setActiveTheme("minimal");
      expect(service.getActiveThemeName()).toBe("minimal");
    });

    it("persists across instances", () => {
      service.setActiveTheme("resume");
      const service2 = new ThemeServiceImpl(settingsService);
      expect(service2.getActiveThemeName()).toBe("resume");
    });

    it("getTheme respects active theme", () => {
      service.setActiveTheme("grid");
      const theme = service.getTheme(service.getActiveThemeName());
      expect(theme.name).toBe("grid");
    });

    it("throws on unknown theme name", () => {
      expect(() => service.setActiveTheme("nope" as any)).toThrow("Unknown theme");
    });
  });

  describe("getCustomColors / setCustomColors", () => {
    it("returns empty object by default", () => {
      expect(service.getCustomColors()).toEqual({});
    });

    it("stores and retrieves custom colors", () => {
      service.setCustomColors({ background: "#ff0000", accent: "#00ff00" });
      const colors = service.getCustomColors();
      expect(colors.background).toBe("#ff0000");
      expect(colors.accent).toBe("#00ff00");
    });

    it("applies custom colors on top of theme", () => {
      service.setCustomColors({ background: "#custom-bg" });
      const theme = service.getTheme("developer");
      expect(theme.colors.background).toBe("#custom-bg");
      expect(theme.colors.text).toBe("#e6edf3");
    });

    it("persists across instances", () => {
      service.setCustomColors({ accent: "#123456" });
      const service2 = new ThemeServiceImpl(settingsService);
      expect(service2.getCustomColors().accent).toBe("#123456");
    });

    it("returns empty for corrupted JSON", () => {
      settingsService.set("portfolio:customColors", "not-json");
      expect(service.getCustomColors()).toEqual({});
    });
  });

  describe("theme distinctiveness", () => {
    it("all themes have unique names", () => {
      const names = service.listThemes().map((t) => t.name);
      expect(new Set(names).size).toBe(5);
    });

    it("resume uses single column layout", () => {
      expect(service.getTheme("resume").gridColumns).toBe("1fr");
    });

    it("minimal uses no border radius", () => {
      expect(service.getTheme("minimal").borderRadius).toBe("0");
    });

    it("dark uses elevated card style", () => {
      expect(service.getTheme("dark").cardStyle).toBe("elevated");
    });
  });
});
