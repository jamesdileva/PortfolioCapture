import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDatabase } from "../helpers/database.js";
import type Database from "better-sqlite3";
import { ProjectRepository } from "../../packages/database/repositories/project-repository.js";
import { SessionRepository } from "../../packages/database/repositories/session-repository.js";
import { ProjectService } from "../../apps/desktop/electron/services/project-service.js";
import { SessionService } from "../../apps/desktop/electron/services/session-service.js";
import { SessionManager } from "../../apps/desktop/electron/services/session-manager.js";
import type { CaptureProvider, CaptureSession, CaptureResult } from "../../packages/shared/types/index.js";

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
    manager = new SessionManager(sessionService, captureProvider, projectService, {
      outputRoot: "data/recordings",
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
});
