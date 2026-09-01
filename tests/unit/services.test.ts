import { describe, it, expect, beforeEach } from "vitest";
import { createTestDatabase } from "../helpers/database.js";
import type Database from "better-sqlite3";
import { ProjectRepository } from "../../packages/database/repositories/project-repository.js";
import { SessionRepository } from "../../packages/database/repositories/session-repository.js";
import { AssetRepository } from "../../packages/database/repositories/asset-repository.js";
import { SettingsRepository } from "../../packages/database/repositories/settings-repository.js";
import { ProjectService } from "../../apps/desktop/electron/services/project-service.js";
import { SessionService } from "../../apps/desktop/electron/services/session-service.js";
import { AssetService } from "../../apps/desktop/electron/services/asset-service.js";
import { SettingsService } from "../../apps/desktop/electron/services/settings-service.js";

describe("ProjectService", () => {
  let db: Database.Database;
  let service: ProjectService;

  beforeEach(() => {
    db = createTestDatabase();
    service = new ProjectService(new ProjectRepository(db));
  });

  it("creates and lists projects", () => {
    const project = service.create({ name: "Test", path: "/test" });
    expect(project.name).toBe("Test");
    expect(project.path).toBe("/test");

    const list = service.list();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(project.id);
  });

  it("gets project by id", () => {
    const project = service.create({ name: "Test", path: "/test" });
    const found = service.getById(project.id);
    expect(found).not.toBeNull();
    expect(found!.name).toBe("Test");
  });

  it("returns null for nonexistent id", () => {
    expect(service.getById("nonexistent")).toBeNull();
  });

  it("updates project", () => {
    const project = service.create({ name: "Test", path: "/test" });
    const updated = service.update(project.id, { name: "Updated" });
    expect(updated).not.toBeNull();
    expect(updated!.name).toBe("Updated");
  });

  it("deletes project", () => {
    const project = service.create({ name: "Test", path: "/test" });
    expect(service.delete(project.id)).toBe(true);
    expect(service.getById(project.id)).toBeNull();
  });

  it("throws when deleting nonexistent project", () => {
    expect(() => service.delete("nonexistent")).toThrow("Project nonexistent not found");
  });
});

describe("SessionService", () => {
  let db: Database.Database;
  let projectService: ProjectService;
  let service: SessionService;

  beforeEach(() => {
    db = createTestDatabase();
    projectService = new ProjectService(new ProjectRepository(db));
    service = new SessionService(new SessionRepository(db));
  });

  it("creates session for project", () => {
    const project = projectService.create({ name: "Test", path: "/test" });
    const session = service.create({ projectId: project.id, trigger: "manual" });
    expect(session.projectId).toBe(project.id);
    expect(session.status).toBe("starting");
  });

  it("lists sessions by project", () => {
    const project = projectService.create({ name: "Test", path: "/test" });
    service.create({ projectId: project.id, trigger: "manual" });
    service.create({ projectId: project.id, trigger: "process_launch" });

    const sessions = service.listByProject(project.id);
    expect(sessions).toHaveLength(2);
  });

  it("lists all sessions", () => {
    const p1 = projectService.create({ name: "A", path: "/a" });
    const p2 = projectService.create({ name: "B", path: "/b" });
    service.create({ projectId: p1.id, trigger: "manual" });
    service.create({ projectId: p2.id, trigger: "process_launch" });

    const all = service.listAll();
    expect(all).toHaveLength(2);
  });

  it("updates session status", () => {
    const project = projectService.create({ name: "Test", path: "/test" });
    const session = service.create({ projectId: project.id, trigger: "manual" });
    const updated = service.updateStatus(session.id, "recording");
    expect(updated).not.toBeNull();
    expect(updated!.status).toBe("recording");
  });

  it("updates raw video path", () => {
    const project = projectService.create({ name: "Test", path: "/test" });
    const session = service.create({ projectId: project.id, trigger: "manual" });
    const updated = service.updateRawVideoPath(session.id, "/path/to/video.mp4");
    expect(updated).not.toBeNull();
    expect(updated!.rawVideoPath).toBe("/path/to/video.mp4");
  });

  it("deletes session", () => {
    const project = projectService.create({ name: "Test", path: "/test" });
    const session = service.create({ projectId: project.id, trigger: "manual" });
    expect(service.delete(session.id)).toBe(true);
    expect(service.getById(session.id)).toBeNull();
  });
});

describe("AssetService", () => {
  let db: Database.Database;
  let projectService: ProjectService;
  let sessionService: SessionService;
  let service: AssetService;

  beforeEach(() => {
    db = createTestDatabase();
    projectService = new ProjectService(new ProjectRepository(db));
    sessionService = new SessionService(new SessionRepository(db));
    service = new AssetService(new AssetRepository(db));
  });

  it("creates asset", () => {
    const project = projectService.create({ name: "Test", path: "/test" });
    const session = sessionService.create({ projectId: project.id, trigger: "manual" });
    const asset = service.create({
      sessionId: session.id,
      projectId: project.id,
      type: "screenshot",
      path: "/path/to/screenshot.png",
    });
    expect(asset.type).toBe("screenshot");
    expect(asset.sessionId).toBe(session.id);
  });

  it("lists assets by project", () => {
    const project = projectService.create({ name: "Test", path: "/test" });
    const session = sessionService.create({ projectId: project.id, trigger: "manual" });
    service.create({
      sessionId: session.id,
      projectId: project.id,
      type: "screenshot",
      path: "/path/to/shot1.png",
    });
    service.create({
      sessionId: session.id,
      projectId: project.id,
      type: "screenshot",
      path: "/path/to/shot2.png",
    });

    const assets = service.listByProject(project.id);
    expect(assets).toHaveLength(2);
  });

  it("lists assets by session", () => {
    const project = projectService.create({ name: "Test", path: "/test" });
    const session = sessionService.create({ projectId: project.id, trigger: "manual" });
    service.create({
      sessionId: session.id,
      projectId: project.id,
      type: "raw_video",
      path: "/path/to/video.mp4",
    });

    const assets = service.listBySession(session.id);
    expect(assets).toHaveLength(1);
    expect(assets[0].type).toBe("raw_video");
  });

  it("deletes asset", () => {
    const project = projectService.create({ name: "Test", path: "/test" });
    const session = sessionService.create({ projectId: project.id, trigger: "manual" });
    const asset = service.create({
      sessionId: session.id,
      projectId: project.id,
      type: "thumbnail",
      path: "/path/to/thumb.png",
    });
    expect(service.delete(asset.id)).toBe(true);
    expect(service.getById(asset.id)).toBeNull();
  });
});

describe("SettingsService", () => {
  let db: Database.Database;
  let service: SettingsService;

  beforeEach(() => {
    db = createTestDatabase();
    service = new SettingsService(new SettingsRepository(db));
  });

  it("sets and gets value", () => {
    service.set("resolution", "1080p");
    expect(service.get("resolution")).toBe("1080p");
  });

  it("returns null for nonexistent key", () => {
    expect(service.get("nonexistent")).toBeNull();
  });

  it("gets all settings", () => {
    service.set("resolution", "1080p");
    service.set("fps", "30");
    const all = service.getAll();
    expect(all.length).toBeGreaterThanOrEqual(2);
  });

  it("deletes setting", () => {
    service.set("resolution", "1080p");
    expect(service.delete("resolution")).toBe(true);
    expect(service.get("resolution")).toBeNull();
  });
});
