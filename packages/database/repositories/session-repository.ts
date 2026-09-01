import Database from "better-sqlite3";
import { randomUUID } from "crypto";
import type {
  RecordingSession,
  SessionStatus,
  SessionTrigger,
  CreateSessionInput,
} from "../../shared/types/index.js";

export class SessionRepository {
  constructor(private db: Database.Database) {}

  create(input: CreateSessionInput): RecordingSession {
    const now = new Date().toISOString();
    const session: RecordingSession = {
      id: randomUUID(),
      projectId: input.projectId,
      startedAt: now,
      endedAt: null,
      status: "starting",
      trigger: input.trigger,
      durationMs: null,
      rawVideoPath: null,
    };

    this.db
      .prepare(
        `INSERT INTO sessions (id, project_id, started_at, ended_at, status, trigger, duration_ms, raw_video_path)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        session.id,
        session.projectId,
        session.startedAt,
        session.endedAt,
        session.status,
        session.trigger,
        session.durationMs,
        session.rawVideoPath
      );

    return session;
  }

  getById(id: string): RecordingSession | null {
    const row = this.db
      .prepare("SELECT * FROM sessions WHERE id = ?")
      .get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    return this.rowToSession(row);
  }

  listByProject(projectId: string): RecordingSession[] {
    const rows = this.db
      .prepare("SELECT * FROM sessions WHERE project_id = ? ORDER BY started_at DESC")
      .all(projectId) as Record<string, unknown>[];
    return rows.map((row) => this.rowToSession(row));
  }

  listAll(): RecordingSession[] {
    const rows = this.db
      .prepare("SELECT * FROM sessions ORDER BY started_at DESC")
      .all() as Record<string, unknown>[];
    return rows.map((row) => this.rowToSession(row));
  }

  updateStatus(id: string, status: SessionStatus): RecordingSession | null {
    const existing = this.getById(id);
    if (!existing) return null;

    const endedAt = ["complete", "failed", "cancelled"].includes(status)
      ? new Date().toISOString()
      : null;

    const durationMs =
      endedAt && existing.startedAt
        ? new Date(endedAt).getTime() - new Date(existing.startedAt).getTime()
        : null;

    this.db
      .prepare(
        `UPDATE sessions SET status = ?, ended_at = COALESCE(?, ended_at), duration_ms = COALESCE(?, duration_ms) WHERE id = ?`
      )
      .run(status, endedAt, durationMs, id);

    return this.getById(id)!;
  }

  updateRawVideoPath(id: string, rawVideoPath: string): RecordingSession | null {
    const existing = this.getById(id);
    if (!existing) return null;

    this.db
      .prepare("UPDATE sessions SET raw_video_path = ? WHERE id = ?")
      .run(rawVideoPath, id);

    return this.getById(id)!;
  }

  delete(id: string): boolean {
    const result = this.db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
    return result.changes > 0;
  }

  private rowToSession(row: Record<string, unknown>): RecordingSession {
    return {
      id: row.id as string,
      projectId: row.project_id as string,
      startedAt: row.started_at as string,
      endedAt: row.ended_at as string | null,
      status: row.status as SessionStatus,
      trigger: row.trigger as SessionTrigger,
      durationMs: row.duration_ms as number | null,
      rawVideoPath: row.raw_video_path as string | null,
    };
  }
}
