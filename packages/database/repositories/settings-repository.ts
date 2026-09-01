import Database from "better-sqlite3";
import type { Settings } from "../../shared/types/index.js";

export class SettingsRepository {
  constructor(private db: Database.Database) {}

  get(key: string): string | null {
    const row = this.db
      .prepare("SELECT value FROM settings WHERE key = ?")
      .get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  set(key: string, value: string): void {
    this.db
      .prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)")
      .run(key, value);
  }

  getAll(): Settings[] {
    const rows = this.db.prepare("SELECT * FROM settings ORDER BY key").all() as Settings[];
    return rows;
  }

  delete(key: string): boolean {
    const result = this.db.prepare("DELETE FROM settings WHERE key = ?").run(key);
    return result.changes > 0;
  }
}
