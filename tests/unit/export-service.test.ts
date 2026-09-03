import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { tmpdir } from "os";
import { createTestDatabase } from "../helpers/database.js";
import type Database from "better-sqlite3";
import { ProjectRepository } from "../../packages/database/repositories/project-repository.js";
import { SessionRepository } from "../../packages/database/repositories/session-repository.js";
import { AssetRepository } from "../../packages/database/repositories/asset-repository.js";
import { ProjectService } from "../../apps/desktop/electron/services/project-service.js";
import { SessionService } from "../../apps/desktop/electron/services/session-service.js";
import { AssetService } from "../../apps/desktop/electron/services/asset-service.js";
import { ExportServiceImpl } from "../../apps/desktop/electron/services/export-service.js";

describe("ExportServiceImpl", () => {
  let db: Database.Database;
  let projectService: ProjectService;
  let sessionService: SessionService;
  let assetService: AssetService;
  let service: ExportServiceImpl;
  let tempDir: string;

  beforeEach(() => {
    db = createTestDatabase();
    projectService = new ProjectService(new ProjectRepository(db));
    sessionService = new SessionService(new SessionRepository(db));
    assetService = new AssetService(new AssetRepository(db));
    tempDir = fs.mkdtempSync(path.join(tmpdir(), "export-test-"));
    service = new ExportServiceImpl(projectService, sessionService, assetService, tempDir);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("throws when projectId is empty", async () => {
    await expect(service.exportProject("")).rejects.toThrow("Project ID is required");
  });

  it("throws when project not found", async () => {
    await expect(service.exportProject("nonexistent")).rejects.toThrow("Project nonexistent not found");
  });

  it("creates export directory with metadata and README", async () => {
    const project = projectService.create({ name: "MyProject", path: "/test" });

    const result = await service.exportProject(project.id);

    expect(result.metadataIncluded).toBe(true);
    expect(result.readmeIncluded).toBe(true);
    expect(result.demoIncluded).toBe(false);
    expect(result.screenshotCount).toBe(0);

    const exportDir = result.exportPath;
    expect(fs.existsSync(exportDir)).toBe(true);
    expect(fs.existsSync(path.join(exportDir, "metadata.json"))).toBe(true);
    expect(fs.existsSync(path.join(exportDir, "README.md"))).toBe(true);
  });

  it("writes correct metadata content", async () => {
    const project = projectService.create({ name: "TestProject", path: "/test" });

    const result = await service.exportProject(project.id);
    const metadata = JSON.parse(fs.readFileSync(path.join(result.exportPath, "metadata.json"), "utf-8"));

    expect(metadata.project.id).toBe(project.id);
    expect(metadata.project.name).toBe("TestProject");
    expect(metadata.project.path).toBe("/test");
    expect(metadata.sessionCount).toBe(0);
    expect(metadata.exportedAt).toBeDefined();
  });

  it("writes correct README content", async () => {
    const project = projectService.create({ name: "ReadmeProject", path: "/test" });

    const result = await service.exportProject(project.id);
    const readme = fs.readFileSync(path.join(result.exportPath, "README.md"), "utf-8");

    expect(readme).toContain("# ReadmeProject");
    expect(readme).toContain("Exported from Portfolio Auto Recorder");
  });

  it("includes demo.mp4 when demo_video asset exists", async () => {
    const project = projectService.create({ name: "DemoProject", path: "/test" });
    const session = sessionService.create({ projectId: project.id, trigger: "manual" });
    sessionService.updateStatus(session.id, "complete");

    const demoDir = path.join(tempDir, "demo-source");
    fs.mkdirSync(demoDir, { recursive: true });
    const demoPath = path.join(demoDir, "demo.mp4");
    fs.writeFileSync(demoPath, "fake video data");

    assetService.create({
      sessionId: session.id,
      projectId: project.id,
      type: "demo_video",
      path: demoPath,
      durationMs: 30000,
    });

    const result = await service.exportProject(project.id);

    expect(result.demoIncluded).toBe(true);
    expect(fs.existsSync(path.join(result.exportPath, "demo.mp4"))).toBe(true);
  });

  it("copies screenshots to screenshots/ directory", async () => {
    const project = projectService.create({ name: "ShotProject", path: "/test" });
    const session = sessionService.create({ projectId: project.id, trigger: "manual" });
    sessionService.updateStatus(session.id, "complete");

    const shotDir = path.join(tempDir, "shots-source");
    fs.mkdirSync(shotDir, { recursive: true });
    const shot1Path = path.join(shotDir, "shot-001.png");
    const shot2Path = path.join(shotDir, "shot-002.png");
    fs.writeFileSync(shot1Path, "png data 1");
    fs.writeFileSync(shot2Path, "png data 2");

    assetService.create({
      sessionId: session.id,
      projectId: project.id,
      type: "screenshot",
      path: shot1Path,
      width: 1920,
      height: 1080,
    });
    assetService.create({
      sessionId: session.id,
      projectId: project.id,
      type: "screenshot",
      path: shot2Path,
      width: 1920,
      height: 1080,
    });

    const result = await service.exportProject(project.id);

    expect(result.screenshotCount).toBe(2);
    expect(fs.existsSync(path.join(result.exportPath, "screenshots"))).toBe(true);
    expect(fs.existsSync(path.join(result.exportPath, "screenshots", "shot-001.png"))).toBe(true);
    expect(fs.existsSync(path.join(result.exportPath, "screenshots", "shot-002.png"))).toBe(true);
  });

  it("uses latest complete session assets", async () => {
    const project = projectService.create({ name: "MultiSession", path: "/test" });

    const session1 = sessionService.create({ projectId: project.id, trigger: "manual" });
    sessionService.updateStatus(session1.id, "complete");

    db.prepare("UPDATE sessions SET started_at = '2020-01-01T00:00:00.000Z' WHERE id = ?").run(session1.id);

    const session2 = sessionService.create({ projectId: project.id, trigger: "process_launch" });
    sessionService.updateStatus(session2.id, "complete");

    const shotDir = path.join(tempDir, "multi-source");
    fs.mkdirSync(shotDir, { recursive: true });

    const oldShot = path.join(shotDir, "old.png");
    const newShot = path.join(shotDir, "new.png");
    fs.writeFileSync(oldShot, "old data");
    fs.writeFileSync(newShot, "new data");

    assetService.create({
      sessionId: session1.id,
      projectId: project.id,
      type: "screenshot",
      path: oldShot,
    });
    assetService.create({
      sessionId: session2.id,
      projectId: project.id,
      type: "screenshot",
      path: newShot,
    });

    const result = await service.exportProject(project.id);

    expect(result.screenshotCount).toBe(1);
    expect(fs.existsSync(path.join(result.exportPath, "screenshots", "new.png"))).toBe(true);
  });

  it("sanitizes project name for directory", async () => {
    const project = projectService.create({ name: "My<Project>:Test", path: "/test" });

    const result = await service.exportProject(project.id);

    const dirName = path.basename(result.exportPath);
    expect(dirName).toBe("My_Project__Test");
    expect(fs.existsSync(result.exportPath)).toBe(true);
  });

  it("overwrites existing export directory cleanly", async () => {
    const project = projectService.create({ name: "Overwrite", path: "/test" });

    const result1 = await service.exportProject(project.id);
    const result2 = await service.exportProject(project.id);

    expect(result1.exportPath).toBe(result2.exportPath);
    expect(fs.existsSync(path.join(result2.exportPath, "metadata.json"))).toBe(true);
  });

  it("counts sessions correctly in metadata", async () => {
    const project = projectService.create({ name: "CountProject", path: "/test" });
    const session1 = sessionService.create({ projectId: project.id, trigger: "manual" });
    sessionService.updateStatus(session1.id, "complete");
    const session2 = sessionService.create({ projectId: project.id, trigger: "process_launch" });
    sessionService.updateStatus(session2.id, "complete");
    const session3 = sessionService.create({ projectId: project.id, trigger: "manual" });
    sessionService.updateStatus(session3.id, "failed");

    const result = await service.exportProject(project.id);
    const metadata = JSON.parse(fs.readFileSync(path.join(result.exportPath, "metadata.json"), "utf-8"));

    expect(metadata.sessionCount).toBe(2);
  });
});
