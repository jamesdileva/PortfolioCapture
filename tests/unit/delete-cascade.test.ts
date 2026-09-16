import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { tmpdir } from "os";
import { createTestDatabase } from "../helpers/database.js";
import type Database from "better-sqlite3";
import { ProjectRepository } from "../../packages/database/repositories/project-repository.js";
import { SessionRepository } from "../../packages/database/repositories/session-repository.js";
import { AssetRepository } from "../../packages/database/repositories/asset-repository.js";
import { SettingsRepository } from "../../packages/database/repositories/settings-repository.js";
import { FeatureEvidenceRepository } from "../../packages/database/repositories/feature-evidence-repository.js";
import { ProjectService } from "../../apps/desktop/electron/services/project-service.js";
import { SessionService } from "../../apps/desktop/electron/services/session-service.js";

describe("delete cascades", () => {
  let db: Database.Database;
  let projectService: ProjectService;
  let sessionService: SessionService;
  let assetRepo: AssetRepository;
  let settingsRepo: SettingsRepository;
  let evidenceRepo: FeatureEvidenceRepository;
  let recordingsRoot: string;

  beforeEach(() => {
    db = createTestDatabase();
    projectService = new ProjectService(new ProjectRepository(db), {});
    sessionService = new SessionService(new SessionRepository(db), {});
    assetRepo = new AssetRepository(db);
    settingsRepo = new SettingsRepository(db);
    evidenceRepo = new FeatureEvidenceRepository(db);
    recordingsRoot = fs.mkdtempSync(path.join(tmpdir(), "cascade-test-"));
  });

  afterEach(() => {
    fs.rmSync(recordingsRoot, { recursive: true, force: true });
  });

  it("deletes a session with assets, settings keys, and files", async () => {
    const project = projectService.create({ name: "P", path: "/p" });
    const sessionRepo = new SessionRepository(db);
    const created = sessionRepo.create({ projectId: project.id, trigger: "manual" });
    assetRepo.create({ sessionId: created.id, projectId: project.id, type: "screenshot", path: "/s/shot.png" });
    assetRepo.create({ sessionId: created.id, projectId: project.id, type: "raw_video", path: "/s/raw.mp4" });
    settingsRepo.set(`timeline:${created.id}`, "[]");
    settingsRepo.set(`capture-blank:${created.id}`, "250");
    settingsRepo.set(`timeline-overrides:${created.id}`, "{}");
    const sessionDir = path.join(recordingsRoot, project.id, created.id);
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(path.join(sessionDir, "raw.mp4"), "fake");

    const svc = new SessionService(sessionRepo, { recordingsRoot });
    expect(svc.delete(created.id)).toBe(true);

    expect(sessionRepo.getById(created.id)).toBeNull();
    expect(assetRepo.listBySession(created.id)).toEqual([]);
    expect(settingsRepo.get(`timeline:${created.id}`)).toBeNull();
    expect(settingsRepo.get(`capture-blank:${created.id}`)).toBeNull();
    expect(settingsRepo.get(`timeline-overrides:${created.id}`)).toBeNull();
    expect(fs.existsSync(sessionDir)).toBe(false);
  });

  it("keeps files when no recordingsRoot is configured", () => {
    const sessionRepo = new SessionRepository(db);
    const project = projectService.create({ name: "P", path: "/p" });
    const created = sessionRepo.create({ projectId: project.id, trigger: "manual" });
    const sessionDir = path.join(recordingsRoot, project.id, created.id);
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(path.join(sessionDir, "raw.mp4"), "fake");

    const svc = new SessionService(sessionRepo);
    expect(svc.delete(created.id)).toBe(true);
    expect(fs.existsSync(path.join(sessionDir, "raw.mp4"))).toBe(true);
  });

  it("deletes a project with sessions, assets, evidence, and files", () => {
    const sessionRepo = new SessionRepository(db);
    const project = projectService.create({ name: "P", path: "/p" });
    const created = sessionRepo.create({ projectId: project.id, trigger: "manual" });
    assetRepo.create({ sessionId: created.id, projectId: project.id, type: "screenshot", path: "/s/shot.png" });
    evidenceRepo.create({ projectId: project.id, featureName: "F" });
    settingsRepo.set(`timeline:${created.id}`, "[]");
    const projectDir = path.join(recordingsRoot, project.id);
    fs.mkdirSync(path.join(projectDir, created.id), { recursive: true });

    const svc = new ProjectService(new ProjectRepository(db), { recordingsRoot });
    expect(svc.delete(project.id)).toBe(true);

    expect(sessionRepo.listByProject(project.id)).toEqual([]);
    expect(assetRepo.listByProject(project.id)).toEqual([]);
    expect(evidenceRepo.listByProject(project.id)).toEqual([]);
    expect(settingsRepo.get(`timeline:${created.id}`)).toBeNull();
    expect(fs.existsSync(projectDir)).toBe(false);
  });

  it("throws a clear error for unknown ids", () => {
    const sessionRepo = new SessionRepository(db);
    const svc = new SessionService(sessionRepo, { recordingsRoot });
    expect(() => svc.delete("nope")).toThrow("not found");
  });
});
