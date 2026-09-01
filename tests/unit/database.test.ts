import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { createTestDatabase } from "../helpers/database.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("database migrations", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDatabase();
  });

  afterEach(() => {
    db.close();
  });

  it("creates all required tables", () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '_migrations'")
      .all() as { name: string }[];
    const names = tables.map((t) => t.name).sort();
    expect(names).toEqual(["assets", "projects", "sessions", "settings"]);
  });

  it("creates required indexes", () => {
    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'")
      .all() as { name: string }[];
    const names = indexes.map((i) => i.name).sort();
    expect(names).toContain("idx_sessions_project");
    expect(names).toContain("idx_assets_project");
    expect(names).toContain("idx_assets_session");
    expect(names).toContain("idx_sessions_started_at");
  });

  it("migration is idempotent", () => {
    const tablesBefore = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '_migrations'")
      .all() as { name: string }[];

    const sql = fs.readFileSync(path.join(__dirname, "../../packages/database/migrations/001_initial.sql"), "utf-8");
    db.exec(sql);

    const tablesAfter = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '_migrations'")
      .all() as { name: string }[];

    expect(tablesAfter.length).toBe(tablesBefore.length);
  });
});
