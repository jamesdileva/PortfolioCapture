import Database from "better-sqlite3";
import * as fs from "fs";
import * as path from "path";

declare const __dirname: string;

export function createDatabase(dbPath: string): Database.Database {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}

export function runMigrations(db: Database.Database): void {
  const migrationsDir = path.join(__dirname, "migrations");
  if (!fs.existsSync(migrationsDir)) return;

  db.exec("CREATE TABLE IF NOT EXISTS _migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");

  const applied = db.prepare("SELECT id FROM _migrations").all() as { id: string }[];
  const appliedIds = new Set(applied.map((r) => r.id));

  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const migrationId = file.replace(".sql", "");
    if (appliedIds.has(migrationId)) continue;

    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf-8");
    db.exec(sql);
    db.prepare("INSERT INTO _migrations (id, applied_at) VALUES (?, ?)").run(
      migrationId,
      new Date().toISOString()
    );
  }
}

export function closeDatabase(db: Database.Database): void {
  db.close();
}
