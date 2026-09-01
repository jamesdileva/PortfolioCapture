import type { SessionRepository } from "../../../../packages/database/repositories/session-repository.js";
import type {
  RecordingSession,
  CreateSessionInput,
  SessionStatus,
} from "../../../../packages/shared/types/index.js";

export class SessionService {
  constructor(private repo: SessionRepository) {}

  create(input: CreateSessionInput): RecordingSession {
    if (!input.projectId) throw new Error("Project ID is required");
    if (!input.trigger) throw new Error("Trigger is required");
    return this.repo.create(input);
  }

  getById(id: string): RecordingSession | null {
    if (!id) throw new Error("Session ID is required");
    return this.repo.getById(id);
  }

  listByProject(projectId: string): RecordingSession[] {
    if (!projectId) throw new Error("Project ID is required");
    return this.repo.listByProject(projectId);
  }

  listAll(): RecordingSession[] {
    return this.repo.listAll();
  }

  updateStatus(id: string, status: SessionStatus): RecordingSession | null {
    if (!id) throw new Error("Session ID is required");
    if (!status) throw new Error("Status is required");
    const existing = this.repo.getById(id);
    if (!existing) throw new Error(`Session ${id} not found`);
    return this.repo.updateStatus(id, status);
  }

  updateRawVideoPath(id: string, rawVideoPath: string): RecordingSession | null {
    if (!id) throw new Error("Session ID is required");
    const existing = this.repo.getById(id);
    if (!existing) throw new Error(`Session ${id} not found`);
    return this.repo.updateRawVideoPath(id, rawVideoPath);
  }

  delete(id: string): boolean {
    if (!id) throw new Error("Session ID is required");
    const existing = this.repo.getById(id);
    if (!existing) throw new Error(`Session ${id} not found`);
    return this.repo.delete(id);
  }
}
