import { describe, it, expect, vi, beforeEach } from "vitest";
import { CrashRecoveryServiceImpl } from "../../apps/desktop/electron/services/crash-recovery.js";
import type { SessionService } from "../../apps/desktop/electron/services/session-service.js";
import type { RecordingSession, SessionStatus } from "../../packages/shared/types/index.js";

function makeSession(overrides: Partial<RecordingSession> & { id: string; status: SessionStatus }): RecordingSession {
  return {
    projectId: "proj-1",
    startedAt: new Date(Date.now() - 1000).toISOString(),
    endedAt: null,
    trigger: "process_launch",
    durationMs: null,
    rawVideoPath: null,
    ...overrides,
  };
}

function createMockSessionService(sessions: RecordingSession[]): SessionService {
  return {
    listAll: vi.fn(() => sessions),
    getById: vi.fn((id: string) => sessions.find((s) => s.id === id) ?? null),
    updateStatus: vi.fn(),
    create: vi.fn(),
    listByProject: vi.fn(),
    updateRawVideoPath: vi.fn(),
    delete: vi.fn(),
  } as unknown as SessionService;
}

describe("CrashRecoveryServiceImpl", () => {
  let mockSessions: RecordingSession[];
  let mockSessionService: SessionService;

  beforeEach(() => {
    mockSessions = [
      makeSession({ id: "s1", status: "recording", projectId: "proj-1" }),
      makeSession({ id: "s2", status: "complete", projectId: "proj-2" }),
      makeSession({ id: "s3", status: "starting", projectId: "proj-1" }),
      makeSession({ id: "s4", status: "failed", projectId: "proj-3" }),
      makeSession({ id: "s5", status: "finalizing", projectId: "proj-2" }),
      makeSession({ id: "s6", status: "cancelled", projectId: "proj-3" }),
    ];
    mockSessionService = createMockSessionService(mockSessions);
  });

  describe("detectOrphans", () => {
    it("returns sessions with orphan statuses (starting, recording, finalizing)", () => {
      const service = new CrashRecoveryServiceImpl(mockSessionService);
      const projectNames = new Map([["proj-1", "Project Alpha"], ["proj-2", "Project Beta"], ["proj-3", "Project Gamma"]]);

      const orphans = service.detectOrphans(projectNames);

      expect(orphans).toHaveLength(3);
      expect(orphans.map((o) => o.session.id)).toEqual(expect.arrayContaining(["s1", "s3", "s5"]));
    });

    it("maps project names correctly", () => {
      const service = new CrashRecoveryServiceImpl(mockSessionService);
      const projectNames = new Map([["proj-1", "Project Alpha"], ["proj-2", "Project Beta"], ["proj-3", "Project Gamma"]]);

      const orphans = service.detectOrphans(projectNames);

      const alphaOrphans = orphans.filter((o) => o.projectName === "Project Alpha");
      expect(alphaOrphans).toHaveLength(2);

      const betaOrphans = orphans.filter((o) => o.projectName === "Project Beta");
      expect(betaOrphans).toHaveLength(1);
    });

    it("returns empty array when no orphaned sessions exist", () => {
      const allComplete: RecordingSession[] = [
        makeSession({ id: "s1", status: "complete", projectId: "proj-1" }),
        makeSession({ id: "s2", status: "failed", projectId: "proj-2" }),
      ];
      const service = new CrashRecoveryServiceImpl(createMockSessionService(allComplete));

      const orphans = service.detectOrphans(new Map());

      expect(orphans).toHaveLength(0);
    });

    it("returns empty array when no sessions exist", () => {
      const service = new CrashRecoveryServiceImpl(createMockSessionService([]));

      const orphans = service.detectOrphans(new Map());

      expect(orphans).toHaveLength(0);
    });

    it("assigns Unknown Project for unmapped project IDs", () => {
      const service = new CrashRecoveryServiceImpl(mockSessionService);

      const orphans = service.detectOrphans(new Map());

      const unknownOrphans = orphans.filter((o) => o.projectName === "Unknown Project");
      expect(unknownOrphans.length).toBeGreaterThan(0);
    });
  });

  describe("discardOrphan", () => {
    it("marks orphaned session as failed", () => {
      const service = new CrashRecoveryServiceImpl(mockSessionService);

      service.discardOrphan("s1");

      expect(mockSessionService.updateStatus).toHaveBeenCalledWith("s1", "failed");
    });

    it("throws on empty session ID", () => {
      const service = new CrashRecoveryServiceImpl(mockSessionService);

      expect(() => service.discardOrphan("")).toThrow("Session ID is required");
    });

    it("throws on nonexistent session", () => {
      const service = new CrashRecoveryServiceImpl(mockSessionService);

      expect(() => service.discardOrphan("nonexistent")).toThrow("Session nonexistent not found");
    });

    it("throws when session is not orphaned (complete status)", () => {
      const service = new CrashRecoveryServiceImpl(mockSessionService);

      expect(() => service.discardOrphan("s2")).toThrow("is not an orphan");
    });

    it("throws when session is not orphaned (failed status)", () => {
      const service = new CrashRecoveryServiceImpl(mockSessionService);

      expect(() => service.discardOrphan("s4")).toThrow("is not an orphan");
    });

    it("accepts finalizing status as orphan", () => {
      const service = new CrashRecoveryServiceImpl(mockSessionService);

      service.discardOrphan("s5");

      expect(mockSessionService.updateStatus).toHaveBeenCalledWith("s5", "failed");
    });

    it("accepts starting status as orphan", () => {
      const service = new CrashRecoveryServiceImpl(mockSessionService);

      service.discardOrphan("s3");

      expect(mockSessionService.updateStatus).toHaveBeenCalledWith("s3", "failed");
    });
  });

  describe("autoCleanup", () => {
    it("marks old orphan sessions as failed", () => {
      const oldSession = makeSession({
        id: "old",
        status: "recording",
        projectId: "proj-1",
        startedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
      });
      const recentSession = makeSession({
        id: "recent",
        status: "recording",
        projectId: "proj-1",
        startedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      });
      const service = new CrashRecoveryServiceImpl(createMockSessionService([oldSession, recentSession]));

      const cleaned = service.autoCleanup(new Map([["proj-1", "Test"]]));

      expect(cleaned).toBe(1);
      expect(service).toBeDefined();
    });

    it("does not mark recent orphan sessions", () => {
      const recentSession = makeSession({
        id: "recent",
        status: "recording",
        projectId: "proj-1",
        startedAt: new Date(Date.now() - 1000).toISOString(),
      });
      const service = new CrashRecoveryServiceImpl(createMockSessionService([recentSession]));

      const cleaned = service.autoCleanup(new Map([["proj-1", "Test"]]));

      expect(cleaned).toBe(0);
    });

    it("returns 0 when no orphans exist", () => {
      const allComplete = [
        makeSession({ id: "s1", status: "complete", projectId: "proj-1" }),
      ];
      const service = new CrashRecoveryServiceImpl(createMockSessionService(allComplete));

      const cleaned = service.autoCleanup(new Map());

      expect(cleaned).toBe(0);
    });

    it("uses custom maxAgeMs when provided", () => {
      const session = makeSession({
        id: "s1",
        status: "recording",
        projectId: "proj-1",
        startedAt: new Date(Date.now() - 100_000).toISOString(),
      });
      const service = new CrashRecoveryServiceImpl(createMockSessionService([session]));

      const cleaned = service.autoCleanup(new Map(), 50_000);

      expect(cleaned).toBe(1);
    });

    it("does not mark non-orphan statuses as failed", () => {
      const completeSession = makeSession({
        id: "old",
        status: "complete",
        projectId: "proj-1",
        startedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
      });
      const service = new CrashRecoveryServiceImpl(createMockSessionService([completeSession]));

      const cleaned = service.autoCleanup(new Map());

      expect(cleaned).toBe(0);
    });

    it("marks starting sessions older than max age", () => {
      const session = makeSession({
        id: "old-starting",
        status: "starting",
        projectId: "proj-1",
        startedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
      });
      const service = new CrashRecoveryServiceImpl(createMockSessionService([session]));

      const cleaned = service.autoCleanup(new Map());

      expect(cleaned).toBe(1);
    });
  });
});
