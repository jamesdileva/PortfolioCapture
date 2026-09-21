import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDatabase } from "../helpers/database.js";
import type Database from "better-sqlite3";
import { ProjectRepository } from "../../packages/database/repositories/project-repository.js";
import { SessionRepository } from "../../packages/database/repositories/session-repository.js";
import { SettingsRepository } from "../../packages/database/repositories/settings-repository.js";
import { SettingsRepository } from "../../packages/database/repositories/settings-repository.js";
import { ProjectService } from "../../apps/desktop/electron/services/project-service.js";
import { SessionService } from "../../apps/desktop/electron/services/session-service.js";
import { SettingsService } from "../../apps/desktop/electron/services/settings-service.js";
import { SettingsService } from "../../apps/desktop/electron/services/settings-service.js";
import { SessionManager } from "../../apps/desktop/electron/services/session-manager.js";
import { IdleDetectorImpl } from "../../apps/desktop/electron/services/idle-detector.js";
import type { CaptureProvider, CaptureSession, CaptureResult, CaptureOptions } from "../../packages/shared/types/index.js";

function createMockCaptureProvider(): CaptureProvider & { stopResult: CaptureResult; shouldFailStart: boolean; shouldFailStop: boolean } {
  return {
    shouldFailStart: false,
    shouldFailStop: false,
    stopResult: {
      outputPath: "data/recordings/test/session/raw.mp4",
      durationMs: 5000,
      fileSizeBytes: 1024000,
      width: 1920,
      height: 1080,
    },
    async start(): Promise<CaptureSession> {
      if (this.shouldFailStart) throw new Error("FFmpeg failed to start");
      return { sessionId: `capture-${Date.now()}`, startedAt: new Date().toISOString() };
    },
    async stop(): Promise<CaptureResult> {
      if (this.shouldFailStop) throw new Error("FFmpeg stop failed");
      return this.stopResult;
    },
  };
}

describe("SessionManager", () => {
  let db: Database.Database;
  let projectService: ProjectService;
  let sessionService: SessionService;
  let captureProvider: ReturnType<typeof createMockCaptureProvider>;
  let manager: SessionManager;

  beforeEach(() => {
    db = createTestDatabase();
    projectService = new ProjectService(new ProjectRepository(db));
    sessionService = new SessionService(new SessionRepository(db));
    captureProvider = createMockCaptureProvider();
    manager = new SessionManager({
      sessionService,
      captureProvider,
      projectService,
      config: { outputRoot: "data/recordings" },
    });
  });

  it("creates session in starting status, transitions to recording on capture start", async () => {
    const project = projectService.create({ name: "Test", path: "/test", executablePath: "/test/app.exe" });
    const session = await manager.startSession(project.id, "manual");

    expect(session.status).toBe("recording");
    expect(session.projectId).toBe(project.id);
    expect(session.trigger).toBe("manual");
    expect(manager.getActiveProjectIds()).toContain(project.id);
  });

  it("transitions to complete on stop", async () => {
    const project = projectService.create({ name: "Test", path: "/test", executablePath: "/test/app.exe" });
    await manager.startSession(project.id, "manual");

    const completed = await manager.stopSession(project.id);
    expect(completed).not.toBeNull();
    expect(completed!.status).toBe("complete");
    expect(completed!.rawVideoPath).toBeTruthy();
    expect(completed!.endedAt).not.toBeNull();
    expect(manager.getActiveProjectIds()).not.toContain(project.id);
  });

  it("returns null when stopping with no active session", async () => {
    const result = await manager.stopSession("nonexistent");
    expect(result).toBeNull();
  });

  it("throws on duplicate active session for same project", async () => {
    const project = projectService.create({ name: "Test", path: "/test", executablePath: "/test/app.exe" });
    await manager.startSession(project.id, "manual");

    await expect(manager.startSession(project.id, "manual")).rejects.toThrow(
      "Session already active for project"
    );
  });

  it("marks session as failed when capture start fails", async () => {
    const project = projectService.create({ name: "Test", path: "/test", executablePath: "/test/app.exe" });
    captureProvider.shouldFailStart = true;

    await expect(manager.startSession(project.id, "manual")).rejects.toThrow("FFmpeg failed to start");

    const sessions = sessionService.listByProject(project.id);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].status).toBe("failed");
    expect(manager.getActiveProjectIds()).not.toContain(project.id);
  });

  it("marks session complete even when capture stop fails (defensive)", async () => {
    const project = projectService.create({ name: "Test", path: "/test", executablePath: "/test/app.exe" });
    await manager.startSession(project.id, "manual");

    captureProvider.shouldFailStop = true;
    const completed = await manager.stopSession(project.id);

    expect(completed).not.toBeNull();
    expect(completed!.status).toBe("complete");
  });

  it("onProcessStarted creates recording session for matched project", async () => {
    const project = projectService.create({ name: "Test", path: "/test", executablePath: "/test/app.exe" });

    await manager.onProcessStarted({ id: project.id, name: project.name });

    const sessions = sessionService.listByProject(project.id);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].status).toBe("recording");
  });

  it("onProcessStopped stops active session for matched project", async () => {
    const project = projectService.create({ name: "Test", path: "/test", executablePath: "/test/app.exe" });
    await manager.onProcessStarted({ id: project.id, name: project.name });

    await manager.onProcessStopped({ id: project.id, name: project.name });

    const sessions = sessionService.listByProject(project.id);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].status).toBe("complete");
  });

  it("onProcessStopped is no-op for unmatched project", async () => {
    await manager.onProcessStopped({ id: "nonexistent", name: "ghost.exe" });
    expect(manager.getActiveProjectIds()).toHaveLength(0);
  });

  it("onDevServerStarted creates recording session with dev_server_launch trigger", async () => {
    const project = projectService.create({ name: "Web App", path: "/web", devServerPorts: [3000] });

    await manager.onDevServerStarted({ id: project.id, name: project.name });

    const sessions = sessionService.listByProject(project.id);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].trigger).toBe("dev_server_launch");
    expect(sessions[0].status).toBe("recording");
  });

  it("onDevServerStopped stops active session", async () => {
    const project = projectService.create({ name: "Web App", path: "/web", devServerPorts: [3000] });
    await manager.onDevServerStarted({ id: project.id, name: project.name });

    await manager.onDevServerStopped({ id: project.id, name: project.name });

    const sessions = sessionService.listByProject(project.id);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].status).toBe("complete");
  });

  it("dual monitor (process + dev server) does not create duplicate sessions", async () => {
    const project = projectService.create({ name: "Test", path: "/test", executablePath: "/test/app.exe", devServerPorts: [3000] });

    await manager.onProcessStarted({ id: project.id, name: project.name });
    await manager.onDevServerStarted({ id: project.id, name: project.name });

    const sessions = sessionService.listByProject(project.id);
    expect(sessions).toHaveLength(1);
    expect(manager.getActiveSessionForProject(project.id)).toBeDefined();
  });

  it("sets session rawVideoPath from capture result on stop", async () => {
    const project = projectService.create({ name: "Test", path: "/test", executablePath: "/test/app.exe" });
    captureProvider.stopResult.outputPath = "/custom/output/video.mp4";

    await manager.startSession(project.id, "manual");
    const completed = await manager.stopSession(project.id);

    expect(completed!.rawVideoPath).toBe("/custom/output/video.mp4");
  });

  it("session duration calculated in repository on complete", async () => {
    const project = projectService.create({ name: "Test", path: "/test", executablePath: "/test/app.exe" });
    await manager.startSession(project.id, "manual");

    const completed = await manager.stopSession(project.id);

    expect(completed!.endedAt).not.toBeNull();
    expect(completed!.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("throws on start for nonexistent project", async () => {
    await expect(manager.startSession("nonexistent", "manual")).rejects.toThrow("Project nonexistent not found");
  });

  it("rapid start/stop cycles produce no orphan sessions", async () => {
    const project = projectService.create({ name: "Test", path: "/test", executablePath: "/test/app.exe" });

    await manager.startSession(project.id, "manual");
    await manager.stopSession(project.id);

    await manager.startSession(project.id, "process_launch");
    await manager.stopSession(project.id);

    await manager.startSession(project.id, "manual");
    await manager.stopSession(project.id);

    const sessions = sessionService.listByProject(project.id);
    expect(sessions).toHaveLength(3);
    expect(sessions.every((s) => s.status === "complete")).toBe(true);
  });

  it("getActiveSessionForProject returns undefined when none active", () => {
    expect(manager.getActiveSessionForProject("nonexistent")).toBeUndefined();
  });

  describe("idle detection integration", () => {
    let settingsService: SettingsService;

    beforeEach(() => {
      settingsService = new SettingsService(new SettingsRepository(db));
    });

    function createManagerWithIdle() {
      let time = 0;
      const mockNow = vi.fn(() => time);
      const advance = (ms: number) => { time += ms; };

      const mgr = new SessionManager({
        sessionService,
        captureProvider,
        projectService,
        config: { outputRoot: "data/recordings" },
        idleDetectorFactory: () => new IdleDetectorImpl({ idleTimeoutMs: 15_000, pollIntervalMs: 1000 }, mockNow),
        settingsService,
      });
      return { mgr, advance, mockNow };
    }

    it("creates and starts idle detector on session start", async () => {
      const { mgr, advance } = createManagerWithIdle();
      const project = projectService.create({ name: "Test", path: "/test", executablePath: "/test/app.exe" });

      await mgr.startSession(project.id, "manual");
      advance(500);

      const timeline = mgr.getTimelineForProject(project.id);
      expect(timeline.length).toBeGreaterThanOrEqual(1);
      expect(timeline[0].idle).toBe(false);

      await mgr.stopSession(project.id);
    });

    it("records activity on idle detector", async () => {
      const { mgr, advance } = createManagerWithIdle();
      const project = projectService.create({ name: "Test", path: "/test", executablePath: "/test/app.exe" });

      await mgr.startSession(project.id, "manual");
      advance(500);
      mgr.recordActivity(project.id);
      advance(200);
      mgr.recordActivity(project.id);

      const timeline = mgr.getTimelineForProject(project.id);
      expect(timeline.length).toBeGreaterThanOrEqual(1);

      await mgr.stopSession(project.id);
    });

    it("stores timeline in settings on stop", async () => {
      const { mgr, advance } = createManagerWithIdle();
      const project = projectService.create({ name: "Test", path: "/test", executablePath: "/test/app.exe" });

      await mgr.startSession(project.id, "manual");
      advance(500);
      const completed = await mgr.stopSession(project.id);

      const stored = settingsService.get(`timeline:${completed!.id}`);
      expect(stored).not.toBeNull();
      const timeline = JSON.parse(stored!);
      expect(Array.isArray(timeline)).toBe(true);
      expect(timeline.length).toBeGreaterThanOrEqual(1);
    });

    it("stores idle segment in timeline after idle timeout", async () => {
      const { mgr, advance } = createManagerWithIdle();
      const project = projectService.create({ name: "Test", path: "/test", executablePath: "/test/app.exe" });

      await mgr.startSession(project.id, "manual");
      advance(20_000);
      const completed = await mgr.stopSession(project.id);

      const stored = settingsService.get(`timeline:${completed!.id}`);
      const timeline = JSON.parse(stored!);
      const idleSegments = timeline.filter((s: { idle: boolean }) => s.idle);
      expect(idleSegments.length).toBeGreaterThanOrEqual(1);
    });

    it("no idle detector when factory not provided", async () => {
      const project = projectService.create({ name: "Test", path: "/test", executablePath: "/test/app.exe" });
      await manager.startSession(project.id, "manual");

      expect(manager.getTimelineForProject(project.id)).toEqual([]);

      await manager.stopSession(project.id);
    });

    it("recordActivity is no-op for nonexistent project", () => {
      manager.recordActivity("nonexistent");
    });
  });

  describe("onSessionComplete callback", () => {
    it("calls onSessionComplete after session finishes", async () => {
      const onComplete = vi.fn();
      const mgr = new SessionManager({
        sessionService,
        captureProvider,
        projectService,
        config: { outputRoot: "data/recordings" },
        onSessionComplete: onComplete,
      });

      const project = projectService.create({ name: "Test", path: "/test", executablePath: "/test/app.exe" });
      await mgr.startSession(project.id, "manual");
      await mgr.stopSession(project.id);

      expect(onComplete).toHaveBeenCalledWith(project.id, expect.any(String));
    });

    it("does not throw when onSessionComplete not provided", async () => {
      const project = projectService.create({ name: "Test", path: "/test", executablePath: "/test/app.exe" });
      await manager.startSession(project.id, "manual");
      await manager.stopSession(project.id);
    });
  });

  describe("post-processing pipeline integration", () => {
    let settingsService: SettingsService;

    beforeEach(() => {
      settingsService = new SettingsService(new SettingsRepository(db));
    });

    function createManagerWithPostProcessing() {
      const assembleFn = vi.fn().mockReturnValue({ segments: [{ startMs: 0, endMs: 10000, label: "Feature 1", priority: 1 }], spanMs: 10000 });
      const detectFn = vi.fn().mockResolvedValue([{ timestampMs: 0, score: 1 }]);
      const generateChaptersFn = vi.fn().mockResolvedValue({ sessionId: "s1", chapters: [], totalDurationMs: 0, generatedAt: "" });
      const scoreFn = vi.fn().mockReturnValue({ score: 75, factors: {}, breakdown: [], computedAt: "" });
      const listEvidenceFn = vi.fn().mockReturnValue([]);

      const mgr = new SessionManager({
        sessionService,
        captureProvider,
        projectService,
        config: { outputRoot: "data/recordings" },
        settingsService,
        timelineAssembler: { assemble: assembleFn },
        sceneDetector: { detect: detectFn },
        featureChapterGenerator: { generateChapters: generateChaptersFn, getChapters: vi.fn(), saveChapters: vi.fn(), renameChapter: vi.fn(), reorderChapters: vi.fn(), deleteChapters: vi.fn() },
        demoQualityScorer: { score: scoreFn },
        featureEvidenceService: { list: listEvidenceFn, generate: vi.fn(), getById: vi.fn(), save: vi.fn(), update: vi.fn(), accept: vi.fn(), reject: vi.fn(), delete: vi.fn() },
      });

      return { mgr, assembleFn, detectFn, generateChaptersFn, scoreFn, listEvidenceFn };
    }

    it("calls assembleTimeline after stop", async () => {
      const { mgr, assembleFn, detectFn } = createManagerWithPostProcessing();
      const project = projectService.create({ name: "Test", path: "/test", executablePath: "/test/app.exe" });

      await mgr.startSession(project.id, "manual");
      await mgr.stopSession(project.id);

      expect(detectFn).toHaveBeenCalled();
      expect(assembleFn).toHaveBeenCalled();
    });

    it("calls generateChapters after stop", async () => {
      const { mgr, generateChaptersFn } = createManagerWithPostProcessing();
      const project = projectService.create({ name: "Test", path: "/test", executablePath: "/test/app.exe" });

      await mgr.startSession(project.id, "manual");
      await mgr.stopSession(project.id);

      expect(generateChaptersFn).toHaveBeenCalled();
    });

    it("calls demoQualityScorer after stop", async () => {
      const { mgr, scoreFn } = createManagerWithPostProcessing();
      const project = projectService.create({ name: "Test", path: "/test", executablePath: "/test/app.exe" });

      await mgr.startSession(project.id, "manual");
      await mgr.stopSession(project.id);

      expect(scoreFn).toHaveBeenCalled();
    });

    it("stores assembled timeline in settings", async () => {
      const { mgr } = createManagerWithPostProcessing();
      const project = projectService.create({ name: "Test", path: "/test", executablePath: "/test/app.exe" });

      await mgr.startSession(project.id, "manual");
      const completed = await mgr.stopSession(project.id);

      const stored = settingsService.get(`assembled-timeline:${completed!.id}`);
      expect(stored).not.toBeNull();
      const timeline = JSON.parse(stored!);
      expect(timeline.segments).toBeDefined();
    });

    it("stores demo quality in settings", async () => {
      const { mgr } = createManagerWithPostProcessing();
      const project = projectService.create({ name: "Test", path: "/test", executablePath: "/test/app.exe" });

      await mgr.startSession(project.id, "manual");
      const completed = await mgr.stopSession(project.id);

      const stored = settingsService.get(`demo-quality:${completed!.id}`);
      expect(stored).not.toBeNull();
      const quality = JSON.parse(stored!);
      expect(quality.score).toBe(75);
    });

    it("does not fail session when post-processing throws", async () => {
      const assembleFn = vi.fn().mockImplementation(() => { throw new Error("assembly failed"); });
      const detectFn = vi.fn().mockResolvedValue([]);
      const generateChaptersFn = vi.fn().mockImplementation(() => { throw new Error("chapters failed"); });
      const scoreFn = vi.fn().mockImplementation(() => { throw new Error("scoring failed"); });

      const mgr = new SessionManager({
        sessionService,
        captureProvider,
        projectService,
        config: { outputRoot: "data/recordings" },
        settingsService,
        timelineAssembler: { assemble: assembleFn },
        sceneDetector: { detect: detectFn },
        featureChapterGenerator: { generateChapters: generateChaptersFn, getChapters: vi.fn(), saveChapters: vi.fn(), renameChapter: vi.fn(), reorderChapters: vi.fn(), deleteChapters: vi.fn() },
        demoQualityScorer: { score: scoreFn },
        featureEvidenceService: { list: vi.fn(), generate: vi.fn(), getById: vi.fn(), save: vi.fn(), update: vi.fn(), accept: vi.fn(), reject: vi.fn(), delete: vi.fn() },
      });

      const project = projectService.create({ name: "Test", path: "/test", executablePath: "/test/app.exe" });
      await mgr.startSession(project.id, "manual");
      const completed = await mgr.stopSession(project.id);

      expect(completed).not.toBeNull();
      expect(completed!.status).toBe("complete");
    });

    it("skips post-processing when deps not provided", async () => {
      const project = projectService.create({ name: "Test", path: "/test", executablePath: "/test/app.exe" });
      await manager.startSession(project.id, "manual");
      const completed = await manager.stopSession(project.id);

      expect(completed).not.toBeNull();
      expect(completed!.status).toBe("complete");
    });
  });

  describe("InteractionCollector integration", () => {
    it("starts and stops interaction collector with session", async () => {
      const started: string[] = [];
      const stopped: string[] = [];
      const collector = {
        start: () => { started.push("start"); },
        stop: () => { stopped.push("stop"); },
        getEvents: () => [],
        getTimestamps: () => [100, 200, 300],
        reset: () => {},
      };

      const mgr = new SessionManager({
        sessionService,
        captureProvider,
        projectService,
        config: { outputRoot: "data/recordings" },
        interactionCollectorFactory: () => collector,
      });

      const project = projectService.create({ name: "Test", path: "/test", executablePath: "/test/app.exe" });
      await mgr.startSession(project.id, "manual");

      expect(started).toEqual(["start"]);

      await mgr.stopSession(project.id);

      expect(stopped).toEqual(["stop"]);
    });

    it("passes interaction timestamps to screenshot ranker", async () => {
      const timestamps = [100, 250, 400];
      const collector = {
        start: () => {},
        stop: () => {},
        getEvents: () => [],
        getTimestamps: () => timestamps,
        reset: () => {},
      };

      const rankerContext: { interactionTimestamps: number[]; segmentDurations: number[] }[] = [];

      const mgr = new SessionManager({
        sessionService,
        captureProvider,
        projectService,
        config: { outputRoot: "data/recordings" },
        interactionCollectorFactory: () => collector,
        screenshotRanker: {
          rank: vi.fn().mockReturnValue([]),
          selectRanked: vi.fn().mockImplementation((_shots, context) => {
            rankerContext.push(context);
            return [];
          }),
        },
        screenshotExtractor: {
          extract: vi.fn().mockResolvedValue([
            { path: "s1.png", timestampMs: 50, width: 1920, height: 1080 },
            { path: "s2.png", timestampMs: 200, width: 1920, height: 1080 },
          ]),
        },
        assetService: {
          create: vi.fn(),
          getById: vi.fn(),
          listByProject: vi.fn().mockReturnValue([]),
          listBySession: vi.fn().mockReturnValue([]),
          listByType: vi.fn().mockReturnValue([]),
          delete: vi.fn(),
        },
      });

      const project = projectService.create({ name: "Test", path: "/test", executablePath: "/test/app.exe" });
      await mgr.startSession(project.id, "manual");
      await mgr.stopSession(project.id);

      expect(rankerContext.length).toBeGreaterThan(0);
      expect(rankerContext[0].interactionTimestamps).toEqual(timestamps);
    });

    it("works without interaction collector factory (optional)", async () => {
      const project = projectService.create({ name: "Test", path: "/test", executablePath: "/test/app.exe" });
      await manager.startSession(project.id, "manual");
      const completed = await manager.stopSession(project.id);

      expect(completed).not.toBeNull();
      expect(completed!.status).toBe("complete");
    });
  });

  describe("startSession concurrency guard", () => {
    it("concurrent starts create only one session", async () => {
      const project = projectService.create({ name: "Test", path: "/test", executablePath: "/test/app.exe" });
      let release!: () => void;
      const gate = new Promise<void>((r) => { release = r; });
      const innerStart = captureProvider.start.bind(captureProvider);
      captureProvider.start = async () => {
        await gate;
        return innerStart();
      };

      const p1 = manager.startSession(project.id, "manual");
      const p2 = manager.startSession(project.id, "manual");
      release();
      const results = await Promise.allSettled([p1, p2]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason.message).toContain("Session already active");
      expect(sessionService.listByProject(project.id)).toHaveLength(1);
    });
  });

  describe("raw_video asset + postprocess logging", () => {
    it("creates a raw_video asset on stop", async () => {
      const { AssetRepository } = await import("../../packages/database/repositories/asset-repository.js");
      const { AssetService } = await import("../../apps/desktop/electron/services/asset-service.js");
      const assetService = new AssetService(new AssetRepository(db));
      const mgr = new SessionManager({
        sessionService,
        captureProvider,
        projectService,
        assetService,
        config: { outputRoot: "data/recordings" },
      });

      const project = projectService.create({ name: "Test", path: "/test", executablePath: "/test/app.exe" });
      await mgr.startSession(project.id, "manual");
      const completed = await mgr.stopSession(project.id);

      const assets = assetService.listBySession(completed!.id);
      const raw = assets.find((a) => a.type === "raw_video");
      expect(raw).toBeDefined();
      expect(raw!.path).toBe(completed!.rawVideoPath);
    });

    it("logs postprocess failures instead of swallowing silently", async () => {
      const { AssetRepository } = await import("../../packages/database/repositories/asset-repository.js");
      const { AssetService } = await import("../../apps/desktop/electron/services/asset-service.js");
      const messages: string[] = [];
      const mgr = new SessionManager({
        sessionService,
        captureProvider,
        projectService,
        assetService: new AssetService(new AssetRepository(db)),
        screenshotExtractor: {
          extract: async () => { throw new Error("ffmpeg exploded"); },
        },
        config: { outputRoot: "data/recordings" },
        logger: (m: string) => { messages.push(m); },
      });

      const project = projectService.create({ name: "Test", path: "/test", executablePath: "/test/app.exe" });
      await mgr.startSession(project.id, "manual");
      const completed = await mgr.stopSession(project.id);

      expect(completed!.status).toBe("complete");
      expect(messages.some((m) => m.includes("extractScreenshots") && m.includes("ffmpeg exploded"))).toBe(true);
    });
  });

  describe("window capture resolution", () => {
    function windowTestSetup(windows: Array<{ title: string; pid: number; hwnd: string }>, logger?: (m: string) => void) {
      const settingsService = new SettingsService(new SettingsRepository(db));
      const startedWith: CaptureOptions[] = [];
      const innerStart = captureProvider.start.bind(captureProvider);
      captureProvider.start = async (opts: CaptureOptions) => {
        startedWith.push(opts);
        return innerStart();
      };
      const mgr = new SessionManager({
        sessionService,
        captureProvider,
        projectService,
        settingsService,
        windowEnumerator: { listWindows: async () => windows },
        config: { outputRoot: "data/recordings" },
        logger,
      });
      return { mgr, settingsService, startedWith };
    }

    it("captures the bound window when it is open", async () => {
      const { mgr, startedWith } = windowTestSetup([{ title: "My App", pid: 42, hwnd: "0x1" }]);
      const project = projectService.create({
        name: "Win",
        path: "/win",
        captureMode: "window",
        windowTitle: "my app",
      });

      await mgr.startSession(project.id, "manual");

      expect(startedWith).toHaveLength(1);
      expect(startedWith[0].captureMode).toBe("window");
      expect(startedWith[0].windowTitle).toBe("My App");
    });

    it("falls back to desktop with a marker when the window is missing", async () => {
      const messages: string[] = [];
      const { mgr, settingsService, startedWith } = windowTestSetup([], (m) => messages.push(m));
      const project = projectService.create({
        name: "Win",
        path: "/win",
        captureMode: "window",
        windowTitle: "Gone App",
      });

      const session = await mgr.startSession(project.id, "manual");

      expect(startedWith).toHaveLength(1);
      expect(startedWith[0].captureMode).toBe("desktop");
      expect(startedWith[0].windowTitle).toBeUndefined();
      expect(messages.some((m) => m.includes("falling back to desktop"))).toBe(true);
      expect(settingsService.get(`capture-fallback:${session.id}`)).toBe("Gone App");
    });

    it("profile settings override the project binding", async () => {
      const { mgr, settingsService, startedWith } = windowTestSetup([
        { title: "My App", pid: 42, hwnd: "0x1" },
      ]);
      const project = projectService.create({
        name: "Win",
        path: "/win",
        captureMode: "window",
        windowTitle: "My App",
      });

      const session = await mgr.startSession(project.id, "manual", { captureMode: "desktop" });

      expect(startedWith).toHaveLength(1);
      expect(startedWith[0].captureMode).toBe("desktop");
      expect(settingsService.get(`capture-fallback:${session.id}`)).toBeNull();
    });
  });

  describe("demo fallback", () => {
    it("generates the demo from raw video when there is nothing to trim", async () => {
      const { AssetRepository } = await import("../../packages/database/repositories/asset-repository.js");
      const { AssetService } = await import("../../apps/desktop/electron/services/asset-service.js");
      const assetService = new AssetService(new AssetRepository(db));
      const generatedFrom: string[] = [];
      const mgr = new SessionManager({
        sessionService,
        captureProvider,
        projectService,
        assetService,
        demoGenerator: {
          generate: async (input: string, outputDir: string) => {
            generatedFrom.push(input);
            return { outputPath: `${outputDir}/demo.mp4`, durationMs: 5000, segmentCount: 1, hasIntro: false, hasOutro: false };
          },
        },
        config: { outputRoot: "data/recordings" },
      });

      const project = projectService.create({ name: "Test", path: "/test" });
      await mgr.startSession(project.id, "manual");
      const completed = await mgr.stopSession(project.id);

      // No smartTrimmer configured, so trimVideo yields null and the raw
      // capture becomes the demo source.
      expect(generatedFrom).toHaveLength(1);
      expect(generatedFrom[0]).toBe(completed!.rawVideoPath);
      const demo = assetService.listBySession(completed!.id).find((a) => a.type === "demo_video");
      expect(demo).toBeDefined();
    });
  });

  describe("blank capture detection", () => {
    async function stopWithBrightness(brightness: number | null) {
      const { AssetRepository } = await import("../../packages/database/repositories/asset-repository.js");
      const { AssetService } = await import("../../apps/desktop/electron/services/asset-service.js");
      const messages: string[] = [];
      const settingsSvc = new SettingsService(new SettingsRepository(db));
      const mgr = new SessionManager({
        sessionService,
        captureProvider,
        projectService,
        assetService: new AssetService(new AssetRepository(db)),
        settingsService: settingsSvc,
        brightnessSampler: async () => brightness,
        config: { outputRoot: "data/recordings" },
        logger: (m: string) => { messages.push(m); },
      });
      const project = projectService.create({ name: "Test", path: "/test" });
      await mgr.startSession(project.id, "manual");
      const completed = await mgr.stopSession(project.id);
      return { completed, messages, settingsSvc };
    }

    it("marks white captures and logs", async () => {
      const { completed, messages, settingsSvc } = await stopWithBrightness(250);
      expect(completed!.status).toBe("complete");
      expect(messages.some((m) => m.includes("looks blank"))).toBe(true);
      expect(settingsSvc.get(`capture-blank:${completed!.id}`)).toBe("250");
    });

    it("stays silent for normal captures", async () => {
      const { completed, messages, settingsSvc } = await stopWithBrightness(90);
      expect(completed!.status).toBe("complete");
      expect(messages.some((m) => m.includes("looks blank"))).toBe(false);
      expect(settingsSvc.get(`capture-blank:${completed!.id}`)).toBeNull();
    });
  });

  describe("window provider selection", () => {
    function selectionSetup() {
      const ffmpegMock = createMockCaptureProvider();
      const electronMock = createMockCaptureProvider();
      const messages: string[] = [];
      const mgr = new SessionManager({
        sessionService,
        captureProvider: ffmpegMock,
        projectService,
        config: { outputRoot: "data/recordings" },
        windowEnumerator: {
          listWindows: async () => [{ title: "My App", pid: 11, hwnd: "0x1" }],
        },
        windowCaptureProvider: electronMock,
        brightnessSampler: async () => null,
        logger: (m: string) => { messages.push(m); },
      });
      const ffmpegStart = vi.spyOn(ffmpegMock, "start");
      const ffmpegStop = vi.spyOn(ffmpegMock, "stop");
      const electronStart = vi.spyOn(electronMock, "start");
      const electronStop = vi.spyOn(electronMock, "stop");
      return { mgr, messages, ffmpegStart, ffmpegStop, electronStart, electronStop, ffmpegMock, electronMock };
    }

    function makeWindowProject() {
      return projectService.create({
        name: "Win",
        path: "/win",
        captureMode: "window",
        windowTitle: "My App",
      });
    }

    it("uses the Electron provider for window captures", async () => {
      const { mgr, ffmpegStart, electronStart, electronStop } = selectionSetup();
      const project = makeWindowProject();

      await mgr.startSession(project.id, "manual");

      expect(electronStart).toHaveBeenCalledTimes(1);
      expect(electronStart.mock.calls[0][0]).toMatchObject({ captureMode: "window", windowTitle: "My App" });
      expect(ffmpegStart).not.toHaveBeenCalled();

      await mgr.stopSession(project.id);
      expect(electronStop).toHaveBeenCalledTimes(1);
    });

    it("falls back to FFmpeg title capture when Electron fails", async () => {
      const { mgr, messages, ffmpegStart, electronMock } = selectionSetup();
      electronMock.shouldFailStart = true;
      const project = makeWindowProject();

      await mgr.startSession(project.id, "manual");

      expect(ffmpegStart).toHaveBeenCalledTimes(1);
      expect(ffmpegStart.mock.calls[0][0]).toMatchObject({ captureMode: "window", windowTitle: "My App" });
      expect(messages.some((m) => m.includes("trying FFmpeg title capture"))).toBe(true);
    });

    it("falls back to desktop when FFmpeg title capture fails", async () => {
      const messages: string[] = [];
      const ffmpegStart = vi.fn();
      const project = makeWindowProject();

      const mgr2 = new SessionManager({
        sessionService,
        captureProvider: {
          start: ffmpegStart,
          stop: async () => ({
            outputPath: "x.mp4",
            durationMs: 1,
            fileSizeBytes: 1,
            width: 1,
            height: 1,
          }),
        } as never,
        projectService,
        config: { outputRoot: "data/recordings" },
        windowEnumerator: {
          listWindows: async () => [{ title: "My App", pid: 11, hwnd: "0x1" }],
        },
        brightnessSampler: async () => null,
        logger: (m: string) => { messages.push(m); },
      });
      ffmpegStart
        .mockRejectedValueOnce(new Error("no such window"))
        .mockImplementation(async () => ({
          sessionId: "cap-desktop",
          startedAt: new Date().toISOString(),
        }));

      await mgr2.startSession(project.id, "manual");

      expect(ffmpegStart).toHaveBeenCalledTimes(2);
      expect(ffmpegStart.mock.calls[1][0]).toMatchObject({ captureMode: "desktop" });
      expect((ffmpegStart.mock.calls[1][0] as { windowTitle?: string }).windowTitle).toBeUndefined();
      expect(messages.some((m) => m.includes("falling back to desktop"))).toBe(true);
    });

    it("ignores the Electron provider for desktop captures", async () => {
      const { mgr, electronStart, ffmpegStart } = selectionSetup();
      const project = projectService.create({ name: "Desk", path: "/desk" });

      await mgr.startSession(project.id, "manual");

      expect(electronStart).not.toHaveBeenCalled();
      expect(ffmpegStart).toHaveBeenCalledTimes(1);
      expect(ffmpegStart.mock.calls[0][0]).toMatchObject({ captureMode: "desktop" });
    });
  });

  describe("focus edge-trim", () => {
    const FOCUS = [
      { startMs: 0, endMs: 3000, title: "Portfolio Auto Recorder", exePath: "C:\\app\\rec.exe" },
      { startMs: 3000, endMs: 50000, title: "My App", exePath: "C:\\app\\myapp.exe" },
      { startMs: 50000, endMs: 56000, title: "Portfolio Auto Recorder", exePath: "C:\\app\\rec.exe" },
    ];

    async function focusSetup() {
      const { AssetRepository } = await import("../../packages/database/repositories/asset-repository.js");
      const { AssetService } = await import("../../apps/desktop/electron/services/asset-service.js");
      const assetService = new AssetService(new AssetRepository(db));
      const settingsSvc = new SettingsService(new SettingsRepository(db));
      const trimEdgesFocus = vi.fn(async (_in: string, out: string) => out);
      const generatedFrom: string[] = [];
      const tracker = {
        start: vi.fn(),
        stop: vi.fn(),
        getSegments: () => FOCUS,
      };
      const mgr = new SessionManager({
        sessionService,
        captureProvider,
        projectService,
        assetService,
        settingsService: settingsSvc,
        smartTrimmer: {
          trim: vi.fn(async () => null),
          trimEdgesFocus,
          computeActiveSegments: () => [],
        } as never,
        demoGenerator: {
          generate: async (input: string, outputDir: string) => {
            generatedFrom.push(input);
            return { outputPath: `${outputDir}/demo.mp4`, durationMs: 5000, segmentCount: 1, hasIntro: false, hasOutro: false };
          },
        },
        foregroundTrackerFactory: () => tracker,
        brightnessSampler: async () => null,
        config: { outputRoot: "data/recordings" },
      });
      return { mgr, trimEdgesFocus, generatedFrom, tracker, settingsSvc };
    }

    function makeFocusProject(name: string, sub: string) {
      return projectService.create({ name, path: `/${sub}`, executablePath: "C:\\app\\myapp.exe" });
    }

    it("trims recorder round-trip edges for manual recordings", async () => {
      const { mgr, trimEdgesFocus, generatedFrom, tracker, settingsSvc } = await focusSetup();
      const project = makeFocusProject("Win", "win");

      await mgr.startSession(project.id, "manual");
      expect(tracker.start).toHaveBeenCalledTimes(1);
      const completed = await mgr.stopSession(project.id);

      expect(trimEdgesFocus).toHaveBeenCalledTimes(1);
      const [, outPath, , target] = trimEdgesFocus.mock.calls[0] as [string, string, unknown, { exePath: string | null }];
      expect(outPath.endsWith("edged.mp4")).toBe(true);
      expect(target.exePath).toBe("C:\\app\\myapp.exe");
      expect(generatedFrom).toHaveLength(1);
      expect(generatedFrom[0]).toContain("edged.mp4");
      expect(settingsSvc.get(`focus:${completed!.id}`)).not.toBeNull();
    });

    it("skips edge-trim for auto recordings by default", async () => {
      const { mgr, trimEdgesFocus } = await focusSetup();
      const project = makeFocusProject("Auto", "auto");

      await mgr.startSession(project.id, "process_launch");
      await mgr.stopSession(project.id);

      expect(trimEdgesFocus).not.toHaveBeenCalled();
    });

    it("profile flag overrides the trigger default both ways", async () => {
      const auto = await focusSetup();
      await mgrStart(auto, "Auto2", "auto2", "process_launch", { focusEdgeTrim: true });
      expect(auto.trimEdgesFocus).toHaveBeenCalledTimes(1);

      const manual = await focusSetup();
      await mgrStart(manual, "Manual2", "manual2", "manual", { focusEdgeTrim: false });
      expect(manual.trimEdgesFocus).not.toHaveBeenCalled();
    });

    async function mgrStart(
      setup: Awaited<ReturnType<typeof focusSetup>>,
      name: string,
      sub: string,
      trigger: "manual" | "process_launch",
      profileSettings?: Record<string, unknown>,
    ) {
      const project = makeFocusProject(name, sub);
      await setup.mgr.startSession(project.id, trigger, profileSettings as never);
      await setup.mgr.stopSession(project.id);
    }
  });
});
