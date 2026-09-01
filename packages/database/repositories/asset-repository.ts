import Database from "better-sqlite3";
import { randomUUID } from "crypto";
import type { MediaAsset, AssetType, CreateAssetInput } from "../../shared/types/index.js";

export class AssetRepository {
  constructor(private db: Database.Database) {}

  create(input: CreateAssetInput): MediaAsset {
    const now = new Date().toISOString();
    const asset: MediaAsset = {
      id: randomUUID(),
      sessionId: input.sessionId,
      projectId: input.projectId,
      type: input.type,
      path: input.path,
      durationMs: input.durationMs ?? null,
      width: input.width ?? null,
      height: input.height ?? null,
      fileSizeBytes: input.fileSizeBytes ?? null,
      createdAt: now,
    };

    this.db
      .prepare(
        `INSERT INTO assets (id, session_id, project_id, type, path, duration_ms, width, height, file_size_bytes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        asset.id,
        asset.sessionId,
        asset.projectId,
        asset.type,
        asset.path,
        asset.durationMs,
        asset.width,
        asset.height,
        asset.fileSizeBytes,
        asset.createdAt
      );

    return asset;
  }

  getById(id: string): MediaAsset | null {
    const row = this.db
      .prepare("SELECT * FROM assets WHERE id = ?")
      .get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    return this.rowToAsset(row);
  }

  listByProject(projectId: string): MediaAsset[] {
    const rows = this.db
      .prepare("SELECT * FROM assets WHERE project_id = ? ORDER BY created_at DESC")
      .all(projectId) as Record<string, unknown>[];
    return rows.map((row) => this.rowToAsset(row));
  }

  listBySession(sessionId: string): MediaAsset[] {
    const rows = this.db
      .prepare("SELECT * FROM assets WHERE session_id = ? ORDER BY created_at DESC")
      .all(sessionId) as Record<string, unknown>[];
    return rows.map((row) => this.rowToAsset(row));
  }

  listByType(projectId: string, type: AssetType): MediaAsset[] {
    const rows = this.db
      .prepare("SELECT * FROM assets WHERE project_id = ? AND type = ? ORDER BY created_at DESC")
      .all(projectId, type) as Record<string, unknown>[];
    return rows.map((row) => this.rowToAsset(row));
  }

  delete(id: string): boolean {
    const result = this.db.prepare("DELETE FROM assets WHERE id = ?").run(id);
    return result.changes > 0;
  }

  private rowToAsset(row: Record<string, unknown>): MediaAsset {
    return {
      id: row.id as string,
      sessionId: row.session_id as string,
      projectId: row.project_id as string,
      type: row.type as AssetType,
      path: row.path as string,
      durationMs: row.duration_ms as number | null,
      width: row.width as number | null,
      height: row.height as number | null,
      fileSizeBytes: row.file_size_bytes as number | null,
      createdAt: row.created_at as string,
    };
  }
}
