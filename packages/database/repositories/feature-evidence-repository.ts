import Database from "better-sqlite3";
import { randomUUID } from "crypto";
import type { FeatureEvidence, FeatureEvidenceStatus, FeatureEvidenceCommit, FeatureEvidenceInput, FeatureEvidenceUpdateInput } from "../../shared/types/index.js";
import { parseJsonArray } from "../../shared/utils/parse-json-array.js";

export class FeatureEvidenceRepository {
  constructor(private db: Database.Database) {}

  create(input: FeatureEvidenceInput): FeatureEvidence {
    const now = new Date().toISOString();
    const evidence: FeatureEvidence = {
      id: randomUUID(),
      projectId: input.projectId,
      featureName: input.featureName,
      description: input.description ?? null,
      confidence: input.confidence ?? 0.5,
      status: "candidate",
      commits: input.commits ?? [],
      screenshotPaths: input.screenshotPaths ?? [],
      recordingSegmentPaths: input.recordingSegmentPaths ?? [],
      readmeSnippet: input.readmeSnippet ?? null,
      createdAt: now,
      updatedAt: now,
    };

    this.db
      .prepare(
        `INSERT INTO feature_evidence (id, project_id, feature_name, description, confidence, status, commits, screenshot_paths, recording_segment_paths, readme_snippet, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        evidence.id,
        evidence.projectId,
        evidence.featureName,
        evidence.description,
        evidence.confidence,
        evidence.status,
        JSON.stringify(evidence.commits),
        JSON.stringify(evidence.screenshotPaths),
        JSON.stringify(evidence.recordingSegmentPaths),
        evidence.readmeSnippet,
        evidence.createdAt,
        evidence.updatedAt
      );

    return evidence;
  }

  getById(id: string): FeatureEvidence | null {
    const row = this.db
      .prepare("SELECT * FROM feature_evidence WHERE id = ?")
      .get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    return this.rowToEvidence(row);
  }

  listByProject(projectId: string): FeatureEvidence[] {
    const rows = this.db
      .prepare("SELECT * FROM feature_evidence WHERE project_id = ? ORDER BY confidence DESC")
      .all(projectId) as Record<string, unknown>[];
    return rows.map((row) => this.rowToEvidence(row));
  }

  update(id: string, input: FeatureEvidenceUpdateInput): FeatureEvidence | null {
    const existing = this.getById(id);
    if (!existing) return null;

    const updates: string[] = [];
    const values: unknown[] = [];

    if (input.featureName !== undefined) { updates.push("feature_name = ?"); values.push(input.featureName); }
    if (input.description !== undefined) { updates.push("description = ?"); values.push(input.description); }
    if (input.confidence !== undefined) { updates.push("confidence = ?"); values.push(input.confidence); }
    if (input.status !== undefined) { updates.push("status = ?"); values.push(input.status); }
    if (input.commits !== undefined) { updates.push("commits = ?"); values.push(JSON.stringify(input.commits)); }
    if (input.screenshotPaths !== undefined) { updates.push("screenshot_paths = ?"); values.push(JSON.stringify(input.screenshotPaths)); }
    if (input.recordingSegmentPaths !== undefined) { updates.push("recording_segment_paths = ?"); values.push(JSON.stringify(input.recordingSegmentPaths)); }
    if (input.readmeSnippet !== undefined) { updates.push("readme_snippet = ?"); values.push(input.readmeSnippet); }

    if (updates.length === 0) return existing;

    updates.push("updated_at = ?");
    const now = new Date().toISOString();
    values.push(now, id);

    this.db.prepare(`UPDATE feature_evidence SET ${updates.join(", ")} WHERE id = ?`).run(...values);
    return this.getById(id)!;
  }

  delete(id: string): boolean {
    const result = this.db.prepare("DELETE FROM feature_evidence WHERE id = ?").run(id);
    return result.changes > 0;
  }

  private rowToEvidence(row: Record<string, unknown>): FeatureEvidence {
    return {
      id: row.id as string,
      projectId: row.project_id as string,
      featureName: row.feature_name as string,
      description: row.description as string | null,
      confidence: row.confidence as number,
      status: (row.status as FeatureEvidenceStatus) ?? "candidate",
      commits: parseJsonArray(row.commits as string | null) as unknown as FeatureEvidenceCommit[],
      screenshotPaths: parseJsonArray(row.screenshot_paths as string | null),
      recordingSegmentPaths: parseJsonArray(row.recording_segment_paths as string | null),
      readmeSnippet: row.readme_snippet as string | null,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }
}
