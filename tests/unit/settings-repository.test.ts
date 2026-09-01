import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { createTestDatabase } from "../helpers/database.js";
import { SettingsRepository } from "../../packages/database/repositories/settings-repository.js";

describe("SettingsRepository", () => {
  let db: Database.Database;
  let repo: SettingsRepository;

  beforeEach(() => {
    db = createTestDatabase();
    repo = new SettingsRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it("sets and gets a value", () => {
    repo.set("theme", "dark");
    expect(repo.get("theme")).toBe("dark");
  });

  it("returns null for nonexistent key", () => {
    expect(repo.get("nonexistent")).toBeNull();
  });

  it("overwrites existing value", () => {
    repo.set("theme", "dark");
    repo.set("theme", "light");
    expect(repo.get("theme")).toBe("light");
  });

  it("gets all settings", () => {
    repo.set("theme", "dark");
    repo.set("fps", "30");

    const all = repo.getAll();
    expect(all).toHaveLength(2);
    expect(all.map((s) => s.key).sort()).toEqual(["fps", "theme"]);
  });

  it("deletes a setting", () => {
    repo.set("theme", "dark");
    const deleted = repo.delete("theme");
    expect(deleted).toBe(true);
    expect(repo.get("theme")).toBeNull();
  });

  it("returns false when deleting nonexistent key", () => {
    expect(repo.delete("nonexistent")).toBe(false);
  });
});
