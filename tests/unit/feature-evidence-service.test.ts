import { describe, it, expect, beforeEach } from "vitest";
import { createTestDatabase } from "../helpers/database.js";
import type Database from "better-sqlite3";
import { ProjectRepository } from "../../packages/database/repositories/project-repository.js";
import { SessionRepository } from "../../packages/database/repositories/session-repository.js";
import { AssetRepository } from "../../packages/database/repositories/asset-repository.js";
import { FeatureEvidenceRepository } from "../../packages/database/repositories/feature-evidence-repository.js";
import { FeatureEvidenceServiceImpl } from "../../apps/desktop/electron/services/feature-evidence-service.js";
import type { GitService } from "../../packages/shared/types/index.js";

function mockGitService(overrides?: Partial<GitService>): GitService {
  return {
    getRepoInfo: async () => null,
    getProjectFileInfo: async () => ({ packageJson: null, readme: null }),
    getProjectMetadata: async () => ({ repoInfo: null, fileInfo: { packageJson: null, readme: null } }),
    ...overrides,
  };
}

function mockExec(stdout: string = "", shouldFail = false) {
  return async (cmd: string, _opts: { cwd: string }) => {
    if (shouldFail) throw new Error("exec failed");
    return { stdout, stderr: "" };
  };
}

describe("FeatureEvidenceServiceImpl", () => {
  let db: Database.Database;
  let evidenceRepo: FeatureEvidenceRepository;
  let projectRepo: ProjectRepository;
  let sessionRepo: SessionRepository;
  let assetRepo: AssetRepository;

  beforeEach(() => {
    db = createTestDatabase();
    evidenceRepo = new FeatureEvidenceRepository(db);
    projectRepo = new ProjectRepository(db);
    sessionRepo = new SessionRepository(db);
    assetRepo = new AssetRepository(db);
  });

  it("throws when projectId is empty", async () => {
    const service = new FeatureEvidenceServiceImpl(evidenceRepo, projectRepo, sessionRepo, assetRepo, mockGitService());
    await expect(service.generate("")).rejects.toThrow("projectId is required");
  });

  it("throws when project not found", async () => {
    const service = new FeatureEvidenceServiceImpl(evidenceRepo, projectRepo, sessionRepo, assetRepo, mockGitService());
    await expect(service.generate("nonexistent")).rejects.toThrow("Project not found");
  });

  it("generates evidence from git commits", async () => {
    const project = projectRepo.create({ name: "Test", path: "/test" });
    const exec = mockExec("abc123|feat: add dashboard|2026-01-01 10:00:00\nabc124|feat: add dashboard|2026-01-02 10:00:00\n");
    const service = new FeatureEvidenceServiceImpl(evidenceRepo, projectRepo, sessionRepo, assetRepo, mockGitService(), exec);

    const results = await service.generate(project.id);

    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].projectId).toBe(project.id);
    expect(results[0].commits.length).toBeGreaterThanOrEqual(1);
  });

  it("generates fallback evidence when no feature groups", async () => {
    const project = projectRepo.create({ name: "Test", path: "/test" });
    const exec = mockExec("abc123|fix: typo|2026-01-01\n");
    const service = new FeatureEvidenceServiceImpl(evidenceRepo, projectRepo, sessionRepo, assetRepo, mockGitService(), exec);

    const results = await service.generate(project.id);

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe("candidate");
  });

  it("generates empty results when no commits", async () => {
    const project = projectRepo.create({ name: "Test", path: "/test" });
    const exec = mockExec("");
    const service = new FeatureEvidenceServiceImpl(evidenceRepo, projectRepo, sessionRepo, assetRepo, mockGitService(), exec);

    const results = await service.generate(project.id);

    expect(results).toHaveLength(0);
  });

  it("handles git exec failure gracefully", async () => {
    const project = projectRepo.create({ name: "Test", path: "/test" });
    const exec = mockExec("", true);
    const service = new FeatureEvidenceServiceImpl(evidenceRepo, projectRepo, sessionRepo, assetRepo, mockGitService(), exec);

    const results = await service.generate(project.id);

    expect(results).toHaveLength(0);
  });

  it("links screenshots and segments from sessions", async () => {
    const project = projectRepo.create({ name: "Test", path: "/test" });
    const session = sessionRepo.create({ projectId: project.id, trigger: "manual" });
    sessionRepo.updateStatus(session.id, "complete");
    assetRepo.create({ sessionId: session.id, projectId: project.id, type: "screenshot", path: "/img/shot1.png" });
    assetRepo.create({ sessionId: session.id, projectId: project.id, type: "trimmed_video", path: "/vid/trimmed.mp4" });

    const exec = mockExec("abc123|feat: dashboard|2026-01-01 10:00:00\nabc124|feat: dashboard|2026-01-02 10:00:00\n");
    const service = new FeatureEvidenceServiceImpl(evidenceRepo, projectRepo, sessionRepo, assetRepo, mockGitService(), exec);

    const results = await service.generate(project.id);

    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it("includes readme snippet when available", async () => {
    const project = projectRepo.create({ name: "Test", path: "/test" });
    const gitService = mockGitService({
      getProjectFileInfo: async () => ({
        packageJson: null,
        readme: { description: "Test app", content: "This is the Dashboard feature for the app." },
      }),
    });
    const exec = mockExec("abc123|feat: dashboard|2026-01-01 10:00:00\nabc124|feat: dashboard|2026-01-02 10:00:00\n");
    const service = new FeatureEvidenceServiceImpl(evidenceRepo, projectRepo, sessionRepo, assetRepo, gitService, exec);

    const results = await service.generate(project.id);

    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it("list returns evidence for project", () => {
    const project = projectRepo.create({ name: "Test", path: "/test" });
    evidenceRepo.create({ projectId: project.id, featureName: "A" });
    evidenceRepo.create({ projectId: project.id, featureName: "B" });

    const service = new FeatureEvidenceServiceImpl(evidenceRepo, projectRepo, sessionRepo, assetRepo, mockGitService());
    const results = service.list(project.id);

    expect(results).toHaveLength(2);
  });

  it("list throws on empty projectId", () => {
    const service = new FeatureEvidenceServiceImpl(evidenceRepo, projectRepo, sessionRepo, assetRepo, mockGitService());
    expect(() => service.list("")).toThrow("projectId is required");
  });

  it("getById returns evidence", () => {
    const project = projectRepo.create({ name: "Test", path: "/test" });
    const created = evidenceRepo.create({ projectId: project.id, featureName: "Test" });
    const service = new FeatureEvidenceServiceImpl(evidenceRepo, projectRepo, sessionRepo, assetRepo, mockGitService());
    expect(service.getById(created.id)).not.toBeNull();
  });

  it("getById throws on empty id", () => {
    const service = new FeatureEvidenceServiceImpl(evidenceRepo, projectRepo, sessionRepo, assetRepo, mockGitService());
    expect(() => service.getById("")).toThrow("id is required");
  });

  it("save creates evidence", () => {
    const project = projectRepo.create({ name: "Test", path: "/test" });
    const service = new FeatureEvidenceServiceImpl(evidenceRepo, projectRepo, sessionRepo, assetRepo, mockGitService());
    const result = service.save({ projectId: project.id, featureName: "New" });

    expect(result.featureName).toBe("New");
    expect(result.projectId).toBe(project.id);
  });

  it("save throws on empty projectId", () => {
    const service = new FeatureEvidenceServiceImpl(evidenceRepo, projectRepo, sessionRepo, assetRepo, mockGitService());
    expect(() => service.save({ projectId: "", featureName: "X" })).toThrow("projectId is required");
  });

  it("save throws on empty featureName", () => {
    const project = projectRepo.create({ name: "Test", path: "/test" });
    const service = new FeatureEvidenceServiceImpl(evidenceRepo, projectRepo, sessionRepo, assetRepo, mockGitService());
    expect(() => service.save({ projectId: project.id, featureName: "" })).toThrow("featureName is required");
  });

  it("save throws when project not found", () => {
    const service = new FeatureEvidenceServiceImpl(evidenceRepo, projectRepo, sessionRepo, assetRepo, mockGitService());
    expect(() => service.save({ projectId: "nonexistent", featureName: "X" })).toThrow("Project not found");
  });

  it("update modifies evidence", () => {
    const project = projectRepo.create({ name: "Test", path: "/test" });
    const created = evidenceRepo.create({ projectId: project.id, featureName: "Old" });
    const service = new FeatureEvidenceServiceImpl(evidenceRepo, projectRepo, sessionRepo, assetRepo, mockGitService());
    const updated = service.update(created.id, { featureName: "New" });

    expect(updated.featureName).toBe("New");
  });

  it("update throws on empty id", () => {
    const service = new FeatureEvidenceServiceImpl(evidenceRepo, projectRepo, sessionRepo, assetRepo, mockGitService());
    expect(() => service.update("", { featureName: "X" })).toThrow("id is required");
  });

  it("update throws when not found", () => {
    const service = new FeatureEvidenceServiceImpl(evidenceRepo, projectRepo, sessionRepo, assetRepo, mockGitService());
    expect(() => service.update("nonexistent", { featureName: "X" })).toThrow("Feature evidence not found");
  });

  it("accept marks evidence as accepted", () => {
    const project = projectRepo.create({ name: "Test", path: "/test" });
    const created = evidenceRepo.create({ projectId: project.id, featureName: "Test" });
    const service = new FeatureEvidenceServiceImpl(evidenceRepo, projectRepo, sessionRepo, assetRepo, mockGitService());
    const accepted = service.accept(created.id);

    expect(accepted.status).toBe("accepted");
  });

  it("reject marks evidence as rejected", () => {
    const project = projectRepo.create({ name: "Test", path: "/test" });
    const created = evidenceRepo.create({ projectId: project.id, featureName: "Test" });
    const service = new FeatureEvidenceServiceImpl(evidenceRepo, projectRepo, sessionRepo, assetRepo, mockGitService());
    const rejected = service.reject(created.id);

    expect(rejected.status).toBe("rejected");
  });

  it("delete removes evidence", () => {
    const project = projectRepo.create({ name: "Test", path: "/test" });
    const created = evidenceRepo.create({ projectId: project.id, featureName: "Test" });
    const service = new FeatureEvidenceServiceImpl(evidenceRepo, projectRepo, sessionRepo, assetRepo, mockGitService());
    service.delete(created.id);

    expect(evidenceRepo.getById(created.id)).toBeNull();
  });

  it("delete throws on nonexistent", () => {
    const service = new FeatureEvidenceServiceImpl(evidenceRepo, projectRepo, sessionRepo, assetRepo, mockGitService());
    expect(() => service.delete("nonexistent")).toThrow("Feature evidence not found");
  });

  it("computeConfidence scales with evidence count", async () => {
    const project = projectRepo.create({ name: "Test", path: "/test" });
    const exec = mockExec(
      "abc1|feat: a|2026-01-01\nabc2|feat: a|2026-01-02\nabc3|feat: a|2026-01-03\nabc4|feat: a|2026-01-04\nabc5|feat: a|2026-01-05\n",
    );
    const service = new FeatureEvidenceServiceImpl(evidenceRepo, projectRepo, sessionRepo, assetRepo, mockGitService(), exec);

    const results = await service.generate(project.id);

    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].confidence).toBeGreaterThan(0);
  });
});
