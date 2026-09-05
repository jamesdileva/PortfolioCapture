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
import { PortfolioGeneratorImpl } from "../../apps/desktop/electron/services/portfolio-generator.js";

describe("PortfolioGeneratorImpl", () => {
  let db: Database.Database;
  let projectService: ProjectService;
  let sessionService: SessionService;
  let assetService: AssetService;
  let generator: PortfolioGeneratorImpl;
  let tempDir: string;

  beforeEach(() => {
    db = createTestDatabase();
    projectService = new ProjectService(new ProjectRepository(db));
    sessionService = new SessionService(new SessionRepository(db));
    assetService = new AssetService(new AssetRepository(db));
    tempDir = fs.mkdtempSync(path.join(tmpdir(), "portfolio-test-"));
    generator = new PortfolioGeneratorImpl(projectService, sessionService, assetService, tempDir);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("generates portfolio with empty projects", async () => {
    const result = await generator.generate();

    expect(result.projectCount).toBe(0);
    expect(result.assetCount).toBe(0);
    expect(fs.existsSync(result.indexHtmlPath)).toBe(true);
    expect(fs.existsSync(result.dataJsonPath)).toBe(true);
  });

  it("creates output directory structure", async () => {
    const result = await generator.generate();

    expect(fs.existsSync(result.outputDir)).toBe(true);
    expect(fs.existsSync(path.join(result.outputDir, "assets"))).toBe(true);
    expect(fs.existsSync(path.join(result.outputDir, "projects"))).toBe(true);
  });

  it("generates data.json with project metadata", async () => {
    projectService.create({ name: "TestProject", path: "/test", description: "A test", features: ["feat1"], techStack: ["React"] });

    await generator.generate();
    const data = JSON.parse(fs.readFileSync(path.join(tempDir, "data.json"), "utf-8"));

    expect(data.projects).toHaveLength(1);
    expect(data.projects[0].name).toBe("TestProject");
    expect(data.projects[0].description).toBe("A test");
    expect(data.projects[0].features).toEqual(["feat1"]);
    expect(data.projects[0].techStack).toEqual(["React"]);
    expect(data.summary.totalProjects).toBe(1);
    expect(data.generatedAt).toBeDefined();
  });

  it("generates index.html with project cards", async () => {
    projectService.create({ name: "MyApp", path: "/app", description: "My application" });

    await generator.generate();
    const html = fs.readFileSync(path.join(tempDir, "index.html"), "utf-8");

    expect(html).toContain("MyApp");
    expect(html).toContain("My application");
    expect(html).toContain("1 projects");
    expect(html).toContain("MyApp</a>");
  });

  it("index.html uses assets/ path (not ../assets/) for demos and screenshots", async () => {
    const project = projectService.create({ name: "PathTest", path: "/pt" });
    const session = sessionService.create({ projectId: project.id, trigger: "manual" });
    sessionService.updateStatus(session.id, "complete");

    const sourceDir = path.join(tempDir, "src");
    fs.mkdirSync(sourceDir, { recursive: true });
    const demo = path.join(sourceDir, "demo.mp4");
    const shot = path.join(sourceDir, "shot.png");
    fs.writeFileSync(demo, "fake demo");
    fs.writeFileSync(shot, "fake png");

    assetService.create({ sessionId: session.id, projectId: project.id, type: "demo_video", path: demo });
    assetService.create({ sessionId: session.id, projectId: project.id, type: "screenshot", path: shot, width: 1920, height: 1080 });

    await generator.generate();
    const html = fs.readFileSync(path.join(tempDir, "index.html"), "utf-8");

    expect(html).toContain('src="assets/demo.mp4"');
    expect(html).toContain('src="assets/shot.png"');
    expect(html).not.toContain('../assets/');
  });

  it("generates per-project HTML pages", async () => {
    projectService.create({ name: "Alpha", path: "/alpha", description: "Alpha project", features: ["f1", "f2"], techStack: ["Vue"] });

    await generator.generate();
    const projectHtml = fs.readFileSync(path.join(tempDir, "projects", "alpha.html"), "utf-8");

    expect(projectHtml).toContain("Alpha");
    expect(projectHtml).toContain("Alpha project");
    expect(projectHtml).toContain("f1");
    expect(projectHtml).toContain("f2");
    expect(projectHtml).toContain("Vue");
    expect(projectHtml).toContain("Back to Portfolio");
  });

  it("copies demo video to assets directory", async () => {
    const project = projectService.create({ name: "DemoProject", path: "/demo" });
    const session = sessionService.create({ projectId: project.id, trigger: "manual" });
    sessionService.updateStatus(session.id, "complete");

    const sourceDir = path.join(tempDir, "source");
    fs.mkdirSync(sourceDir, { recursive: true });
    const demoPath = path.join(sourceDir, "demo.mp4");
    fs.writeFileSync(demoPath, "fake demo");

    assetService.create({ sessionId: session.id, projectId: project.id, type: "demo_video", path: demoPath });

    const result = await generator.generate();

    expect(result.assetCount).toBe(1);
    expect(fs.existsSync(path.join(result.outputDir, "assets", "demo.mp4"))).toBe(true);
  });

  it("copies screenshots to assets directory", async () => {
    const project = projectService.create({ name: "ShotProject", path: "/shot" });
    const session = sessionService.create({ projectId: project.id, trigger: "manual" });
    sessionService.updateStatus(session.id, "complete");

    const sourceDir = path.join(tempDir, "shots");
    fs.mkdirSync(sourceDir, { recursive: true });
    const shot1 = path.join(sourceDir, "shot-001.png");
    const shot2 = path.join(sourceDir, "shot-002.png");
    fs.writeFileSync(shot1, "png1");
    fs.writeFileSync(shot2, "png2");

    assetService.create({ sessionId: session.id, projectId: project.id, type: "screenshot", path: shot1, width: 1920, height: 1080 });
    assetService.create({ sessionId: session.id, projectId: project.id, type: "screenshot", path: shot2, width: 1280, height: 720 });

    const result = await generator.generate();

    expect(result.assetCount).toBe(2);
    expect(fs.existsSync(path.join(result.outputDir, "assets", "shot-001.png"))).toBe(true);
    expect(fs.existsSync(path.join(result.outputDir, "assets", "shot-002.png"))).toBe(true);
  });

  it("includes sessions in data.json", async () => {
    const project = projectService.create({ name: "SessionProject", path: "/sess" });
    const session = sessionService.create({ projectId: project.id, trigger: "manual" });
    sessionService.updateStatus(session.id, "complete");

    await generator.generate();
    const data = JSON.parse(fs.readFileSync(path.join(tempDir, "data.json"), "utf-8"));

    expect(data.projects[0].sessions).toHaveLength(1);
    expect(data.projects[0].sessions[0].id).toBe(session.id);
    expect(data.projects[0].sessions[0].status).toBe("complete");
    expect(data.summary.totalSessions).toBe(1);
  });

  it("counts only complete sessions in summary", async () => {
    const project = projectService.create({ name: "CountProject", path: "/count" });
    const s1 = sessionService.create({ projectId: project.id, trigger: "manual" });
    sessionService.updateStatus(s1.id, "complete");
    const s2 = sessionService.create({ projectId: project.id, trigger: "manual" });
    sessionService.updateStatus(s2.id, "failed");

    await generator.generate();
    const data = JSON.parse(fs.readFileSync(path.join(tempDir, "data.json"), "utf-8"));

    expect(data.summary.totalSessions).toBe(1);
    expect(data.projects[0].sessions).toHaveLength(1);
  });

  it("re-generates cleanly over existing output", async () => {
    projectService.create({ name: "Overwrite", path: "/ow" });

    const r1 = await generator.generate();
    const r2 = await generator.generate();

    expect(r1.outputDir).toBe(r2.outputDir);
    expect(fs.existsSync(path.join(tempDir, "index.html"))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, "data.json"))).toBe(true);
  });

  it("uses custom output directory from config", async () => {
    const customDir = path.join(tempDir, "custom-output");

    const result = await generator.generate({ outputDir: customDir });

    expect(result.outputDir).toBe(customDir);
    expect(fs.existsSync(customDir)).toBe(true);
  });

  it("getData returns cached data after generate", async () => {
    projectService.create({ name: "CachedProject", path: "/cached" });

    await generator.generate();
    const data = generator.getData();

    expect(data.projects).toHaveLength(1);
    expect(data.projects[0].name).toBe("CachedProject");
  });

  it("getData builds fresh data when no cache", () => {
    projectService.create({ name: "FreshProject", path: "/fresh" });

    const data = generator.getData();

    expect(data.projects).toHaveLength(1);
    expect(data.projects[0].name).toBe("FreshProject");
  });

  it("includes project status in data.json", async () => {
    projectService.create({ name: "ActiveProject", path: "/active", projectStatus: "active" });
    projectService.create({ name: "CompletedProject", path: "/completed", projectStatus: "completed" });

    await generator.generate();
    const data = JSON.parse(fs.readFileSync(path.join(tempDir, "data.json"), "utf-8"));

    expect(data.projects.find((p: { name: string }) => p.name === "ActiveProject").projectStatus).toBe("active");
    expect(data.projects.find((p: { name: string }) => p.name === "CompletedProject").projectStatus).toBe("completed");
  });

  it("includes githubUrl in data.json", async () => {
    projectService.create({ name: "GithubProject", path: "/gh", githubUrl: "https://github.com/test/repo" });

    await generator.generate();
    const data = JSON.parse(fs.readFileSync(path.join(tempDir, "data.json"), "utf-8"));

    expect(data.projects[0].githubUrl).toBe("https://github.com/test/repo");
  });

  it("skips screenshots when includeScreenshots is false", async () => {
    const project = projectService.create({ name: "NoShots", path: "/ns" });
    const session = sessionService.create({ projectId: project.id, trigger: "manual" });
    sessionService.updateStatus(session.id, "complete");

    const sourceDir = path.join(tempDir, "ns-shots");
    fs.mkdirSync(sourceDir, { recursive: true });
    const shot = path.join(sourceDir, "shot.png");
    fs.writeFileSync(shot, "png");

    assetService.create({ sessionId: session.id, projectId: project.id, type: "screenshot", path: shot });

    const result = await generator.generate({ includeScreenshots: false });

    expect(result.assetCount).toBe(0);
  });

  it("skips demos when includeDemos is false", async () => {
    const project = projectService.create({ name: "NoDemos", path: "/nd" });
    const session = sessionService.create({ projectId: project.id, trigger: "manual" });
    sessionService.updateStatus(session.id, "complete");

    const sourceDir = path.join(tempDir, "nd-demo");
    fs.mkdirSync(sourceDir, { recursive: true });
    const demo = path.join(sourceDir, "demo.mp4");
    fs.writeFileSync(demo, "video");

    assetService.create({ sessionId: session.id, projectId: project.id, type: "demo_video", path: demo });

    const result = await generator.generate({ includeDemos: false });

    expect(result.assetCount).toBe(0);
  });

  it("renders hero image from first screenshot in project page", async () => {
    const project = projectService.create({ name: "HeroProject", path: "/hero" });
    const session = sessionService.create({ projectId: project.id, trigger: "manual" });
    sessionService.updateStatus(session.id, "complete");

    const sourceDir = path.join(tempDir, "hero-src");
    fs.mkdirSync(sourceDir, { recursive: true });
    const shot1 = path.join(sourceDir, "shot-001.png");
    const shot2 = path.join(sourceDir, "shot-002.png");
    fs.writeFileSync(shot1, "png1");
    fs.writeFileSync(shot2, "png2");

    assetService.create({ sessionId: session.id, projectId: project.id, type: "screenshot", path: shot1, width: 1920, height: 1080 });
    assetService.create({ sessionId: session.id, projectId: project.id, type: "screenshot", path: shot2, width: 1280, height: 720 });

    await generator.generate();
    const html = fs.readFileSync(path.join(tempDir, "projects", "heroproject.html"), "utf-8");

    expect(html).toContain('class="hero"');
    expect(html).toContain('src="../assets/shot-001.png"');
    expect(html).toContain('alt="hero"');
  });

  it("no hero section when no screenshots", async () => {
    projectService.create({ name: "NoHero", path: "/nohero" });

    await generator.generate();
    const html = fs.readFileSync(path.join(tempDir, "projects", "nohero.html"), "utf-8");

    expect(html).not.toContain('class="hero"');
  });

  it("renders timeline with recording sessions in project page", async () => {
    const project = projectService.create({ name: "TimelineProject", path: "/tl" });
    const session = sessionService.create({ projectId: project.id, trigger: "manual" });
    sessionService.updateStatus(session.id, "complete");
    sessionService.updateRawVideoPath(session.id, "/video.mp4");

    await generator.generate();
    const html = fs.readFileSync(path.join(tempDir, "projects", "timelineproject.html"), "utf-8");

    expect(html).toContain('class="timeline"');
    expect(html).toContain("Recording");
    expect(html).toContain("tl-date");
    expect(html).toContain("tl-duration");
  });

  it("no timeline section when no sessions", async () => {
    projectService.create({ name: "NoTimeline", path: "/notl" });

    await generator.generate();
    const html = fs.readFileSync(path.join(tempDir, "projects", "notimeline.html"), "utf-8");

    expect(html).not.toContain('class="timeline"');
  });

  it("timeline shows formatted duration", async () => {
    const project = projectService.create({ name: "DurationProject", path: "/dur" });
    const session = sessionService.create({ projectId: project.id, trigger: "manual" });
    sessionService.updateStatus(session.id, "complete");

    await generator.generate();
    const html = fs.readFileSync(path.join(tempDir, "projects", "durationproject.html"), "utf-8");

    expect(html).toContain("m ");
    expect(html).toContain("s");
  });

  it("project page renders with minimal data (no crashes)", async () => {
    projectService.create({ name: "Minimal", path: "/min" });

    await generator.generate();
    const html = fs.readFileSync(path.join(tempDir, "projects", "minimal.html"), "utf-8");

    expect(html).toContain("Minimal");
    expect(html).toContain("Back to Portfolio");
    expect(html).not.toContain('class="hero"');
    expect(html).not.toContain('class="timeline"');
  });
});
