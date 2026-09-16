import Database from "better-sqlite3";
import { randomUUID } from "crypto";
import type { Project, ProjectStatus, CaptureMode, CreateProjectInput, UpdateProjectInput } from "../../shared/types/index.js";
import { parseJsonArray } from "../../shared/utils/parse-json-array.js";

export class ProjectRepository {
  constructor(private db: Database.Database) {}

  create(input: CreateProjectInput): Project {
    const now = new Date().toISOString();
    const project: Project = {
      id: randomUUID(),
      name: input.name,
      path: input.path,
      executablePath: input.executablePath ?? null,
      launchCommand: input.launchCommand ?? null,
      enabled: input.enabled ?? true,
      autoRecord: input.autoRecord ?? true,
      description: input.description ?? null,
      features: input.features ?? [],
      techStack: input.techStack ?? [],
      githubUrl: input.githubUrl ?? null,
      projectStatus: input.projectStatus ?? "active",
      devServerPorts: input.devServerPorts ?? [],
      captureMode: input.captureMode ?? "desktop",
      windowTitle: input.windowTitle ?? null,
      createdAt: now,
      updatedAt: now,
    };

    this.db
      .prepare(
        `INSERT INTO projects (id, name, path, executable_path, launch_command, enabled, auto_record, description, features, tech_stack, github_url, project_status, dev_server_ports, capture_mode, window_title, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        project.id,
        project.name,
        project.path,
        project.executablePath,
        project.launchCommand,
        project.enabled ? 1 : 0,
        project.autoRecord ? 1 : 0,
        project.description,
        JSON.stringify(project.features),
        JSON.stringify(project.techStack),
        project.githubUrl,
        project.projectStatus,
        JSON.stringify(project.devServerPorts),
        project.captureMode,
        project.windowTitle,
        project.createdAt,
        project.updatedAt
      );

    return project;
  }

  getById(id: string): Project | null {
    const row = this.db
      .prepare("SELECT * FROM projects WHERE id = ?")
      .get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    return this.rowToProject(row);
  }

  list(): Project[] {
    const rows = this.db.prepare("SELECT * FROM projects ORDER BY created_at DESC").all() as Record<string, unknown>[];
    return rows.map((row) => this.rowToProject(row));
  }

  update(id: string, input: UpdateProjectInput): Project | null {
    const existing = this.getById(id);
    if (!existing) return null;

    const updates: string[] = [];
    const values: unknown[] = [];

    if (input.name !== undefined) { updates.push("name = ?"); values.push(input.name); }
    if (input.path !== undefined) { updates.push("path = ?"); values.push(input.path); }
    if (input.executablePath !== undefined) { updates.push("executable_path = ?"); values.push(input.executablePath); }
    if (input.launchCommand !== undefined) { updates.push("launch_command = ?"); values.push(input.launchCommand); }
    if (input.enabled !== undefined) { updates.push("enabled = ?"); values.push(input.enabled ? 1 : 0); }
    if (input.autoRecord !== undefined) { updates.push("auto_record = ?"); values.push(input.autoRecord ? 1 : 0); }
    if (input.description !== undefined) { updates.push("description = ?"); values.push(input.description); }
    if (input.features !== undefined) { updates.push("features = ?"); values.push(JSON.stringify(input.features)); }
    if (input.techStack !== undefined) { updates.push("tech_stack = ?"); values.push(JSON.stringify(input.techStack)); }
    if (input.githubUrl !== undefined) { updates.push("github_url = ?"); values.push(input.githubUrl); }
    if (input.projectStatus !== undefined) { updates.push("project_status = ?"); values.push(input.projectStatus); }
    if (input.devServerPorts !== undefined) { updates.push("dev_server_ports = ?"); values.push(JSON.stringify(input.devServerPorts)); }
    if (input.captureMode !== undefined) { updates.push("capture_mode = ?"); values.push(input.captureMode); }
    if (input.windowTitle !== undefined) { updates.push("window_title = ?"); values.push(input.windowTitle); }

    if (updates.length === 0) return existing;

    updates.push("updated_at = ?");
    const now = new Date().toISOString();
    values.push(now, id);

    this.db.prepare(`UPDATE projects SET ${updates.join(", ")} WHERE id = ?`).run(...values);
    return this.getById(id)!;
  }

  delete(id: string): boolean {
    const result = this.db.prepare("DELETE FROM projects WHERE id = ?").run(id);
    return result.changes > 0;
  }

  /**
   * Deletes a project plus its sessions, asset rows, feature evidence, and
   * per-session settings keys in one transaction. Plain `delete()` fails
   * with a foreign-key error once child rows exist. Cross-table SQL lives
   * here deliberately: atomicity requires a single transaction on this
   * handle. In-memory chapter caches are keyed by UUID and expire on
   * restart, so they need no cleanup.
   */
  deleteCascade(id: string): boolean {
    const run = this.db.transaction(() => {
      const sessionRows = this.db
        .prepare("SELECT id FROM sessions WHERE project_id = ?")
        .all(id) as Array<{ id: string }>;
      const prefixes = [
        "timeline:",
        "assembled-timeline:",
        "demo-chapters:",
        "demo-quality:",
        "capture-fallback:",
        "capture-blank:",
        "timeline-overrides:",
      ];
      const settingsKeys = sessionRows.flatMap((s) => prefixes.map((p) => `${p}${s.id}`));
      if (settingsKeys.length > 0) {
        this.db
          .prepare(`DELETE FROM settings WHERE key IN (${settingsKeys.map(() => "?").join(",")})`)
          .run(...settingsKeys);
      }
      this.db.prepare("DELETE FROM assets WHERE project_id = ?").run(id);
      this.db.prepare("DELETE FROM feature_evidence WHERE project_id = ?").run(id);
      this.db.prepare("DELETE FROM sessions WHERE project_id = ?").run(id);
      const result = this.db.prepare("DELETE FROM projects WHERE id = ?").run(id);
      return result.changes > 0;
    });
    return run();
  }

  private rowToProject(row: Record<string, unknown>): Project {
    return {
      id: row.id as string,
      name: row.name as string,
      path: row.path as string,
      executablePath: row.executable_path as string | null,
      launchCommand: row.launch_command as string | null,
      enabled: (row.enabled as number) === 1,
      autoRecord: (row.auto_record as number) === 1,
      description: row.description as string | null,
      features: parseJsonArray(row.features as string | null),
      techStack: parseJsonArray(row.tech_stack as string | null),
      githubUrl: row.github_url as string | null,
      projectStatus: (row.project_status as ProjectStatus) ?? "active",
      devServerPorts: parseJsonArray(row.dev_server_ports as string | null).map(Number).filter((n) => !isNaN(n)),
      captureMode: (row.capture_mode as CaptureMode) ?? "desktop",
      windowTitle: (row.window_title as string | null) ?? null,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }
}
