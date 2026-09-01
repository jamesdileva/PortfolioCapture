import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { createTestDatabase } from "../helpers/database.js";
import { ProjectRepository } from "../../packages/database/repositories/project-repository.js";
import { SessionRepository } from "../../packages/database/repositories/session-repository.js";

describe("SessionRepository", () => {
  let db: Database.Database;
  let projectRepo: ProjectRepository;
  let sessionRepo: SessionRepository;

  beforeEach(() => {
    db = createTestDatabase();
    projectRepo = new ProjectRepository(db);
    sessionRepo = new SessionRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  function createTestProject() {
    return projectRepo.create({ name: "Test", path: "C:\\Test" });
  }

  it("creates a session and retrieves it by id", () => {
    const project = createTestProject();
    const session = sessionRepo.create({ projectId: project.id, trigger: "manual" });

    expect(session.id).toBeDefined();
    expect(session.projectId).toBe(project.id);
    expect(session.status).toBe("starting");
    expect(session.trigger).toBe("manual");
    expect(session.endedAt).toBeNull();
  });

  it("lists sessions for a project", () => {
    const project = createTestProject();
    sessionRepo.create({ projectId: project.id, trigger: "manual" });
    sessionRepo.create({ projectId: project.id, trigger: "process_launch" });

    const sessions = sessionRepo.listByProject(project.id);
    expect(sessions).toHaveLength(2);
  });

  it("updates session status", () => {
    const project = createTestProject();
    const session = sessionRepo.create({ projectId: project.id, trigger: "manual" });

    const updated = sessionRepo.updateStatus(session.id, "recording");
    expect(updated!.status).toBe("recording");
    expect(updated!.endedAt).toBeNull();
  });

  it("sets ended_at when status is complete", () => {
    const project = createTestProject();
    const session = sessionRepo.create({ projectId: project.id, trigger: "manual" });

    const updated = sessionRepo.updateStatus(session.id, "complete");
    expect(updated!.status).toBe("complete");
    expect(updated!.endedAt).not.toBeNull();
    expect(updated!.durationMs).not.toBeNull();
  });

  it("updates raw video path", () => {
    const project = createTestProject();
    const session = sessionRepo.create({ projectId: project.id, trigger: "manual" });

    const updated = sessionRepo.updateRawVideoPath(session.id, "C:\\Videos\\raw.mp4");
    expect(updated!.rawVideoPath).toBe("C:\\Videos\\raw.mp4");
  });

  it("returns null when updating nonexistent session", () => {
    expect(sessionRepo.updateStatus("nonexistent", "recording")).toBeNull();
  });

  it("deletes a session", () => {
    const project = createTestProject();
    const session = sessionRepo.create({ projectId: project.id, trigger: "manual" });

    const deleted = sessionRepo.delete(session.id);
    expect(deleted).toBe(true);
    expect(sessionRepo.getById(session.id)).toBeNull();
  });

  it("round-trips session lifecycle", () => {
    const project = createTestProject();
    const session = sessionRepo.create({ projectId: project.id, trigger: "process_launch" });

    sessionRepo.updateStatus(session.id, "recording");
    sessionRepo.updateRawVideoPath(session.id, "C:\\raw.mp4");
    const completed = sessionRepo.updateStatus(session.id, "complete");

    expect(completed!.status).toBe("complete");
    expect(completed!.rawVideoPath).toBe("C:\\raw.mp4");
    expect(completed!.endedAt).not.toBeNull();
  });
});
