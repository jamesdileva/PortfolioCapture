import type { SessionRepository } from "../../../../packages/database/repositories/session-repository.js";
import type {
  RecordingSession,
  CreateSessionInput,
  SessionStatus,
} from "../../../../packages/shared/types/index.js";

export class SessionService {
  constructor(private repo: SessionRepository) {}

  create(input: CreateSessionInput): RecordingSession {
    return this.repo.create(input);
  }

  getById(id: string): RecordingSession | null {
    return this.repo.getById(id);
  }

  listByProject(projectId: string): RecordingSession[] {
    return this.repo.listByProject(projectId);
  }

  updateStatus(id: string, status: SessionStatus): RecordingSession | null {
    return this.repo.updateStatus(id, status);
  }

  updateRawVideoPath(id: string, rawVideoPath: string): RecordingSession | null {
    return this.repo.updateRawVideoPath(id, rawVideoPath);
  }

  delete(id: string): boolean {
    return this.repo.delete(id);
  }
}
