import { describe, it, expect, beforeEach } from "vitest";
import { createTestDatabase } from "../helpers/database.js";
import type Database from "better-sqlite3";
import { ProjectRepository } from "../../packages/database/repositories/project-repository.js";
import { FeatureEvidenceRepository } from "../../packages/database/repositories/feature-evidence-repository.js";

describe("FeatureEvidenceRepository", () => {
  let db: Database.Database;
  let repo: FeatureEvidenceRepository;
  let projectRepo: ProjectRepository;
  let projectId: string;

  beforeEach(() => {
    db = createTestDatabase();
    repo = new FeatureEvidenceRepository(db);
    projectRepo = new ProjectRepository(db);
    const project = projectRepo.create({ name: "Test", path: "/test" });
    projectId = project.id;
  });

  it("creates evidence with defaults", () => {
    const evidence = repo.create({ projectId, featureName: "Dashboard" });

    expect(evidence.id).toBeTruthy();
    expect(evidence.projectId).toBe(projectId);
    expect(evidence.featureName).toBe("Dashboard");
    expect(evidence.status).toBe("candidate");
    expect(evidence.confidence).toBe(0.5);
    expect(evidence.commits).toEqual([]);
    expect(evidence.screenshotPaths).toEqual([]);
    expect(evidence.recordingSegmentPaths).toEqual([]);
    expect(evidence.readmeSnippet).toBeNull();
  });

  it("creates evidence with all fields", () => {
    const evidence = repo.create({
      projectId,
      featureName: "Auth",
      description: "Login flow",
      confidence: 0.85,
      commits: [{ sha: "abc123", message: "feat: add login", date: "2026-01-01" }],
      screenshotPaths: ["/img/1.png"],
      recordingSegmentPaths: ["/vid/1.mp4"],
      readmeSnippet: "Auth module",
    });

    expect(evidence.confidence).toBe(0.85);
    expect(evidence.commits).toHaveLength(1);
    expect(evidence.screenshotPaths).toEqual(["/img/1.png"]);
    expect(evidence.recordingSegmentPaths).toEqual(["/vid/1.mp4"]);
    expect(evidence.readmeSnippet).toBe("Auth module");
  });

  it("getById returns evidence", () => {
    const created = repo.create({ projectId, featureName: "Test" });
    const found = repo.getById(created.id);

    expect(found).not.toBeNull();
    expect(found!.id).toBe(created.id);
  });

  it("getById returns null for nonexistent", () => {
    expect(repo.getById("nonexistent")).toBeNull();
  });

  it("listByProject returns evidence sorted by confidence", () => {
    repo.create({ projectId, featureName: "Low", confidence: 0.3 });
    repo.create({ projectId, featureName: "High", confidence: 0.9 });

    const project2 = projectRepo.create({ name: "Other", path: "/other" });
    repo.create({ projectId: project2.id, featureName: "Other", confidence: 0.7 });

    const results = repo.listByProject(projectId);

    expect(results).toHaveLength(2);
    expect(results[0].featureName).toBe("High");
    expect(results[1].featureName).toBe("Low");
  });

  it("listByProject returns empty for unknown project", () => {
    expect(repo.listByProject("unknown")).toEqual([]);
  });

  it("update modifies fields", () => {
    const created = repo.create({ projectId, featureName: "Old" });
    const updated = repo.update(created.id, { featureName: "New", status: "accepted" });

    expect(updated).not.toBeNull();
    expect(updated!.featureName).toBe("New");
    expect(updated!.status).toBe("accepted");
  });

  it("update returns null for nonexistent", () => {
    expect(repo.update("nonexistent", { featureName: "X" })).toBeNull();
  });

  it("update persists commits", () => {
    const created = repo.create({ projectId, featureName: "Test" });
    const commits = [{ sha: "abc", message: "feat: x", date: "2026-01-01" }];
    const updated = repo.update(created.id, { commits });

    expect(updated!.commits).toEqual(commits);
  });

  it("delete removes evidence", () => {
    const created = repo.create({ projectId, featureName: "Test" });
    expect(repo.delete(created.id)).toBe(true);
    expect(repo.getById(created.id)).toBeNull();
  });

  it("delete returns false for nonexistent", () => {
    expect(repo.delete("nonexistent")).toBe(false);
  });
});
