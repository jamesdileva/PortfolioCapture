import { mkdirSync, existsSync } from "fs";
import { join } from "path";
import type {
  RecordingSession,
  SessionTrigger,
  CaptureProvider,
  CaptureOptions,
  CaptureResult,
  AudioMode,
  ScreenshotExtractor,
  IdleSegment,
  SmartTrimmer,
  DemoGenerator,
} from "../../../../packages/shared/types/index.js";
import type { SessionService } from "./session-service.js";
import type { ProjectService } from "./project-service.js";
import type { AssetService } from "./asset-service.js";
import type { SettingsService } from "./settings-service.js";
import type { IdleDetectorImpl } from "./idle-detector.js";

export type IdleDetectorFactory = () => IdleDetectorImpl;

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
  idleDetector?: IdleDetectorImpl;
}

export class SessionManager {
  private activeByProject: Map<string, ActiveSession> = new Map();
  private config: SessionManagerConfig;
  private sessionService: SessionService;
  private captureProvider: CaptureProvider;
  private projectService: ProjectService;
  private screenshotExtractor?: ScreenshotExtractor;
  private assetService?: AssetService;
  private idleDetectorFactory?: IdleDetectorFactory;
  private settingsService?: SettingsService;
  private smartTrimmer?: SmartTrimmer;
  private demoGenerator?: DemoGenerator;

  constructor(
    sessionService: SessionService,
    captureProvider: CaptureProvider,
    projectService: ProjectService,
    config?: Partial<SessionManagerConfig>,
    screenshotExtractor?: ScreenshotExtractor,
    assetService?: AssetService,
    idleDetectorFactory?: IdleDetectorFactory,
    settingsService?: SettingsService,
    smartTrimmer?: SmartTrimmer,
    demoGenerator?: DemoGenerator,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.sessionService = sessionService;
    this.captureProvider = captureProvider;
    this.projectService = projectService;
    this.screenshotExtractor = screenshotExtractor;
    this.assetService = assetService;
    this.idleDetectorFactory = idleDetectorFactory;
    this.settingsService = settingsService;
    this.smartTrimmer = smartTrimmer;
    this.demoGenerator = demoGenerator;
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
      const captureSession = await this.captureProvider.start(captureOptions);

      this.activeByProject.set(projectId, {
        session: { ...session, status: "recording" },
        captureSessionId: captureSession.sessionId,
        projectId,
      });

      const active = this.activeByProject.get(projectId)!;
      if (this.idleDetectorFactory) {
        const detector = this.idleDetectorFactory();
        detector.start();
        active.idleDetector = detector;
      }

      this.sessionService.updateStatus(session.id, "recording");
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

    this.sessionService.updateStatus(active.session.id, "finalizing");

    let timeline: IdleSegment[] = [];
    if (active.idleDetector) {
      active.idleDetector.stop();
      timeline = active.idleDetector.getTimeline();
    }

    try {
      const result = await this.captureProvider.stop(active.captureSessionId);

      this.activeByProject.delete(projectId);

      this.sessionService.updateRawVideoPath(active.session.id, result.outputPath);

      if (timeline.length > 0) {
        this.settingsService?.set(`timeline:${active.session.id}`, JSON.stringify(timeline));
      }

      await this.extractScreenshots(active.session.id, active.projectId, result.outputPath);

      const trimmedVideoPath = await this.trimVideo(active.session.id, active.projectId, result.outputPath, timeline);

      await this.generateDemo(active.session.id, active.projectId, trimmedVideoPath);

      this.sessionService.updateStatus(active.session.id, "complete");

      return this.sessionService.getById(active.session.id)!;
    } catch {
      this.activeByProject.delete(projectId);
      if (timeline.length > 0) {
        this.settingsService?.set(`timeline:${active.session.id}`, JSON.stringify(timeline));
      }
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

  recordActivity(projectId: string): void {
    const active = this.activeByProject.get(projectId);
    if (active?.idleDetector) {
      active.idleDetector.recordActivity();
    }
  }

  getTimelineForProject(projectId: string): IdleSegment[] {
    const active = this.activeByProject.get(projectId);
    if (active?.idleDetector) {
      return active.idleDetector.getTimeline();
    }
    return [];
  }

  private async extractScreenshots(
    sessionId: string,
    projectId: string,
    rawVideoPath: string,
  ): Promise<void> {
    if (!this.screenshotExtractor || !this.assetService) {
      return;
    }

    try {
      const screenshotsDir = join(
        this.config.outputRoot,
        projectId,
        sessionId,
        "screenshots",
      );

      const screenshots = await this.screenshotExtractor.extract(
        rawVideoPath,
        screenshotsDir,
      );

      for (const shot of screenshots) {
        this.assetService.create({
          sessionId,
          projectId,
          type: "screenshot",
          path: shot.path,
          width: shot.width,
          height: shot.height,
        });
      }
    } catch {
      // Screenshot extraction is best-effort; don't fail the session
    }
  }

  private async trimVideo(
    sessionId: string,
    projectId: string,
    rawVideoPath: string,
    timeline: IdleSegment[],
  ): Promise<string | null> {
    if (!this.smartTrimmer || !this.assetService || timeline.length === 0) {
      return null;
    }

    try {
      const sessionDir = join(this.config.outputRoot, projectId, sessionId);
      const result = await this.smartTrimmer.trim(rawVideoPath, sessionDir, timeline);

      this.assetService.create({
        sessionId,
        projectId,
        type: "trimmed_video",
        path: result.outputPath,
        durationMs: result.durationAfterMs,
      });

      return result.outputPath;
    } catch {
      // Smart trimming is best-effort; don't fail the session
      return null;
    }
  }

  private async generateDemo(
    sessionId: string,
    projectId: string,
    trimmedVideoPath: string | null,
  ): Promise<void> {
    if (!this.demoGenerator || !this.assetService || !trimmedVideoPath) {
      return;
    }

    try {
      const processedDir = join(this.config.outputRoot, projectId, sessionId, "processed");

      const result = await this.demoGenerator.generate(trimmedVideoPath, processedDir);

      this.assetService.create({
        sessionId,
        projectId,
        type: "demo_video",
        path: result.outputPath,
        durationMs: result.durationMs,
      });
    } catch {
      // Demo generation is best-effort; don't fail the session
    }
  }
}
