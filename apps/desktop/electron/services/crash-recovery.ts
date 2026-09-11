import type { RecordingSession, SessionStatus } from "../../../../packages/shared/types/index.js";
import type { SessionService } from "./session-service.js";

export interface OrphanedSession {
  session: RecordingSession;
  projectName: string;
}

export interface CrashRecoveryService {
  detectOrphans(projectNames: Map<string, string>): OrphanedSession[];
  discardOrphan(sessionId: string): void;
  autoCleanup(projectNames: Map<string, string>, maxAgeMs?: number): number;
}

const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export class CrashRecoveryServiceImpl implements CrashRecoveryService {
  private sessionService: SessionService;
  private nowFn: () => number;

  constructor(sessionService: SessionService, nowFn?: () => number) {
    this.sessionService = sessionService;
    this.nowFn = nowFn ?? (() => Date.now());
  }

  detectOrphans(projectNames: Map<string, string>): OrphanedSession[] {
    const allSessions = this.sessionService.listAll();
    const orphans: OrphanedSession[] = [];

    for (const session of allSessions) {
      if (this.isOrphanStatus(session.status)) {
        orphans.push({
          session,
          projectName: projectNames.get(session.projectId) ?? "Unknown Project",
        });
      }
    }

    return orphans;
  }

  discardOrphan(sessionId: string): void {
    if (!sessionId) throw new Error("Session ID is required");
    const session = this.sessionService.getById(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);
    if (!this.isOrphanStatus(session.status)) {
      throw new Error(`Session ${sessionId} is not an orphan (status: ${session.status})`);
    }
    this.sessionService.updateStatus(sessionId, "failed");
  }

  autoCleanup(projectNames: Map<string, string>, maxAgeMs: number = DEFAULT_MAX_AGE_MS): number {
    const allSessions = this.sessionService.listAll();
    const now = this.nowFn();
    let cleaned = 0;

    for (const session of allSessions) {
      if (this.isOrphanStatus(session.status)) {
        const startedAt = new Date(session.startedAt).getTime();
        if (now - startedAt > maxAgeMs) {
          this.sessionService.updateStatus(session.id, "failed");
          cleaned++;
        }
      }
    }

    return cleaned;
  }

  private isOrphanStatus(status: SessionStatus): boolean {
    return status === "starting" || status === "recording" || status === "finalizing";
  }
}
