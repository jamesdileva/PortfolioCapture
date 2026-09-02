import { mkdirSync, existsSync } from "fs";
import { join } from "path";
import type {
  RecordingSession,
  SessionTrigger,
  CaptureProvider,
  CaptureOptions,
  CaptureResult,
  AudioMode,
} from "../../../../packages/shared/types/index.js";
import type { SessionService } from "./session-service.js";
import type { ProjectService } from "./project-service.js";

interface SessionManagerConfig {
  outputRoot: string;
  fps: number;
  width: number;
  height: number;
  audio: AudioMode;
}

const DEFAULT_CONFIG: SessionManagerConfig = {
  outputRoot: "data/recordings",
  fps: 30,
  width: 1920,
  height: 1080,
  audio: "none",
};

interface ActiveSession {
  session: RecordingSession;
  captureSessionId: string;
  projectId: string;
}

export class SessionManager {
  private activeByProject: Map<string, ActiveSession> = new Map();
  private config: SessionManagerConfig;
  private sessionService: SessionService;
  private captureProvider: CaptureProvider;
  private projectService: ProjectService;

  constructor(
    sessionService: SessionService,
    captureProvider: CaptureProvider,
    projectService: ProjectService,
    config?: Partial<SessionManagerConfig>
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.sessionService = sessionService;
    this.captureProvider = captureProvider;
    this.projectService = projectService;
  }

  async startSession(projectId: string, trigger: SessionTrigger): Promise<RecordingSession> {
    if (this.activeByProject.has(projectId)) {
      throw new Error(`Session already active for project ${projectId}`);
    }

    const project = this.projectService.getById(projectId);
    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    const session = this.sessionService.create({ projectId, trigger });

    const outputDir = join(this.config.outputRoot, projectId, session.id);
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }
    const outputPath = join(outputDir, "raw.mp4");

    const captureOptions: CaptureOptions = {
      outputPath,
      fps: this.config.fps,
      width: this.config.width,
      height: this.config.height,
      audio: this.config.audio,
    };

    try {
      this.sessionService.updateStatus(session.id, "recording");
      const captureSession = await this.captureProvider.start(captureOptions);

      this.activeByProject.set(projectId, {
        session: { ...session, status: "recording" },
        captureSessionId: captureSession.sessionId,
        projectId,
      });

      return this.sessionService.getById(session.id)!;
    } catch (err) {
      this.sessionService.updateStatus(session.id, "failed");
      this.activeByProject.delete(projectId);
      throw err;
    }
  }

  async stopSession(projectId: string): Promise<RecordingSession | null> {
    const active = this.activeByProject.get(projectId);
    if (!active) {
      return null;
    }

    this.activeByProject.delete(projectId);

    this.sessionService.updateStatus(active.session.id, "finalizing");

    try {
      const result = await this.captureProvider.stop(active.captureSessionId);

      this.sessionService.updateRawVideoPath(active.session.id, result.outputPath);
      this.sessionService.updateStatus(active.session.id, "complete");

      return this.sessionService.getById(active.session.id)!;
    } catch {
      this.sessionService.updateStatus(active.session.id, "complete");
      return this.sessionService.getById(active.session.id)!;
    }
  }

  async onProcessStarted(project: { id: string; name: string }): Promise<void> {
    try {
      await this.startSession(project.id, "process_launch");
    } catch {
      // swallow — project not enabled or already recording
    }
  }

  async onProcessStopped(project: { id: string; name: string }): Promise<void> {
    await this.stopSession(project.id);
  }

  getActiveSessionForProject(projectId: string): ActiveSession | undefined {
    return this.activeByProject.get(projectId);
  }

  getActiveProjectIds(): string[] {
    return [...this.activeByProject.keys()];
  }
}
