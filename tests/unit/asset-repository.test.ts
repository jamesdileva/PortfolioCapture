import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { createTestDatabase } from "../helpers/database.js";
import { ProjectRepository } from "../../packages/database/repositories/project-repository.js";
import { SessionRepository } from "../../packages/database/repositories/session-repository.js";
import { AssetRepository } from "../../packages/database/repositories/asset-repository.js";

describe("AssetRepository", () => {
  let db: Database.Database;
  let projectRepo: ProjectRepository;
  let sessionRepo: SessionRepository;
  let assetRepo: AssetRepository;

  beforeEach(() => {
    db = createTestDatabase();
    projectRepo = new ProjectRepository(db);
    sessionRepo = new SessionRepository(db);
    assetRepo = new AssetRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  function createTestProjectAndSession() {
    const project = projectRepo.create({ name: "Test", path: "C:\\Test" });
    const session = sessionRepo.create({ projectId: project.id, trigger: "manual" });
    return { project, session };
  }

  it("creates an asset and retrieves it by id", () => {
    const { project, session } = createTestProjectAndSession();

    const asset = assetRepo.create({
      sessionId: session.id,
      projectId: project.id,
      type: "raw_video",
      path: "C:\\raw.mp4",
      durationMs: 60000,
      width: 1920,
      height: 1080,
      fileSizeBytes: 1024000,
    });

    expect(asset.id).toBeDefined();
    expect(asset.type).toBe("raw_video");
    expect(asset.durationMs).toBe(60000);
    expect(asset.width).toBe(1920);
    expect(asset.height).toBe(1080);
    expect(asset.fileSizeBytes).toBe(1024000);
  });

  it("lists assets by project", () => {
    const { project, session } = createTestProjectAndSession();

    assetRepo.create({ sessionId: session.id, projectId: project.id, type: "raw_video", path: "a.mp4" });
    assetRepo.create({ sessionId: session.id, projectId: project.id, type: "screenshot", path: "a.png" });

    const assets = assetRepo.listByProject(project.id);
    expect(assets).toHaveLength(2);
  });

  it("lists assets by session", () => {
    const { project, session } = createTestProjectAndSession();

    assetRepo.create({ sessionId: session.id, projectId: project.id, type: "raw_video", path: "a.mp4" });
    assetRepo.create({ sessionId: session.id, projectId: project.id, type: "thumbnail", path: "t.png" });

    const assets = assetRepo.listBySession(session.id);
    expect(assets).toHaveLength(2);
  });

  it("lists assets by type", () => {
    const { project, session } = createTestProjectAndSession();

    assetRepo.create({ sessionId: session.id, projectId: project.id, type: "raw_video", path: "a.mp4" });
    assetRepo.create({ sessionId: session.id, projectId: project.id, type: "screenshot", path: "s.png" });
    assetRepo.create({ sessionId: session.id, projectId: project.id, type: "screenshot", path: "s2.png" });

    const screenshots = assetRepo.listByType(project.id, "screenshot");
    expect(screenshots).toHaveLength(2);
    expect(screenshots.every((a) => a.type === "screenshot")).toBe(true);
  });

  it("deletes an asset", () => {
    const { project, session } = createTestProjectAndSession();
    const asset = assetRepo.create({ sessionId: session.id, projectId: project.id, type: "thumbnail", path: "t.png" });

    const deleted = assetRepo.delete(asset.id);
    expect(deleted).toBe(true);
    expect(assetRepo.getById(asset.id)).toBeNull();
  });
});
